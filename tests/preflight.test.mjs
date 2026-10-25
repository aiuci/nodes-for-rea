import test from 'node:test';
import assert from 'node:assert/strict';
import {runPreflight,createReaAdapter,preflightScope,preflightDiagnostic} from '../lib/preflight.mjs';

const readyEngine=()=>({available:true,session:{providers:[{id:'ghidra',availability:{status:'unavailable',code:'not_configured',reason:'Ghidra is not configured.'}}],toolAvailability:[{names:['analyze_javascript_application','analyze_web_bundle','inspect_managed_artifact','inspect_sqlite_database','inspect_artifact'],available:true}]}});
const check=(id,status,required=true)=>({id,label:id,status,required,detail:`${id} prerequisite`});
const adapter=(checks,more={})=>({id:'fixture',check:async()=>checks,...more});

test('required statuses gate work; missing optional prerequisites do not block unrelated tasks',async()=>{
  let result=await runPreflight({adapters:[adapter([check('core','ready'),check('native','missing',false)])]});assert.equal(result.status,'ready');assert.equal(result.checks[1].required,false);
  result=await runPreflight({adapters:[adapter([check('core','ready'),check('native','missing')])]});assert.equal(result.status,'blocked');assert.equal(result.checks[1].status,'missing');
  for(const state of ['unknown','unavailable','timed-out','canceled'])assert.equal((await runPreflight({adapters:[adapter([check('required',state)])]})).status,'blocked');
  assert.ok(result.checks.every(item=>Number.isFinite(Date.parse(item.checkedAt))));assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
});

test('empty, malformed and over-limit prerequisite responses cannot silently pass',async()=>{
  assert.equal((await runPreflight()).status,'blocked');
  assert.equal((await runPreflight({adapters:[adapter([])]})).status,'blocked');
  assert.equal((await runPreflight({adapters:[adapter([{id:'unchecked',status:'looks-good'}])]})).checks[0].status,'unknown');
  assert.equal((await runPreflight({adapters:[{id:'repair',command:'install something'}]})).status,'blocked');
  assert.equal((await runPreflight({adapters:[adapter(Array.from({length:65},(_,i)=>check(String(i),'ready')))]})).status,'blocked');
});

test('errors retain redacted diagnostics while the main message remains friendly',async()=>{
  const failure=Object.assign(new Error('Missing Java. Authorization: Bearer super-secret; api_key=sk-secret refresh_token=secret https://user:pass@example.com'),{code:'MISSING_JAVA'});
  const result=await runPreflight({adapters:[adapter([],{check:async()=>{throw failure;}})]}),row=result.checks[0];
  assert.equal(result.status,'blocked');assert.match(row.detail,/Open setup and retry/);assert.ok(!row.detail.includes('Authorization'));assert.equal(row.diagnostic.code,'MISSING_JAVA');
  assert.ok(row.diagnostic.message.includes('Missing Java'));assert.ok(!JSON.stringify(result).includes('super-secret'));assert.ok(!JSON.stringify(result).includes('user:pass'));assert.ok(!JSON.stringify(result).includes('sk-secret'));
  assert.match(preflightDiagnostic('access_token=very-secret'),/redacted/);
});

test('timeouts abort the adapter signal and settle an unresponsive check without inference',async()=>{
  let aborted=false,reasoningCalls=0;
  const result=await runPreflight({adapters:[adapter([],{timeoutMs:10,check:async(_context,{signal})=>new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve([check('late','ready')]);},{once:true}))})]});
  if(result.status==='ready')reasoningCalls++;
  assert.equal(result.status,'blocked');assert.equal(result.checks[0].status,'timed-out');assert.equal(aborted,true);assert.equal(reasoningCalls,0);
});

test('user cancellation propagates and pre-aborted checks do not invoke adapters',async()=>{
  const controller=new AbortController();let called=0,aborted=false;
  const work=runPreflight({adapters:[adapter([],{check:async(_context,{signal})=>{called++;return new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve([]);},{once:true}));}})],signal:controller.signal});
  setTimeout(()=>controller.abort(),10);const result=await work;assert.equal(result.status,'blocked');assert.equal(result.canceled,true);assert.equal(aborted,true);
  await runPreflight({adapters:[adapter([],{check:async()=>{called++;return [];}})],signal:controller.signal});assert.equal(called,1);
});

