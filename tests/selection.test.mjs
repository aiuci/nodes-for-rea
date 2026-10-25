import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {InvestigationStore,Investigator} from '../lib/investigation.mjs';
import {selectedFeature,selectFeature,resolveSelection,reconcileSelection} from '../lib/selection.mjs';
import {contextFor,presentationErrors,referenceErrors,planSchema} from '../lib/agent.mjs';
const map={id:'map',role:'assistant',recommendation:'Encrypted scene distribution',features:[{name:'Encrypted scene distribution',displayLabel:'Private sharing',displayQuestion:'How does a scene reach someone else?',parentName:'',claimIndexes:[0]},{name:'Infinite canvas editing',displayLabel:'Drawing',parentName:'',claimIndexes:[0]}]};
function state(){return {messages:[structuredClone(map)],targets:[],evidence:[],openQuestions:[]};}
test('selection keeps analytical identity and display label through persistence',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'investigator-focus-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new InvestigationStore(root),s=await store.create();s.messages=[structuredClone(map)];
 selectFeature(s,'map','Infinite canvas editing');await store.save(s);const reopened=await store.read(s.id);
 assert.equal(selectedFeature(reopened).displayLabel,'Drawing');assert.equal(contextFor(reopened).selectedFeature.name,'Infinite canvas editing');assert.throws(()=>selectFeature(s,'map','invented'));
});
test('typed references use clicked focus ahead of recommendation; exact display labels change the same focus',()=>{
 const s=state();selectFeature(s,'map','Infinite canvas editing');resolveSelection(s,'Investigate that.');assert.equal(selectedFeature(s).displayLabel,'Drawing');resolveSelection(s,'Go deeper');assert.equal(selectedFeature(s).displayLabel,'Drawing');
 assert.equal(resolveSelection(s,'Select private sharing').selectionOnly,true);assert.equal(selectedFeature(s).name,'Encrypted scene distribution');
 const recommended=state();resolveSelection(recommended,'Investigate that');assert.equal(selectedFeature(recommended).displayLabel,'Private sharing');assert.ok(resolveSelection({messages:[]},'Investigate that').clarification);
});
test('selection-only instruction saves focus without invoking inspection or reasoning',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'investigator-select-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new InvestigationStore(root),s=await store.create();s.messages=[structuredClone(map)];
 await new Investigator(store,{reasoning:()=>{throw new Error('Selection must not reason.');}}).turn(s,'Select Drawing');assert.equal(selectedFeature(await store.read(s.id)).displayLabel,'Drawing');assert.equal(s.evidence.length,0);
});
test('display names remain unique while evidence bindings retain analytical feature names',()=>{
 const result={features:map.features,recommendation:map.recommendation,claims:[{evidenceId:'e'}]};assert.deepEqual(presentationErrors(result,true),[]);assert.ok(presentationErrors({...result,features:map.features.map(row=>({...row,displayLabel:'Same'}))},true).length);
});
test('citation repair identifies unbound interpretations as well as invented quotations',()=>{
 const errors=referenceErrors({claims:[{state:'inferred',evidenceId:'',quote:'',text:'A layered product.'},{state:'observed',evidenceId:'s',quote:'Not on page.'},{state:'proposed',evidenceId:'',quote:'',text:'A possible design.'}]},[{id:'s',text:'Drawing and collaboration.'}]);
 assert.equal(errors.length,2);assert.equal(errors[0].claimIndex,0);assert.match(errors[0].reason,/inferred/);assert.equal(errors[1].claimIndex,1);
});
test('ordinary verbs do not silently change feature focus',()=>{
 const s=state();s.messages[0].features.push({name:'Human support',displayLabel:'Support'});selectFeature(s,'map','Infinite canvas editing');resolveSelection(s,'Does it support local files?');assert.equal(selectedFeature(s).displayLabel,'Drawing');resolveSelection(s,'How does Support work?');assert.equal(selectedFeature(s).displayLabel,'Support');
});
test('rediscovery rebinds a surviving feature and preserves retained focus outside the new shortlist',()=>{
 const s=state();selectFeature(s,'map','Infinite canvas editing');const next={...structuredClone(map),id:'next'};s.messages.push(next);reconcileSelection(s,next);assert.equal(s.selection.messageId,'next');reconcileSelection(s,{id:'changed',features:[]});assert.equal(s.selection.messageId,'next');
 s.messages=[];reconcileSelection(s,{id:'changed',features:[]});assert.equal(s.selection,null);
});
test('an automatic feature branch keeps its chosen focus and persists branch identity',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'investigator-branch-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new InvestigationStore(root),s=await store.create();s.messages=[structuredClone(map)];
  const focuses=[];const reasoning=async(_config,schema,prompt)=>{focuses.push(JSON.parse(prompt).context.selectedFeature.name);return schema===planSchema?{focus:'sharing',reads:[]}:{answer:'A proposed sharing design.',understanding:'Source-free proposal.',recommendation:'Trace sharing design',features:[],findings:[],directions:[],openQuestions:[],claims:[]};};
  await new Investigator(store,{reasoning,config:{reaEnabled:false}}).turn(s,'Explore Drawing',{branchFeatureName:'Encrypted scene distribution'});
  assert.ok(focuses.length>=2);assert.ok(focuses.every(name=>name==='Encrypted scene distribution'));
  const saved=await store.read(s.id);assert.equal(saved.messages.at(-1).branchFeatureName,'Encrypted scene distribution');assert.equal(saved.messages.at(-1).focus.featureName,'Encrypted scene distribution');
});
