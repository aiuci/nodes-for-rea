import test from 'node:test';
import assert from 'node:assert/strict';
import {errorPresentation} from '../lib/user-feedback.mjs';
import {interruptedRequest} from '../lib/failure-recovery.mjs';
import {explainFailure} from '../lib/failure-recovery.mjs';

test('route reference failures explain how to replan without sending users to setup',()=>{
 for(const reason of ['Route item 2 does not name a unique saved feature node.','The proposed route could not be matched to distinct saved features. Your goal and investigation are kept. Choose Plan the route to try again.']){
  const info=errorPresentation(Error(reason));assert.equal(info.category,'validation');assert.ok(info.icon);assert.match(info.message,/Plan the route/);assert.doesNotMatch(info.message,/Setup|technical details/);
  assert.match(explainFailure({status:'failed',reason}).nextAction,/Plan the route/);
 }
});

test('common failures identify the resource and a useful next step without exposing raw errors as the explanation',()=>{
 for(const [raw,category] of [['connect EACCES socket os 10013','network-blocked'],['401 Unauthorized','authentication'],['429 Too Many Requests','rate-limit'],['out of credits','quota'],['ENOSPC disk full','storage'],['EPERM file access denied','permission'],['Ghidra unavailable','native-tool'],['unsupported provider flag','configuration'],['ETIMEDOUT response timed out','timeout']]){
  const info=errorPresentation(new Error(raw));assert.equal(info.category,category);assert.ok(info.icon&&info.actionLabel);assert.notEqual(info.message,raw);assert.equal(info.detail,raw);
 }
 assert.doesNotMatch(errorPresentation(Error('mystery')).message,/saved|retained/i);
 assert.match(errorPresentation(Error('EACCES'),{context:'save'}).message,/Keep this window open/);
 assert.match(errorPresentation(Error('corrupt'),{context:'open'}).message,/not been replaced/);
 assert.equal(errorPresentation(Error('missing microphone'),{context:'dictation'}).category,'dictation');
 assert.equal(errorPresentation(Error('bad theme'),{context:'theme'}).category,'theme');
});

test('explicit interrupted resume uses saved context and rejects checkpoint, completed, duplicate and missing requests',()=>{
 const attempt={id:'old',status:'stopped',question:'Original saved question',nodeId:'feature:a',retryContext:{message:'Saved precise question',branchFeatureName:'A',parentResultId:'parent',parentNodeId:'turn:parent',nodeId:'feature:a',agentContext:{text:'Approved project context'}}},state={attempts:[attempt]};
 assert.deepEqual(interruptedRequest(state,attempt),{message:'Saved precise question',branchFeatureName:'A',parentResultId:'parent',parentNodeId:'turn:parent',nodeId:'feature:a',agentContext:{text:'Approved project context'}});
 for(const patch of [{resultId:'done'},{aiRecovery:{status:'paused'}},{targetRecovery:{}},{status:'failed'},{kind:'planning'}])assert.throws(()=>interruptedRequest({attempts:[]},{...attempt,...patch}),/cannot restart/);
 assert.throws(()=>interruptedRequest({attempts:[attempt,{retryOf:'old'}]},attempt),/newer continuation/);
 assert.throws(()=>interruptedRequest({attempts:[]},{id:'empty',status:'stopped'}),/saved request is unavailable/);
});

test('resuming an interrupted inspection preserves independent draft/evidence, creates one continuation and runs normal preflight',async()=>{
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const {Investigator,InvestigationStore}=await import('../lib/investigation.mjs'),{planSchema}=await import('../lib/agent.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-explicit-resume-'));
 try{
  const store=new InvestigationStore(root),state=await store.create();state.messages=[{id:'map',role:'assistant',features:[{name:'Alpha',claimIndexes:[0]}],claims:[{text:'Retained source',evidenceId:'e1'}]}];await store.addEvidence(state,{id:'e1',raw:'Retained source',text:'Retained source'});state.selection={messageId:'map',featureName:'Alpha'};state.mechanismInventory={mechanisms:[]};state.draft='Independent unsent question';
  const attempt={id:'interrupted',status:'stopped',question:'Explain Alpha.',retryContext:{message:'Explain Alpha.',branchFeatureName:'Alpha',nodeId:'feature:alpha'},recovery:{status:'interrupted',history:[]}};state.attempts=[attempt];await store.save(state);
  let checks=0,calls=0;const investigator=new Investigator(store,{config:{reaEnabled:true},preflight:async()=>{checks++;return {status:'blocked',checks:[]};},reasoning:async(_c,schema)=>{calls++;return schema===planSchema?{focus:'Alpha',reads:[]}:{answer:'Retained source',claims:[{text:'Retained source',state:'observed',evidenceId:'e1',quote:'Retained source'}],recommendation:''};}});
  await investigator.turn(state,'Must not replace saved context',{resumeInterruptedAttemptId:attempt.id});assert.equal(checks,1);assert.equal(calls,0);assert.equal(state.attempts.length,1);assert.equal(state.draft,'Independent unsent question');
  investigator.config={reaEnabled:false};const evidence=structuredClone(state.evidence);await investigator.turn(state,'Ignored replacement',{resumeInterruptedAttemptId:attempt.id});assert.ok(calls>0);assert.equal(state.attempts.length,2);assert.equal(state.attempts[1].retryOf,'interrupted');assert.equal(state.attempts[1].question,'Explain Alpha.');assert.equal(attempt.recovery.status,'resolved');assert.deepEqual(state.evidence,evidence);assert.equal(state.draft,'Independent unsent question');
  await assert.rejects(investigator.turn(state,'duplicate',{resumeInterruptedAttemptId:attempt.id}),/cannot restart/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
