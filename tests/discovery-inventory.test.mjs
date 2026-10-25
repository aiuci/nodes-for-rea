import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inventoryRecords,inventoryCoverage} from '../lib/discovery-inventory.mjs';
import {selectFeature,selectedFeature,resolveSelection,reconcileSelection} from '../lib/selection.mjs';
import {InvestigationStore,Investigator} from '../lib/investigation.mjs';
import {contextFor,planSchema} from '../lib/agent.mjs';
import {mechanismSchema,mergeMechanismInventories,coverageErrors} from '../lib/mechanisms.mjs';
import {keepFeature,collectionIntent,featureCollection} from '../lib/collection.mjs';

const quote='The product provides retained history and named exports.';
const mechanism={id:'history',name:'Retained history',role:'supporting',summary:'The source describes retained history.',parts:['Unsupported imagined part'],references:[{evidenceId:'source',quote}]};
const claim={state:'observed',text:'Named exports are described.',evidenceId:'source',quote};
const row=name=>({name,displayLabel:name,investigate:`What is established about ${name}?`,displayQuestion:`How does ${name} work?`,parentName:'',mechanismIds:[],claimIndexes:[0],origins:[]});
function fixture(){
 const inventory={mechanisms:[structuredClone(mechanism)],candidateReview:[]};
 return {title:'Product',targets:[{kind:'website',locator:'https://example.com',origin:'https://example.com'}],evidence:[{id:'source',kind:'page',locator:'https://example.com',text:quote,limitations:['Source description only.'],sourceCoverage:{partial:true}}],messages:[{id:'map',role:'assistant',features:[row('Named exports'),row('Other feature')],claims:[claim],recommendation:'Named exports',mechanismInventory:inventory}],mechanismInventory:inventory,openQuestions:[],activity:[]};
}
async function savedFixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-inventory-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new InvestigationStore(root),state=await store.create();Object.assign(state,fixture());await store.save(state);return {store,state};}
const answer=()=>({answer:'Named exports are described; execution remains unknown.',understanding:'Only a description is retained.',features:[],findings:[{question:'What is known?',finding:'The source describes these capabilities.',change:'new',claimIndexes:[0]}],claims:[claim],recommendation:'',directions:[],openQuestions:['What happens at runtime?']});

test('feature investigation from retained inventory without a prior final answer skips discovery inventory and map repair',async t=>{
 const {store,state}=await savedFixture(t);state.messages=[{role:'user',text:'Discover this product'}];state.mechanismInventory.mechanisms[0].role='core';await store.save(state);const calls=[];
 const reasoning=async(_config,schema,prompt)=>{calls.push(schema);return schema===planSchema?{focus:'Retained history',judgment:{decision:'answer'},reads:[]}:schema===mechanismSchema?state.mechanismInventory:answer();};
 await new Investigator(store,{reasoning,config:{reaEnabled:false}}).turn(state,'What is established about retained history?',{branchFeatureName:'Retained history'});
 assert.equal(state.messages.at(-1).resultKind,'followup');assert.equal(calls.length,2);assert.equal(calls.includes(mechanismSchema),false);assert.equal(state.messages.at(-1).branchFeatureName,'Retained history');assert.equal(state.messages.at(-1).rejectedClaimCount,0);
});

test('explicit rediscovery still requires a whole-product map even when a retained feature is selected',async t=>{
 const {store,state}=await savedFixture(t);state.messages=[{role:'user',text:'Prior discovery was interrupted'}];state.mechanismInventory.mechanisms[0].role='core';let inventoryCalls=0;
 const reasoning=async(_config,schema)=>{if(schema===planSchema)return {focus:'Product',judgment:{decision:'answer'},reads:[]};if(schema===mechanismSchema){inventoryCalls++;return state.mechanismInventory;}return answer();};
 await assert.rejects(new Investigator(store,{reasoning,config:{reaEnabled:false}}).turn(state,'Rediscover the feature map',{branchFeatureName:'Retained history'}),/feature map omitted/);assert.ok(inventoryCalls>0);
});

