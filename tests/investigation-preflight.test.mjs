import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {InvestigationStore,Investigator} from '../lib/investigation.mjs';
import {workspaceMap,branchStats} from '../lib/workspace-map.mjs';
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-preflight-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new InvestigationStore(path.join(root,'data')),state=await store.create(),file=path.join(root,'owned.exe');await fs.writeFile(file,Buffer.from('MZowned-native-header'));return {root,store,state,file};}
test('missing inspection engine blocks before source inspection or paid reasoning and retains exact recovery request',async t=>{
 const {root,store,state,file}=await fixture(t);let calls=0;
 const investigator=new Investigator(store,{config:{rea:path.join(root,'missing-engine.exe')},reasoning:async()=>{calls++;throw Error('Unexpected inference');}}),request=`"${file}"\nUnderstand this application`;
 await investigator.turn(state,request,{nodeId:'core'});
 const saved=await store.read(state.id);assert.equal(calls,0);assert.equal(saved.preflight.status,'blocked');assert.equal(saved.preflight.request.text,request);assert.equal(saved.preflight.request.options.nodeId,'core');assert.equal(saved.preflight.targets[0].targetType,'native');assert.equal(saved.draft,request);assert.equal(saved.messages.length,0);assert.equal(saved.evidence.length,0);assert.equal(saved.attempts?.length||0,0);assert.equal(branchStats(workspaceMap(saved),'core').discovered,0);assert.ok(workspaceMap(saved).nodes.has('utility:preflight'));
});
test('blocked node-local work preserves a different unfinished draft and all earlier research',async t=>{
 const {root,store,state,file}=await fixture(t);state.messages=[{id:'earlier',role:'assistant',title:'Retained knowledge',features:[],text:'Earlier result'}];state.draft='An unrelated unfinished question';await store.save(state);await store.updateWorkspace(state.id,{draft:state.draft,draftContext:null});const messages=JSON.stringify(state.messages);
 await new Investigator(store,{config:{rea:path.join(root,'missing-engine.exe')},reasoning:async()=>{throw Error('Unexpected');}}).turn(state,`"${file}"`,{preserveDraft:true});
 const saved=await store.read(state.id);assert.equal(saved.draft,'An unrelated unfinished question');assert.equal(JSON.stringify(saved.messages),messages);assert.equal(saved.preflight.request.text,`"${file}"`);
});
test('preflight also gates direct backend callers and source-free actions do not demand an inspection dependency',async t=>{
 const {store,state}=await fixture(t);let called=0,context;
 const investigator=new Investigator(store,{config:{},preflight:async input=>{context=input.context;return {status:'blocked',checks:[{id:'owned',label:'Owned requirement',required:true,status:'missing'}],checkedAt:new Date().toISOString()};},reasoning:async()=>{called++;}});
 await investigator.turn(state,'Design a proposed organizer');assert.equal(called,0);assert.deepEqual(context.requirements,[]);assert.equal(state.preflight.status,'blocked');
 const later=await store.create();await assert.rejects(new Investigator(store,{config:{},reasoning:async()=>{called++;throw Error('Owned reasoning boundary');}}).turn(later,'Design a proposed organizer'),/Owned reasoning boundary/);assert.equal(called,1);assert.equal(later.preflight.status,'ready');
});
test('hiding the setup utility cannot bypass the backend gate or shift existing spectrum landmarks',async t=>{
 const {root,store,state,file}=await fixture(t);state.workspace.deletedNodes=['utility:preflight'];await store.save(state);let called=false;
 await new Investigator(store,{config:{rea:path.join(root,'missing.exe')},reasoning:async()=>{called=true;}}).turn(state,`"${file}"`);assert.equal(called,false);assert.equal(state.preflight.status,'blocked');assert.ok(!workspaceMap(state).nodes.has('utility:preflight'));
 const {assignLoopingNodeSpectrum}=await import('../lib/jeremys-spectrum.mjs');const original={messages:[{id:'map',role:'assistant',title:'Owned map',features:[{name:'First'},{name:'Second'}]}],evidence:[],targets:[]},before=assignLoopingNodeSpectrum(workspaceMap(original)),after=assignLoopingNodeSpectrum(workspaceMap({...original,preflight:{status:'ready'}}));for(const [id,value]of Object.entries(before))assert.equal(after[id],value,id);
});
