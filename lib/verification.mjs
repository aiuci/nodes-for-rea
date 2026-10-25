// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const text=value=>typeof value==='string'&&value.length>0&&!value.includes('\0');
const normalize=value=>value.replaceAll('\r\n','\n').replaceAll('\r','\n');
const equalPath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
const shell=/^(cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh(?:\.exe)?|bash(?:\.exe)?|sh(?:\.exe)?|wscript(?:\.exe)?|cscript(?:\.exe)?)$/i;
const interpreter=/^(node|python\d*(?:\.\d+)*|ruby|perl|deno|bun|dotnet|java)(?:\.exe)?$/i;
const inlineProgram=arg=>/^(-e|-c|--eval(?:=|$)|--print(?:=|$)|-p|eval|run=-)/.test(arg);
const within=(root,file)=>{const relative=path.relative(root,file);return !relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));};

async function identity(record){
  if(!record||!path.isAbsolute(record.path||'')||! /^[a-f0-9]{64}$/i.test(record.sha256||''))throw new Error('Every bound artifact needs an absolute path and SHA-256.');
  const resolved=await fs.realpath(record.path);
  if(!(await fs.stat(resolved)).isFile())throw new Error('Verification artifacts must be files.');
  const sha256=digest(await fs.readFile(resolved));
  if(sha256!==record.sha256.toLowerCase())throw new Error(`Artifact changed since the verification manifest was prepared: ${record.path}`);
  return {path:resolved,sha256};
}

async function execution(value,target){
  if(!value||!path.isAbsolute(value.command||'')||shell.test(path.basename(value.command))||/\.(?:cmd|bat|ps1)$/i.test(value.command))throw new Error('Select an absolute executable, without a shell.');
  if(!Array.isArray(value.args)||value.args.length>64||value.args.some(arg=>typeof arg!=='string'||arg.includes('\0')||arg.length>8192))throw new Error('Execution arguments must be a bounded array of strings.');
  if(!path.isAbsolute(value.cwd||'')||!(await fs.stat(value.cwd)).isDirectory())throw new Error('Select an existing absolute working directory.');
  if(!Array.isArray(value.artifacts)||!value.artifacts.length||value.artifacts.length>32)throw new Error('Bind the executable and any scripts to explicit artifact SHA-256 values.');
  const command=await fs.realpath(value.command),artifacts=[];
  if(shell.test(path.basename(command))||/\.(?:cmd|bat|ps1)$/i.test(command))throw new Error('Shell execution is unsupported.');
  for(const item of value.artifacts)artifacts.push(await identity(item));
  if(!artifacts.some(item=>equalPath(item.path,command)))throw new Error('The selected executable must have an artifact SHA-256 binding.');
  const driver=value.driver?await identity(value.driver):null;
  if(driver&&!artifacts.some(item=>equalPath(item.path,driver.path)&&item.sha256===driver.sha256))throw new Error('The explicit driver must be bound in execution.artifacts.');
  // Interpreters may execute a selected file, never inline generated code.
  if(interpreter.test(path.basename(command))&&value.args.some(inlineProgram))throw new Error('Inline interpreter programs are unsupported; select a bound program file.');
  const boundArguments=[];
  for(const arg of value.args)if(path.isAbsolute(arg)){try{boundArguments.push(await fs.realpath(arg));}catch{}}
  if(target&&!equalPath(command,target.path)&&!boundArguments.some(arg=>equalPath(arg,target.path)))throw new Error('The execution must invoke the investigation target or pass its exact artifact path.');
  const name=path.basename(command),program=/^java(?:\.exe)?$/i.test(name)&&value.args[0]==='-jar'?value.args[1]:value.args[0];
  let programPath;try{if(path.isAbsolute(program||''))programPath=await fs.realpath(program);}catch{}
  if(driver){
    if(!equalPath(command,driver.path)&&!(interpreter.test(name)&&programPath&&equalPath(programPath,driver.path)))throw new Error('The driver must be the executable or the interpreter’s actual program argument.');
    if(target&&!boundArguments.some(arg=>equalPath(arg,target.path)))throw new Error('Pass the exact target artifact as an argument to its explicit driver.');
  }else if(target&&!equalPath(command,target.path)){
    if(!interpreter.test(name)||!programPath||!equalPath(programPath,target.path))throw new Error('Run the exact target executable, or a supported interpreter with the target as its program argument.');
  }
  if(target&&!artifacts.some(item=>equalPath(item.path,target.path)&&item.sha256===target.sha256))throw new Error('The investigation target must be bound in execution.artifacts.');
  return {command,args:[...value.args],cwd:await fs.realpath(value.cwd),artifacts,...(driver?{driver}:{})};
}

