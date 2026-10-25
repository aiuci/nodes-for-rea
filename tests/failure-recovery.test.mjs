import test from 'node:test';
import assert from 'node:assert/strict';
import {explainFailure} from '../lib/failure-recovery.mjs';
import {recordFailure,diagnoseFailure,consumeRecovery} from '../lib/failure-recovery-host.mjs';
import {workspaceMap} from '../lib/workspace-map.mjs';
const fixture=()=>{const attempt={id:'a',question:'Inspect sample',nodeId:'core',status:'failed',reason:'custom provider conflicts with built-in provider',startedAt:new Date().toISOString()};return {attempt,state:{title:'Sample',attempts:[attempt],messages:[],evidence:[],targets:[]},config:{provider:'codex',model:'sample'}};};
const check=async()=>({ready:true,summary:'Local setup ready; remote outcome unverified.'});

test('failure diagnostics retain safe operation attribution without copying arbitrary payloads',()=>{
 const {attempt,config}=fixture(),error=Object.assign(Error('REA returned invalid inspection output'),{code:'REA_INVALID_OUTPUT',data:{stage:'tool-output',operation:'inspect_fixture',receivedBytes:42,secret:'do not retain',payload:{token:'do not retain'}}});
 recordFailure(attempt,error,config);assert.deepEqual(attempt.diagnostic,{runId:'a',stage:'tool-output',faultType:'REA_INVALID_OUTPUT',recoveryOutcome:'request-retained-in-attempt',details:{operation:'inspect_fixture',receivedBytes:42}});
 assert.ok(!JSON.stringify(attempt.diagnostic).includes('do not retain'));
});
test('classifies supported errors without claiming unknown failures are repaired',()=>{
 for(const [reason,category]of [['provider conflicts with built-in provider','configuration'],['401 invalid token','authentication'],['Ghidra missing','native-tool'],['Node executable not found','missing-tool'],['ECONNRESET','connection'],['EPERM','permission'],['mystery failure','unknown']])assert.equal(explainFailure({reason}).category,category);
 assert.equal(explainFailure({status:'stopped'}).category,'interrupted');
});
test('diagnostics preserve research; one explicit retry ticket is consumed and same configuration cannot loop',async()=>{
 const {state,attempt,config}=fixture();recordFailure(attempt,Error(attempt.reason),config);const research=JSON.stringify({messages:state.messages,evidence:state.evidence});
 await diagnoseFailure(state,attempt,{config,check});assert.equal(attempt.recovery.diagnostic.canRetry,true);consumeRecovery(state,attempt,config);assert.throws(()=>consumeRecovery(state,attempt,config),/Diagnose/);
 await diagnoseFailure(state,attempt,{config,check});assert.equal(attempt.recovery.diagnostic.canRetry,false);assert.equal(JSON.stringify({messages:state.messages,evidence:state.evidence}),research);
});
test('changed research, config, expired and failed checks cannot authorize retry',async()=>{
 for(const kind of ['research','config','expired','unready']){const {state,attempt,config}=fixture();await diagnoseFailure(state,attempt,{config,now:10000,check:async()=>({ready:kind!=='unready',summary:'Checked'})});if(kind==='research')state.messages.push({text:'new evidence'});if(kind==='config')config.model='changed';assert.throws(()=>consumeRecovery(state,attempt,config,{now:kind==='expired'?700001:10001}),/Diagnose/);}
});
test('unknown errors and quota/429 retain specialized recovery; failed probes remain blocked',async()=>{
 for(const reason of ['mystery','429 Too Many Requests','out of credits']){const {state,attempt,config}=fixture();attempt.reason=reason;await diagnoseFailure(state,attempt,{config,check});assert.equal(attempt.recovery.diagnostic.canRetry,false);}
 const {state,attempt,config}=fixture();await diagnoseFailure(state,attempt,{config,check:async()=>{throw Error('probe unavailable');}});assert.equal(attempt.recovery.diagnostic.canRetry,false);
});
test('new recovery attempts group on map while complete history remains retained',()=>{
 const {state,attempt,config}=fixture();recordFailure(attempt,Error(attempt.reason),config);const second={...structuredClone(attempt),id:'b'};state.attempts.push(second);assert.equal([...workspaceMap(state).nodes.values()].filter(n=>n.type==='attempt').length,1);assert.equal(state.attempts.length,2);attempt.recovery.resolvedAt='now';second.recovery.resolvedAt='now';assert.equal([...workspaceMap(state).nodes.values()].filter(n=>n.type==='attempt').length,0);assert.equal(state.attempts.length,2);
});

