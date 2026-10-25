import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {classifyTarget,assessFreshness} from '../lib/targets.mjs';
import {ReaInvestigation} from '../lib/rea-engine.mjs';
import {productForEvidence,productsFor} from '../lib/collection.mjs';
import {InvestigationStore} from '../lib/investigation.mjs';
import {buildDocument} from '../lib/investigation-document.mjs';
import {prepareShare} from '../lib/document-sharing.mjs';
function pe(managed=false){const bytes=Buffer.alloc(512);bytes.write('MZ');bytes.writeUInt32LE(64,60);bytes.write('PE\0\0',64);bytes.writeUInt16LE(0x20b,88);if(managed)bytes.writeUInt32LE(4096,312);return bytes;}
async function fixture(){const root=await fs.mkdtemp(path.join(tmpdir(),'rea-apphost-')),exe=path.join(root,'Owned.exe'),dll=path.join(root,'Owned.dll');const bytes=pe();bytes.write('Owned.dll\0',400);await fs.writeFile(exe,bytes);await fs.writeFile(dll,pe(true));await fs.writeFile(path.join(root,'Owned.runtimeconfig.json'),JSON.stringify({runtimeOptions:{tfm:'net10.0'}}));await fs.writeFile(path.join(root,'Owned.deps.json'),JSON.stringify({runtimeTarget:{name:'test'},targets:{test:{'Owned/1.0':{runtime:{'Owned.dll':{}}}}}}));return {root,exe,dll};}
test('declared .NET companion is selected by agreement of bytes, manifests and managed header; missing agreement stays native',async()=>{
 const {root,exe,dll}=await fixture();try{const target=await classifyTarget(exe);assert.equal(target.root,exe);assert.equal(target.targetType,'native');assert.equal(target.inspectionTarget.root,dll);assert.equal(target.inspectionTarget.targetType,'managed');
 await fs.writeFile(path.join(root,'Owned.deps.json'),'{}');assert.equal((await classifyTarget(exe)).inspectionTarget,undefined);
 }finally{assert.ok(root.startsWith(tmpdir()));await fs.rm(root,{recursive:true,force:true});}
});
test('managed route preserves selected product identity, uses bounded summary/views and rejects changed packaging before dispatch',async()=>{
 const {root,exe,dll}=await fixture();try{const target=await classifyTarget(exe),state={targets:[target],evidence:[],activity:[]},rea=new ReaInvestigation({},state,root,{addEvidence:async e=>{state.evidence.push(e);return e;}}),calls=[];
 rea.client={callTool:async(op,args)=>{calls.push({op,args});return {content:[{type:'text',text:'{}'}]};}};rea.checkpoint=async()=>{};
 await rea.seed(target);assert.ok(!calls.some(c=>c.op==='open_binary'));assert.deepEqual(calls.map(c=>c.op),['inspect_managed_artifact','inspect_managed_members']);assert.ok(calls.every(c=>c.args.path===dll&&c.args.detail==='summary'));
 const evidence=state.evidence.find(e=>e.operation==='inspect_managed_members');assert.equal(productForEvidence(state,evidence).id,productsFor(state)[0].id);
 await fs.appendFile(dll,'changed');await assert.rejects(rea.bind(target),/changed/);await assessFreshness(state);assert.equal(target.applicability,'changed');assert.equal(evidence.stale,true);
 }finally{assert.ok(root.startsWith(tmpdir()));await fs.rm(root,{recursive:true,force:true});}
});
test('portable documents retain the declared companion as an external dependency and sharing withholds its metadata paths',async()=>{
 const {root,exe,dll}=await fixture();try{
 const store=new InvestigationStore(path.join(root,'research')),state=await store.create();state.targets=[await classifyTarget(exe)];await store.save(state);
 const full=await buildDocument(store,state.id);assert.equal(full.manifest.dependencies[0].inspectionComponent.identity.path,dll);assert.equal(full.manifest.dependencies[0].inspectionComponent.metadata.length,2);
 const copy=await buildDocument(store,state.id,{prepared:prepareShare(state,{includeLocalPaths:false})}),body=JSON.stringify({state:copy.state,manifest:copy.manifest});assert.ok(!body.includes(root.replaceAll('\\','\\\\')));assert.ok(!body.includes('Owned.deps.json'));assert.ok(!body.includes('Owned.runtimeconfig.json'));
 }finally{assert.ok(root.startsWith(tmpdir()));await fs.rm(root,{recursive:true,force:true});}
});
