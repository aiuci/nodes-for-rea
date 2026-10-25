import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {validateVerificationManifest,runVerification,captureHostProcess} from '../lib/verification.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-verify-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'original.mjs');await fs.writeFile(file,'console.log(1);');
  const target={path:file,sha256:hash(await fs.readFile(file))},command={path:process.execPath,sha256:hash(await fs.readFile(process.execPath))};
  return {file,root,target,command,state:{targets:[{kind:'repository',root,locator:root}],selection:{featureName:'Test output'}},manifest:{version:1,kind:'process',scope:'One output observation',expectationSource:{kind:'user-asserted',description:'Independent expected constant is one.'},target,execution:{command:command.path,args:[file],cwd:root,artifacts:[command,target]},cases:[{id:'one',expected:{terminalText:'1\n',exitCode:0}}]}};
}
function envelope(value,operation='capture_process_scenario'){return {structuredContent:{evidence:{evidence_id:'ev_'+hash(JSON.stringify(value)),operation,normalized_result:value}},content:[]};}
function capture(command,overrides={}){return {frames:[{data:'1\r\n'}],exit:{code:0,reason:'exited'},manifest:{executable_sha256:command.sha256},settlement:{state:'quiesced'},residual_unknowns:[],truncated:false,...overrides};}

test('manifest requires independent expectation attribution and exact investigation identity',async t=>{
  const f=await fixture(t);await validateVerificationManifest(f.manifest,f.state);
  await assert.rejects(validateVerificationManifest({...f.manifest,expectationSource:{kind:'generated',description:'Model output'}},f.state),/independent/);
  await assert.rejects(validateVerificationManifest({...f.manifest,target:{...f.target,sha256:'0'.repeat(64)}},f.state),/changed/);
  await assert.rejects(validateVerificationManifest(f.manifest,{targets:[]}),/unrelated/);
  await assert.rejects(validateVerificationManifest({...f.manifest,execution:{...f.manifest.execution,args:['-e','console.log(1)',f.file]}},f.state),/Inline/);
  await assert.rejects(validateVerificationManifest({...f.manifest,timeoutMs:100000},f.state),/timeout/);
});

test('mismatch is failed and complete raw observation remains available',async t=>{
  const f=await fixture(t),raw=envelope(capture(f.command,{frames:[{data:'2\n'}]}));
  const result=await runVerification({...f,messageId:'m',client:{callTool:async()=>raw}});
  assert.equal(result.run.status,'failed');assert.equal(result.run.cases[0].actual.terminalText,'2\n');assert.deepEqual(result.evidence[0].raw,raw);
});

test('normal observed case passes only its explicit finite expectation',async t=>{
  const f=await fixture(t);const result=await runVerification({...f,messageId:'m',client:{callTool:async()=>envelope(capture(f.command))}});
  assert.equal(result.run.status,'passed');assert.equal(result.run.scope,f.manifest.scope);assert.match(result.run.limitations.join(' '),/finite/);
});

test('partial, timeout and provider failure remain untested with retained evidence',async t=>{
  const f=await fixture(t);
  for(const raw of [envelope(capture(f.command,{truncated:true})),envelope(capture(f.command,{exit:{reason:'timeout',code:null}})),{isError:true,content:[{type:'text',text:JSON.stringify({error:{message:'Windows capture unavailable'}})}]}]){
    const result=await runVerification({...f,messageId:'m',client:{callTool:async()=>raw}});
    assert.equal(result.run.status,'blocked');assert.equal(result.run.cases[0].status,'untested');assert.deepEqual(result.evidence[0].raw,raw);
  }
});

test('target changes during capture invalidate otherwise matching output',async t=>{
  const f=await fixture(t);const result=await runVerification({...f,messageId:'m',client:{callTool:async()=>{await fs.appendFile(f.file,'\n// changed');return envelope(capture(f.command));}}});
  assert.equal(result.run.status,'blocked');assert.match(result.run.cases[0].reason,/changed/);
});

test('failed reconstruction verification does not leave a passed case',async t=>{
  const f=await fixture(t);let calls=0;
  const result=await runVerification({...f,messageId:'m',manifest:{...f.manifest,reconstruction:f.manifest.execution},client:{callTool:async()=>{calls++;if(calls===3)throw new Error('Comparison unavailable');return envelope(capture(f.command));}}});
  assert.equal(result.run.status,'blocked');assert.equal(result.run.cases[0].status,'untested');assert.equal(result.evidence.length,3);
});

