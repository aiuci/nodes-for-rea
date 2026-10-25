import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {NativeSetupCheck} from '../lib/native-setup-check.mjs';
import {fileIdentity} from '../lib/targets.mjs';
import {nativeComponents,setupDiagnostic} from '../lib/setup-diagnostics.mjs';
import {engineReadiness} from '../lib/setup-readiness.mjs';
import {explainFailure} from '../lib/failure-recovery.mjs';
import {recoveryReadiness,diagnoseFailure} from '../lib/failure-recovery-host.mjs';
import {createReaAdapter,runPreflight,preflightScope} from '../lib/preflight.mjs';
import {workspaceMap,branchStats} from '../lib/workspace-map.mjs';
const names=['configuration','platform','architecture','installation','version','headless','native_decompiler','java'];
const session=(change={})=>({providers:[{id:'ghidra',availability:{status:'available',diagnostics:{checks:names.map(name=>({name,ok:true,code:null}))},...change}}],toolAvailability:[]});
const engine=s=>engineReadiness({available:true,session:s});
async function fixture(t,options={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-guided-setup-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'owned.exe');await fs.writeFile(file,'Owned static test bytes, never executable.');
  const target={root:file,targetType:'native',identity:await fileIdentity(file)},calls=[];
  const fake=async(_config,{signal,allowedTools})=>({callTool:async(name)=>{calls.push(name);if(signal.aborted)throw signal.reason;if(options.hold)await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));if(options.error===name)return {isError:true};if(name==='binary_session')return {structuredContent:{result:{open:true,analysis_provider_binding:{provider:{id:options.provider||'ghidra'}}}}};if(name==='binary_overview'){const value=options.malformed?{}:{document:'owned',procedure_count:1,string_count:0};return options.normalized?{structuredContent:{evidence_id:'owned-receipt',normalized_result:value}}:{structuredContent:{result:value}};}return {structuredContent:{result:{open:true}}};},close:async()=>calls.push('close'),allowedTools});
  return {root,target,calls,config:{rea:process.execPath},check:new NativeSetupCheck(path.join(root,'settings'),{openClient:fake,...options})};
}
test('component projection distinguishes measured absence, incompatible and unresolved Java without claiming missing Java',()=>{
  const s=session({status:'unavailable',code:'not_configured',diagnostics:{checks:[{name:'configuration',ok:false,code:'not_configured'},{name:'java',ok:false,code:'version_unresolved'},{name:'version',ok:false,code:'unsupported_version'}]}}),rows=nativeComponents(s);
  assert.equal(rows.find(c=>c.id==='ghidra:configuration').state,'missing');assert.equal(rows.find(c=>c.id==='ghidra:java').state,'unknown');assert.equal(rows.find(c=>c.id==='ghidra:version').state,'incompatible');
  const d=setupDiagnostic(engine(s),s,{requirements:['core','native']});assert.equal(d.status,'blocked');assert.match(d.summary,/request is preserved/);assert.ok(d.unknowns.includes('Full JDK'));
});
test('advertised or incomplete Ghidra readiness cannot pass native prerequisites; unrelated routes stay separate',()=>{
  assert.equal(engine(session({diagnostics:{checks:[]}})).cards.at(-1).state,'unknown');
  const s=session();s.toolAvailability=[{names:['analyze_javascript_application'],available:true}];const r=engine(s);assert.equal(r.cards.at(-1).state,'ready');assert.equal(setupDiagnostic(r,s,{requirements:['core','javascript']}).status,'ready');assert.equal(setupDiagnostic(r,s,{requirements:['core','native']}).status,'blocked');
});
test('generic native-provider errors get actionable diagnosis and cannot claim readiness without operation proof',async()=>{
  const attempt={id:'a',status:'failed',reason:'REA open_binary: analysis_provider_unavailable',question:'Inspect saved target'},s=session(),e=engine(s);assert.equal(explainFailure(attempt).category,'native-tool');
  const result=recoveryReadiness({attempt,config:{},ai:{configured:true},engine:e});assert.equal(result.ready,false);
  const state={attempts:[attempt],messages:[],evidence:[],targets:[],draft:'Keep this draft'};await diagnoseFailure(state,attempt,{config:{},check:async()=>result});assert.equal(attempt.recovery.diagnostic.canRetry,false);assert.equal(state.draft,'Keep this draft');
});
test('explicit check runs only open/read/session/close, persists target-bound proof and survives reopen',async t=>{
  const f=await fixture(t);assert.equal((await f.check.current(f.target,f.config,session())).state,'unknown');assert.deepEqual(f.calls,[]);
  assert.equal((await f.check.run(f.target,f.config,session())).state,'ready');assert.deepEqual(f.calls,['open_binary','binary_overview','binary_session','close']);
  assert.equal((await new NativeSetupCheck(path.join(f.root,'settings')).current(f.target,f.config,session())).state,'ready');
});
test('changed configuration, target, expiry and tool files invalidate operation proof',async t=>{
  const f=await fixture(t);const tool=path.join(f.root,'owned-tool');await fs.writeFile(tool,'v1');const s=session();s.providers[0].availability.diagnostics.java_command=tool;
  await f.check.run(f.target,f.config,s);assert.equal((await f.check.current(f.target,{...f.config,reaEnv:{JAVA_HOME:'changed'}},s)).state,'unknown');
  await fs.writeFile(tool,'different version');assert.equal((await f.check.current(f.target,f.config,s)).state,'unknown');
  await f.check.run(f.target,f.config,s);await fs.writeFile(f.target.root,'changed target');assert.equal((await f.check.current(f.target,f.config,s)).state,'unknown');
  const expired=new NativeSetupCheck(path.join(f.root,'settings'),{now:()=>Date.now()+700000});assert.equal((await expired.current(f.target,f.config,s)).state,'unknown');
});
test('failure, malformed overview and cancellation never become a pass and close owned sessions',async t=>{
  for(const options of [{error:'open_binary'},{error:'binary_overview'},{malformed:true},{hold:true,timeoutMs:15}]){const f=await fixture(t,options);const result=await f.check.run(f.target,f.config,session());assert.notEqual(result.state,'ready');assert.ok(f.calls.length===0||f.calls.at(-1)==='close','every created session closes; a pre-dispatch timeout creates none');assert.notEqual((await f.check.current(f.target,f.config,session())).state,'ready');}
});
test('missing provider never opens a client and canceled checks preserve unrelated data',async t=>{
  const f=await fixture(t);await assert.rejects(f.check.run(f.target,f.config,session({status:'unavailable'})),/prerequisites/);assert.deepEqual(f.calls,[]);
  const controller=new AbortController();controller.abort();assert.equal((await f.check.run(f.target,f.config,session(),{signal:controller.signal})).state,'canceled');assert.deepEqual(f.calls,[]);
  assert.equal(await fs.readFile(f.target.root,'utf8'),'Owned static test bytes, never executable.');
});
test('target-scoped preflight requires recent explicit proof and never starts an operation itself',async t=>{
  const f=await fixture(t),s=session(),config={...f.config,nativeSetupCheck:(target,s)=>f.check.current(target,f.config,s)},context=preflightScope({incomingTargets:[f.target]});
  let r=await runPreflight({adapters:[createReaAdapter(config,{probe:async()=>({available:true,session:s})})],context});assert.equal(r.status,'blocked');assert.equal(r.checks.find(c=>c.id==='rea:native-operation').status,'unknown');assert.deepEqual(f.calls,[]);
  await f.check.run(f.target,f.config,s);r=await runPreflight({adapters:[createReaAdapter(config,{probe:async()=>({available:true,session:s})})],context});assert.equal(r.status,'ready');assert.equal(f.calls.filter(n=>n==='open_binary').length,1);
});
test('blocked saved diagnostic response is labeled inspection blocked and excluded from completed result count',()=>{
  const state={targets:[],evidence:[],messages:[{id:'blocked',role:'assistant',continuation:{status:'blocked'},inspectionErrors:['REA inspection: analysis_provider_unavailable'],features:[],claims:[]}]};const map=workspaceMap(state),item=map.nodes.get('turn:blocked');assert.equal(item.title,'Inspection blocked');assert.equal(item.blocked,true);assert.equal(branchStats(map,'core').attempts,0);assert.equal(state.messages.length,1);
});