test('inventory preserves historical maps and exact-source-backed mechanisms outside curated selections without expanding invented parts',()=>{
 const state=fixture();state.messages.push({id:'new-map',role:'assistant',features:[row('New capability')],claims:[claim]});
 state.mechanismInventory.mechanisms.push({...mechanism,id:'position',name:'Best product',role:'positioning'},{...mechanism,id:'fake',name:'Invented feature',references:[{evidenceId:'source',quote:'Not present'}]});
 const before=JSON.stringify(state),records=inventoryRecords(state);
 assert.deepEqual(records.map(record=>record.row.name),['Named exports','Other feature','New capability','Retained history']);
 assert.equal(records.at(-1).message.id,'map');assert.equal(records.at(-1).sourceKind,'mechanism-inventory');assert.deepEqual(records.at(-1).row.origins[0].claimIndexes,[0]);
 assert.equal(JSON.stringify(state),before,'projection must not rewrite saved maps or create messages');
});

test('inventory is not numerically capped and coverage separates untouched work from unknown total and evidence boundaries',()=>{
 const state=fixture();state.messages[0].features=Array.from({length:180},(_,index)=>row(`Feature ${index}`));
 state.messages.push({id:'result',role:'assistant',branchFeatureName:'Feature 179',findings:[],claims:[]});
 const coverage=inventoryCoverage(state);assert.equal(coverage.discovered,181);assert.equal(coverage.investigated,1);assert.equal(coverage.untouched,180);assert.equal(coverage.total,null);assert.equal(coverage.complete,false);assert.ok(coverage.boundaries.some(item=>item.kind==='partial-source'));assert.ok(coverage.boundaries.some(item=>item.reason==='Source description only.'));
});

test('mechanism-only feature selection, selected context, Keep and export retain actual supporting evidence',async t=>{
 const {store,state}=await savedFixture(t);const record=inventoryRecords(state).find(record=>record.row.name==='Retained history');
 selectFeature(state,record.message.id,record.row.name);assert.equal(selectedFeature(state).messageId,'map');assert.equal(contextFor(state).selectedFeature.name,'Retained history');
 assert.deepEqual(collectionIntent(state,'Keep this feature'),{messageId:'map',featureName:'Retained history',keep:true});
 keepFeature(state,'map','Retained history',true);const kept=featureCollection(state).features[0];assert.equal(kept.claims[0].quote,quote);assert.equal(kept.origins[0].productId,'web:example.com');assert.equal(kept.mechanisms[0].id,'history');assert.equal(kept.sourceMessageId,'map');
 await store.save(state);const reopened=await store.read(state.id);assert.equal(selectedFeature(reopened).name,'Retained history');assert.equal(reopened.messages.length,1);
 resolveSelection(reopened,'Select Retained history');assert.equal(reopened.selection.featureName,'Retained history');
});

test('mechanism-only selected claims pin historical evidence outside the recent context window',()=>{
 const state=fixture();for(let index=0;index<25;index++)state.evidence.push({id:`later-${index}`,text:`Later ${index}`,kind:'page',locator:'https://example.com/later',limitations:[]});
 selectFeature(state,'map','Retained history');const context=contextFor(state,{phase:'plan'});assert.ok(context.evidence.some(source=>source.id==='source'));assert.equal(context.discoveredInventory.at(-1).name,'Retained history');
});

test('mechanism-only features execute with persistent branch identity and the exact selected context',async t=>{
 const {store,state}=await savedFixture(t),focuses=[];
 const reasoning=async(_config,schema,prompt)=>{focuses.push(JSON.parse(prompt).context.selectedFeature);return schema===planSchema?{focus:'history',reads:[]}:answer();};
 await new Investigator(store,{reasoning,config:{reaEnabled:false}}).turn(state,'How does retained history work?',{branchFeatureName:'Retained history'});
 assert.ok(focuses.length>=2);assert.ok(focuses.every(focus=>focus.name==='Retained history'&&focus.messageId==='map'));assert.equal(state.messages.at(-1).branchFeatureName,'Retained history');assert.equal(state.messages.at(-1).focus.featureName,'Retained history');
 assert.equal(inventoryCoverage(await store.read(state.id)).investigated,1);
});

