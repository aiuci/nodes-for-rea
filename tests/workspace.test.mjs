import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {InvestigationStore,Investigator} from '../lib/investigation.mjs';
import {featureRecords,topicGroups,assignSpectrum,workspacePatch,evidenceLabel} from '../lib/workspace.mjs';
import {exportInvestigation,importInvestigation} from '../lib/archive.mjs';
import {auditSavedSupport} from '../lib/support-audit.mjs';
import {planSchema} from '../lib/agent.mjs';
import {coverageErrors} from '../lib/mechanisms.mjs';

test('every retained identity survives malformed grouping, later wording and spectrum append',()=>{
  const state={messages:[{id:'m1',role:'assistant',features:[{name:'Export'},{name:'PNG',parentName:'Export'},{name:'Loop',parentName:'Loop'},{name:'Lost',parentName:'Missing'}]},{id:'m2',role:'assistant',features:[{name:'PNG',displayLabel:'PNG image',parentName:'Export'}]}]};
  const records=featureRecords(state),groups=topicGroups(records),first=assignSpectrum(records,groups);
  assert.equal(records.length,4);assert.equal(records.find(r=>r.row.name==='PNG').title,'PNG image');assert.deepEqual(new Set(groups.flatMap(g=>g.items.map(r=>r.id))),new Set(records.map(r=>r.id)));
  state.messages.push({role:'assistant',features:[{name:'New feature'}]});const next=featureRecords(state),colors=assignSpectrum(next,topicGroups(next),first);for(const [id,t]of Object.entries(first))assert.equal(colors[id],t);
});
test('workspace sidecar survives stale engine saves and is included in portable export/import',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-workspace-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new InvestigationStore(path.join(root,'data')),state=await store.create(),stale=structuredClone(state);
  state.messages=[{id:'map',role:'assistant',features:[{name:'PNG'}]}];await store.save(state);
  const workspace={activeView:'evidence',inspected:'feature:png',pins:['feature:png'],expanded:['feature:png'],cameras:{evidence:{x:38,y:72,scale:.9}},spectrum:{'feature:png':.2},dottedLines:true,wiresVisible:false,circuitMode:true,bounceNodes:true,outlineFollow:false,outlineExpanded:['feature:png'],growth:[{nodeId:'turn:map',originId:'core',addedIds:['feature:png'],createdAt:1,seenAt:null}],growthRoots:['turn:map']};
  await store.updateWorkspace(state.id,{workspace,draft:'Does transparency survive?',draftContext:{featureName:'PNG',messageId:'map',label:'PNG'}});
  stale.messages=state.messages;stale.status='saved';await store.save(stale);const read=await store.read(state.id);
  assert.equal(read.draft,'Does transparency survive?');assert.equal(read.workspace.activeView,'evidence');assert.equal(read.draftContext.featureName,'PNG');assert.equal(read.workspace.cameras.evidence.x,38);assert.equal(read.workspace.dottedLines,true);assert.equal(read.workspace.wiresVisible,false);assert.equal(read.workspace.circuitMode,true);assert.equal(read.workspace.bounceNodes,true);assert.equal(read.workspace.outlineFollow,false);assert.deepEqual(read.workspace.outlineExpanded,['feature:png']);
  await fs.mkdir(path.join(root,'exports'));const folder=await exportInvestigation(store,state.id,path.join(root,'exports'),{}),other=new InvestigationStore(path.join(root,'imported')),imported=await importInvestigation(other,folder);
  assert.deepEqual(imported.state.workspace,read.workspace);assert.deepEqual(imported.state.draftContext,read.draftContext);assert.equal(imported.state.draft,read.draft);
});
test('explicit branch scope wins over named text and null scope does not fall back to a recommendation',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-scope-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new InvestigationStore(root),state=await store.create();
  state.messages=[{id:'map',role:'assistant',features:[{name:'PNG',displayLabel:'PNG export'},{name:'Batch',displayLabel:'Batch export'}],recommendation:'Batch'}];state.mechanismInventory={mechanisms:[]};state.evidence=[];let selected=[];
  const reasoning=async(_config,schema,prompt)=>{if(schema===planSchema){selected.push(JSON.parse(prompt).selection?.featureName);return {reads:[],judgment:{decision:'answer',reason:'Retained evidence only',purpose:'Scope test',uncertainty:'',impact:''}};}return {features:[],findings:[],claims:[],answer:'No new source was inspected.',recommendation:'',continuation:{status:'blocked',reason:'Evidence unavailable',uncertainty:'No source',impact:'Unknown answer',nextEvidence:'Source needed'}};};
  const investigator=new Investigator(store,{reasoning,config:{reaEnabled:false}});await investigator.turn(state,'Explore Batch export',{branchFeatureName:'PNG'});assert.equal(state.selection.featureName,'PNG');await investigator.turn(state,'Go deeper',{branchFeatureName:null});assert.equal(state.selection,null);
});
test('support review can record a missing detail using retained evidence without acquiring a target',async t=>{
  const state={id:'s',title:'Example',targets:[],evidence:[{id:'e',kind:'page',text:'Export as PNG.',sha256:'a',locator:'https://example.invalid',limitations:[]}],messages:[{id:'m',role:'assistant',branchFeatureName:'PNG',claims:[{state:'observed',text:'PNG is described.',evidenceId:'e',quote:'Export as PNG.'}],findings:[]}]};
  const original=structuredClone(state.messages[0]);let calls=0;
  const result=await auditSavedSupport(state,['m'],'Where did retries come from?',{reasoning:async()=>{calls++;return {overview:'Retry behavior is unsupported.',answer:'The saved passage describes PNG only.',claims:[],findings:[{question:'Retries?',finding:'Retry behavior is not established by the retained passage.',change:'gap',claimIndexes:[]}],continuation:{status:'blocked',reason:'No supporting implementation evidence',uncertainty:'Retry behavior',impact:'Cannot assert retries',nextEvidence:'Implementation source'}};}});
  assert.equal(calls,1);assert.equal(state.evidence.length,1);assert.equal(result.auditScope.noNewInspection,true);assert.equal(result.findings[0].change,'gap');assert.deepEqual(state.messages[0],original);
});
test('scope sanitization preserves an unavailable destination and evidence labels do not promote a source quote',()=>{
  const patch=workspacePatch({draft:'Question',draftContext:{featureName:'Removed',messageId:'old'},workspace:{activeView:'wrong',cameras:{explore:{x:Infinity,y:0,scale:100}},pins:['one','two','three']}},{messages:[]});assert.equal(patch.draftContext.featureName,'Removed');assert.equal(patch.workspace.activeView,'overview');assert.equal(patch.workspace.cameras.explore.x,0);assert.equal(patch.workspace.pins.length,2);
  assert.equal(evidenceLabel({state:'observed'},{kind:'page'}),'Source description');assert.equal(evidenceLabel({state:'inferred'},{evidenceStatus:'runtime-observed'}),'Inference');assert.equal(evidenceLabel({state:'observed'},{evidenceStatus:'inspection-failed'}),'Inspection failed');
});
test('discovery rejects an empty map and omitted supporting mechanisms, while followups may have no map',()=>{
  const inventory={mechanisms:[{id:'support',name:'Export',role:'supporting',references:[]}]};
  assert.ok(coverageErrors({features:[]},inventory,{requireMap:true}).length);
  assert.deepEqual(coverageErrors({features:[]},inventory),[]);
  assert.ok(coverageErrors({features:[{name:'Other',mechanismIds:[]}],mechanismCoverage:[]},inventory,{requireMap:true}).length);
  assert.deepEqual(coverageErrors({features:[{name:'Export',mechanismIds:['support']}],mechanismCoverage:[{mechanismId:'support',featureNames:['Export']}]},inventory,{requireMap:true}),[]);
});
test('saved comparison admits only the two selected branches and rejects foreign support',async()=>{
  const evidence=['A','B','C'].map(id=>({id,text:`Source ${id}`,locator:id,kind:'file',limitations:[]}));
  const state={id:'compare',title:'Compare',targets:[],evidence,messages:['A','B','C'].map(id=>({id,role:'assistant',branchFeatureName:id,claims:[{text:`Source ${id}`,state:'observed',evidenceId:id,quote:`Source ${id}`}],findings:[]}))};
  let contexts;const result=await auditSavedSupport(state,['A','B'],'Compare A and B',{reasoning:async(_config,_schema,input)=>{contexts=JSON.parse(input).contexts;return {overview:'Both selected sources are retained.',answer:'Both selected sources are retained.',claims:[],findings:[{question:'Runtime?',finding:'Runtime comparison is unknown.',change:'gap',claimIndexes:[]}],continuation:{status:'blocked',reason:'Runtime not observed',uncertainty:'Behavior',impact:'Cannot establish equivalence',nextEvidence:'Declared checks'}};}});
  assert.deepEqual(result.auditScope.sourceMessageIds,['A','B']);assert.deepEqual(new Set(contexts.flatMap(c=>c.evidence.map(e=>e.id))),new Set(['A','B']));
  await assert.rejects(()=>auditSavedSupport(state,['A'],'Foreign source',{reasoning:async()=>({claims:[{text:'Source C',state:'observed',evidenceId:'C',quote:'Source C'}]})}),/invalid source references/);
});
