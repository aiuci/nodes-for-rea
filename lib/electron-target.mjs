// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import path from 'node:path';
import {inventoryDirectory} from './sources.mjs';

// Packaging hints are not proof of Electron. Require app metadata, a contained
// JavaScript entry and Chromium runtime files before changing inspection scope.
export async function electronTarget(entry,{fs,identity,directoryIdentity}={}){
 if(entry.targetType!=='native'||path.extname(entry.root).toLowerCase()!=='.exe')return null;
 const folder=path.dirname(entry.root),norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,''),inside=(root,file)=>{const rel=path.relative(root,file);return rel!== '..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
 const regular=async file=>{try{return (await fs.lstat(file)).isFile();}catch{return false;}};
 const markers=[];for(const name of ['v8_context_snapshot.bin','snapshot_blob.bin','chrome_100_percent.pak','icudtl.dat'])if(await regular(path.join(folder,name)))markers.push(name);
 if(markers.length<2)return null;
 for(const relative of ['resources/app.asar','resources/app']){
  try{
   const root=await fs.realpath(path.join(folder,relative));if(!inside(folder,root))continue;
   const stat=await fs.stat(root);let pkg,main,files,metadata=[];
   if(stat.isFile()&&relative.endsWith('.asar')){
    const handle=await fs.open(root,'r');try{
     const prefix=Buffer.alloc(16);if((await handle.read(prefix,0,16,0)).bytesRead!==16)continue;
     const payload=prefix.readUInt32LE(4),length=prefix.readUInt32LE(12),base=8+payload;
     if(payload<8||length<2||length>8*1024*1024||length>payload-8||base>stat.size)continue;
     const bytes=Buffer.alloc(length);if((await handle.read(bytes,0,length,16)).bytesRead!==length)continue;
     const tree=JSON.parse(bytes.toString('utf8')),node=tree.files?.['package.json'];
     if(!node||node.link||node.unpacked||!Number.isSafeInteger(node.size)||node.size<2||node.size>256*1024||!/^\d+$/.test(node.offset))continue;
     const offset=Number(node.offset);if(!Number.isSafeInteger(offset)||base+offset+node.size>stat.size)continue;
     const json=Buffer.alloc(node.size);if((await handle.read(json,0,json.length,base+offset)).bytesRead!==json.length)continue;
     pkg=JSON.parse(json.toString('utf8'));main=entryPath(pkg.main);if(!main)continue;
     const source=main.split('/').reduce((n,key)=>n?.files?.[key],tree);if(!source||source.link||source.files)continue;
     files=['package.json',main];
    }finally{await handle.close();}
   }else if(stat.isDirectory()){
    const manifest=await fs.realpath(path.join(root,'package.json'));if(!inside(root,manifest)||(await fs.stat(manifest)).size>256*1024)continue;
    pkg=JSON.parse(await fs.readFile(manifest,'utf8'));main=entryPath(pkg.main);if(!main)continue;
    const entryFile=await fs.realpath(path.join(root,main));if(!inside(root,entryFile)||!await regular(entryFile))continue;
    files=(await inventoryDirectory(root)).files;if(!files.includes(main))continue;
    metadata=[await identity(manifest)];
   }else continue;
   // Do not redirect a separately selected helper merely because it lives next
   // to an Electron product. Prefer declared product name; otherwise require a
   // unique root application EXE after excluding standard maintenance programs.
   const named=[pkg.productName,pkg.name].filter(s=>typeof s==='string').some(s=>norm(s)===norm(path.parse(entry.root).name));
   if(!named){const exes=(await fs.readdir(folder,{withFileTypes:true})).filter(e=>e.isFile()&&/\.exe$/i.test(e.name)&&!/^(?:uninstall|update|crashpad|squirrel|notification_helper)/i.test(e.name));if(exes.length!==1||exes[0].name.toLowerCase()!==path.basename(entry.root).toLowerCase())continue;}
   const componentIdentity=stat.isDirectory()?await directoryIdentity(root,files):await identity(root);
   return {root,targetType:'javascript',...(stat.isDirectory()?{kind:'repository',files}:{}),bootstrapSources:['package.json',main,...files.filter(f=>/^(?:preload|index)\.[cm]?js$/.test(f)&&f!==main)].slice(0,4),identity:componentIdentity,reason:'Electron application metadata and Chromium runtime layout identify the packaged JavaScript implementation.',declaration:{framework:'electron',entryPoint:entry.root,packageName:typeof pkg.name==='string'?pkg.name:null,main,markers,metadata},limitations:['Selected Electron application resources only; runtime behavior and native helpers/addons have not been inspected.']};
  }catch{/* Missing, malformed or inaccessible hints do not establish a route. */}
 }
 return null;
}
function entryPath(value){const main=typeof value==='string'?value:'index.js';return main.length<1024&&!main.includes('\\')&&!path.posix.isAbsolute(main)&&!main.split('/').includes('..')&&/\.[cm]?js$/.test(main)?main.replace(/^\.\//,''):null;}
