import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {ReaConnectionStore} from '../lib/rea-connection.mjs';
import {resolveReaConfig} from '../lib/rea-config.mjs';

async function fixture(t,{bundle=true}={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-bundle-restore-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const settingsRoot=path.join(root,'settings'),external=path.join(root,'source-pristine-4733fc8/scripts/rea.mjs'),entry=path.join(root,'engines/rea/rea.mjs'),node=path.join(root,'engines/node/node.exe');
  await fs.mkdir(path.dirname(external),{recursive:true});await fs.writeFile(external,`process.stderr.write("REA's compiled runtime is missing. Run npm ci and build:cached.");process.exit(1);`);
  if(bundle){await fs.mkdir(path.dirname(entry),{recursive:true});await fs.copyFile(new URL('./fixtures/rea-mcp-fixture.mjs',import.meta.url),entry);await fs.mkdir(path.dirname(node),{recursive:true});await fs.writeFile(node,'owned executable placeholder; probe injected');}
  const config=path.join(root,'config.toml');await fs.writeFile(config,`[mcp_servers.rea]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(external)}, "mcp"]\n[mcp_servers.rea.env]\nJAVA_HOME = "/unrelated-java"\nGHIDRA_INSTALL_DIR = "/unrelated-ghidra"`);
  const discovery={portableRoot:root,appRoot:path.join(root,'resources/app'),codexConfigPath:config,env:{INVESTIGATOR_REA:external,INVESTIGATOR_NODE:'/unrelated-node'}};
  const prior={reaPath:external,browser:path.join(root,'browser.exe'),ghidraPath:path.join(root,'ghidra'),javaHome:path.join(root,'java'),lastCheck:{available:true,checkedAt:'retained'}};
  await fs.mkdir(settingsRoot,{recursive:true});const file=path.join(settingsRoot,'rea-connection.json');await fs.writeFile(file,JSON.stringify(prior));
  return {root,settingsRoot,external,entry,node,discovery,prior,file};
}
test('existing external unbuilt dispatcher fails an actual probe without changing saved settings',async t=>{
  const f=await fixture(t),before=await fs.readFile(f.file,'utf8');
  // The environment-selected Node is deliberately absent; an explicit test
  // launch override uses this controlled Node, while the selected REA is real.
  const store=new ReaConnectionStore(f.settingsRoot,{discovery:{...f.discovery,env:{}}});
  await assert.rejects(()=>store.saveVerified({reaPath:f.external}),/compiled runtime is missing/);
  assert.equal(await fs.readFile(f.file,'utf8'),before);
});
test('restore selects only the actual bundle over environment/registration and preserves other provider settings',async t=>{
  const f=await fixture(t);let probes=0;
  const store=new ReaConnectionStore(f.settingsRoot,{discovery:f.discovery,probe:async(config,options)=>{
    probes++;const launch=resolveReaConfig(config,options.discovery);
    assert.equal(launch.command,f.node);assert.deepEqual(launch.args,[f.entry,'mcp']);assert.equal(launch.bundled,true);
    assert.equal(launch.env.JAVA_HOME,f.prior.javaHome);assert.equal(launch.env.GHIDRA_INSTALL_DIR,f.prior.ghidraPath);
    return {available:true,source:launch.source,toolCount:6,session:{providers:[],toolAvailability:[]}};
  }});
  const bundle=await store.bundled();assert.equal(bundle.available,true);assert.equal(bundle.entry,f.entry);assert.equal(probes,0);
  const result=await store.restoreBundled();assert.equal(probes,1);assert.equal(result.settings.reaPath,f.entry);
  assert.equal(result.settings.reaBundled,true);
  assert.deepEqual(result.provenance,{engine:'included',runtime:'included-node'});
  for(const key of ['browser','ghidraPath','javaHome'])assert.equal(result.settings[key],f.prior[key]);
  assert.equal(result.status.available,true);assert.ok(Date.parse(result.status.checkedAt));
});

test('engine identity describes the selected external launch rather than an unused bundled Node',async t=>{
  const f=await fixture(t),store=new ReaConnectionStore(f.settingsRoot,{discovery:{...f.discovery,env:{}}});
  assert.deepEqual((await store.view()).provenance,{engine:'external',runtime:'app-runtime'});
  await fs.unlink(f.external);
  assert.deepEqual((await store.view()).provenance,{engine:'external',runtime:'unavailable'});
});
test('restored included-engine preference follows a moved package even while its old copy still exists',async t=>{
  const f=await fixture(t),probe=async()=>({available:true,source:'settings',session:{providers:[],toolAvailability:[]}});
  const store=new ReaConnectionStore(f.settingsRoot,{discovery:f.discovery,probe});await store.restoreBundled();
  const moved=f.root+'-moved';t.after(()=>fs.rm(moved,{recursive:true,force:true}));await fs.cp(f.root,moved,{recursive:true});
  const discovery={...f.discovery,portableRoot:moved,appRoot:path.join(moved,'resources/app')},relocated=new ReaConnectionStore(path.join(moved,'settings'),{discovery,probe});
  const entry=path.join(moved,'engines/rea/rea.mjs'),node=path.join(moved,'engines/node/node.exe');
  assert.equal((await relocated.config()).rea,entry);assert.equal((await relocated.view()).settings.reaPath,entry);
  assert.equal(resolveReaConfig(await relocated.config(),discovery).command,node);
  assert.notEqual((await relocated.config()).rea,f.entry,'the previous copy still exists but must not be selected');
  await fs.unlink(entry);assert.equal((await relocated.bundled()).available,false);assert.equal((await relocated.view()).available,false,'a broken moved bundle must not borrow the old engine or registration');
  await relocated.saveVerified({reaPath:f.external});assert.equal((await relocated.read()).reaBundled,undefined,'deliberate external engine choice clears included-engine intent');
});
test('missing bundle never borrows external engine and cannot mutate settings',async t=>{
  const f=await fixture(t,{bundle:false}),before=await fs.readFile(f.file,'utf8');let probes=0;
  const store=new ReaConnectionStore(f.settingsRoot,{discovery:f.discovery,probe:async()=>{probes++;return {available:true};}});
  assert.equal((await store.bundled()).available,false);
  await assert.rejects(()=>store.restoreBundled(),/Extract the complete Nodes for REA ZIP/);
  assert.equal(probes,0);assert.equal(await fs.readFile(f.file,'utf8'),before);
});
test('present dispatcher with absent compiled bundle runtime is incomplete rather than an install instruction',async t=>{
  const f=await fixture(t,{bundle:false}),entry=path.join(f.root,'engines/rea/node_modules/rea-agents/scripts/rea.mjs');
  await fs.mkdir(path.dirname(entry),{recursive:true});await fs.writeFile(entry,'');await fs.mkdir(path.dirname(f.node),{recursive:true});await fs.writeFile(f.node,'');
  const store=new ReaConnectionStore(f.settingsRoot,{discovery:f.discovery}),bundle=await store.bundled();
  assert.equal(bundle.available,false);assert.match(bundle.reason,/Extract the complete/);assert.doesNotMatch(bundle.reason,/npm/);
  await fs.writeFile(f.file,JSON.stringify({reaPath:entry,reaBundled:true}));
  assert.deepEqual((await store.view()).provenance,{engine:'included',runtime:'included-node'},'a compiled-core failure must not be reported as missing system Node');
});
test('failed or canceled restore probes keep previous settings byte-for-byte',async t=>{
  const f=await fixture(t),before=await fs.readFile(f.file,'utf8');
  const store=new ReaConnectionStore(f.settingsRoot,{discovery:f.discovery,probe:async()=>({available:false,reason:'Owned probe failed.'})});
  await assert.rejects(()=>store.restoreBundled(),/previous settings were kept/);assert.equal(await fs.readFile(f.file,'utf8'),before);
  const controller=new AbortController();controller.abort();store.probe=async()=>({available:true});
  await assert.rejects(()=>store.restoreBundled(controller.signal),/canceled/);assert.equal(await fs.readFile(f.file,'utf8'),before);
});
