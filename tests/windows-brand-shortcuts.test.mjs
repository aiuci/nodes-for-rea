import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {syncBrandShortcuts,ownsBrandShortcut}=require('../lib/windows-brand-shortcuts.cjs');
const identity={appRoot:'C:\\Apps\\Candidate',executable:'C:\\Runtime\\electron.exe',scriptHost:'C:\\Windows\\System32\\wscript.exe',launchers:['C:\\Apps\\Candidate\\Launch Candidate.vbs'],portable:false},appId='Owned.Candidate';
const details={target:identity.scriptHost,args:'"'+identity.launchers[0]+'"',cwd:identity.appRoot,icon:'C:\\old.ico'};
test('desktop ownership requires exact launch root, full arguments and no conflicting AppID',()=>{
 assert.equal(ownsBrandShortcut(details,identity,appId,{desktop:true}),true);
 assert.equal(ownsBrandShortcut({...details,args:'"C:\\Apps\\Main\\Launch Candidate.vbs"'},identity,appId,{desktop:true}),false);
 for(const extra of [{cwd:'C:\\Apps\\Dev'},{appUserModelId:'Other.App'},{args:details.args+' --extra'},{target:'C:\\Windows\\System32\\cmd.exe'}])assert.equal(ownsBrandShortcut({...details,...extra},identity,appId,{desktop:true}),false);
 assert.equal(ownsBrandShortcut({...details,target:identity.executable,args:'"'+identity.appRoot+'"',appUserModelId:appId},identity,appId),true);
 assert.equal(ownsBrandShortcut(details,undefined,appId,{desktop:true}),false);
 assert.equal(ownsBrandShortcut({...details,cwd:'c:\\apps\\candidate\\'},identity,appId,{desktop:true}),true);
});
test('portable copies sharing AppID cannot claim another executable',()=>{
 const portable={...identity,portable:true,executable:'C:\\Apps\\Candidate\\Nodes.exe'};
 const d={...details,target:portable.executable,args:'',appUserModelId:appId};
 assert.equal(ownsBrandShortcut(d,portable,appId,{desktop:true}),true);
 assert.equal(ownsBrandShortcut({...d,target:'C:\\Apps\\Older\\Nodes.exe'},portable,appId,{desktop:true}),false);
 assert.equal(ownsBrandShortcut({...d,args:'--other-profile'},portable,appId,{desktop:true}),false);
});
async function fixture(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-shortcut-')),desktop=path.join(root,'redirected-desktop'),backupFolder=path.join(root,'backups');await fs.mkdir(desktop);
 const i={appRoot:root,executable:path.join(root,'Nodes.exe'),portable:true};await fs.writeFile(i.executable,'fixture');
 const file=path.join(desktop,'Renamed by user.lnk'),other=path.join(desktop,'Main.lnk'),map=new Map();
 const d={target:i.executable,args:'',cwd:root,appUserModelId:appId,icon:path.join(root,'old.ico'),iconIndex:0,description:'Keep description',toastActivatorClsid:'keep-clsid'};
 for(const [f,props] of [[file,d],[other,{...d,target:path.join(root,'other','Nodes.exe')}]]){map.set(f,props);await fs.writeFile(f,JSON.stringify(props));}
 let writes=0,notifications=0;
 const shell={readShortcutLink:f=>({...map.get(f)}),writeShortcutLink:(f,operation,update)=>{assert.equal(operation,'update');assert.deepEqual(Object.keys(update).sort(),['icon','iconIndex']);map.set(f,{...map.get(f),...update});writes++;return true;}};
 const options={appData:root,desktop,identity:i,backupFolder,appId,icon:path.join(root,'new.ico'),shell,notify:async files=>{assert.deepEqual(files,[file]);notifications++;}};
 return {root,file,other,map,options,counts:()=>({writes,notifications})};
}
test('desktop sync backs up exact bytes and preserves launch/properties; repeat is no-op',async()=>{
 const f=await fixture(),before=await fs.readFile(f.file),other=await fs.readFile(f.other),properties={...f.map.get(f.file)};
 try{assert.equal(await syncBrandShortcuts(f.options),1);assert.deepEqual(f.map.get(f.file),{...properties,icon:f.options.icon,iconIndex:0});
 const backups=(await fs.readdir(f.options.backupFolder)).filter(n=>n.endsWith('.lnk'));assert.equal(backups.length,1);assert.deepEqual(await fs.readFile(path.join(f.options.backupFolder,backups[0])),before);assert.deepEqual(await fs.readFile(f.other),other);
 assert.equal(await syncBrandShortcuts(f.options),0);assert.deepEqual(f.counts(),{writes:1,notifications:1});}finally{await fs.rm(f.root,{recursive:true,force:true});}
});
test('missing desktop creates nothing; failed backup or stale request writes nothing',async()=>{
 const f=await fixture();try{
 assert.equal(await syncBrandShortcuts({...f.options,desktop:path.join(f.root,'absent')}),0);await assert.rejects(fs.stat(path.join(f.root,'absent')));
 await fs.writeFile(path.join(f.root,'blocked-backup'),'file');let errors=0;
 assert.equal(await syncBrandShortcuts({...f.options,backupFolder:path.join(f.root,'blocked-backup'),onError:()=>errors++}),0);assert.equal(errors,1);
 assert.equal(await syncBrandShortcuts({...f.options,isCurrent:()=>false}),0);assert.deepEqual(f.counts(),{writes:0,notifications:0});}finally{await fs.rm(f.root,{recursive:true,force:true});}
});
test('concurrent shortcut edit and failed shell refresh are contained',async()=>{
 const f=await fixture();try{
 let reads=0;const read=f.options.shell.readShortcutLink;f.options.shell.readShortcutLink=file=>{if(file===f.file&&++reads===2)f.map.set(file,{...f.map.get(file),description:'Changed concurrently'});return read(file);};
 assert.equal(await syncBrandShortcuts(f.options),0);assert.equal(f.counts().writes,0);
 f.options.shell.readShortcutLink=read;let errors=0;assert.equal(await syncBrandShortcuts({...f.options,notify:async()=>{throw Error('Explorer busy');},onError:()=>errors++}),1);assert.equal(errors,1);assert.equal(f.counts().writes,1);
 }finally{await fs.rm(f.root,{recursive:true,force:true});}
});