test('sanitized shared handoff rejects private diagnostic fields while preserving component facts',async()=>{
  const {setupReport}=await import('../lib/setup-report.mjs');const r=engine(session());r.diagnostic=setupDiagnostic(r,session(),{requirements:['core','native']});
  r.diagnostic.token='PRIVATE-SENTINEL';r.diagnostic.cards[0].label='PRIVATE-SENTINEL';r.diagnostic.components[0].detail='PRIVATE-SENTINEL';r.diagnostic.components[0].extra='PRIVATE-SENTINEL';r.diagnostic.observations.ghidraVersion='PRIVATE-SENTINEL';r.diagnostic.requirements.push('PRIVATE-SENTINEL');
  const result=setupReport({engine:r});assert.ok(!JSON.stringify(result).includes('PRIVATE-SENTINEL'));assert.equal(result.inspection.diagnostic.components[0].state,'ready');assert.equal(result.inspection.diagnostic.status,'blocked');
});
test('setup host opening, copying and canceled approval never run analysis or change research',async t=>{
  const f=await fixture(t);
  const {installSetupHost}=await import('../lib/setup-host.mjs');const {setupReport}=await import('../lib/setup-report.mjs');const handlers={},state={targets:[{kind:'artifact',targetType:'native',root:'owned.exe',identity:{path:'owned.exe',sha256:'owned'}}],messages:[],draft:'Keep me'},before=JSON.stringify(state);let approvals=0,runs=0,proof=false,copied;
  const s=session(),nativeCheck={file:path.join(f.root,'native-inspection-check.json'),current:async()=>({state:proof?'ready':'unknown'}),run:async()=>{runs++;proof=true;return {state:'ready'};}},dialog={showMessageBox:async()=>({response:approvals}),showOpenDialog:async()=>({canceled:true})};
  installSetupHost({handle:(name,fn)=>handlers[name]=fn,setup:fn=>fn(new AbortController().signal),connection:{view:async()=>({configured:true})},reaConnection:{view:async()=>({available:true}),config:async()=>({rea:process.execPath}),bundled:async()=>({available:false})},nativeCheck,store:{read:async()=>state},getCurrent:()=> 'owned',dialog,getWindow:()=>null,clipboard:{writeText:text=>copied=JSON.parse(text)},setupReport,system:()=>({}),classify:async()=>state.targets[0],probe:async()=>({available:true,session:s})});
  let result=await handlers['setup-check']();assert.equal(result.diagnostic.status,'blocked');assert.equal(runs,0);await handlers['setup-report']();assert.equal(copied.inspection.diagnostic.status,'blocked');
  assert.equal((await handlers['setup-native-check']()).canceled,true);assert.equal(runs,0);approvals=1;result=await handlers['setup-native-check']();assert.equal(runs,1);assert.equal(result.diagnostic.status,'ready');assert.equal(JSON.stringify(state),before);
});
test('an unavailable provider cannot reach native approval or operation',async()=>{
  const {installSetupHost}=await import('../lib/setup-host.mjs');const handlers={};let effects=0;
  installSetupHost({handle:(name,fn)=>handlers[name]=fn,setup:fn=>fn(new AbortController().signal),connection:{},reaConnection:{view:async()=>({available:true}),config:async()=>({rea:process.execPath}),bundled:async()=>({})},nativeCheck:{current:async()=>({state:'unknown'}),run:async()=>effects++},store:{read:async()=>({targets:[]})},getCurrent:()=>null,dialog:{showMessageBox:async()=>effects++},getWindow:()=>null,probe:async()=>({available:true,session:session({status:'unavailable',code:'not_configured'})})});
  await assert.rejects(handlers['setup-native-check'](),/prerequisites/);assert.equal(effects,0);
});
test('independent target checks survive each other and a failed latest check invalidates only its target',async t=>{
  const f=await fixture(t),second=path.join(f.root,'second.exe');await fs.writeFile(second,'Owned second static target');const target={root:second,targetType:'native',identity:await fileIdentity(second)};
  await f.check.run(f.target,f.config,session());await f.check.run(target,f.config,session());assert.equal((await f.check.current(f.target,f.config,session())).state,'ready');assert.equal((await f.check.current(target,f.config,session())).state,'ready');
  const canceled=new AbortController();canceled.abort();await f.check.run(f.target,f.config,session(),{signal:canceled.signal});assert.equal((await f.check.current(f.target,f.config,session())).state,'canceled');assert.equal((await f.check.current(target,f.config,session())).state,'ready');
});
test('diagnostic persistence failure prevents a native operation and is surfaced',async t=>{
  const f=await fixture(t);f.check.write=async()=>{throw Error('Owned diagnostic disk failure');};await assert.rejects(f.check.run(f.target,f.config,session()),/disk failure/);assert.deepEqual(f.calls,[]);
});