const onlyKeys=(object,allowed,label)=>{if(!object||typeof object!=='object'||Array.isArray(object)||Object.keys(object).some(key=>!allowed.includes(key)))throw new Error(`${label} contains unsupported fields.`);};
function browserUrl(value){
  if(!text(value)||value.length>8192)throw new Error('Select a bounded HTTP(S) browser URL.');
  let url;try{url=new URL(value);}catch{throw new Error('Select a valid browser URL.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Browser verification requires HTTP(S) URLs without credentials.');
  if([...url.searchParams.keys()].some(key=>/password|secret|token|authorization|credential/i.test(key)))throw new Error('Secret-bearing URL parameters are unsupported.');
  return url;
}
function browserLocator(value){
  const fields=value?.kind==='css'?['kind','selector']:value?.kind==='test_id'?['kind','value']:value?.kind==='role'?['kind','role','name']:[];
  onlyKeys(value,fields,'Browser locator');
  if(!fields.length||fields.slice(1).some(key=>!text(value[key])||value[key].length>1000))throw new Error('Choose a bounded CSS, test ID or named-role locator.');
  if(value.kind==='role'&&!['button','checkbox','combobox','dialog','link','listbox','menuitem','option','radio','slider','spinbutton','switch','tab','textbox'].includes(value.role))throw new Error('Unsupported browser locator role.');
  return structuredClone(value);
}
function browserActions(actions,origin){
  if(actions===undefined)actions=[{step_id:'settle',action:'wait_for_timeout',duration_ms:250}];
  if(!Array.isArray(actions)||!actions.length||actions.length>20)throw new Error('Declare 1–20 finite browser actions.');
  const ids=new Set();let budget=0;
  const selected=actions.map(item=>{
    const fields={goto:['destination','wait_until'],click:['locator','button','click_count'],fill:['locator','value'],press:['locator','key'],wait_for_timeout:['duration_ms']}[item?.action];
    if(!fields)throw new Error('Browser checks permit only goto, click, public-literal fill, press and wait_for_timeout.');
    onlyKeys(item,['step_id','action','timeout_ms',...fields],'Browser action');
    if(!/^[A-Za-z][A-Za-z0-9._-]{0,99}$/.test(item.step_id||'')||ids.has(item.step_id))throw new Error('Browser step IDs must be valid and unique.');ids.add(item.step_id);
    const chosen={step_id:item.step_id,action:item.action};
    if(item.action==='wait_for_timeout'){
      if(item.timeout_ms!==undefined||!Number.isInteger(item.duration_ms)||item.duration_ms<1||item.duration_ms>5000)throw new Error('Browser waits must be 1–5000 ms.');
      chosen.duration_ms=item.duration_ms;budget+=item.duration_ms;return chosen;
    }
    const timeout=item.timeout_ms??3000;if(!Number.isInteger(timeout)||timeout<100||timeout>10000)throw new Error('Browser action timeout must be 100–10000 ms.');chosen.timeout_ms=timeout;budget+=timeout;
    if(item.action==='goto'){
      onlyKeys(item.destination,['url'],'Navigation destination');const url=browserUrl(item.destination.url);
      if(url.origin!==origin)throw new Error('Declared browser navigation must remain within the selected exact origin.');
      chosen.destination={url:url.href};chosen.wait_until=item.wait_until||'domcontentloaded';
      if(!['commit','domcontentloaded','load'].includes(chosen.wait_until))throw new Error('Unsupported navigation wait condition.');
    }else{
      chosen.locator=browserLocator(item.locator);
      if(item.action==='click'){
        chosen.button=item.button||'left';chosen.click_count=item.click_count??1;
        if(!['left','middle','right'].includes(chosen.button)||!Number.isInteger(chosen.click_count)||chosen.click_count<1||chosen.click_count>2)throw new Error('Select a bounded browser click.');
      }else if(item.action==='fill'){
        onlyKeys(item.value,['source','value'],'Browser fill value');
        if(item.value.source!=='literal'||typeof item.value.value!=='string'||item.value.value.length>4000||item.value.value.includes('\0'))throw new Error('Only bounded public literal fills are supported; secret references are forbidden.');
        if(/password|secret|token|credential|one.time|otp/i.test(JSON.stringify(chosen.locator)))throw new Error('Credential-field fills are unsupported.');
        chosen.value={source:'literal',value:item.value.value};
      }else if(item.action==='press'){
        if(!text(item.key)||item.key.length>40||!/^(?:Enter|Tab|Escape|Space|Backspace|Delete|Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown|[A-Za-z0-9])$/.test(item.key))throw new Error('Select a supported finite browser key without system shortcuts.');chosen.key=item.key;
      }
    }
    return chosen;
  });
  if(budget>60000)throw new Error('Browser action budgets must total at most 60000 ms.');
  return {actions:selected,budget};
}
function browserExpected(value,origin){
  onlyKeys(value,['url','domIncludes'],'Browser expectations');
  const expected={domIncludes:value.domIncludes||[]};
  if(!Array.isArray(expected.domIncludes)||expected.domIncludes.length>20||expected.domIncludes.some(item=>!text(item)||item.length>4000))throw new Error('Declare at most 20 nonempty DOM substring expectations.');
  if(value.url!==undefined){const url=browserUrl(value.url);if(url.origin!==origin)throw new Error('Expected URL must remain within the selected exact origin.');expected.url=url.href;}
  if(!expected.url&&!expected.domIncludes.length)throw new Error('Declare at least one independent URL or DOM expectation.');
  return expected;
}
function validateBrowserManifest(manifest,state){
  onlyKeys(manifest,['version','kind','capture','scope','expectationSource','target','browser','actions','expected','reconstruction'],'Browser manifest');
  if(manifest.capture!==undefined&&manifest.capture!=='rea-browser')throw new Error('Browser manifests use only rea-browser capture.');
  onlyKeys(manifest.target,['url'],'Browser target');const url=browserUrl(manifest.target.url);
  if(!(state.targets||[]).some(item=>{try{return item.kind==='website'&&browserUrl(item.locator).origin===url.origin;}catch{return false;}}))throw new Error('Browser target origin is unrelated to the current investigation.');
  const original=browserActions(manifest.actions,url.origin),expected=browserExpected(manifest.expected,url.origin);
  let reconstruction;
  if(manifest.reconstruction){
    onlyKeys(manifest.reconstruction,['url','actions','expected'],'Browser reconstruction');const other=browserUrl(manifest.reconstruction.url);
    // Separate fresh captures may target explicitly selected reconstruction origins.
    const actions=browserActions(manifest.reconstruction.actions,other.origin);
    let expectedOther=manifest.reconstruction.expected;
    if(!expectedOther){expectedOther={domIncludes:expected.domIncludes};if(expected.url){const prior=new URL(expected.url);expectedOther.url=expected.url===url.href?other.href:new URL(prior.pathname+prior.search+prior.hash,other.origin).href;}}
    reconstruction={url:other.href,actions:actions.actions,expected:browserExpected(expectedOther,other.origin)};
    if(original.actions.length+actions.actions.length>20||original.budget+actions.budget>60000)throw new Error('Original and reconstruction share the 20-action and 60000 ms budget.');
  }
  return {version:1,kind:'browser',capture:'rea-browser',scope:manifest.scope,expectationSource:structuredClone(manifest.expectationSource),target:{url:url.href},actions:original.actions,expected,...(manifest.browser?{browser:structuredClone(manifest.browser)}:{}),...(reconstruction?{reconstruction}:{})};
}

async function selectedBrowser(manifest,{config={},browserPath}={}){
  if(manifest.browser){onlyKeys(manifest.browser,['path','sha256'],'Browser executable binding');return identity(manifest.browser);}
  const file=browserPath||config.browser;if(!path.isAbsolute(file||''))throw new Error('Select a local Chromium executable in Connection or bind manifest.browser with its absolute path and SHA-256.');
  const resolved=await fs.realpath(file);if(!(await fs.stat(resolved)).isFile()||shell.test(path.basename(resolved)))throw new Error('Select a browser executable file, without a shell.');
  return {path:resolved,sha256:digest(await fs.readFile(resolved))};
}
function browserScenario(browser,url,actions){return {browser:{mode:'launch',executable_path:browser.path,headless:true},start_url:{url},actions,capture:{after_each_step:['url'],at_end:['dom','url','accessibility'],events:['page-errors','frames','popups','downloads']},storage:{cookies:[],local_storage:[],session_storage:[]},secrets:[]};}

function browserObservation(capture,url,actions){
  const reasons=[];const origin=new URL(url).origin;
  if(capture.browser?.mode!=='launch'||capture.browser?.process_ownership!=='provider-owned'||capture.browser?.cleanup!=='terminated-owned-process')reasons.push('Fresh browser ownership and cleanup were not established.');
  if(capture.completeness?.status!=='complete'||capture.completeness?.equality_eligible!==true)reasons.push('Browser observation is incomplete or truncated.');
  if(!Array.isArray(capture.steps)||capture.steps.length!==actions.length+1)reasons.push('Browser action coverage is incomplete.');
  for(const [index,step] of (capture.steps||[]).entries()){
    if(step.status!=='completed')reasons.push(`Browser step ${step.step_id} ${step.status}: ${step.error||'not completed'}`);
    if(index&&step.step_id!==actions[index-1]?.step_id)reasons.push('Observed browser steps do not match the selected scenario.');
    for(const value of [step.after_url,...(index?[step.before_url]:[])])if(value?.origin!==origin)reasons.push('Browser left the declared origin; those observations cannot verify this target.');
  }
  for(const event of capture.events?.items||[])if(event.kind==='popup-opened'||event.kind==='download-cancelled'||event.kind==='frame-navigated'&&event.url?.origin&&event.url.origin!==origin)reasons.push('Unexpected popup, download or foreign-frame navigation occurred.');
  const artifacts=capture.steps?.at(-1)?.artifacts,dom=artifacts?.dom,urlArtifact=artifacts?.url;
  if(dom?.state!=='captured'||typeof dom.value?.text!=='string')reasons.push('The final DOM was not completely captured.');
  else if(dom.value.sha256!==digest(Buffer.from(dom.value.text))||dom.value.bytes!==Buffer.byteLength(dom.value.text))reasons.push('Final DOM digest or size mismatch.');
  if(urlArtifact?.state!=='captured'||urlArtifact.value?.redacted||typeof urlArtifact.value?.url!=='string')reasons.push('The final URL was not completely captured.');
  return {url:urlArtifact?.value?.url||null,dom:dom?.value?.text||'',pageErrors:(capture.events?.items||[]).filter(event=>event.kind==='page-error'),reasons:[...new Set(reasons)]};
}

async function runBrowserVerification({selected,run,evidence,client,signal,config,browserPath,onProgress}){
  run.capture='rea-browser';run.limitations=[
    'Checks cover only the declared finite URL and DOM-substring expectations after the caller-selected actions. DOM assertions do not establish visibility, private backend behavior or global equivalence.',
    'Expected values are caller supplied; their stated independent source is recorded but its truth is not certified.',
    'Each scenario launches a fresh owned browser context, with no authentication imports, secret references or persistent profile.',
    'Declared navigation stays within each selected origin. REA does not expose a navigation firewall: unexpected page redirects or script navigation are detected in retained observations and cannot pass these checks.'];
  const scenarios=[{id:'original',url:selected.target.url,actions:selected.actions,expected:selected.expected},...(selected.reconstruction?[{id:'reconstruction',...selected.reconstruction}]:[])];
  for(const item of scenarios){
    if(item.expected.url)run.cases.push({id:`${item.id}:url`,input:{url:item.url,actions:item.actions},expected:{url:item.expected.url},actual:null,status:'untested',reason:'Not executed.'});
    for(const [index,value]of item.expected.domIncludes.entries())run.cases.push({id:`${item.id}:dom-${index+1}`,input:{url:item.url,actions:item.actions},expected:{domIncludes:value},actual:null,status:'untested',reason:'Not executed.'});
  }
  const browser=await selectedBrowser(selected,{config,browserPath});run.browser=browser;run.manifest.browser=browser;
  if(shell.test(path.basename(browser.path)))throw new Error('Shell execution is unsupported.');
  const deadline=Date.now()+90000;
  for(const item of scenarios){
    const cases=run.cases.filter(result=>result.id.startsWith(item.id+':'));
    const record={id:randomUUID(),kind:'rea',operation:'capture_browser_scenario',locator:item.url,capturedAt:new Date().toISOString(),parameters:browserScenario(browser,item.url,item.actions),raw:null};
    try{
      signal?.throwIfAborted();await identity(browser);onProgress(`Checking ${item.id} browser URL and DOM expectations…`);
      evidence.push(record);run.evidenceIds.push(record.id);
      const timeout=deadline-Date.now();if(timeout<=0)throw new Error('Browser verification exceeded its 90000 ms total budget.');
      record.raw=await client.callTool(record.operation,record.parameters,{signal,timeout});
      const canonical=canonicalEvidence(record.raw,record.operation);record.canonicalEvidenceId=canonical.evidence_id;
      const actual=browserObservation(canonical.normalized_result,item.url,item.actions);await identity(browser);
      run.limitations.push(...(canonical.limitations||[]),...(canonical.normalized_result.limitations||[]));
      if(actual.pageErrors.length)run.limitations.push(`${item.id}: ${actual.pageErrors.length} page error(s) retained; these assertions do not establish error-free operation.`);
      for(const result of cases){
        const isUrl=result.expected.url!==undefined;result.actual=isUrl?{url:actual.url}:{domIncludes:result.expected.domIncludes,present:actual.dom.includes(result.expected.domIncludes)};
        if(actual.reasons.length){result.reason=actual.reasons.join(' ');continue;}
        const matches=isUrl?actual.url===result.expected.url:actual.dom.includes(result.expected.domIncludes);
        result.status=matches?'passed':'failed';result.reason=matches?'The declared finite browser expectation matched.':'The observed browser result differs from the declared expectation.';
      }
    }catch(error){record.error=error.message;for(const result of cases){result.status='untested';result.reason=error.message;}if(signal?.aborted)break;}
  }
  run.limitations=[...new Set(run.limitations)];run.status=run.cases.some(item=>item.status==='failed')?'failed':run.cases.every(item=>item.status==='passed')?'passed':'blocked';
  if(selected.reconstruction)run.reconstruction={scope:'Separate finite browser assertions only; no browser equivalence proof.',status:run.cases.filter(item=>item.id.startsWith('reconstruction:')).every(item=>item.status==='passed')?'pass':run.cases.some(item=>item.id.startsWith('reconstruction:')&&item.status==='failed')?'fail':'unknown'};
}

/** User-selected JSON only. This function never accepts a command proposed by reasoning. */
export async function validateVerificationManifest(manifest,state){
  if(manifest?.version!==1||!['process','browser'].includes(manifest.kind))throw new Error('Choose a version 1 process or browser verification manifest; native GUI verification remains untested.');
  const source=manifest.expectationSource;
  if(!source||!['reference','user-asserted'].includes(source.kind)||!text(source.description)||source.description.length>4000)throw new Error('Declare independent expected behavior using a reference or an explicit user assertion.');
  if(source.kind==='reference'){let url;try{url=new URL(source.url);}catch{}if(!url||!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Reference expectations need an HTTP(S) source URL.');}
  if(!text(manifest.scope)||manifest.scope.length>4000)throw new Error('Describe the finite behavior this verification covers.');
  if(manifest.kind==='browser')return validateBrowserManifest(manifest,state);
  const capture=manifest.capture||'rea-process';if(!['rea-process','host-process'].includes(capture))throw new Error('Choose capture: rea-process or host-process explicitly.');
  const target=await identity(manifest.target);let belongs=false;
  for(const item of state.targets||[]){const locator=item.root||item.path||item.locator;if(!path.isAbsolute(locator||''))continue;let root,stat;try{root=await fs.realpath(locator);stat=await fs.stat(root);}catch{continue;}
    if(stat.isDirectory()?within(root,target.path):equalPath(root,target.path)){
      if(item.identity?.sha256&&equalPath(root,target.path)&&item.identity.sha256!==target.sha256)throw new Error('The manifest artifact differs from the inspected target version. Start an investigation for the changed artifact.');
      belongs=true;
    }
  }
  if(!belongs)throw new Error('The manifest target is unrelated to the current investigation.');
  if(!Array.isArray(manifest.cases)||!manifest.cases.length||manifest.cases.length>20)throw new Error('Supply between 1 and 20 finite verification cases.');
  const ids=new Set();
  for(const item of manifest.cases){
    if(!text(item.id)||item.id.length>100||ids.has(item.id))throw new Error('Case IDs must be nonempty and unique.');ids.add(item.id);
    if(item.args!==undefined&&(!Array.isArray(item.args)||item.args.length>32||item.args.some(arg=>typeof arg!=='string'||arg.includes('\0')||arg.length>8192)))throw new Error('Case arguments must be bounded strings.');
    if(item.stdin!==undefined&&(typeof item.stdin!=='string'||item.stdin.length>8192))throw new Error('Case terminal input must be at most 8192 characters.');
    const expected=item.expected;
    if(!Number.isInteger(expected?.exitCode)||expected.exitCode<0||expected.exitCode>255)throw new Error('Each case needs independently expected exitCode (0–255).');
    const fields=capture==='host-process'?['stdout','stderr']:['terminalText'];
    if(fields.some(field=>typeof expected[field]!=='string'||expected[field].length>65536))throw new Error(`Each case needs independently expected ${fields.join(' and ')}.`);
  }
  const timeoutMs=manifest.timeoutMs??5000;if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>10000)throw new Error('Case timeout must be between 100 and 10000 ms.');
  const original=await execution(manifest.execution,target),reconstruction=manifest.reconstruction?await execution(manifest.reconstruction):null;
  for(const selected of [original,reconstruction].filter(Boolean))if(interpreter.test(path.basename(selected.command))&&manifest.cases.some(item=>(item.args||[]).some(inlineProgram)))throw new Error('Inline interpreter programs in case arguments are unsupported.');
  return {version:1,kind:'process',capture,scope:manifest.scope,expectationSource:{...source},target,execution:original,...(reconstruction?{reconstruction}:{}),timeoutMs,cases:structuredClone(manifest.cases)};
}

/** Direct process observation, kept separate from REA's canonical PTY evidence. */
export function captureHostProcess(execution,item,{signal,timeoutMs=5000}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error('Verification cancelled before execution.'));
    let stdout='',stderr='',reason='exited',finished=false,cleanup=null,stopPromise=null,rootExited=false;
    const child=spawn(execution.command,[...execution.args,...(item.args||[])],{cwd:execution.cwd,windowsHide:true,shell:false,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
    const stop=why=>{
      if(stopPromise)return stopPromise;reason=why;
      stopPromise=new Promise(done=>{
        if(!child.pid||rootExited){cleanup=rootExited?'root-already-exited-descendants-unconfirmed':'not-started';done();return;}
        if(process.platform==='win32'){
          const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});
          killer.once('error',()=>{cleanup='tree-kill-unavailable';child.kill();done();});
          killer.once('close',code=>{cleanup=code===0?'tree-kill-requested':'tree-kill-unconfirmed';if(code!==0)child.kill();done();});
        }else{try{process.kill(-child.pid,'SIGKILL');cleanup='process-group-kill-requested';}catch{cleanup='process-group-kill-unconfirmed';child.kill();}done();}
      });return stopPromise;
    };
    const abort=()=>{void stop('cancelled');};
    const timer=setTimeout(()=>{void stop('timeout');},timeoutMs);
    // A second deadline bounds a failed kill or descendants holding pipe handles.
    const finalTimer=setTimeout(()=>finish(null,{stdout:normalize(stdout),stderr:normalize(stderr),exitCode:null,reason:reason==='exited'?'cleanup-unconfirmed':reason,cleanup:cleanup||'unconfirmed'}),timeoutMs+5000);
    function finish(error,result){if(finished)return;finished=true;clearTimeout(timer);clearTimeout(finalTimer);signal?.removeEventListener('abort',abort);child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();error?reject(error):resolve(result);}
    const append=(field,chunk)=>{if(field==='stdout')stdout+=chunk.toString();else stderr+=chunk.toString();if(Buffer.byteLength(stdout)+Buffer.byteLength(stderr)>131072){stdout=stdout.slice(0,65536);stderr=stderr.slice(0,65536);void stop('output-limit');}};
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',chunk=>append('stdout',chunk));child.stderr.on('data',chunk=>append('stderr',chunk));
    child.once('exit',()=>{rootExited=true;});
    child.once('error',error=>finish(error));
    child.once('close',async(code,exitSignal)=>{if(stopPromise)await stopPromise;finish(null,{stdout:normalize(stdout),stderr:normalize(stderr),exitCode:code,signal:exitSignal,reason,cleanup:cleanup||'root-exited'});});
    child.stdin.on('error',()=>{});child.stdin.end(item.stdin||'');signal?.addEventListener('abort',abort,{once:true});
  });
}

