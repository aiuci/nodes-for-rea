import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {InvestigationStore} from '../lib/investigation.mjs';
import {keepFeature} from '../lib/collection.mjs';
import {exportInvestigation,importInvestigation,investigationDeletionPath} from '../lib/archive.mjs';
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-archive-'));assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new InvestigationStore(path.join(root,'data')),state=await store.create(),raw='<h1>A source</h1><script>alert("source text")</script>',id=randomUUID();state.targets=[{kind:'website',locator:'https://example.com'}];
  await store.addEvidence(state,{id,kind:'page',locator:'https://example.com',title:'Source',capturedAt:new Date().toISOString(),sha256:createHash('sha256').update(raw).digest('hex'),text:raw,raw,limitations:[]});
  const row={name:'Sharing',displayLabel:'Sharing',investigate:'How does sharing work?',displayQuestion:'How does sharing work?',claimIndexes:[0]};
  state.title='A <script>private & saved</script> investigation';state.messages=[{id:'map',role:'assistant',text:'A <script>source</script> description',features:[row],claims:[{state:'observed',evidenceId:id,text:'Source description',quote:raw}],recommendation:'Sharing'},{id:'followup',role:'assistant',branchFeatureName:'Sharing',focus:{featureName:'Sharing'},text:'Saved branch',features:[],findings:[],claims:[],recommendation:'Inspect next step'}];state.draft='An unsent question';state.status='saved';keepFeature(state,'map','Sharing',true);await store.save(state);
  const exports=path.join(root,'exports');await fs.mkdir(exports);return {root,store,state,exports,raw};
}
test('folder export relocates and imports complete evidence, branches, Keep, draft and layout without altering the source',async t=>{
  const {root,store,state,exports,raw}=await fixture(t),original=await fs.readFile(path.join(store.directory(state.id),'investigation.json'),'utf8');
  const view={hiddenDirections:['turn:followup'],nodes:[['turn:followup',{x:24,y:-90}]],features:[['map',[['feature:sharing',{x:340,y:20}]]]]};
  const folder=await exportInvestigation(store,state.id,exports,view),document=JSON.parse(await fs.readFile(path.join(folder,'investigation.json')));assert.equal(document.evidence[0].snapshotPath,`evidence/${state.evidence[0].id}.txt`);assert.equal(await fs.readFile(path.join(store.directory(state.id),'investigation.json'),'utf8'),original);
  const report=await fs.readFile(path.join(folder,'index.html'),'utf8');assert.ok(!report.includes('<script>'));assert.ok(report.includes('&lt;script&gt;'));assert.ok(report.includes('Saved snapshot'));
  const moved=path.join(root,'Moved export with spaces');assert.ok(path.resolve(moved).startsWith(path.resolve(root)+path.sep));await fs.rename(folder,moved);
  const {state:imported,view:restored}=await importInvestigation(store,moved);assert.notEqual(imported.id,state.id);assert.deepEqual(imported.messages,state.messages);assert.deepEqual(imported.keptFeatures,(await store.read(state.id)).keptFeatures);assert.equal(imported.draft,state.draft);assert.deepEqual(restored, {version:1,...view});assert.equal(await fs.readFile(imported.evidence[0].snapshotPath,'utf8'),raw);assert.equal((await store.list()).length,2);
});
test('export never overwrites an earlier folder and rejects its own data directory',async t=>{
  const {store,state,exports}=await fixture(t),first=await exportInvestigation(store,state.id,exports),second=await exportInvestigation(store,state.id,exports);assert.notEqual(first,second);assert.ok(await fs.stat(first));await assert.rejects(exportInvestigation(store,state.id,store.directory(state.id)),/outside/);
});
test('damaged export records and snapshots are rejected before importing any history',async t=>{
  const {store,state,exports}=await fixture(t),folder=await exportInvestigation(store,state.id,exports),snapshot=path.join(folder,'evidence',`${state.evidence[0].id}.txt`);await fs.appendFile(snapshot,'changed');await assert.rejects(importInvestigation(store,folder),/damaged/);assert.equal((await store.list()).length,1);
  const second=await exportInvestigation(store,state.id,exports);await fs.appendFile(path.join(second,'investigation.json'),' ');await assert.rejects(importInvestigation(store,second),/changed or is damaged/);assert.equal((await store.list()).length,1);
});
test('deletion targets are constrained to an existing investigation inside the data directory',async t=>{
  const {store,state}=await fixture(t);assert.equal(await investigationDeletionPath(store,state.id),store.directory(state.id));await assert.rejects(investigationDeletionPath(store,'../outside'),/Invalid investigation/);
});

test('accordion positions and bucket identities survive folder export and import',async t=>{
  const {store,state,exports}=await fixture(t),accordion=[['turn:followup',{x:1200,y:60,revision:2}],['history:feature:sharing',{x:900,y:60,revision:'history'}]];
  const folder=await exportInvestigation(store,state.id,exports,{accordion});const imported=await importInvestigation(store,folder);assert.deepEqual(imported.view.accordion,accordion);
});