test('required unavailable non-native routes never produce a success summary',()=>{
 for(const id of ['web','managed','sqlite','archive']){const s=session();s.toolAvailability=[{names:[{web:'analyze_web_bundle',managed:'inspect_managed_artifact',sqlite:'inspect_sqlite_database',archive:'inspect_artifact'}[id]],available:false}];const record=setupDiagnostic(engine(s),s,{requirements:['core',id]});assert.equal(record.status,'blocked');assert.doesNotMatch(record.summary,/prerequisites are working/);assert.match(record.summary,/required inspection route/i);}
});
test('damaged or missing persisted timestamps cannot bypass freshness after reopen',async t=>{
 const f=await fixture(t);await f.check.run(f.target,f.config,session());const content=JSON.parse(await fs.readFile(f.check.file,'utf8'));for(const value of [null,'not-a-date',undefined]){content.records.at(-1).checkedAt=value;await fs.writeFile(f.check.file,JSON.stringify(content));assert.equal((await f.check.current(f.target,f.config,session())).state,'unknown');}
});
test('IDA configuration or provider identity changes invalidate non-Ghidra proof',async t=>{
 const f=await fixture(t,{provider:'ida'}),registration=path.join(f.root,'ida.json');await fs.writeFile(registration,'owned initial config');const config={...f.config,reaEnv:{REA_IDA_MCP_CONFIG:registration}},s={providers:[{id:'ida',version:'owned-v1',availability:{status:'available'}}]};
 await f.check.run(f.target,config,s);assert.equal((await f.check.current(f.target,config,s)).state,'ready');await fs.writeFile(registration,'owned changed registration');assert.equal((await f.check.current(f.target,config,s)).state,'unknown');await f.check.run(f.target,config,s);const changed=structuredClone(s);changed.providers[0].version='owned-v2';assert.equal((await f.check.current(f.target,config,changed)).state,'unknown');
});
test('typed native failure and failed operation survive into the sanitized common record',()=>{
 const s=session(),record=setupDiagnostic(engine(s),s,{requirements:['core','native'],verification:{state:'unavailable',code:'analysis_provider_unavailable',operation:'open_binary'}});assert.equal(record.verification.code,'analysis_provider_unavailable');assert.equal(record.verification.operation,'open_binary');assert.match(record.summary,/did not pass/);
});

