// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {writeZip,readZip,ZIP_LIMITS,safePackagePath} from './document-zip.mjs';
import {scrubCredentials,scrubSnapshot} from './document-privacy.mjs';
import {workspaceMap,serializeWorkspaceMap} from './workspace-map.mjs';
import {productsFor,featureCollection} from './collection.mjs';
import {LAYOUTS} from './workspace.mjs';
export const DOCUMENT_FORMAT='rea-nodes-investigation',DOCUMENT_VERSION=1;
export const digest=raw=>createHash('sha256').update(raw).digest('hex');
const uuid=id=>typeof id==='string'&&/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id);
const recordId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
const json=value=>Buffer.from(JSON.stringify(value,null,2));
const within=(root,file)=>{const rel=path.relative(root,file);return rel!==''&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
function safeJSON(raw,label){
  if(raw.length>ZIP_LIMITS.entry)throw new Error(`${label} is too large.`);let value;try{value=JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(raw));}catch{throw new Error(`${label} is not valid UTF-8 JSON.`);}
  let objects=0;const walk=(v,depth)=>{if(depth>60||++objects>500000)throw new Error(`${label} is excessively complex.`);if(v&&typeof v==='object')for(const [k,x]of Object.entries(v)){if(['__proto__','prototype','constructor'].includes(k))throw new Error(`Unsafe property in ${label}.`);walk(x,depth+1);}};walk(value,0);return value;
}
function unique(items,label){const seen=new Set();for(const item of items){if(!recordId(item?.id)||seen.has(item.id))throw new Error(`Invalid or duplicate ${label} identity.`);seen.add(item.id);}return seen;}
export function validateInvestigation(state){
  if(!state||!uuid(state.id)||typeof state.title!=='string'||!Array.isArray(state.messages)||!Array.isArray(state.evidence)||!Array.isArray(state.targets)||state.messages.length>20000||state.evidence.length>4000)throw new Error('Invalid investigation schema.');
  if(state.draft!==undefined&&typeof state.draft!=='string')throw new Error('Invalid saved draft.');
  const workspace=state.workspace;
  if(workspace!==undefined){
    if(!workspace||typeof workspace!=='object'||Array.isArray(workspace))throw new Error('Invalid workspace schema.');
    if(workspace.layout&&!LAYOUTS.includes(workspace.layout)||Object.keys(workspace.layouts||{}).some(name=>!LAYOUTS.includes(name)))throw new Error('Unsupported workspace layout. The original file is unchanged.');
    for(const positions of [workspace.mapPositions,...Object.values(workspace.layouts||{}).map(layout=>layout.positions)].filter(Boolean)){
      if(typeof positions!=='object'||Array.isArray(positions)||Object.keys(positions).length>10000)throw new Error('Unsupported or excessive saved layout positions.');
      for(const p of Object.values(positions))if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||['width','height'].some(k=>p[k]!==undefined&&!Number.isFinite(p[k])))throw new Error('Invalid node rectangle in saved layout.');
    }
  }
  for(const target of state.targets){if(!target||typeof target.locator!=='string')throw new Error('Invalid source target schema.');if(target.kind==='website'){let url;try{url=new URL(target.locator);}catch{throw new Error('Invalid website source reference.');}if(!['http:','https:'].includes(url.protocol))throw new Error('Unsupported website source protocol.');}if(target.portableSourceId&&!/^private-source:[a-f0-9]{24}$/.test(target.portableSourceId))throw new Error('Invalid private source identity.');}
  const messages=unique(state.messages,'message'),evidence=unique(state.evidence,'evidence'),byMessage=new Map(state.messages.map(m=>[m.id,m])),attempts=unique(state.attempts||[],'attempt');
  for(const m of state.messages){
    if(!['user','assistant','system'].includes(m.role))throw new Error('Invalid message role.');
    for(const key of ['features','findings','claims','directions'])if(m[key]!==undefined&&!Array.isArray(m[key]))throw new Error('Invalid research record schema.');
    if(m.parentResultId&&!messages.has(m.parentResultId))throw new Error('A result refers to an absent origin.');
    if(m.recoveredAttemptId&&!attempts.has(m.recoveredAttemptId))throw new Error('A result refers to an absent recovery attempt.');
    for(const row of m.features||[])if(typeof row.name!=='string'||!row.name.trim())throw new Error('A feature has no identity.');
    for(const claim of m.claims||[])if(claim.evidenceId&&!evidence.has(claim.evidenceId))throw new Error('A claim refers to absent evidence metadata.');
    for(const row of [...(m.features||[]),...(m.findings||[])])for(const index of row.claimIndexes||[])if(!Number.isInteger(index)||index<0||index>=(m.claims||[]).length)throw new Error('Invalid supporting claim reference.');
  }
  for(const e of state.evidence)if(!/^[a-f0-9]{64}$/.test(e.sha256||''))throw new Error('Invalid evidence checksum.');
  const done=new Set();for(const m of state.messages){const seen=new Set();let at=m;while(at&&!done.has(at.id)){if(seen.has(at.id))throw new Error('Cyclic result relationships.');seen.add(at.id);at=byMessage.get(at.parentResultId);}for(const id of seen)done.add(id);}
  const features=new Map(state.messages.flatMap(m=>(m.features||[]).map(f=>[f.name.trim().toLowerCase(),f]))),settled=new Set();for(const [name,f]of features){const seen=new Set();let key=name;while(features.has(key)&&!settled.has(key)){if(seen.has(key))throw new Error('Cyclic feature relationships.');seen.add(key);const row=features.get(key);if(!row.parentName)break;key=row.parentName.trim().toLowerCase();if(!features.has(key))throw new Error('A feature refers to an absent parent.');}for(const id of seen)settled.add(id);}
  if(state.workspace?.version>1||state.workspace?.shapeVersion>3)throw new Error('Unsupported future workspace version. The original file is unchanged.');
  const map=workspaceMap(state);if(map.nodes.size>50000)throw new Error('Excessive investigation graph.');
  for(const edge of map.edges)if(!map.nodes.has(edge.from)||!map.nodes.has(edge.to))throw new Error('Invalid graph relationship.');
  for(const m of state.messages)if(m.parentNodeId&&!map.nodes.has(m.parentNodeId))throw new Error('A result refers to an absent originating node.');
  return map;
}
export function inactiveInvestigation(input){
  const state=structuredClone(input);if(['inspecting','running'].includes(state.status))state.status='stopped';
  for(const a of state.attempts||[])if(a.status==='running'){a.status='stopped';a.interrupted=true;a.reason=a.reason||'Interrupted before this document was reopened; no work was resumed.';}
  for(const run of state.verificationRuns||[])if(run.status==='running'){run.status='interrupted';run.interrupted=true;}
  return state;
}
export function documentFingerprint(input){
  const state=structuredClone(input);delete state.updatedAt;delete state.documentRecovery;delete state.documentNotice;
  for(const e of state.evidence||[])e.snapshotPath=`evidence/${e.id}.txt`;
  const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
  return digest(JSON.stringify(stable(state)));
}
export async function buildDocument(store,id,{documentId,revision=1,origin=null,appVersion='unknown',prepared}={}){
  const original=await store.read(id),state=inactiveInvestigation(prepared?.state||original);validateInvestigation(state);
  state.id=documentId||original.portableIdentity?.id||original.id;state.portableIdentity={id:state.id,...(origin?{origin}:original.portableIdentity?.origin?{origin:original.portableIdentity.origin}:{})};
  // Materialize source identities before any privacy substitutions.
  state.products=productsFor(state);const scrub=scrubCredentials(state,{paths:prepared?.paths||[]});let clean=scrub.value;const files=new Map(),attachments=[];let redactions=scrub.count;
  const source=await fs.realpath(store.directory(id));
  for(const e of clean.evidence){
    const relative=`evidence/${e.id}.txt`,excluded=prepared?.excludedEvidence?.includes(e.id);let data,status=excluded?'excluded':'missing',reason=excluded?'Excluded from the shared copy.':'Snapshot unavailable in the saved investigation.';
    if(!excluded)try{const file=await fs.realpath(path.join(source,relative));if(!within(source,file))throw new Error('Evidence resolves outside this investigation.');const stat=await fs.stat(file);if(!stat.isFile()||stat.size>ZIP_LIMITS.entry)throw new Error('Evidence snapshot exceeds 32 MiB.');data=await fs.readFile(file);const originalRecord=original.evidence.find(x=>x.id===e.id);if(digest(data)!==originalRecord.sha256)throw new Error('A saved evidence snapshot no longer matches its checksum.');const r=scrubSnapshot(data,{paths:prepared?.paths||[]});redactions+=r.count;data=r.data;status='bundled';}catch(error){if(error.code!=='ENOENT')throw error;}
    const sourceSha256=e.originalSha256||e.sha256;
    if(data){const hash=digest(data);if(hash!==e.sha256){e.originalSha256=sourceSha256;e.sha256=hash;e.contentRedacted=true;(e.limitations||=[]).push('Portable snapshot was redacted; its checksum measures retained bytes, not correctness or identity with the original capture.');}files.set(relative,data);}
    e.snapshotPath=status==='bundled'?relative:null;e.portableAttachment={status,...(status==='bundled'?{path:relative}:{reason})};
    if(status!=='bundled')(e.limitations||=[]).push(reason);
    attachments.push({evidenceId:e.id,status,...(data?{path:relative,sha256:digest(data),bytes:data.length}:{}),sourceSha256,...(data?{}:{reason})});
  }
  const stateData=json(clean);files.set('investigation.json',stateData);const mapData=json(serializeWorkspaceMap(clean));files.set('workspace-map.json',mapData);
  const manifest={format:DOCUMENT_FORMAT,version:DOCUMENT_VERSION,investigationId:clean.id,revision,originatingApp:{name:'Nodes for REA',version:appVersion},savedAt:new Date().toISOString(),origin:clean.portableIdentity.origin||null,records:[{path:'investigation.json',sha256:digest(stateData)},{path:'workspace-map.json',sha256:digest(mapData)}],attachments,dependencies:[...(clean.targets||[]).map(target=>({kind:'inspection-target',status:'external',locator:target.locator,identity:target.identity||null,limitations:target.limitations||[],...(target.inspectionTarget?{inspectionComponent:{status:'external',identity:target.inspectionTarget.identity,metadata:target.inspectionTarget.declaration.metadata}}:{})})),{kind:'inspection-providers',status:'not-bundled',description:'REA and AI providers are required only for new inspection. No authentication or connection configuration is included.'}],sharing:prepared?{...prepared.summary,credentialRedactions:redactions}:null,integrityNote:'Checksums establish retained byte integrity, not the correctness of conclusions.'};
  files.set('manifest.json',json(manifest));files.set('README.txt',Buffer.from('Nodes for REA investigation document\n\nOpen this .reanodes file with Nodes for REA. It is a ZIP of versioned JSON and recorded evidence.\nNo target application, provider configuration or authentication files are bundled. Evidence may contain code as inert text. Opening does not run inspection or resume work.\ninvestigation.json is the complete research record; workspace-map.json is its derived readable graph.\nExternal targets are needed only for new inspection. Excluded or missing evidence is identified in manifest.json.\nChecksums prove byte integrity, not finding correctness.\n'));
  return {data:writeZip(files),manifest,state:clean,fingerprint:documentFingerprint(original)};
}
export function parseDocument(raw){
  const files=readZip(raw),manifest=safeJSON(files.get('manifest.json')||Buffer.alloc(0),'Manifest');
  if(manifest.format!==DOCUMENT_FORMAT||!Number.isInteger(manifest.version))throw new Error('Not a Nodes for REA investigation document.');
  if(manifest.version>DOCUMENT_VERSION)throw new Error(`This document uses future format ${manifest.version}. Its file is unchanged. Open it with a newer Nodes for REA app.`);
  if(manifest.version!==1)throw new Error('This older document format has no supported migration. The original file is unchanged.');
  if(!uuid(manifest.investigationId)||!Number.isSafeInteger(manifest.revision)||manifest.revision<1||!Array.isArray(manifest.records)||!Array.isArray(manifest.attachments)||!Array.isArray(manifest.dependencies))throw new Error('Invalid document manifest schema.');
  const allowed=new Set(['manifest.json','README.txt']),records=new Map();for(const entry of manifest.records){if(!['investigation.json','workspace-map.json'].includes(entry.path)||records.has(entry.path)||!/^[a-f0-9]{64}$/.test(entry.sha256||''))throw new Error('Invalid structured document record.');const data=files.get(entry.path);if(!data||digest(data)!==entry.sha256)throw new Error(`Missing or damaged ${entry.path}.`);records.set(entry.path,safeJSON(data,entry.path));allowed.add(entry.path);}
  const state=records.get('investigation.json'),projection=records.get('workspace-map.json');validateInvestigation(state);if(state.id!==manifest.investigationId||state.portableIdentity?.id!==state.id||!projection)throw new Error('Investigation identity or graph record is missing.');
  // The investigation record is authoritative; reject a competing graph.
  const derived=serializeWorkspaceMap(state);if(JSON.stringify(projection)!==JSON.stringify(derived))throw new Error('The graph projection does not match the investigation record.');
  const seen=new Set(),snapshots=[],warnings=[];
  for(const a of manifest.attachments){
    if(!recordId(a.evidenceId)||seen.has(a.evidenceId)||!['bundled','excluded','missing','external'].includes(a.status))throw new Error('Invalid attachment identity/status.');seen.add(a.evidenceId);const e=state.evidence.find(x=>x.id===a.evidenceId);if(!e||e.portableAttachment?.status!==a.status)throw new Error('Attachment has no matching evidence record/status.');
    if(a.status==='bundled'){
      if(a.path!==`evidence/${a.evidenceId}.txt`||!safePackagePath(a.path)||a.sha256!==e.sha256||e.snapshotPath!==a.path||!Number.isSafeInteger(a.bytes)||a.bytes<0)throw new Error('Invalid evidence attachment reference.');allowed.add(a.path);const data=files.get(a.path);
      if(data){if(data.length!==a.bytes||digest(data)!==a.sha256)throw new Error('Evidence attachment checksum failed.');snapshots.push({id:a.evidenceId,data});}
      else{e.portableAttachment={status:'missing',reason:'Bundled snapshot is absent from this document.'};(e.limitations||=[]).push(e.portableAttachment.reason);warnings.push(`Missing snapshot: ${e.title||e.id}`);}
    }else{if(a.path||e.snapshotPath)throw new Error('An external/excluded attachment has an unsafe local reference.');warnings.push(`${a.status}: ${e.title||e.id}`);}
  }
  if(seen.size!==state.evidence.length)throw new Error('Evidence metadata is missing an attachment declaration.');
  for(const name of files.keys())if(!allowed.has(name))throw new Error(`Undeclared document entry: ${name}`);
  return {state:inactiveInvestigation(state),manifest,snapshots,warnings,packageHash:digest(raw)};
}
export async function readDocument(file){const stat=await fs.stat(file);if(!stat.isFile()||stat.size>ZIP_LIMITS.archive)throw new Error('Choose a .reanodes file no larger than 128 MiB.');return parseDocument(await fs.readFile(file));}
export async function atomicDocumentWrite(file,data,{expectedHash,beforeCommit}={}){
  const parent=await fs.realpath(path.dirname(file)),destination=path.join(parent,path.basename(file));if(!/\.reanodes$/i.test(destination))throw new Error('Investigation documents use the .reanodes extension.');
  const unchanged=async()=>{if(expectedHash!==undefined){let current;try{const stat=await fs.stat(destination);if(!stat.isFile()||stat.size>ZIP_LIMITS.archive)throw new Error('This document changed outside the app. Use Save As.');current=await fs.readFile(destination);}catch(error){if(error.code!=='ENOENT')throw error;}if(!current||digest(current)!==expectedHash)throw new Error('This document changed or moved outside the app. Use Save As to preserve both versions.');}};
  await unchanged();try{if((await fs.lstat(destination)).isSymbolicLink())throw new Error('Choose a regular document path, not a symbolic link.');}catch(error){if(error.code!=='ENOENT')throw error;}
  const temporary=path.join(parent,`.reanodes-${randomUUID()}.tmp`);let handle;
  try{handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(data);await handle.sync();await handle.close();handle=null;await beforeCommit?.(temporary);await unchanged();await fs.rename(temporary,destination);let dir;try{dir=await fs.open(parent,'r');await dir.sync();}catch{/* Directory fsync is unavailable on Windows. */}finally{await dir?.close().catch(()=>{});}return destination;}catch(error){await handle?.close().catch(()=>{});await fs.rm(temporary,{force:true});throw error;}
}
export async function installDocument(store,document,{filePath=null,identity,origin,savedFingerprint}={}){
  const state=structuredClone(document.state),portableId=identity||state.id;state.id=randomUUID();state.portableIdentity={id:portableId,...(origin?{origin}:state.portableIdentity?.origin?{origin:state.portableIdentity.origin}:{})};
  await fs.mkdir(store.root,{recursive:true});const root=await fs.realpath(store.root),stage=await fs.mkdtemp(path.join(root,'.rea-document-')),final=store.directory(state.id);
  try{
    await fs.mkdir(path.join(stage,'evidence'));for(const snapshot of document.snapshots)await fs.writeFile(path.join(stage,'evidence',`${snapshot.id}.txt`),snapshot.data);
    for(const e of state.evidence)e.snapshotPath=path.join(final,'evidence',`${e.id}.txt`);
    state.updatedAt=new Date().toISOString();await fs.writeFile(path.join(stage,'investigation.json'),json(state));if(state.collectionCreatedAt)await fs.writeFile(path.join(stage,'feature-collection.json'),json(featureCollection(state)));
    const binding={version:1,filePath,investigationId:portableId,revision:document.manifest.revision,packageHash:document.packageHash,savedFingerprint:savedFingerprint||documentFingerprint(state),warnings:document.warnings||[],origin:state.portableIdentity.origin||null};await fs.writeFile(path.join(stage,'document.json'),json(binding));
    await fs.rename(stage,final);return {state:await store.read(state.id),binding};
  }catch(error){if(within(root,stage))await fs.rm(stage,{recursive:true,force:true});throw error;}
}
