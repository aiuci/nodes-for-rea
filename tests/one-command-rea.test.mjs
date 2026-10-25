import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ReaClient} from '../lib/rea-client.mjs';
import {checkInspectionRoute} from '../lib/setup-route-check.mjs';
import {installSetupHost} from '../lib/setup-host.mjs';
import {setupFlow} from '../lib/setup-presentation.mjs';

test('verified closure rejects an error, timeout or prematurely dead transport and still releases it',async()=>{
 for(const mode of ['error','timeout','dead','success']){
  const client=Object.create(ReaClient.prototype);let released=false;
  Object.assign(client,{closed:mode==='dead',tools:[{name:'close_binary'}],callTool:async()=>{if(mode==='timeout')throw Error('Owned timeout');return {isError:mode==='error'};},fail(){released=true;this.closed=true;this.closePromise=Promise.resolve();}});
  if(mode==='success'){await client.close({verify:true});await client.close({verify:true});assert.equal(client.closureVerified,true);}
  else await assert.rejects(client.close({verify:true}),/closure|timeout/);
  if(mode!=='dead')assert.equal(released,true);
 }
});

test('single-file inspection gives REA only an owned exact snapshot and cleans it even when close fails',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-single-source-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const target=path.join(root,'selected.mjs');await fs.writeFile(target,'export const selected=1;');await fs.writeFile(path.join(root,'unrelated.mjs'),'DO NOT INCLUDE');
 for(const badClose of [false,true]){
  let snapshot;
  const run=()=>checkInspectionRoute({root:target,targetType:'javascript-file',kind:'artifact'},{},{root,openClient:async()=>({callTool:async(name,args)=>{assert.equal(name,'analyze_javascript_application');snapshot=args.input_path;assert.notEqual(snapshot,root);assert.deepEqual(args.source_paths,['selected.mjs']);assert.deepEqual(await fs.readdir(snapshot),['selected.mjs']);assert.equal(await fs.readFile(path.join(snapshot,'selected.mjs'),'utf8'),'export const selected=1;');return {structuredContent:{evidence_id:'owned',normalized_result:{summary:'Owned fixture'}}};},close:async options=>{assert.equal(options.verify,true);if(badClose)throw Error('Owned close failure');}})});
  if(badClose)await assert.rejects(run(),/close failure/);else assert.equal((await run()).state,'ready');
  await assert.rejects(fs.stat(snapshot),{code:'ENOENT'});
 }
});

test('one launch holds operation pending until proof, and a canceled chooser starts no inspection',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-one-launch-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const handlers={},events=[],target={kind:'artifact',targetType:'native',root:path.join(root,'owned.exe'),identity:{path:'owned',sha256:'owned'}};
 let selected=true,proof='ready',finish,started,runs=0;
 const entered=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>finish=resolve);
 const session={providers:[{id:'ghidra',availability:{status:'available',diagnostics:{checks:['configuration','platform','architecture','installation','version','headless','native_decompiler','java','native_authority'].map(name=>({name,ok:true}))}}}]};
 installSetupHost({handle:(n,f)=>handlers[n]=f,setup:f=>f(new AbortController().signal),connection:{},reaConnection:{view:async()=>({available:true}),config:async()=>({rea:process.execPath}),bundled:async()=>({})},nativeCheck:{file:path.join(root,'settings/check.json'),current:async()=>({state:proof}),run:async()=>{runs++;started();await gate;proof='unavailable';return {state:proof};}},store:{read:async()=>({targets:selected?[target]:[]})},getCurrent:()=> 'owned',classify:async()=>target,dialog:{showOpenDialog:async()=>({canceled:true}),showMessageBox:async()=>{throw Error('No second confirmation for explicit launch');}},getWindow:()=>null,probe:async()=>({available:true,session}),onProgress:e=>events.push(e)});
 const pending=handlers['setup-launch']();await entered;
 assert.ok(events.some(e=>e.row==='operation'&&e.state==='Checking'));
 assert.ok(!events.some(e=>e.row==='operation'&&e.state==='Verified working'),'Old saved proof must not turn this fresh run green');
 finish();const result=await pending;assert.equal(setupFlow(result).rows.find(r=>r.id==='operation').state,'Failed');assert.notEqual(setupFlow(result).state,'Verified working');
 selected=false;assert.equal((await handlers['setup-launch']()).canceled,true);assert.equal(runs,1);
});