test('failed reasoning retries original request after diagnosis and resolves history without losing evidence',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const {Investigator,InvestigationStore}=await import('../lib/investigation.mjs');const {planSchema}=await import('../lib/agent.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-guided-recovery-'));try{
 const store=new InvestigationStore(root),state=await store.create(),config={reaEnabled:false};state.messages=[{id:'map',role:'assistant',features:[{name:'Alpha',claimIndexes:[0]}],claims:[{text:'Retained source',evidenceId:'e1'}]}];await store.addEvidence(state,{id:'e1',raw:'Retained source',text:'Retained source'});state.selection={messageId:'map',featureName:'Alpha'};state.mechanismInventory={mechanisms:[]};let failing=true;
 const reasoning=async(_config,schema)=>{if(failing)throw Error('provider conflicts with built-in provider');return schema===planSchema?{focus:'Alpha',reads:[]}:{answer:'Retained source',claims:[{text:'Retained source',state:'observed',evidenceId:'e1',quote:'Retained source'}],recommendation:''};};
 const investigator=new Investigator(store,{config,reasoning});await assert.rejects(investigator.turn(state,'Explain Alpha.'),/provider conflicts/);const attempt=state.attempts.at(-1),evidence=structuredClone(state.evidence);state.draft='Keep my independent draft';await diagnoseFailure(state,attempt,{config,check});failing=false;
 await investigator.turn(state,'This must not replace the saved question',{retryFailureAttemptId:attempt.id,preserveDraft:true});assert.equal(state.status,'saved');assert.equal(state.attempts.at(-1).question,'Explain Alpha.');assert.equal(attempt.recovery.status,'resolved');assert.deepEqual(state.evidence,evidence);assert.equal(state.draft,'Keep my independent draft');assert.ok(attempt.recovery.history.some(e=>e.event==='completed'));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('planning failures persist goal and diagnostics gate repeated planner calls',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const {InvestigationStore}=await import('../lib/investigation.mjs');const {AgentSessionStore}=await import('../lib/agent-guide.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-planner-recovery-'));try{const store=new InvestigationStore(root),state=await store.create(),config={provider:'codex'};let calls=0;const guide=new AgentSessionStore(store,{planner:async()=>{calls++;throw Error('provider conflicts with built-in provider');}});
 await assert.rejects(guide.propose(state.id,'Keep this goal',null,{config}),/provider conflicts/);let saved=await store.read(state.id);assert.equal(saved.attempts[0].question,'Keep this goal');assert.equal(saved.attempts[0].kind,'planning');await assert.rejects(guide.propose(state.id,'Keep this goal',null,{config}),/Diagnose/);assert.equal(calls,1);
 await diagnoseFailure(saved,saved.attempts[0],{config,check});await store.save(saved);await assert.rejects(guide.propose(state.id,'Keep this goal',null,{config}),/provider conflicts/);assert.equal(calls,2);saved=await store.read(state.id);await diagnoseFailure(saved,saved.attempts.at(-1),{config,check});assert.equal(saved.attempts.at(-1).recovery.diagnostic.canRetry,false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('generated route failure can be explicitly replanned without Diagnose and resolves older matching failures',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');const {InvestigationStore}=await import('../lib/investigation.mjs');const {AgentSessionStore}=await import('../lib/agent-guide.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-route-retry-'));
 try{const store=new InvestigationStore(root),state=await store.create(),goal='Build my downloader';state.draft='Independent draft';state.attempts=[{id:'legacy',kind:'planning',question:goal,status:'failed',reason:'Route item 2 does not name a unique saved feature node.',recovery:{category:'unknown',history:[]}}];await store.save(state);let calls=0;
 const guide=new AgentSessionStore(store,{planner:async()=>{calls++;if(calls===1)throw Object.assign(Error('The proposed route could not be matched to distinct saved features. Your goal and investigation are kept.'),{code:'ROUTE_PLAN_INVALID'});return [{id:'step',nodeId:'feature:download',status:'pending'}];}});
 await assert.rejects(guide.propose(state.id,goal,null,{config:{}}),/proposed route/);assert.equal(calls,1);
 const session=await guide.propose(state.id,goal,null,{config:{}});assert.equal(session.status,'proposed');assert.equal(calls,2);const saved=await store.read(state.id);assert.equal(saved.draft,'Independent draft');assert.ok(saved.attempts.every(a=>a.recovery.resolvedAt));assert.equal(saved.recoveryRetries,undefined);
 await guide.propose(state.id,goal,null,{config:{}});assert.equal(calls,3);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('configuration retry requires a successful model verification newer than failure, not just sign-in',async()=>{
 const {recoveryReadiness}=await import('../lib/failure-recovery-host.mjs');const attempt={reason:'provider conflicts with built-in provider',finishedAt:'2026-10-20T12:00:00Z'},engine={ready:true,cards:[]},ai={configured:true};
 assert.equal(recoveryReadiness({attempt,engine,ai,config:{}}).ready,false);
 assert.equal(recoveryReadiness({attempt,engine,ai,config:{recoveryVerification:'2026-10-20T11:00:00Z'}}).ready,false);
 assert.equal(recoveryReadiness({attempt,engine,ai,config:{recoveryVerification:'2026-10-20T12:01:00Z'}}).ready,true);
});