test('unavailable optional Hopper or stale IDA config cannot block a working Ghidra operation',async t=>{
 const f=await fixture(t),s=session();s.providers.push({id:'hopper',availability:{status:'unavailable',code:'unsupported_host',diagnostics:{launcher_path:path.join(f.root,'absent-hopper.exe')}}});s.providers.push({id:'ida',availability:{status:'unavailable',code:'not_configured'}});
 const config={...f.config,reaEnv:{REA_IDA_MCP_CONFIG:path.join(f.root,'absent-ida.json')}};assert.equal((await f.check.run(f.target,config,s)).state,'ready');assert.equal((await f.check.current(f.target,config,s)).state,'ready');
});

for(const code of ['analysis_provider_unavailable','provider_unavailable'])test(`${code} during seeding stops before model planning and preserves draft/research`,async t=>{
 const f=await fixture(t);await fs.writeFile(f.target.root,'MZ owned diagnostic fixture');const {Investigator,InvestigationStore}=await import('../lib/investigation.mjs');const store=new InvestigationStore(path.join(f.root,'research')),state=await store.create();state.draft='Keep this independent draft';const priorMessage={id:'prior-answer',role:'assistant',overview:'Keep this prior finding',features:[],claims:[]},priorEvidence={id:'prior-source',kind:'file',text:'Keep this prior evidence'};state.messages.push(priorMessage);state.evidence.push(priorEvidence);await store.save(state);let reasoning=0;
 const client={tools:[{name:'open_binary',inputSchema:{type:'object',properties:{}}},{name:'binary_overview',inputSchema:{type:'object',properties:{}}}],sessionStatus:async()=>({}),callTool:async name=>{if(name==='open_binary')return {isError:true,structuredContent:{error:{code,message:code==='provider_unavailable'?'The selected analysis provider is unavailable. Review the reported local diagnostics or run `rea doctor`, then retry.':'No compatible provider was selected.'}}};throw Error('Owned checkpoint unavailable');},close:async()=>{}};
 const investigator=new Investigator(store,{config:{reaEnabled:true},preflight:async()=>({status:'ready',checks:[]}),openClient:async()=>client,reasoning:async()=>{reasoning++;throw Error('Model must not be called');}});
 await investigator.turn(state,'Inspect "'+f.target.root+'"',{preserveDraft:true});assert.equal(reasoning,0);assert.equal(state.status,'blocked');assert.equal(state.attempts.at(-1).status,'blocked');assert.equal(state.draft,'Keep this independent draft');assert.deepEqual(state.messages.filter(m=>m.role==='assistant'),[priorMessage]);assert.deepEqual(state.evidence.find(e=>e.id===priorEvidence.id),priorEvidence);assert.ok(state.evidence.some(e=>e.operationStatus==='failed'));assert.ok(state.attempts.at(-1).reason.includes(code));assert.equal(state.preflight.status,'blocked');assert.ok(state.preflight.request.text.includes(f.target.root));assert.equal((await store.read(state.id)).draft,'Keep this independent draft');
});