test('scope uses real target classifications and declared inspection components without guessing EXE architecture',()=>{
  const scope=preflightScope({incomingTargets:[{kind:'artifact',targetType:'native',inspectionTarget:{targetType:'managed',root:'app.dll'}},{kind:'website',locator:'https://example.com'},{kind:'artifact',targetType:'javascript-file'},{kind:'artifact',targetType:'sqlite'},{kind:'artifact',targetType:'archive'}],retainedTargets:[{kind:'repository',files:['src/app.mjs']}]});
  assert.deepEqual(scope.requirements,['core','javascript','web','managed','sqlite','archive']);assert.equal(scope.requiresEngine,true);
  assert.deepEqual(preflightScope({incomingTargets:['C:\\unknown.exe']}).requirements,['core']);assert.deepEqual(preflightScope({incomingTargets:[{locator:'unresolved folder'}]}).requirements,['core']);
  assert.deepEqual(preflightScope({retainedTargets:[{kind:'artifact',targetType:'native'}]}).requirements,['core','native']);
  assert.deepEqual(preflightScope().requirements,[]);
});

test('REA adapter runs an actual injected core probe; missing native remains optional for JavaScript/web',async()=>{
  const config={rea:'fixture'},calls=[];
  const rea=createReaAdapter(config,{probe:async(value,options)=>{calls.push({value,options});return readyEngine();}});
  const result=await runPreflight({adapters:[rea],context:{requirements:['core','javascript','web']}});
  assert.equal(result.status,'ready');assert.equal(calls.length,1);assert.equal(calls[0].value,config);assert.ok(calls[0].options.signal instanceof AbortSignal);
  const native=result.checks.find(item=>item.id==='rea:native');assert.equal(native.required,false);assert.equal(native.status,'missing');assert.ok(native.diagnostic.reason.includes('Ghidra'));
  assert.equal((await runPreflight({adapters:[rea],context:{requirements:['core','native']}})).status,'blocked');
});

test('provider readiness never follows from advertised tool names or diagnostic prose alone',async()=>{
  const engine={available:true,tools:['analyze_function','analyze_javascript_application','analyze_web_bundle'],reason:'Everything is ready!',session:{providers:[],toolAvailability:[]}};
  for(const requirement of ['native','javascript','web','managed','sqlite','archive']){
    const result=await runPreflight({adapters:[createReaAdapter({}, {probe:async()=>engine})],context:{requirements:['core',requirement]}});
    assert.equal(result.status,'blocked');assert.equal(result.checks.find(item=>item.id===`rea:${requirement}`).status,'unknown');
  }
});

test('failed core probe overrides provider availability, while managed/SQLite/archive need explicit route evidence',async()=>{
  const engine=readyEngine();engine.available=false;engine.reason='Could not start inspection engine.';engine.session.providers=[{id:'ghidra',availability:{status:'available',diagnostics:{checks:['configuration','platform','architecture','installation','version','headless','native_decompiler','java'].map(name=>({name,ok:true}))}}}];
  let result=await runPreflight({adapters:[createReaAdapter({}, {probe:async()=>engine})],context:{requirements:['core','native']}});assert.equal(result.status,'blocked');assert.equal(result.checks.find(item=>item.id==='rea:core').status,'unavailable');
  result=await runPreflight({adapters:[createReaAdapter({}, {probe:async()=>readyEngine()})],context:{requirements:['core','managed','sqlite','archive']}});assert.equal(result.status,'ready');
});

test('fresh retry can recover readiness without changing the retained target or request context',async()=>{
  const context={incomingTargets:[{kind:'artifact',targetType:'native',locator:'application.exe',identity:{sha256:'retained-hash'}}],message:'Trace the sensor path',parentNodeId:'feature:original'},before=JSON.stringify(context);
  let engine=readyEngine(),calls=0;const rea=createReaAdapter({}, {probe:async()=>{calls++;return engine;},nativeSetupCheck:async()=>({state:'ready'})});
  let result=await runPreflight({adapters:[rea],context});assert.equal(result.status,'blocked');
  engine=readyEngine();engine.session.providers=[{id:'ghidra',name:'Ghidra',availability:{status:'available',diagnostics:{checks:['configuration','platform','architecture','installation','version','headless','native_decompiler','java'].map(name=>({name,ok:true}))}}}];result=await runPreflight({adapters:[rea],context});assert.equal(result.status,'ready');assert.equal(calls,2);assert.equal(JSON.stringify(context),before);
});

test('no target inspection does not start REA, but unsupported explicit requirements cannot pass',async()=>{
  let calls=0;const rea=createReaAdapter({}, {probe:async()=>{calls++;return readyEngine();}});
  assert.equal((await runPreflight({adapters:[rea]})).status,'ready');assert.equal(calls,0);
  assert.equal((await runPreflight({adapters:[rea],context:{requirements:['unimplemented-provider']}})).status,'blocked');assert.equal(calls,1);
});
