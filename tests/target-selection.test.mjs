import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {InvestigationStore,Investigator} from '../lib/investigation.mjs';
import {workspaceMap} from '../lib/workspace-map.mjs';
import {failedAttempt} from '../lib/failure-recovery.mjs';
import {nodeStatus,nodeStatusMarker} from '../ui/node-status.js';
import {prepareTargetRecovery} from '../lib/target-recovery.mjs';

test('ambiguous application discovery pauses for selection without a failed result or model request',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-selection-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const folder=path.join(root,'Owned application bundle');await fs.mkdir(folder);const pe=Buffer.alloc(128);pe.write('MZ');
 for(const name of ['avidemux.exe','avidemux_cli.exe','avidemux_jobs.exe','vsProxy.exe','vsProxy_gui_qt5.exe'])await fs.writeFile(path.join(folder,name),pe);
 const store=new InvestigationStore(path.join(root,'data')),state=await store.create();let calls=0;
 const investigator=new Investigator(store,{config:{reaEnabled:false},reasoning:async()=>{calls++;throw Error('Unexpected model request');}});
 await investigator.turn(state,`Inspect "${folder}"`,{agentContext:{text:'Keep saved project context'}});
 assert.equal(calls,0);assert.equal(state.status,'awaiting-selection');assert.equal(state.attempts.length,1);
 const attempt=state.attempts[0];assert.equal(attempt.status,'awaiting-selection');assert.equal(attempt.targetRecovery.candidates.length,5);assert.equal(failedAttempt(attempt),false);assert.equal(attempt.recovery,undefined);
 const map=workspaceMap(state),item=map.nodes.get(`attempt:${attempt.id}`),view={state,map};assert.match(item.title,/Choose application/);assert.equal(nodeStatus(view,item),'Choose application');assert.equal(nodeStatus(view,map.nodes.get('core')),'Choose application');assert.equal(nodeStatusMarker('Choose application').tone,'neutral');
 assert.equal((await store.list()).length,1);assert.equal((await store.read(state.id)).status,'awaiting-selection');
 state.purpose={current:'Understand editing',history:[]};state.draft='Retain my next question';await store.addEvidence(state,{id:'retained',raw:'Owned retained evidence',text:'Owned retained evidence',kind:'note',locator:folder});await store.save(state);await store.updateWorkspace(state.id,{draft:state.draft});
 const before=structuredClone({purpose:state.purpose,evidence:state.evidence}),chosen=path.join(folder,'avidemux_cli.exe');
 const ready=await prepareTargetRecovery(store,state.id,attempt.id,{choice:chosen});const progress=[];
 const resume=new Investigator(store,{config:{reaEnabled:false},reasoning:async(config,schema,prompt)=>{assert.match(prompt,/Keep saved project context/);throw Error('Controlled inspection boundary after target selection');}});
 await assert.rejects(resume.turn(ready,attempt.question,{recoveryAttemptId:attempt.id,preserveDraft:true,onProgress:text=>progress.push(text)}),/Controlled inspection boundary/);
 assert.equal(ready.id,state.id);assert.equal((await store.list()).length,1);assert.equal(ready.targets[0].root,chosen);assert.equal(ready.targets[0].resolution.from,folder);assert.equal(ready.attempts[1].question,attempt.question);assert.equal(ready.attempts[1].nodeId,`attempt:${attempt.id}`);assert.deepEqual(ready.purpose,before.purpose);assert.deepEqual(ready.evidence,before.evidence);assert.equal((await store.read(state.id)).draft,'Retain my next question');assert.ok(progress.includes('Inspecting…'));assert.equal(failedAttempt(ready.attempts[0]),false);
});

test('legacy failed attempts with candidates project as a neutral choice without rewriting diagnostics',()=>{
 const attempt={id:'old',status:'failed',reason:'Original retained diagnostic',recovery:{status:'failed'},targetRecovery:{status:'choice',productName:'Avidemux',candidates:[{path:'C:\\Owned\\avidemux.exe',name:'Avidemux'},{path:'C:\\Owned\\avidemux_cli.exe',name:'Avidemux'}]}};
 const state={title:'Avidemux',messages:[],targets:[],evidence:[],attempts:[attempt]},before=JSON.stringify(state),map=workspaceMap(state),view={state,map};assert.equal(failedAttempt(attempt),false);assert.equal(nodeStatus(view,map.nodes.get('core')),'Choose application');assert.match(map.nodes.get('attempt:old').title,/Choose application/);assert.equal(JSON.stringify(state),before);
});
