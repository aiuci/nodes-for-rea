import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {InvestigationStore,Investigator} from '../lib/investigation.mjs';
import {keepFeature,featureCollection,updateKeptProgress} from '../lib/collection.mjs';
import {saveCollectionChange} from '../lib/collection-save.mjs';
import {prepareShare} from '../lib/document-sharing.mjs';
import {exportInvestigation,importInvestigation} from '../lib/archive.mjs';

async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-collection-safety-')),store=new InvestigationStore(path.join(root,'data')),s=await store.create();
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const text='Owned evidence supports collection preservation.',e={id:'owned',kind:'file',locator:path.join(root,'owned.txt'),text,sha256:createHash('sha256').update(text).digest('hex')};
 s.evidence=[e];s.messages=[{id:'map',role:'assistant',features:[{name:'Feature A',displayLabel:'Feature A',investigate:'Inspect Feature A',claimIndexes:[0]}],claims:[{evidenceId:e.id,quote:text,text:'Owned supported feature.'}]}];
 await fs.mkdir(path.join(store.directory(s.id),'evidence'));await fs.writeFile(path.join(store.directory(s.id),'evidence/owned.txt'),text);
 keepFeature(s,'map','Feature A',true);s.keptFeatures[0].extension={unknown:'preserve original metadata'};
 s.selection={featureName:'Feature A'};s.messages.push({id:'q',role:'user',text:'Owned deeper question'});
 updateKeptProgress(s,{id:'answer',createdAt:'2026-10-20T00:00:00Z',findings:[{finding:'Owned checkpoint'}],claims:s.messages[0].claims});
 await store.save(s);return {root,store,s:await store.read(s.id)};
}

test('remove/reopen/restore retains exact checkpoints, metadata and research without duplicate archives',async t=>{
 const {store,s}=await fixture(t),record=structuredClone(s.keptFeatures[0]),research=JSON.stringify([s.messages,s.evidence]);
 for(let i=0;i<3;i++){
  const removed=await saveCollectionChange(store,s.id,'map','Feature A',false);assert.equal(removed.collectionSaveError,undefined);assert.equal(removed.keptFeatures.length,0);assert.deepEqual(removed.removedKeptFeatures,[record]);
  const reopened=await store.read(s.id);assert.deepEqual(reopened.removedKeptFeatures,[record]);assert.equal(featureCollection(reopened).features.length,0);
  const json=JSON.parse(await fs.readFile(path.join(store.directory(s.id),'feature-collection.json'),'utf8'));assert.equal(json.features.length,0);assert.equal(json.removedKeptFeatures,undefined);
  const restored=await saveCollectionChange(store,s.id,'map','Feature A',true);assert.deepEqual(restored.keptFeatures,[record]);assert.deepEqual(restored.removedKeptFeatures,[]);
  assert.equal(JSON.stringify([s.messages,s.evidence]),research);
 }
});

test('legacy collection without archive/checkpoints remains compatible and gains a checkpoint safely',async t=>{
 const {store,s}=await fixture(t);delete s.keptFeatures[0].checkpoints;delete s.keptFeatures[0].key;delete s.removedKeptFeatures;
 const record=structuredClone(s.keptFeatures[0]);keepFeature(s,'map','Feature A',false);assert.deepEqual(s.removedKeptFeatures,[record]);keepFeature(s,'map','Feature A',true);assert.deepEqual(s.keptFeatures,[record]);
 // A keyed legacy record with no checkpoint field was supported in old exports.
 s.keptFeatures[0].key='feature a';updateKeptProgress(s,{id:'legacy-answer',findings:[{finding:'New checkpoint'}],claims:[]});assert.equal(s.keptFeatures[0].checkpoints.length,1);
 await store.save(s);assert.equal((await store.read(s.id)).keptFeatures.length,1);
});

test('restore uses original retained snapshot even when current source evidence changes',async t=>{
 const {s}=await fixture(t),record=structuredClone(s.keptFeatures[0]);keepFeature(s,'map','Feature A',false);s.evidence[0].text='Changed current evidence';keepFeature(s,'map','Feature A',true);assert.deepEqual(s.keptFeatures,[record]);
});

test('inactive records do not receive new collection checkpoints',async t=>{
 const {s}=await fixture(t);keepFeature(s,'map','Feature A',false);const before=structuredClone(s.removedKeptFeatures);updateKeptProgress(s,{id:'later',findings:[{finding:'Later research'}],claims:[]});assert.deepEqual(s.removedKeptFeatures,before);
});