test('a saved discovery recommendation binds its own feature and question instead of unrelated prior selection or null scope',async t=>{
 const {store,state}=await savedFixture(t);state.messages[0].focus={messageId:'map',featureName:'Other feature'};selectFeature(state,'map','Other feature');
 const focuses=[];const reasoning=async(_config,schema,prompt)=>{focuses.push(JSON.parse(prompt).context.selectedFeature.name);return schema===planSchema?{focus:'exports',reads:[]}:answer();};
 await new Investigator(store,{reasoning,config:{reaEnabled:false}}).turn(state,'Named exports',{branchFeatureName:null,parentResultId:'map',parentNodeId:'direction:map:0'});
 assert.ok(focuses.every(name=>name==='Named exports'));assert.equal(state.messages.at(-1).branchFeatureName,'Named exports');assert.equal(state.messages.at(-1).parentResultId,'map');assert.equal(state.messages.at(-2).text,'What is established about Named exports?');
 await assert.rejects(new Investigator(store,{reasoning,config:{reaEnabled:false}}).turn(state,'Other feature',{branchFeatureName:'Other feature',parentResultId:'map',parentNodeId:'direction:map:0'}),/different feature branch/);
});

test('deeper grounded hierarchy is valid while cycles and missing parents are rejected',()=>{
 const inventory={mechanisms:[{...mechanism,name:'Root',role:'core'}]},root={...row('Root'),mechanismIds:['history']},child={...row('Child'),parentName:'Root'},leaf={...row('Leaf'),parentName:'Child'};
 const answer={features:[root,child,leaf],mechanismCoverage:[{mechanismId:'history',featureNames:['Root']}]};
 assert.deepEqual(coverageErrors(answer,inventory),[]);assert.ok(coverageErrors({...answer,features:[{...root,parentName:'Leaf'},child,leaf]},inventory).some(error=>/Cyclic/.test(error)));assert.ok(coverageErrors({...answer,features:[root,child,{...leaf,parentName:'Missing'}]},inventory).some(error=>/Invalid parent/.test(error)));
});

test('further discovery merges retained inventory and histories instead of treating a smaller extraction as deletion',async t=>{
 const {store,state}=await savedFixture(t),oldMessages=JSON.stringify(state.messages),newMechanism={...mechanism,id:'exports',name:'Named exports',role:'supporting'},inventory={mechanisms:[newMechanism],candidateReview:[]};
 const merged=mergeMechanismInventories(state.mechanismInventory,inventory);assert.deepEqual(merged.mechanisms.map(item=>item.id),['history','exports']);
 const reasoning=async(_config,schema)=>schema===planSchema?{focus:'discovery',reads:[]}:schema===mechanismSchema?inventory:{...answer(),features:[{...row('Retained history'),mechanismIds:['history']},{...row('Named exports'),mechanismIds:['exports']}],recommendation:'Named exports',mechanismCoverage:[{mechanismId:'history',featureNames:['Retained history']},{mechanismId:'exports',featureNames:['Named exports']}]};
 await new Investigator(store,{reasoning,config:{reaEnabled:false}}).turn(state,'Discover more capabilities and update the feature map from available sources',{branchFeatureName:null});
 assert.equal(state.messages.at(-1).resultKind,'discovery');assert.equal(JSON.stringify(state.messages.slice(0,1)),oldMessages);assert.deepEqual(state.mechanismInventory.mechanisms.map(item=>item.id),['history','exports']);assert.ok(inventoryRecords(state).some(record=>record.row.name==='Other feature'));
});

