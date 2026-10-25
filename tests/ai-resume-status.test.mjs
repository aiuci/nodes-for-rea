import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {InvestigationStore} from '../lib/investigation.mjs';
import {AiCheckpoint,aiRecoverySeal} from '../lib/ai-checkpoint.mjs';
import {aiResumeStatus} from '../lib/ai-resume-status.mjs';
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-resume-status-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new InvestigationStore(root),state=await store.create(),attempt={id:randomUUID(),status:'blocked',question:'Retained question',aiRecovery:{status:'paused',canResume:true}};
 state.attempts=[attempt];attempt.aiRecovery.seal=aiRecoverySeal(state);await store.save(state);
 const checkpoint=new AiCheckpoint(store.directory(state.id),attempt.id);checkpoint.value.context={message:attempt.question};await assert.rejects(checkpoint.invoke({phase:'plan'},'Retained exact input',async()=>{throw Error('owned failure');}));await checkpoint.save();
 return {store,state,attempt,checkpoint,file:path.join(store.directory(state.id),'investigation.json')};
}
test('read-only resume status validates real checkpoint without changing research or consuming it',async t=>{
 const {store,state,attempt,checkpoint,file}=await fixture(t),before=await fs.readFile(file,'utf8'),savedCheckpoint=await fs.readFile(checkpoint.file,'utf8');
 const check=await aiResumeStatus(store,state.id,attempt.id);assert.equal(check.ready,true);assert.equal(check.status,'ready');assert.equal(await fs.readFile(file,'utf8'),before);assert.equal(await fs.readFile(checkpoint.file,'utf8'),savedCheckpoint);
 state.messages.push({role:'user',text:'New research context'});await store.save(state);const changed=await aiResumeStatus(store,state.id,attempt.id);assert.equal(changed.ready,false);assert.match(changed.reason,/investigation changed/);
});
test('completed result wins over stale paused metadata and a removed checkpoint',async t=>{
 const {store,state,attempt,checkpoint}=await fixture(t);attempt.resultId='completed-result';await store.save(state);await checkpoint.finish();
 const check=await aiResumeStatus(store,state.id,attempt.id);assert.equal(check.status,'completed');assert.equal(check.ready,false);assert.match(check.reason,/already completed/);
});
test('missing checkpoint and provider cooldown are explicit non-executing recovery boundaries',async t=>{
 const {store,state,attempt,checkpoint}=await fixture(t);await checkpoint.finish();const missing=await aiResumeStatus(store,state.id,attempt.id);assert.equal(missing.status,'unavailable');assert.match(missing.reason,/checkpoint is unavailable/);
 attempt.aiRecovery.retryAt=new Date(Date.now()+60000).toISOString();await store.save(state);const waiting=await aiResumeStatus(store,state.id,attempt.id);assert.equal(waiting.status,'waiting');assert.equal(waiting.ready,false);assert.match(waiting.reason,/asked us to wait/);
 assert.equal((await aiResumeStatus(store,state.id,randomUUID())).status,'missing');await assert.rejects(aiResumeStatus(store,'../outside',attempt.id),/Invalid investigation/);
});