test('primary disk write failure reconciles unchanged membership and retry preserves original history',async t=>{
 const {store,s}=await fixture(t),before=structuredClone(s.keptFeatures),write=fs.writeFile;
 fs.writeFile=async(file,...args)=>{if(path.dirname(String(file))===store.directory(s.id)&&path.basename(String(file)).startsWith('state-'))throw Object.assign(new Error('Owned disk full'),{code:'ENOSPC'});return write.call(fs,file,...args);};
 let failed;try{failed=await saveCollectionChange(store,s.id,'map','Feature A',false);}finally{fs.writeFile=write;}
 assert.equal(failed.collectionSaveError.outcome,'unchanged');assert.deepEqual(failed.keptFeatures,before);assert.deepEqual((await store.read(s.id)).keptFeatures,before);
 const retry=await saveCollectionChange(store,s.id,'map','Feature A',false);assert.equal(retry.collectionSaveError,undefined);assert.deepEqual(retry.removedKeptFeatures,before);
});

test('real derived-export obstruction reports canonical commit then idempotent retry repairs the export',async t=>{
 const {store,s}=await fixture(t),file=path.join(store.directory(s.id),'feature-collection.json'),before=structuredClone(s.keptFeatures);
 await fs.unlink(file);await fs.mkdir(file);
 const failed=await saveCollectionChange(store,s.id,'map','Feature A',false);assert.equal(failed.collectionSaveError.outcome,'saved');assert.deepEqual(failed.keptFeatures,[]);assert.deepEqual(failed.removedKeptFeatures,before);
 await fs.rmdir(file);const retry=await saveCollectionChange(store,s.id,'map','Feature A',false);assert.equal(retry.collectionSaveError,undefined);assert.deepEqual(retry.removedKeptFeatures,before);assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')).features,[]);
});

test('postcommit navigation failure is truthful and same desired retry remains lossless',async t=>{
 const {store,s}=await fixture(t),list=store.list;store.list=async()=>{throw Error('Owned navigation failure');};
 const failed=await saveCollectionChange(store,s.id,'map','Feature A',false);assert.equal(failed.collectionSaveError.outcome,'saved');assert.equal(failed.keptFeatures.length,0);
 store.list=list;const retry=await saveCollectionChange(store,s.id,'map','Feature A',false);assert.equal(retry.collectionSaveError,undefined);assert.equal(retry.removedKeptFeatures[0].checkpoints.length,1);
});

test('unreadable postfailure state is reported as uncertain without inventing membership',async t=>{
 const {s}=await fixture(t);let reads=0;const broken={read:async()=>{if(reads++)throw Error('Owned read failure');return structuredClone(s);},save:async()=>{throw Error('Owned save failure');}};
 const failed=await saveCollectionChange(broken,s.id,'map','Feature A',false);assert.equal(failed.collectionSaveError.outcome,'uncertain');assert.equal(failed.keptFeatures,undefined);
});

test('invalid collection command cannot save or archive a record',async t=>{
 const {store,s}=await fixture(t),before=await fs.readFile(path.join(store.directory(s.id),'investigation.json'));
 await assert.rejects(saveCollectionChange(store,s.id,'map','Invented feature',false),/not in the saved map/);await assert.rejects(saveCollectionChange(store,s.id,'map','Feature A','false'),/whether to keep/);
 assert.deepEqual(await fs.readFile(path.join(store.directory(s.id),'investigation.json')),before);
});

test('folder export/import retains inactive history while active kept export excludes it',async t=>{
 const {store,s,root}=await fixture(t),record=structuredClone(s.keptFeatures[0]);await saveCollectionChange(store,s.id,'map','Feature A',false);
 const folder=await exportInvestigation(store,s.id,root),other=new InvestigationStore(path.join(root,'imported')),imported=await importInvestigation(other,folder);
 const reopened=await other.read(imported.state.id);assert.deepEqual(reopened.removedKeptFeatures,[record]);assert.deepEqual(featureCollection(reopened).features,[]);keepFeature(reopened,'map','Feature A',true);assert.deepEqual(reopened.keptFeatures,[record]);
});

test('privacy exclusions remove inactive collection copies just like active collection copies',async t=>{
 const {s}=await fixture(t);keepFeature(s,'map','Feature A',false);const full=prepareShare(s,{includeHidden:true,includeLocalPaths:true});assert.equal(full.state.removedKeptFeatures.length,1);
 const filtered=prepareShare(s,{excludedEvidence:['owned']});assert.equal(filtered.state.removedKeptFeatures,undefined);assert.equal(filtered.state.keptFeatures,undefined);
});

test('typed Remove reconciles committed projection failure and resending records one intent without model work',async t=>{
 const {store,s}=await fixture(t),canonical=store.save.bind(store),initial=s.messages.length,record=structuredClone(s.keptFeatures[0]);let fail=true,calls=0;
 s.draft='UNRELATED DRAFT';await canonical(s);
 store.save=async state=>{await canonical(state);if(fail)throw Error('Owned committed projection failure');};
 const agent=new Investigator(store,{config:{},reasoning:()=>{calls++;throw Error('No model allowed');},preflight:()=>{throw Error('No preflight allowed');}});
 await agent.turn(s,'Remove Feature A from my app');assert.equal(s.collectionSaveError.outcome,'saved');assert.equal(s.keptFeatures.length,0);assert.equal(s.draft,'UNRELATED DRAFT');
 const request=s.messages.at(-1);assert.equal(request.role,'user');assert.equal(request.text,'Remove Feature A from my app');assert.equal(request.collectionCommand.keep,false);
 fail=false;const reopened=await store.read(s.id);await agent.turn(reopened,'Remove Feature A from my app');assert.equal(reopened.collectionSaveError,undefined);assert.equal(reopened.messages.length,initial+1);assert.equal(reopened.messages.at(-1).id,request.id);assert.deepEqual(reopened.removedKeptFeatures,[record]);assert.equal(calls,0);
 const disk=await store.read(s.id);assert.equal(disk.collectionSaveError,undefined);assert.equal(disk.collectionCommandResult,undefined);
});