test('cancelled run retains remaining untested cases without dispatch',async t=>{
  const f=await fixture(t),controller=new AbortController();controller.abort();let calls=0;
  const result=await runVerification({...f,messageId:'m',signal:controller.signal,manifest:{...f.manifest,cases:[...f.manifest.cases,{...f.manifest.cases[0],id:'two'}]},client:{callTool:async()=>{calls++;}}});
  assert.equal(calls,0);assert.equal(result.run.status,'blocked');assert.equal(result.run.cases.length,2);assert.ok(result.run.cases.every(item=>item.status==='untested'));
});

test('real host process independently checks stdout stderr and expected nonzero exit',async t=>{
  const f=await fixture(t);await fs.writeFile(f.file,"console.log('one');console.error('invalid');process.exitCode=2;");f.target.sha256=hash(await fs.readFile(f.file));
  const manifest={...f.manifest,capture:'host-process',cases:[{id:'actual',expected:{stdout:'one\n',stderr:'invalid\n',exitCode:2}}]};
  const passed=await runVerification({...f,manifest,messageId:'real'});
  assert.equal(passed.run.status,'passed');assert.equal(passed.evidence[0].operation,'capture_host_process');assert.equal(passed.run.capture,'host-process');
  const failed=await runVerification({...f,manifest:{...manifest,cases:[{id:'wrong',expected:{stdout:'two\n',stderr:'invalid\n',exitCode:2}}]},messageId:'wrong'});
  assert.equal(failed.run.status,'failed');
});

test('real host timeout is bounded and never passed',async t=>{
  const f=await fixture(t);await fs.writeFile(f.file,'setInterval(()=>{},1000);');
  const start=Date.now(),actual=await captureHostProcess(f.manifest.execution,{args:[]},{timeoutMs:150});
  assert.equal(actual.reason,'timeout');assert.ok(Date.now()-start<6000);assert.ok(actual.cleanup.includes('kill'));
});

test('real host checksum change during execution invalidates matched output',async t=>{
  const f=await fixture(t);await fs.writeFile(f.file,"import fs from 'node:fs';fs.appendFileSync(new URL(import.meta.url),'\\n// changed');console.log(1);");f.target.sha256=hash(await fs.readFile(f.file));
  const result=await runVerification({...f,messageId:'changed',manifest:{...f.manifest,capture:'host-process',cases:[{id:'changed',expected:{stdout:'1\n',stderr:'',exitCode:0}}]}});
  assert.equal(result.run.status,'blocked');assert.match(result.run.cases[0].reason,/changed/);assert.equal(result.evidence[0].raw.stdout,'1\n');
});

test('explicit hashed driver may check an artifact only when both actual driver and exact target are bound',async t=>{
  const f=await fixture(t),driver=path.join(f.root,'driver.mjs');
  await fs.writeFile(f.file,JSON.stringify({value:7}));f.target.sha256=hash(await fs.readFile(f.file));
  await fs.writeFile(driver,"import fs from 'node:fs';console.log(JSON.parse(fs.readFileSync(process.argv[2])).value);");
  const driverIdentity={path:driver,sha256:hash(await fs.readFile(driver))};
  const execution={...f.manifest.execution,args:[driver,f.file],driver:driverIdentity,artifacts:[f.command,f.target,driverIdentity]};
  const manifest={...f.manifest,capture:'host-process',execution,cases:[{id:'read-artifact',expected:{stdout:'7\n',stderr:'',exitCode:0}}]};
  const passed=await runVerification({...f,manifest,messageId:'driver'});assert.equal(passed.run.status,'passed');
  await assert.rejects(validateVerificationManifest({...manifest,execution:{...execution,args:[driver]}},f.state),/exact artifact path|exact target/);
  await assert.rejects(validateVerificationManifest({...manifest,execution:{...execution,args:[f.file,driver]}},f.state),/actual program/);
  await assert.rejects(validateVerificationManifest({...manifest,execution:{...execution,artifacts:[f.command,f.target]}},f.state),/driver must be bound/);
});

test('case arguments cannot turn an interpreter target into an inline program',async t=>{
  const f=await fixture(t),manifest={...f.manifest,target:f.command,execution:{command:f.command.path,args:[],cwd:f.root,artifacts:[f.command]},cases:[{id:'inline',args:['-e','process.exit(0)'],expected:{terminalText:'',exitCode:0}}]};
  await assert.rejects(validateVerificationManifest(manifest,{targets:[{locator:f.command.path}]}),/case arguments/);
});

