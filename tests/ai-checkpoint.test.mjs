import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {AiCheckpoint,aiRecoverySeal} from '../lib/ai-checkpoint.mjs';
import {AiServiceError} from '../lib/ai-recovery.mjs';
import {Investigator,InvestigationStore} from '../lib/investigation.mjs';
import {planSchema} from '../lib/agent.mjs';
import {mechanismSchema} from '../lib/mechanisms.mjs';
async function folder(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-ai-resume-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('checkpoint retains exact failed input and completed answers; changed research or pipeline cannot replay',async t=>{
  const root=await folder(t),id=randomUUID(),state={messages:[],evidence:[],targets:[]},checkpoint=new AiCheckpoint(root,id);checkpoint.value.context={message:'question'};
  await checkpoint.invoke({phase:1},'original plan',async()=>({ok:true}));await assert.rejects(checkpoint.invoke({phase:2},'original answer input',async()=>{throw Error('429');}));await checkpoint.save();
  const attempt={id,aiRecovery:{canResume:true,seal:aiRecoverySeal(state)}};state.draft='New unsent words';state.workspace={zoom:.2};
  const resumed=await AiCheckpoint.load(root,attempt,state);assert.deepEqual(await resumed.invoke({phase:1},'different plan',()=>assert.fail('completed call replayed')),{ok:true});
  await resumed.invoke({phase:2},'different answer input',async input=>{assert.equal(input,'original answer input');return {answer:true};});
  const incompatible=await AiCheckpoint.load(root,attempt,state);await assert.rejects(incompatible.invoke({changed:true},'',()=>assert.fail()),/pipeline changed/);
  state.messages.push({text:'changed research'});await assert.rejects(AiCheckpoint.load(root,attempt,state),/investigation changed/);
  state.messages=[];attempt.aiRecovery.retryAt=new Date(Date.now()+60000).toISOString();await assert.rejects(AiCheckpoint.load(root,attempt,state),/asked us to wait/);
  delete attempt.aiRecovery.retryAt;await resumed.finish();await assert.rejects(AiCheckpoint.load(root,attempt,state),/checkpoint is unavailable/);
});
for(const followup of [false,true])test(`real Investigator ${followup?'follow-up':'discovery'} resumes after synthesis 429 without repeating reads or completed model phases`,async t=>{
  const root=await folder(t),source=path.join(root,'source');await fs.mkdir(source);await fs.writeFile(path.join(source,'main.js'),'export const undo = () => history.pop();');
  const store=new InvestigationStore(path.join(root,'saved')),state=await store.create();let failing=false,calls=[],failedInput;
  const reasoning=async(_config,schema,prompt)=>{calls.push(schema===planSchema?'plan':schema===mechanismSchema?'inventory':'answer');if(schema===planSchema)return {focus:'undo',reads:[{kind:'file',target:'main.js',reason:'Inspect undo.'}]};if(schema===mechanismSchema)return {mechanisms:[]};if(failing){failedInput=prompt;throw new AiServiceError({category:'rate-limit',status:429,retryAt:null},{safeToRetry:true});}return {answer:'Undo pops history.',understanding:'History operation.',recommendation:'',directions:[],claims:[{text:'Undo pops history.',state:'observed',evidenceId:state.evidence.at(-1).id,quote:'history.pop()'}]};};
  const investigator=new Investigator(store,{config:{reaEnabled:false},reasoning});
  if(followup){await investigator.turn(state,`"${source}"\nExplore undo`);delete state.mechanismInventory;}
  calls=[];failing=true;await assert.rejects(investigator.turn(state,followup?'Investigate undo further.':`"${source}"\nExplore undo`),/temporarily rate-limited/);
  const attempt=state.attempts.at(-1),beforeEvidence=state.evidence.map(e=>({id:e.id,sha256:e.sha256})),beforeActivity=structuredClone(state.activity),beforeAttempts=state.attempts.length,beforeUsers=state.messages.filter(m=>m.role==='user').length;
  assert.deepEqual(calls,['plan','inventory','answer']);assert.equal(attempt.aiRecovery.canResume,true);assert.equal(state.status,'blocked');
  let reopened=await store.read(state.id);reopened.draft='Do not lose this draft';await store.save(reopened);calls=[];
  const resumed=new Investigator(store,{config:{reaEnabled:false},reasoning:async(config,schema,prompt,...rest)=>{calls.push('resumed answer');assert.notEqual(schema,planSchema);assert.notEqual(schema,mechanismSchema);assert.equal(prompt,failedInput);failing=false;return reasoning(config,schema,prompt,...rest);}});
  await resumed.turn(reopened,'ignored',{resumeAiAttemptId:attempt.id});
  assert.deepEqual(calls,['resumed answer','answer']);assert.equal(reopened.status,'saved');assert.equal(reopened.draft,'Do not lose this draft');assert.equal(reopened.attempts.length,beforeAttempts);assert.equal(reopened.messages.filter(m=>m.role==='user').length,beforeUsers);assert.deepEqual(reopened.evidence.map(e=>({id:e.id,sha256:e.sha256})),beforeEvidence);assert.deepEqual(reopened.activity,beforeActivity);assert.equal(reopened.attempts.at(-1).aiRecovery.status,'resolved');
  await assert.rejects(fs.stat(path.join(store.directory(state.id),'ai-checkpoints',attempt.id+'.json')),/ENOENT/);
  assert.equal(reopened.attempts.at(-1).recovery.status,'resolved');assert.ok(reopened.attempts.at(-1).recovery.resolvedAt);assert.equal(reopened.attempts.at(-1).recovery.history.filter(e=>e.event==='completed').length,1);
  const finished=JSON.stringify(reopened),count=calls.length;await resumed.turn(reopened,'A late duplicate Resume click',{resumeAiAttemptId:attempt.id});assert.equal(JSON.stringify(reopened),finished);assert.equal(calls.length,count);
});

test('browsing another branch during a pause cannot retarget the saved reasoning request',async t=>{
 const root=await folder(t),store=new InvestigationStore(root),state=await store.create();state.messages=[{id:'map',role:'assistant',features:[{name:'Alpha',claimIndexes:[0]},{name:'Beta',claimIndexes:[0]}],claims:[{text:'Retained source',evidenceId:'e1'}]}];await store.addEvidence(state,{id:'e1',raw:'Retained source',text:'Retained source'});state.selection={messageId:'map',featureName:'Alpha'};state.mechanismInventory={mechanisms:[]};let fail=true;
 const reasoning=async(_config,schema)=>schema===planSchema?{focus:'Alpha',reads:[]}:fail?(()=>{throw new AiServiceError({category:'rate-limit',status:429},{safeToRetry:true});})():{answer:'Retained source',claims:[{text:'Retained source',state:'observed',evidenceId:'e1',quote:'Retained source'}],recommendation:''};const investigator=new Investigator(store,{config:{reaEnabled:false},reasoning});await assert.rejects(investigator.turn(state,'Explain its mechanism.'),/rate-limited/);const id=state.attempts.at(-1).id;state.selection={messageId:'map',featureName:'Beta'};fail=false;await investigator.turn(state,'ignored',{resumeAiAttemptId:id});assert.equal(state.messages.at(-1).branchFeatureName,'Alpha');assert.equal(state.messages.at(-1).focus.featureName,'Alpha');
});
