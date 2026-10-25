import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {classifyTarget,fileIdentity,assessFreshness} from '../lib/targets.mjs';
import {ReaInvestigation} from '../lib/rea-engine.mjs';
async function fixture(t,{asar=false}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-electron-route-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const exe=path.join(root,'Owned.exe'),app=path.join(root,'resources','app');await fs.mkdir(app,{recursive:true});
 const pe=Buffer.alloc(512);pe.write('MZ');await fs.writeFile(exe,pe);for(const marker of ['v8_context_snapshot.bin','icudtl.dat'])await fs.writeFile(path.join(root,marker),'owned runtime marker');
 const pkg=Buffer.from(JSON.stringify({name:'owned',main:'main.js'})),main=Buffer.from('exports.answer=42;');
 let archive;if(asar){const tree=Buffer.from(JSON.stringify({files:{'package.json':{size:pkg.length,offset:'0'},'main.js':{size:main.length,offset:String(pkg.length)}}})),pickle=Buffer.alloc(8+Math.ceil(tree.length/4)*4),prefix=Buffer.alloc(8);pickle.writeUInt32LE(pickle.length-4);pickle.writeUInt32LE(tree.length,4);tree.copy(pickle,8);prefix.writeUInt32LE(4);prefix.writeUInt32LE(pickle.length,4);archive=path.join(root,'resources/app.asar');await fs.writeFile(archive,Buffer.concat([prefix,pickle,pkg,main]));await fs.rm(app,{recursive:true});}
 else{await fs.writeFile(path.join(app,'package.json'),pkg);await fs.writeFile(path.join(app,'main.js'),main);}
 return {root,exe,app,archive,pe};
}
test('direct Electron EXE retains product identity and routes only declared unpacked source',async t=>{
 const {exe,app}=await fixture(t),target=await classifyTarget(exe);assert.equal(target.root,exe);assert.equal(target.targetType,'native');assert.equal(target.inspectionTarget.root,app);assert.equal(target.inspectionTarget.kind,'repository');assert.deepEqual(target.inspectionTarget.bootstrapSources,['package.json','main.js']);
 const state={targets:[target],evidence:[]};await fs.appendFile(path.join(app,'main.js'),'changed');await assessFreshness(state);assert.equal(target.applicability,'changed');
});
test('physical ASAR packaging routes JavaScript; corrupt/unbounded metadata never allocates unbounded buffers',async t=>{
 const {exe,archive}=await fixture(t,{asar:true});const target=await classifyTarget(exe);assert.equal(target.inspectionTarget.root,archive);assert.equal(target.inspectionTarget.targetType,'javascript');
 const handle=await fs.open(archive,'r+');try{const huge=Buffer.alloc(4);huge.writeUInt32LE(0xffffffff);await handle.write(huge,0,4,12);}finally{await handle.close();}assert.equal((await classifyTarget(exe)).inspectionTarget,undefined);
});
test('Chromium markers alone, unrelated helper EXEs and native addons do not redirect',async t=>{
 const {root,exe,app,pe}=await fixture(t),helper=path.join(root,'helper.exe'),addon=path.join(root,'native.node');await fs.writeFile(helper,pe);await fs.writeFile(addon,pe);assert.equal((await classifyTarget(helper)).inspectionTarget,undefined);assert.equal((await classifyTarget(addon)).targetType,'native');assert.equal((await classifyTarget(addon)).inspectionTarget,undefined);
 await fs.rm(app,{recursive:true});assert.equal((await classifyTarget(exe)).inspectionTarget,undefined);
});
test('old native saved targets are rerouted before seed and catalog, without open_binary',async t=>{
 const {root,exe,app}=await fixture(t),target={kind:'artifact',targetType:'native',root:exe,locator:exe,identity:await fileIdentity(exe)},state={targets:[target],evidence:[]},calls=[];
 const rea=new ReaInvestigation({},state,root);rea.client={tools:[{name:'binary_overview',inputSchema:{}},{name:'analyze_javascript_application',inputSchema:{}}],callTool:async(op,args)=>{calls.push({op,args});return {content:[{type:'text',text:'{}'}]};},sessionStatus:async()=>({})};
 const catalog=await rea.catalog();assert.deepEqual(catalog[0].operations.map(t=>t.name),['analyze_javascript_application']);assert.equal(catalog[0].inspectionRoot,app);
 await rea.seed(target);assert.deepEqual(calls.map(c=>c.op),['analyze_javascript_application']);assert.deepEqual(calls[0].args.source_paths,['package.json','main.js']);assert.equal(calls[0].args.detail,'summary');
 assert.throws(()=>rea.validateArguments('binary_overview',{},target),/inspection scope/);
 await fs.appendFile(path.join(app,'main.js'),'changed');await assert.rejects(rea.bind(target),/changed/);
});
function peHeader({managed=false}={}){
 const bytes=Buffer.alloc(1024),pe=0x80,optional=pe+24;bytes.write('MZ');bytes.writeUInt32LE(pe,0x3c);bytes.write('PE\0\0',pe);bytes.writeUInt16LE(0x8664,pe+4);bytes.writeUInt16LE(240,pe+20);bytes.writeUInt16LE(0x20b,optional);bytes.writeUInt32LE(16,optional+108);
 if(managed){bytes.writeUInt32LE(0x2000,optional+224);bytes.writeUInt32LE(72,optional+228);}return bytes;
}
for(const managed of [false,true])test(`${managed?'managed assembly':'native 7-Zip-style'} PE header takes the matching real dispatch branch`,async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-header-routing-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,managed?'ServiceHost.exe':'7z.exe');await fs.writeFile(file,peHeader({managed}));
 if(managed)await fs.writeFile(path.join(root,'WebView2Loader.dll'),peHeader());else await fs.writeFile(path.join(root,'7z.dll'),peHeader());
 const target=await classifyTarget(file),calls=[],rea=new ReaInvestigation({},{targets:[target],evidence:[]},root);assert.equal(target.targetType,managed?'managed':'native');assert.equal(target.inspectionTarget,undefined);
 rea.client={callTool:async(operation,args)=>{calls.push({operation,args});return {content:[{type:'text',text:'{}'}]};}};await rea.seed(target);
 assert.deepEqual(calls.map(c=>c.operation),managed?['inspect_managed_artifact','inspect_managed_members']:['open_binary','binary_overview']);
 assert.equal(calls[0].args.path,file);assert.ok(!calls.some(c=>c.operation==='analyze_javascript_application'));
});