test('typed failure before canonical save retains draft/research and explicit same-id retry logs once',async t=>{
 const {store,s}=await fixture(t),canonical=store.save.bind(store),before=structuredClone(s.messages);s.draft='Remove Feature A from my app';await canonical(s);
 store.save=async()=>{throw Error('Owned before-commit failure');};
 const agent=new Investigator(store,{config:{},reasoning:()=>{throw Error('No model allowed');}});
 await agent.turn(s,s.draft,{collectionRequestId:'owned-stable-request'});assert.equal(s.collectionSaveError.outcome,'unchanged');assert.deepEqual(s.messages,before);assert.equal(s.keptFeatures.length,1);assert.equal(s.draft,'Remove Feature A from my app');
 store.save=canonical;await agent.turn(s,s.draft,{collectionRequestId:'owned-stable-request'});assert.equal(s.collectionSaveError,undefined);assert.equal(s.messages.length,before.length+1);assert.equal(s.messages.at(-1).id,'owned-stable-request');assert.deepEqual(s.messages.slice(0,-1),before);assert.equal(s.draft,'Remove Feature A from my app');
});

test('typed uncertain postcommit readback never substitutes unsaved in-memory membership',async t=>{
 const {s}=await fixture(t),before=structuredClone(s.messages);let disk=structuredClone(s);
 const store={save:async state=>{disk=structuredClone(state);throw Error('Owned uncertain write');},read:async()=>{throw Error('Owned readback unavailable');}};
 const agent=new Investigator(store,{config:{},reasoning:()=>{throw Error('No model allowed');}});await agent.turn(s,'Remove Feature A from my app',{collectionRequestId:'owned-uncertain'});
 assert.equal(s.collectionSaveError.outcome,'uncertain');assert.equal(s.keptFeatures.length,1);assert.deepEqual(s.messages,before);assert.equal(disk.keptFeatures.length,0);
 store.read=async()=>structuredClone(disk);store.save=async state=>{disk=structuredClone(state);};const current=await store.read();await agent.turn(current,'Remove Feature A from my app',{collectionRequestId:'owned-uncertain'});assert.equal(current.messages.length,before.length+1);assert.equal(current.messages.at(-1).id,'owned-uncertain');
});

test('deictic typed retry is bound to captured feature even if selection changes before retry',async t=>{
 const {store,s}=await fixture(t),canonical=store.save.bind(store);s.messages[0].features.push({name:'Feature B',claimIndexes:[0]});s.selection={messageId:'map',featureName:'Feature A'};await canonical(s);
 const agent=new Investigator(store,{config:{},reasoning:()=>{throw Error('No model allowed');}}),choice={messageId:'map',featureName:'Feature A',keep:false};store.save=async()=>{throw Error('Owned precommit failure');};
 await agent.turn(s,'Remove this from my app',{collectionRequestId:'owned-bound-choice',collectionChoice:choice});assert.equal(s.collectionSaveError.outcome,'unchanged');s.selection={messageId:'map',featureName:'Feature B'};store.save=canonical;
 await agent.turn(s,'Remove this from my app',{collectionRequestId:'owned-bound-choice',collectionChoice:choice});assert.equal(s.keptFeatures.length,0);assert.equal(s.removedKeptFeatures[0].name,'Feature A');assert.equal(s.messages.at(-1).text,'Remove this from my app');assert.equal(s.selection.featureName,'Feature B');
 await assert.rejects(agent.turn(s,'Keep Feature B for my app',{collectionRequestId:'owned-bound-choice',collectionChoice:{messageId:'map',featureName:'Feature B',keep:true}}),/different choice/);
});

test('collection clarification remains local and preserves original draft and research',async t=>{
 const {store,s}=await fixture(t),before=structuredClone(s.messages);s.selection=null;s.draft='UNSENT';const agent=new Investigator(store,{config:{},reasoning:()=>{throw Error('No model allowed');}});
 await agent.turn(s,'Keep this');assert.equal(s.messages.at(-1).role,'system');assert.match(s.messages.at(-1).text,/Select a feature/);assert.deepEqual(s.messages.slice(0,-1),before);assert.equal(s.draft,'UNSENT');assert.equal(s.keptFeatures.length,1);
});