test('exact reported provider_unavailable retains a native recovery category and sanitized typed code',async()=>{
 const {sanitizedSetupDiagnostic}=await import('../lib/setup-diagnostics.mjs');
 const reason='REA inspection: Inspection failed: provider_unavailable: The selected analysis provider is unavailable. Review the reported local diagnostics or run `rea doctor`, then retry.';
 assert.equal(explainFailure({status:'failed',reason}).category,'native-tool');
 const s=session(),record=setupDiagnostic(engine(s),s,{requirements:['core','native'],verification:{state:'unavailable',code:'provider_unavailable',operation:'open_binary'}}),safe=sanitizedSetupDiagnostic(record);
 assert.equal(record.verification.code,'provider_unavailable');assert.equal(safe.verification.code,'provider_unavailable');assert.equal(safe.verification.operation,'open_binary');assert.equal(safe.status,'blocked');assert.match(safe.summary,/did not pass/);
});

test('native setup admits the pinned REA canonical evidence envelope without relaxing overview validation',async t=>{const good=await fixture(t,{normalized:true});assert.equal((await good.check.run(good.target,good.config,session())).state,'ready');const bad=await fixture(t,{normalized:true,malformed:true});assert.equal((await bad.check.run(bad.target,bad.config,session())).state,'unavailable');});

test('native verifier honors shipped REA330-second provider startup contract instead of a60-second wrapper cap',async t=>{const f=await fixture(t),open=f.check.openClient,timeouts=[];f.check.openClient=async(config,options)=>{timeouts.push(options.timeout);const client=await open(config,options),call=client.callTool;client.callTool=async(name,args,opts)=>{if(name==='binary_overview')timeouts.push(opts.timeout);return call(name,args,opts);};return client;};assert.equal(f.check.timeoutMs,360000);assert.equal((await f.check.run(f.target,f.config,session())).state,'ready');assert.ok(timeouts.every(ms=>ms>60000&&ms<=330000));});
test('an actual native tool timeout is distinct from unavailable or missing prerequisites',async t=>{const {sanitizedSetupDiagnostic}=await import('../lib/setup-diagnostics.mjs');const f=await fixture(t);f.check.openClient=async()=>({callTool:async()=>{throw Error('REA tools/call timed out.');},close:async()=>{}});const failed=await f.check.run(f.target,f.config,session());assert.equal(failed.state,'unavailable');assert.equal(failed.code,'analysis_timeout');const record=setupDiagnostic(engine(session()),session(),{requirements:['core','native'],verification:failed});assert.equal(sanitizedSetupDiagnostic(record).verification.code,'analysis_timeout');});