function canonicalEvidence(raw,operation){
  if(raw?.isError){
    let message=raw.structuredContent?.error?.message;
    for(const item of raw.content||[])if(item.type==='text'){try{message||=JSON.parse(item.text).error?.message;}catch{}message||=item.text;}
    throw new Error(message||`${operation} failed.`);
  }
  const candidates=[raw?.structuredContent,raw];
  for(const item of raw?.content||[])if(item.type==='text'){try{candidates.push(JSON.parse(item.text));}catch{}}
  for(const value of candidates){const options=[value,value?.evidence,value?.result,value?.data,value?.value];for(const candidate of options)if(candidate?.operation===operation&&candidate.evidence_id&&candidate.normalized_result)return candidate;}
  throw new Error(`${operation} returned no canonical evidence; the check remains untested.`);
}

function scenario(execution,item,timeoutMs){return {executable:execution.command,arguments:[...execution.args,...(item.args||[])],working_directory:execution.cwd,events:item.stdin===undefined?[]:[{type:'input',at_ms:200,data:item.stdin,sensitive:false}],timeout_ms:timeoutMs,idle_timeout_ms:timeoutMs,settle_ms:100,terminal:{columns:160,rows:30,scrollback:1000},limits:{output_bytes:131072,files:100,file_bytes:100000,processes:32,filesystem_depth:2},normalization:{paths:false,pids:false,ports:false,time_bucket_ms:10,patterns:[]}};}