test('Windows implicit taskbar runtime cwd is accepted only with exact AppID, executable and app argument',()=>{
 const d={target:identity.executable,args:'"'+identity.appRoot+'"',cwd:'C:\\Runtime',appUserModelId:appId};
 assert.equal(ownsBrandShortcut(d,identity,appId),true);
 for(const change of [{appUserModelId:'Other.App'},{appUserModelId:''},{args:'"C:\\Apps\\Main"'},{args:d.args+' --other'},{target:'C:\\OtherRuntime\\electron.exe'}])assert.equal(ownsBrandShortcut({...d,...change},identity,appId),false);
 assert.equal(ownsBrandShortcut(d,identity,appId,{desktop:true}),false,'Desktop ownership stays strict');
});
test('unchanged taskbar icon requests refresh without rewriting properties or creating a pin',async()=>{
 const f=await fixture();try{
 const folder=path.join(f.root,'Microsoft/Internet Explorer/Quick Launch/User Pinned/ImplicitAppShortcuts/exact'),file=path.join(folder,'Nodes for REA.lnk');await fs.mkdir(folder,{recursive:true});
 f.map.set(file,{...f.map.get(f.file),cwd:path.dirname(f.options.identity.executable),icon:f.options.icon});await fs.writeFile(file,'owned taskbar fixture');let notifications=0,writes=0;
 const options={...f.options,desktop:undefined,shell:{readShortcutLink:p=>({...f.map.get(p)}),writeShortcutLink:()=>{writes++;return true;}},notify:async files=>{assert.deepEqual(files,[file]);notifications++;}};
 assert.equal(await syncBrandShortcuts(options),0);assert.equal(await syncBrandShortcuts(options),0);assert.equal(notifications,2);assert.equal(writes,0);assert.equal((await fs.readdir(folder)).length,1);
 }finally{await fs.rm(f.root,{recursive:true,force:true});}
});
test('rapid superseded updates are serialized and the latest theme wins',async()=>{
 const f=await fixture();try{
 let current=1;const first=syncBrandShortcuts({...f.options,icon:path.join(f.root,'superseded.ico'),isCurrent:()=>current===1});current=2;const latest=syncBrandShortcuts({...f.options,isCurrent:()=>current===2});
 assert.deepEqual(await Promise.all([first,latest]),[0,1]);assert.equal(f.map.get(f.file).icon,f.options.icon);assert.equal(f.counts().writes,1);
 }finally{await fs.rm(f.root,{recursive:true,force:true});}
});
