// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import nodeFs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inventoryDirectory} from './sources.mjs';
import {electronTarget} from './electron-target.mjs';
import {supportingExecutable,prerequisiteExecutable,rankApplicationCandidates} from './application-candidates.mjs';
import {installedTargets} from './installed-targets.mjs';
import {apphostTarget} from './apphost-target.mjs';

// Inspected archives are physical evidence. Electron's ordinary fs treats ASAR
// files as virtual directories, which can turn an artifact into a source tree.
// Keep the app's own archive support intact; bypass it only for target I/O.
const diskFs=process.versions.electron?createRequire(import.meta.url)('original-fs'):nodeFs;
const fs=diskFs.promises;

export async function fileIdentity(file){
  const canonical=await fs.realpath(file),stat=await fs.stat(canonical);
  if(!stat.isFile())throw new Error('Choose a regular target file.');
  const digest=createHash('sha256');for await(const chunk of diskFs.createReadStream(canonical))digest.update(chunk);
  return {path:canonical,sha256:digest.digest('hex'),size:stat.size};
}
export async function sqliteIdentity(file){const identity=await fileIdentity(file);let wal=null;try{wal=await fileIdentity(identity.path+'-wal');}catch(error){if(error.code!=='ENOENT')throw error;}return {...identity,sidecars:{wal}};}
export function sameIdentity(a,b){return !!a&&!!b&&a.sha256===b.sha256&&JSON.stringify(a.sidecars||null)===JSON.stringify(b.sidecars||null);}
export async function classifyTarget(locator){
  const canonical=await fs.realpath(locator),stat=await fs.stat(canonical);
  if(stat.isDirectory()){
    const entries=await fs.readdir(canonical,{withFileTypes:true});
    const sourceRoot=entries.some(e=>!e.isSymbolicLink()&&(/^(?:\.git|package\.json|pyproject\.toml|Cargo\.toml|go\.mod|CMakeLists\.txt)$/i.test(e.name)||e.isFile()&&/\.(?:sln|csproj|cpp|c|rs|py|go)$/i.test(e.name)));
    if(sourceRoot)return {kind:'repository',locator,root:canonical};
    const candidates=[];let examined=0,capped=false,supportFiles=false;
    const priority=entry=>entry.isDirectory()?3:/\.(?:asar|exe|apk|msix|appx)$/i.test(entry.name)?0:/\.dll$/i.test(entry.name)?1:2;
    const queue=[{dir:canonical,depth:0}];
    while(queue.length&&!capped){const {dir,depth}=queue.shift();for(const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>priority(a)-priority(b)||a.name.localeCompare(b.name))){
      if(++examined>1000){capped=true;break;}
      if(entry.isSymbolicLink()||/^(?:node_modules|\.git|logs?|cache|userdata)$/i.test(entry.name))continue;
      const file=path.join(dir,entry.name);
      if(entry.isDirectory()&&depth<3)queue.push({dir:file,depth:depth+1});
      else if(entry.isFile()&&/\.(?:asar|exe|dll|apk|msix|appx)$/i.test(entry.name)){if(supportingExecutable(entry.name))supportFiles=true;if(!prerequisiteExecutable(entry.name))candidates.push(file);}
    }}
    const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,''),name=norm(path.basename(canonical));
    // The app's root/resources archive can represent its implementation. An
    // archive nested inside a helper must not silently outrank the main EXE.
    const rank=file=>{
      if(/\.asar$/i.test(file)){const parts=path.relative(canonical,file).split(path.sep);return parts.length===1||parts.length===2&&parts[0].toLowerCase()==='resources'?100:55;}
      return /\.exe$/i.test(file)?60:/\.(?:apk|msix|appx)$/i.test(file)?50:20;
    };
    const metadata=candidates.filter(f=>/\.exe$/i.test(f)).length>1?await installedTargets(canonical,candidates.filter(f=>/\.exe$/i.test(f)).slice(0,24)):{records:[]};
    const model=rankApplicationCandidates(candidates.map(file=>{const records=metadata.records.filter(r=>r.path?.toLowerCase()===file.toLowerCase()),record=records.find(r=>r.source==='Start menu shortcut')||records[0]||{};return {...record,path:file,name:record.name||path.basename(file),sources:records.map(r=>r.source),installed:records.some(r=>['Windows installation record','Start menu shortcut'].includes(r.source))};}),{locator:canonical,partial:capped}),order=new Map(model.map((c,i)=>[c.path,i]));
    candidates.sort((a,b)=>rank(b)-rank(a)||order.get(a)-order.get(b));
    if(!candidates.length){if(capped||supportFiles){const error=new Error(capped?'The folder inventory reached its limit before an application could be identified.':'This folder contains supporting installers or utilities, but the application to inspect was not identified.');error.targetResolution={locator:canonical,candidates:[],partial:capped};throw error;}return {kind:'repository',locator,root:canonical};}
    const top=candidates.filter(file=>rank(file)===rank(candidates[0]));
    if(top.length!==1||supportingExecutable(path.basename(top[0]))){const error=new Error(`This folder contains several possible applications. Choose the application file to inspect: ${top.slice(0,6).map(file=>path.relative(canonical,file)).join(', ')}. No application was executed.`);error.targetResolution={locator:canonical,candidates:top.slice(0,12),partial:capped};throw error;}
    const selected=await classifyTarget(top[0]);
    const relative=path.relative(canonical,selected.root);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('The selected application now resolves outside the supplied folder.');
    if(selected.targetType==='unsupported')throw new Error('The application file could not be recognized. Choose a supported application file; no application was executed.');
    return {...selected,locator,containerRoot:canonical,artifactCandidates:candidates.map(file=>path.relative(canonical,file)),limitations:[...selected.limitations,`Selected ${path.relative(canonical,selected.root)} for static inspection from the supplied application folder. Other components have not been inspected.`,...(capped?['Application inventory stopped at 1,000 entries/depth 3; coverage is partial.']:[])]};
  }
  if(!stat.isFile())throw new Error('Choose a target file or source folder.');
  const identity=await fileIdentity(canonical),handle=await fs.open(canonical,'r');let header;
  try{header=Buffer.alloc(Math.min(stat.size,65536));await handle.read(header,0,header.length,0);}finally{await handle.close();}
  const ext=path.extname(canonical).toLowerCase();let targetType='unsupported';
  if(header.subarray(0,16).equals(Buffer.from('SQLite format 3\0')))targetType='sqlite';
  else if(ext==='.asar')targetType='javascript';
  else if(['.zip','.apk','.ipa','.msix','.appx','.dmg'].includes(ext))targetType='archive';
  else if(header.subarray(0,2).toString()==='MZ'){
    targetType='native';const pe=header.length>=64?header.readUInt32LE(60):-1;
    if(pe>=0&&pe+26<header.length&&header.subarray(pe,pe+4).equals(Buffer.from([80,69,0,0]))){
      const optional=pe+24,magic=header.readUInt16LE(optional),data=optional+(magic===0x20b?112:96),clr=data+14*8;
      if(clr+8<=header.length&&header.readUInt32LE(clr)>0)targetType='managed';
    }
  }else if(header.subarray(0,4).equals(Buffer.from([127,69,76,70]))||[0xfeedface,0xfeedfacf,0xcefaedfe,0xcffaedfe,0xcafebabe].includes(header.length>=4?header.readUInt32BE(0):0))targetType='native';
  else if(['.js','.mjs','.cjs'].includes(ext))targetType='javascript-file';
  const target={kind:'artifact',locator,root:canonical,targetType,identity:targetType==='sqlite'?await sqliteIdentity(canonical):identity,limitations:targetType==='unsupported'?['This file format has no configured inspection route.']:targetType==='sqlite'?['Inspect a quiescent database snapshot; database and WAL reads are not an atomic live acquisition.']:[]};
  const companion=await apphostTarget(target,{classify:classifyTarget,identity:fileIdentity})||await electronTarget(target,{fs,identity:fileIdentity,directoryIdentity});
  if(companion){target.inspectionTarget=companion;target.limitations.push(`The selected EXE is a launcher. Static implementation inspection uses its declared ${companion.targetType==='managed'?'managed assembly':'JavaScript application resources'} ${companion.root}. Other product components and runtime behavior remain uninspected.`);}
  return target;
}

