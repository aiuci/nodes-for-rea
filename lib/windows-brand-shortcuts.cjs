// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');

const samePath=(a,b)=>typeof a==='string'&&typeof b==='string'&&path.win32.isAbsolute(a)&&path.win32.isAbsolute(b)&&path.win32.normalize(a).replace(/\\+$/,'').toLowerCase()===path.win32.normalize(b).replace(/\\+$/,'').toLowerCase();
const singleArgument=args=>/^"[^"\r\n]+"$/.test(args||'')?args.slice(1,-1):/^[^\s"]+$/.test(args||'')?args:null;
// AppID alone is shared by portable copies. Require this exact launch location.
function ownsBrandShortcut(details,identity,appId,{desktop=false}={}){
 if(!identity)return !desktop&&details.appUserModelId===appId;
 if(details.appUserModelId&&details.appUserModelId!==appId)return false;
 if(!desktop&&details.appUserModelId!==appId)return false;
 // Windows implicit taskbar links normally use the runtime directory.
 // Launch ownership comes from AppID + exact executable/arguments, not its cwd.
 if(desktop&&!samePath(details.cwd,identity.appRoot))return false;
 if(samePath(details.target,identity.executable))return identity.portable?!details.args?.trim():samePath(singleArgument(details.args),identity.appRoot);
 return !identity.portable&&samePath(details.target,identity.scriptHost)&&identity.launchers.some(file=>samePath(singleArgument(details.args),file));
}
async function canonicalIdentity(identity){
 if(!identity)return undefined;
 const real=async file=>fs.realpath(file).catch(()=>file);
 return {...identity,appRoot:await real(identity.appRoot),executable:await real(identity.executable),scriptHost:identity.scriptHost?await real(identity.scriptHost):undefined,launchers:await Promise.all((identity.launchers||[]).map(real))};
}
async function canonicalDetails(details){
 const real=async file=>file?fs.realpath(file).catch(()=>file):file,arg=singleArgument(details.args);
 return {...details,target:await real(details.target),cwd:await real(details.cwd),args:arg?`"${await real(arg)}"`:details.args};
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function backupShortcut(folder,file,bytes){
 if(!folder)throw Error('Shortcut backup folder is required.');
 await fs.mkdir(folder,{recursive:true});
 const stem=hash(Buffer.concat([Buffer.from(file),bytes])),backup=path.join(folder,stem+'.lnk');
 try{await fs.writeFile(backup,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
 if(!bytes.equals(await fs.readFile(backup)))throw Error('Shortcut backup verification failed.');
 await fs.writeFile(path.join(folder,stem+'.json'),JSON.stringify({shortcut:file,sha256:hash(bytes),backup},null,2),{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
}
async function refreshShortcutRecords(records){
 const script=await fs.readFile(path.join(__dirname,'windows-taskbar-refresh.ps1'),'utf8');
 const {stdout}=await promisify(execFile)(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:8000,env:{...process.env,NODES_TASKBAR_RECORDS:JSON.stringify(records)}});
 const result=JSON.parse(stdout);return Array.isArray(result)?result:[result];
}
let shortcutQueue=Promise.resolve();
function syncBrandShortcuts(options){
 const result=shortcutQueue.then(()=>syncOwnedBrandShortcuts(options));
 shortcutQueue=result.catch(()=>{});return result;
}
// Desktop is opt-in after theme persistence; previews retain existing window/taskbar behavior.
async function syncOwnedBrandShortcuts({appData,appId,icon,shell,desktop,identity,backupFolder,displayName,isCurrent=()=>true,notify,onRefresh=()=>{},onError=()=>{}}){
 const pinned=path.join(appData,'Microsoft/Internet Explorer/Quick Launch/User Pinned');
 const folders=[{folder:path.join(pinned,'TaskBar'),desktop:false}],implicit=path.join(pinned,'ImplicitAppShortcuts');
 for(const entry of await fs.readdir(implicit,{withFileTypes:true}).catch(()=>[]))if(entry.isDirectory()&&!entry.isSymbolicLink())folders.push({folder:path.join(implicit,entry.name),desktop:false});
 if(desktop&&identity&&backupFolder)folders.push({folder:desktop,desktop:true});
 const owner=await canonicalIdentity(identity),changed=new Set(),refresh=[];
 for(const location of folders)for(const entry of await fs.readdir(location.folder,{withFileTypes:true}).catch(()=>[])){
  if(!isCurrent())break;
  if(!entry.isFile()||!entry.name.toLowerCase().endsWith('.lnk'))continue;
  const file=path.join(location.folder,entry.name);
  try{
   const before=await fs.readFile(file),details=shell.readShortcutLink(file);
   if(!ownsBrandShortcut(await canonicalDetails(details),owner,appId,location))continue;
   const updateIcon=!samePath(details.icon,icon)||details.iconIndex!==0;
   if(location.desktop&&!updateIcon)continue;
   // Back up before the first write; never use stale properties after an async gap.
   if(backupFolder)await backupShortcut(backupFolder,file,before);
   if(!isCurrent()||!before.equals(await fs.readFile(file))||JSON.stringify(details)!==JSON.stringify(shell.readShortcutLink(file)))continue;
   if(updateIcon){if(!shell.writeShortcutLink(file,'update',{icon,iconIndex:0}))throw Error('Shortcut icon update was not accepted.');changed.add(file);}
   const after=shell.readShortcutLink(file);
   if(['target','args','cwd','appUserModelId','description','toastActivatorClsid'].some(key=>after[key]!==details[key]))throw Error('Shortcut launch properties changed during refresh.');
   refresh.push({file,sha256:hash(await fs.readFile(file)),taskbar:!location.desktop,appId,displayName:!location.desktop?displayName:undefined,command:`"${details.target}"${details.args?' '+details.args:''}`,icon});
  }catch(error){onError(error,file);}
 }
 if(refresh.length&&isCurrent()){
  try{
   if(notify)await notify(refresh.map(record=>record.file));
   else for(const result of await refreshShortcutRecords(refresh)){
    onRefresh(result);
    if(result.brandingChanged)changed.add(result.file);
    if(result.status==='failed')onError(Error(result.error),result.file);
   }
  }catch(error){onError(error);}
 }
 return changed.size;
}
module.exports={syncBrandShortcuts,ownsBrandShortcut};