function browserManifest(){return {version:1,kind:'browser',scope:'Finite URL and DOM assertions',expectationSource:{kind:'user-asserted',description:'Expected independent public heading is Example Domain.'},target:{url:'https://example.com/'},actions:[{step_id:'settle',action:'wait_for_timeout',duration_ms:20}],expected:{url:'https://example.com/',domIncludes:['Example Domain']}};}
function browserCapture({url='https://example.com/',dom='<h1>Example Domain</h1>',actions=[{step_id:'settle'}],overrides={}}={}){
  const artifact={text:dom,bytes:Buffer.byteLength(dom),sha256:hash(Buffer.from(dom))},location={url,origin:new URL(url).origin,redacted:false};
  return {browser:{mode:'launch',process_ownership:'provider-owned',cleanup:'terminated-owned-process'},completeness:{status:'complete',equality_eligible:true},steps:[{step_id:'scenario_start',status:'completed',after_url:location},...actions.map(action=>({step_id:action.step_id,status:'completed',before_url:location,after_url:location,artifacts:{url:{state:'captured',value:location},dom:{state:'captured',value:artifact}}}))],events:{items:[]},limitations:[],...overrides};
}

test('browser manifest binds exact origin, rejects credentials, secrets, code and excessive actions',async()=>{
  const manifest=browserManifest(),state={targets:[{kind:'website',locator:'https://example.com/docs'}]};
  const selected=await validateVerificationManifest(manifest,state);assert.equal(selected.capture,'rea-browser');
  for(const changed of [
    {...manifest,target:{url:'https://unrelated.example/'}},
    {...manifest,target:{url:'https://user:secret@example.com/'}},
    {...manifest,storage:{cookies:[]}},
    {...manifest,actions:[{step_id:'eval',action:'evaluate',expression:'process.exit()'}]},
    {...manifest,actions:[{step_id:'foreign',action:'goto',destination:{url:'https://unrelated.example/'}}]},
    {...manifest,actions:[{step_id:'secret',action:'fill',locator:{kind:'css',selector:'#value'},value:{source:'secret',secret_id:'password'}}]},
    {...manifest,actions:[{step_id:'password',action:'fill',locator:{kind:'css',selector:'input[type=password]'},value:{source:'literal',value:'secret'}}]},
    {...manifest,actions:Array.from({length:21},(_,index)=>({step_id:'wait-'+index,action:'wait_for_timeout',duration_ms:20}))},
    {...manifest,actions:[{step_id:'wait',action:'wait_for_timeout',duration_ms:100000}]}])await assert.rejects(validateVerificationManifest(changed,state));
});

test('browser checks retain canonical raw observations and report exact independent mismatches',async t=>{
  const f=await fixture(t),state={targets:[{kind:'website',locator:'https://example.com/'}]},manifest=browserManifest(),raw=envelope(browserCapture(),'capture_browser_scenario');let args;
  const passed=await runVerification({state,manifest,config:{browser:process.execPath},messageId:'browser',client:{callTool:async(name,parameters)=>{args=parameters;return raw;}}});
  assert.equal(passed.run.status,'passed');assert.deepEqual(passed.evidence[0].raw,raw);assert.equal(args.browser.mode,'launch');assert.deepEqual(args.secrets,[]);assert.equal(args.browser.headless,true);
  const failed=await runVerification({state,manifest:{...manifest,expected:{url:'https://example.com/',domIncludes:['Wrong expected heading']}},config:{browser:process.execPath},messageId:'mismatch',client:{callTool:async()=>raw}});
  assert.equal(failed.run.status,'failed');assert.equal(failed.run.cases[0].status,'passed');assert.equal(failed.run.cases[1].status,'failed');
});

test('browser missing or truncated evidence and unexpected origin remain untested',async()=>{
  const state={targets:[{kind:'website',locator:'https://example.com/'}]},manifest=browserManifest();
  for(const capture of [browserCapture({overrides:{completeness:{status:'truncated',equality_eligible:false}}}),browserCapture({url:'https://unrelated.example/'}),browserCapture({overrides:{steps:[]}})]){
    const result=await runVerification({state,manifest,config:{browser:process.execPath},messageId:'incomplete',client:{callTool:async()=>envelope(capture,'capture_browser_scenario')}});
    assert.equal(result.run.status,'blocked');assert.ok(result.run.cases.every(item=>item.status==='untested'));assert.equal(result.evidence.length,1);
  }
});

test('browser reconstruction receives separate finite assertions without claiming global equivalence',async()=>{
  const state={targets:[{kind:'website',locator:'https://example.com/'}]},manifest={...browserManifest(),reconstruction:{url:'https://clone.example/'}};
  const result=await runVerification({state,manifest,config:{browser:process.execPath},messageId:'reconstruction',client:{callTool:async(name,args)=>envelope(browserCapture({url:args.start_url.url,actions:args.actions}),name)}});
  assert.equal(result.run.status,'passed');assert.equal(result.run.cases.length,4);assert.equal(result.evidence.length,2);assert.match(result.run.reconstruction.scope,/no browser equivalence proof/);
});