export async function directoryIdentity(root,files){
  const canonical=await fs.realpath(root),digest=createHash('sha256');
  for(const relative of [...files].sort()){
    const full=await fs.realpath(path.join(canonical,relative)),within=path.relative(canonical,full);
    if(within==='..'||within.startsWith('..'+path.sep)||path.isAbsolute(within))throw new Error('A source path now resolves outside the selected folder.');
    const identity=await fileIdentity(full);digest.update(JSON.stringify([relative,identity.sha256,identity.size]));
  }
  return {path:canonical,sha256:digest.digest('hex'),kind:'directory',method:'inventoried-source-files-sha256',fileCount:files.length};
}

export async function assessFreshness(state){
  for(const target of state.targets||[]){
    if(!target.identity?.sha256)continue;
    let current;try{current=target.identity.kind==='directory'?await directoryIdentity(target.root,(await inventoryDirectory(target.root)).files):target.targetType==='sqlite'?await sqliteIdentity(target.identity.path):await fileIdentity(target.identity.path);}catch{}
    target.applicability=!current?'unknown':sameIdentity(current,target.identity)?'current':'changed';
    if(target.inspectionTarget&&target.applicability==='current')for(const file of [target.inspectionTarget.identity,...(target.inspectionTarget.declaration?.metadata||[])]){try{const now=file.kind==='directory'?await directoryIdentity(file.path,(await inventoryDirectory(file.path)).files):await fileIdentity(file.path);if(!sameIdentity(now,file))target.applicability='changed';}catch{if(target.applicability!=='changed')target.applicability='unknown';}}
    for(const source of state.evidence||[])if(source.targetIdentity?.path===target.identity.path){source.applicability=!current?'unknown':sameIdentity(source.targetIdentity,current)?'current':'changed';source.stale=source.applicability==='changed';}
    for(const source of state.evidence||[])if(target.inspectionTarget&&source.targetIdentity?.path===target.inspectionTarget.identity.path){source.applicability=target.applicability;source.stale=source.applicability==='changed';}
  }
  // Source-folder observations retain per-file identities; check their bytes too.
  for(const source of state.evidence||[]){
    if(source.kind!=='file')continue;
    try{const current=await fileIdentity(source.locator);source.applicability=current.sha256===source.sha256?'current':'changed';}catch{source.applicability='unknown';}
    source.stale=source.applicability==='changed';
  }
  return state;
}