function observed(capture){
  const reason=[];
  if(!Array.isArray(capture.frames)||!capture.exit||!capture.manifest)throw new Error('Incomplete process capture.');
  if(capture.truncated)reason.push('Capture was truncated.');
  if(capture.exit.reason!=='exited'||capture.exit.code===null)reason.push('Target did not exit normally within the selected budget.');
  if(capture.settlement?.state!=='quiesced')reason.push('Process settlement was not established.');
  for(const unknown of capture.residual_unknowns||[])if(['terminal','interaction','exit','cleanup'].includes(unknown.scope))reason.push(unknown.reason);
  // PTY frames combine stdout and stderr. Only normalize platform line endings.
  return {terminalText:normalize(capture.frames.map(frame=>frame.raw_data??frame.data).join('')),exitCode:capture.exit.code,reason};
}

/** Finite observations, not global equivalence. All failures retain their raw tool result. */
export async function runVerification({state,messageId,manifest,client,signal,directory,config={},browserPath,onProgress=()=>{}}){
  const run={id:randomUUID(),messageId,featureName:state.selection?.featureName||'',createdAt:new Date().toISOString(),status:'blocked',cases:[],evidenceIds:[],scope:manifest?.scope||'',expectationSource:manifest?.expectationSource||null,limitations:['Checks cover only the declared finite cases and combined PTY terminal output plus exit code.','Expected values are caller supplied; the app records their stated independent source but cannot establish its truth.','Ambient environment, filesystem and network equivalence are not established.']};
  const evidence=[];let selected;
  const call=async(operation,args)=>{
    signal?.throwIfAborted();const record={id:randomUUID(),kind:'rea',operation,locator:selected?.target.path||'',capturedAt:new Date().toISOString(),parameters:args,raw:null};
    evidence.push(record);run.evidenceIds.push(record.id);
    try{record.raw=await client.callTool(operation,args,{signal});const canonical=canonicalEvidence(record.raw,operation);record.canonicalEvidenceId=canonical.evidence_id;return canonical;}catch(error){record.error=error.message;throw error;}
  };
  try{
    selected=await validateVerificationManifest(manifest,state);run.manifest=selected;run.target=selected.target;run.scope=selected.scope;
    if(selected.kind==='browser'){
      await runBrowserVerification({selected,run,evidence,client,signal,config,browserPath,onProgress});run.completedAt=new Date().toISOString();return {run,evidence};
    }
    run.capture=selected.capture;
    if(selected.capture==='host-process')run.limitations=[
      'Host process observations check only declared finite stdout, stderr and exit-code expectations; they are not canonical REA captures or reconstruction equivalence proofs.',
      'Expected values are caller supplied; the app records their stated independent source but cannot establish its truth.',
      'Processes run with current user permissions. Timeout and cancellation request process-tree cleanup; normal root exit does not establish that detached descendants exited.',
      'Ambient environment, dependencies, filesystem and network equivalence are not established.'];
    for(const item of selected.cases){
      const result={id:item.id,input:{args:item.args||[],...(item.stdin!==undefined?{stdin:item.stdin}:{})},expected:item.expected,actual:null,status:'untested',reason:''};run.cases.push(result);
      try{
        signal?.throwIfAborted();onProgress(`Checking ${item.id} against independently declared expectations…`);
        for(const artifact of selected.execution.artifacts)await identity(artifact);
        if(selected.capture==='host-process'){
          const capture=async(execution)=>{
            const record={id:randomUUID(),kind:'host-process',operation:'capture_host_process',locator:selected.target.path,capturedAt:new Date().toISOString(),parameters:{execution,input:result.input,timeoutMs:selected.timeoutMs},raw:null};
            evidence.push(record);run.evidenceIds.push(record.id);
            try{record.raw=await captureHostProcess(execution,item,{signal,timeoutMs:selected.timeoutMs});return record.raw;}catch(error){record.error=error.message;throw error;}
          };
          const actual=await capture(selected.execution);result.actual=actual;
          for(const artifact of selected.execution.artifacts)await identity(artifact);
          if(actual.reason!=='exited'||actual.exitCode===null){result.reason=`Host observation incomplete: ${actual.reason}; cleanup ${actual.cleanup}.`;continue;}
          result.status=actual.stdout===normalize(item.expected.stdout)&&actual.stderr===normalize(item.expected.stderr)&&actual.exitCode===item.expected.exitCode?'passed':'failed';
          result.reason=result.status==='passed'?'Declared stdout, stderr and exit code matched this host observation.':'Observed stdout, stderr or exit code differs from the declared expectation.';
          if(selected.reconstruction){
            for(const artifact of selected.reconstruction.artifacts)await identity(artifact);
            const other=await capture(selected.reconstruction);
            for(const artifact of selected.reconstruction.artifacts)await identity(artifact);
            const status=other.reason!=='exited'||other.exitCode===null?'unknown':other.stdout===actual.stdout&&other.stderr===actual.stderr&&other.exitCode===actual.exitCode?'pass':'fail';
            result.reconstruction={status,authority:'host-process observation',scope:'stdout, stderr, exit code for this case'};
            if(status==='fail'){result.status='failed';result.reason+=' Reconstruction output or exit code differs.';}else if(status==='unknown'&&result.status!=='failed'){result.status='untested';result.reason+=' Reconstruction observation incomplete.';}
          }
          continue;
        }
        const original=await call('capture_process_scenario',scenario(selected.execution,item,selected.timeoutMs));
        const actual=observed(original.normalized_result);result.actual={terminalText:actual.terminalText,exitCode:actual.exitCode};
        for(const artifact of selected.execution.artifacts)await identity(artifact);
        if(original.normalized_result.manifest.executable_sha256!==selected.execution.artifacts.find(artifact=>equalPath(artifact.path,selected.execution.command)).sha256)throw new Error('Captured executable identity does not match the selected manifest.');
        if(actual.reason.length){result.reason=actual.reason.join(' ');continue;}
        result.status=actual.terminalText===normalize(item.expected.terminalText)&&actual.exitCode===item.expected.exitCode?'passed':'failed';
        result.reason=result.status==='passed'?'Declared terminal output and exit code matched.':'Observed terminal output or exit code differs from the declared expectation.';
        if(selected.reconstruction){
          for(const artifact of selected.reconstruction.artifacts)await identity(artifact);
          const reconstructed=await call('capture_process_scenario',scenario(selected.reconstruction,item,selected.timeoutMs));
          for(const artifact of selected.reconstruction.artifacts)await identity(artifact);
          const comparison=await call('compare_process_captures',{left:original,right:reconstructed});
          const checked=await call('verify_reconstruction',{specification:{name:`${run.featureName||'Selected behavior'}: ${item.id}`,claims:[{claim_id:'terminal',title:'Combined terminal output matches the original for this case',kind:'behavioral',dimension:'terminal',comparison_evidence_id:comparison.evidence_id},{claim_id:'exit',title:'Exit behavior matches the original for this case',kind:'behavioral',dimension:'exit',comparison_evidence_id:comparison.evidence_id}]}});
          const status=checked.normalized_result.status;result.reconstruction={status,evidenceId:checked.evidence_id};
          if(status==='fail'){result.status='failed';result.reason+=' Reconstruction differs on a declared comparison.';}else if(status!=='pass'&&result.status!=='failed'){result.status='untested';result.reason+=' Reconstruction comparison remains unknown.';}
        }
      }catch(error){if(result.status!=='failed')result.status='untested';result.reason=error.message;if(signal?.aborted){run.limitations.push('Verification was cancelled; remaining cases were not executed.');break;}}
    }
    for(const item of selected.cases)if(!run.cases.some(result=>result.id===item.id))run.cases.push({id:item.id,input:{args:item.args||[]},expected:item.expected,actual:null,status:'untested',reason:'Not executed after cancellation.'});
    run.status=run.cases.some(item=>item.status==='failed')?'failed':run.cases.every(item=>item.status==='passed')?'passed':'blocked';
  }catch(error){run.limitations.push(error.message);}
  run.completedAt=new Date().toISOString();
  return {run,evidence};
}