test('latest same-name mechanism projection refreshes summary, references and origin while historical and curated records remain intact',()=>{
 const state=fixture(),newQuote='Retained history now includes named checkpoints.';
 state.targets.push({kind:'website',locator:'https://new.example.org',origin:'https://new.example.org'});
 state.evidence.push({id:'new-source',kind:'page',locator:'https://new.example.org',text:newQuote,limitations:[]});
 const latest={mechanisms:[{...mechanism,summary:'Checkpoints are described in the newer source.',references:[{evidenceId:'new-source',quote:newQuote}]}],candidateReview:[]};
 state.messages.push({id:'new-map',role:'assistant',features:[row('Newest capability')],claims:[claim],mechanismInventory:latest});state.mechanismInventory=latest;
 const before=JSON.stringify(state),record=inventoryRecords(state).find(record=>record.id==='feature:retained history');
 assert.equal(record.message.id,'new-map');assert.equal(record.message.claims[0].evidenceId,'new-source');assert.equal(record.row.origins[0].productId,'web:new.example.org');assert.equal(record.row.origins[0].description,'Checkpoints are described in the newer source.');
 assert.ok(inventoryRecords(state).some(record=>record.row.name==='Other feature'));assert.equal(JSON.stringify(state),before);
 state.messages.at(-1).features.push({...row('Retained history'),displayLabel:'Curated history'});assert.equal(inventoryRecords(state).find(record=>record.id==='feature:retained history').title,'Curated history');
});

test('proposed and inferred candidates remain reachable without inflating discovered or investigated coverage',()=>{
 const state=fixture();state.messages[0].features.push({...row('Imagined capability'),evidenceBasis:'proposed'},{...row('Inferred capability'),evidenceBasis:'inferred'},{...row('Observed capability'),evidenceBasis:'observed'});
 state.messages.push({id:'candidate-result',role:'assistant',branchFeatureName:'Imagined capability',features:[],claims:[]},{id:'legacy-result',role:'assistant',branchFeatureName:'Other feature',features:[],claims:[]});
 const coverage=inventoryCoverage(state);assert.equal(coverage.totalFeatures,6);assert.equal(coverage.discovered,4);assert.equal(coverage.investigated,1);assert.equal(coverage.untouched,3);assert.equal(coverage.proposed,1);assert.equal(coverage.inferred,1);assert.equal(coverage.candidates,2);
 assert.equal(inventoryRecords(state).find(record=>record.row.name==='Imagined capability').investigated,true);assert.equal(coverage.total,null);
});

test('case-only rediscovery preserves selection, Keep and execution from an older result without accepting a different branch',async t=>{
 const {store,state}=await savedFixture(t);state.messages[0].features=[row('PNG'),row('Other feature')];state.messages[0].recommendation='PNG';
 selectFeature(state,'map','PNG');state.messages.push({id:'old-result',role:'assistant',branchFeatureName:'PNG',focus:{messageId:'map',featureName:'PNG'},features:[],findings:[],claims:[claim]});
 const newer={id:'new-map',role:'assistant',features:[row('Png')],claims:[claim],recommendation:'Png'};state.messages.push(newer);reconcileSelection(state,newer);
 assert.equal(state.selection.messageId,'new-map');assert.equal(selectedFeature(state).name,'Png');selectFeature(state,'new-map','PNG');
 keepFeature(state,'new-map','PNG',true);assert.equal(state.keptFeatures[0].name,'Png');assert.deepEqual(collectionIntent(state,'Keep png'),{messageId:'new-map',featureName:'Png',keep:true});
 const focuses=[],reasoning=async(_config,schema,prompt)=>{focuses.push(JSON.parse(prompt).context.selectedFeature.name);return schema===planSchema?{focus:'export',reads:[]}:answer();};
 await new Investigator(store,{reasoning,config:{reaEnabled:false}}).turn(state,'Inspect export behavior',{branchFeatureName:'PNG',parentResultId:'old-result',parentNodeId:'turn:old-result'});
 assert.ok(focuses.every(name=>name==='Png'));assert.equal(state.messages.at(-1).branchFeatureName,'Png');assert.equal(state.messages.at(-1).parentResultId,'old-result');assert.equal(state.messages.at(-1).focus.messageId,'new-map');
 await assert.rejects(new Investigator(store,{reasoning,config:{reaEnabled:false}}).turn(state,'Inspect unrelated behavior',{branchFeatureName:'Other feature',parentResultId:'old-result',parentNodeId:'turn:old-result'}),/different feature branch/);
});
