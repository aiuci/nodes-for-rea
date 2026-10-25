import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {InvestigationStore,Investigator} from '../lib/investigation.mjs';
import {productsFor,productForEvidence,originErrors,keepFeature,featureCollection,updateKeptProgress} from '../lib/collection.mjs';
import {coverageErrors} from '../lib/mechanisms.mjs';
import {mechanismSchema} from '../lib/mechanisms.mjs';
import {planSchema} from '../lib/agent.mjs';
function fixture(){
 const targets=['alpha.example','beta.example','player.example'].map(host=>({kind:'website',locator:`https://${host}/`}));
 const evidence=[{id:'a',locator:targets[0].locator,text:'People tailor application documents.'},{id:'b',locator:targets[1].locator,text:'Software tailors application documents.'},{id:'c',locator:targets[2].locator,text:'The player queues music tracks.'}].map(source=>({...source,kind:'page',title:source.locator,limitations:[],sha256:'fixture',capturedAt:'2026-10-15T00:00:00Z'}));
 const claims=evidence.map(source=>({state:'observed',evidenceId:source.id,quote:source.text,text:source.text,quoteOrigin:'source'}));
 const products=targets.map(target=>({id:`web:${new URL(target.locator).hostname}`,name:new URL(target.locator).hostname}));
 const features=[{name:'Document preparation',displayLabel:'Document tailoring',displayQuestion:'How materials are tailored',parentName:'',mechanismIds:['human-docs','auto-docs'],claimIndexes:[0,1],origins:[{productId:products[0].id,description:claims[0].text,claimIndexes:[0]},{productId:products[1].id,description:claims[1].text,claimIndexes:[1]}]},{name:'Music queue',displayLabel:'Music queue',displayQuestion:'How tracks are ordered',parentName:'',mechanismIds:[],claimIndexes:[2],origins:[{productId:products[2].id,description:claims[2].text,claimIndexes:[2]}]}];
 const map={id:'map',role:'assistant',title:'My app',products,claims,features,caveat:'Public descriptions; execution unverified.',openQuestions:['How are failures handled?']};
 return {targets,evidence,products,messages:[map],title:'My app',understanding:'Compared source capabilities.',openQuestions:[],map};
}
test('source identity groups pages but keeps distinct products and repository roots separate',()=>{
 const s=fixture();s.targets.push({kind:'website',locator:'https://www.alpha.example/process/'});assert.equal(productsFor(s).length,3);assert.equal(productForEvidence(s,{locator:'https://docs.alpha.example/help'})?.id,'web:alpha.example');assert.equal(productForEvidence(s,{locator:'https://elsewhere.example'})?.id,undefined);
 const repos={targets:[{kind:'repository',locator:'C:\\Projects\\One'},{kind:'repository',locator:'C:\\Projects\\Two'}]};assert.equal(productForEvidence(repos,{locator:'C:/Projects/Two/main.js'}).name,'Two');assert.equal(productForEvidence(repos,{locator:'C:/Projects/TwoElse/main.js'}),undefined);
});
test('shared rows preserve variants and reject attribution to an unrelated product',()=>{
 const s=fixture();assert.deepEqual(originErrors(s.map,s),[]);
 const wrong=structuredClone(s.map);wrong.features[0].origins[0].productId='web:player.example';assert.ok(originErrors(wrong,s).length);
 const omitted=structuredClone(s.map);omitted.features[0].origins.pop();assert.ok(originErrors(omitted,s).length);
 const invented=structuredClone(s.map);invented.features[1].origins[0].claimIndexes=[0];assert.ok(originErrors(invented,s).length);
});
test('combined coverage merges related mechanisms while retaining each source origin',()=>{
 const s=fixture(),inventory={mechanisms:[{id:'human-docs',name:'Personal document support',role:'core',references:[{evidenceId:'a',quote:s.evidence[0].text}]},{id:'auto-docs',name:'Automatic document generation',role:'differentiator',references:[{evidenceId:'b',quote:s.evidence[1].text}]}]};
 s.map.mechanismCoverage=inventory.mechanisms.map(m=>({mechanismId:m.id,featureNames:['Document preparation']}));assert.deepEqual(coverageErrors(s.map,inventory,{combined:true,state:s}),[]);assert.ok(coverageErrors(s.map,inventory).length);
 const flat=structuredClone(s.map);flat.features[0].origins.pop();assert.ok(coverageErrors(flat,inventory,{combined:true,state:s}).length);
});
test('kept choices, source evidence, and focused progress autosave and reopen as portable JSON',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-collection-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new InvestigationStore(root),state=await store.create(),data=fixture();Object.assign(state,{targets:data.targets,evidence:data.evidence,products:data.products,messages:data.messages,title:data.title,understanding:data.understanding});
 keepFeature(state,'map','Document preparation',true);keepFeature(state,'map','Music queue',true);state.selection={featureName:'Document preparation'};state.messages.push({role:'user',text:'Compare these implementations.'});const answer={id:'follow',createdAt:new Date().toISOString(),findings:[{question:'Who prepares the documents?',finding:'One source describes people; another describes software.',claimIndexes:[0,1]}],claims:data.map.claims.slice(0,2),openQuestions:['How is quality checked?']};updateKeptProgress(state,answer);await store.save(state);
 const reopened=await store.read(state.id),json=JSON.parse(await fs.readFile(path.join(store.directory(state.id),'feature-collection.json'),'utf8'));assert.equal(reopened.keptFeatures.length,2);assert.equal(json.features[0].origins.length,2);assert.equal(json.features[0].checkpoints.length,1);assert.equal(json.features[0].claims[0].quote,data.evidence[0].text);assert.equal(json.features[1].origins[0].productName,'player.example');assert.equal(json.features[0].evidence[0].snapshotPath,undefined);
 keepFeature(reopened,'map','Document preparation',false);keepFeature(reopened,'map','Music queue',false);await store.save(reopened);assert.equal(JSON.parse(await fs.readFile(path.join(store.directory(state.id),'feature-collection.json'),'utf8')).features.length,0);assert.equal(featureCollection(reopened).project.id,state.id);
});
test('Keep rejects invented rows and altered evidence without changing the collection',()=>{
 const s=fixture();assert.throws(()=>keepFeature(s,'map','Invented feature',true));s.evidence[0].text='Changed source';assert.throws(()=>keepFeature(s,'map','Document preparation',true),/source evidence/);assert.equal(s.keptFeatures.length,0);
});
test('spoken-style Keep and remove commands save locally without invoking reasoning',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-keep-words-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new InvestigationStore(root),state=await store.create(),data=fixture();Object.assign(state,{targets:data.targets,evidence:data.evidence,products:data.products,messages:data.messages});const agent=new Investigator(store,{reasoning:()=>{throw new Error('Keep must not invoke a model.');}});
 await agent.turn(state,'Keep Document tailoring for my app');assert.equal(state.keptFeatures.length,1);assert.equal(state.evidence.length,3);await agent.turn(state,'Remove Document tailoring from my app');assert.equal(state.keptFeatures.length,0);
 state.selection={messageId:'map',featureName:'Music queue'};await agent.turn(state,'Keep this');assert.equal(state.keptFeatures[0].name,'Music queue');
});
test('adding a second source remaps into one combined map instead of losing the first source',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-combined-folders-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const sources=[path.join(root,'One'),path.join(root,'Two')];for(const source of sources){await fs.mkdir(source);await fs.writeFile(path.join(source,'README.md'),'This product saves a document.');}
 const store=new InvestigationStore(path.join(root,'saved')),state=await store.create();const reasoning=async(_config,schema)=>{
  if(schema===planSchema)return {focus:'document saving',reads:[]};if(schema===mechanismSchema)return {mechanisms:[],candidateReview:[]};
  const claims=state.evidence.map(source=>({state:'observed',evidenceId:source.id,quote:'saves a document',text:'The source describes document saving.'})),products=productsFor(state);
  return {title:'Test project',overview:'A comparison of document saving.',answer:'The sources describe saving.',understanding:'Saving is described.',recommendation:'Document saving',openQuestions:[],products,claims,features:[{name:'Document saving',displayLabel:'Saving',displayQuestion:'How documents are saved',claimIndexes:claims.map((_,index)=>index),parentName:'',mechanismIds:[],origins:products.map(product=>({productId:product.id,description:'Describes saving.',claimIndexes:state.evidence.flatMap((source,index)=>productForEvidence(state,source)?.id===product.id?[index]:[])}))}]};
 };
 const agent=new Investigator(store,{reasoning,config:{reaEnabled:false}});await agent.turn(state,`"${sources[0]}"`);await agent.turn(state,`Add "${sources[1]}" to compare for my app.`);assert.equal(state.messages.at(-1).resultKind,'discovery');assert.equal(state.messages.at(-1).features[0].origins.length,2);assert.equal(productsFor(state).length,2);
});
