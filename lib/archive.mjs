// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {featureCollection} from './collection.mjs';
import {investigationGraph} from './graph.mjs';
import {serializeWorkspaceMap} from './workspace-map.mjs';
import {buildDelivery,verificationFor} from './delivery.mjs';
const hash=data=>createHash('sha256').update(data).digest('hex');
const safeId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
const inside=(root,target)=>{const relative=path.relative(path.resolve(root),path.resolve(target));return !relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function cleanView(view={}){
  if(!view||typeof view!=='object')view={};
  const positions=list=>Array.isArray(list)?list.slice(0,10000).filter(entry=>Array.isArray(entry)&&typeof entry[0]==='string'&&entry[0].length<500&&entry[1]&&Number.isFinite(entry[1].x)&&Number.isFinite(entry[1].y)&&Math.abs(entry[1].x)<1e8&&Math.abs(entry[1].y)<1e8).map(([id,{x,y}])=>[id,{x,y}]):[];
  const revisions=new Map((Array.isArray(view.accordion)?view.accordion:[]).filter(entry=>Array.isArray(entry)&&entry[1]).map(([id,point])=>[id,point.revision]));
  const accordion=positions(view.accordion).filter(([id])=>revisions.get(id)==='history'||Number.isInteger(revisions.get(id))&&revisions.get(id)>=0&&revisions.get(id)<=10000).map(([id,point])=>[id,{...point,revision:revisions.get(id)}]);
  return {version:1,...(Array.isArray(view.accordion)?{accordion}:{}),...(Array.isArray(view.hiddenDirections)?{hiddenDirections:[...new Set(view.hiddenDirections.filter(id=>typeof id==='string'&&id.startsWith('turn:')&&id.length<500).slice(0,10000))]}:{}),nodes:positions(view.nodes),features:Array.isArray(view.features)?view.features.slice(0,1000).filter(entry=>Array.isArray(entry)&&typeof entry[0]==='string'&&entry[0].length<100).map(([id,list])=>[id,positions(list)]):[]};
}
async function containedFile(root,file){const realRoot=await fs.realpath(root),realFile=await fs.realpath(file);if(!inside(realRoot,realFile))throw new Error('A snapshot points outside the investigation folder.');return fs.readFile(realFile);}
function report(state){
  const map=state.messages.findLast(message=>message.features?.length),sections=[];
  if(map){sections.push(`<h2>Discovered features</h2><table><thead><tr><th>Feature</th><th>Investigation question</th><th>Kept</th></tr></thead><tbody>${map.features.map(row=>`<tr><th>${escape(row.displayLabel||row.name)}</th><td>${escape(row.displayQuestion||row.investigate)}</td><td>${state.keptFeatures?.some(feature=>feature.name===row.name)?'Yes':'No'}</td></tr>`).join('')}</tbody></table>`);}
  for(const message of state.messages){
    if(message.role==='user')sections.push(`<p class="request"><strong>Request:</strong> ${escape(message.text)}</p>`);
    else if(message.role==='system')sections.push(`<p class="status">${escape(message.text)}</p>`);
    else{
      const rows=(message.findings||[]).map(finding=>`<tr><th>${escape(finding.question)}</th><td>${escape(finding.finding)}</td></tr>`).join('');
      const delivery=buildDelivery(state,message),checks=verificationFor(state,message);
      const output=`<details><summary>Finished asset and material boundaries</summary><h3>TLDR</h3><p class="full">${escape(delivery.asset.tldr)}</p><h3>COMPREHENSIVE</h3><p class="full">${escape(delivery.asset.comprehensive)}</p></details>`;
      const checkReport=checks.length?`<details><summary>Recorded declared checks</summary>${checks.map(run=>`<h3>${escape(run.scope||'Recorded check')} · ${escape(run.status)}</h3><p>Passing cases apply only to the recorded finite expectations.</p><pre class="full">${escape(JSON.stringify({expectationSource:run.expectationSource,cases:run.cases,limitations:run.limitations},null,2))}</pre>`).join('')}</details>`:'';
      sections.push(`<section><h2>${escape(message.title||'Investigation checkpoint')}</h2>${message.branchFeatureName?`<p>Feature branch: ${escape(message.branchFeatureName)}</p>`:''}<p>${escape(message.overview||'')}</p>${rows?`<table><thead><tr><th>Question</th><th>Finding</th></tr></thead><tbody>${rows}</tbody></table>`:''}<details><summary>Complete findings and source quotations</summary><p class="full">${escape(message.text)}</p>${(message.claims||[]).map(claim=>`<p>${escape(claim.text)}</p>${claim.quote?`<blockquote>${escape(claim.quote)}</blockquote>`:''}${safeId(claim.evidenceId)?`<a href="evidence/${escape(claim.evidenceId)}.txt">Saved snapshot</a>`:''}`).join('')}</details>${output}${checkReport}${message.recommendation?`<p><strong>Recommended:</strong> ${escape(message.recommendation)}</p>`:''}${message.caveat?`<p>${escape(message.caveat)}</p>`:''}</section>`);
    }
  }
  sections.push(`<h2>Source snapshots</h2><ul>${state.evidence.map(evidence=>`<li><a href="evidence/${escape(evidence.id)}.txt">${escape(evidence.title||evidence.locator)}</a><br>${escape(evidence.locator)}<br><small>SHA-256: ${escape(evidence.sha256)}</small></li>`).join('')}</ul>`);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(state.title)}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:1100px;margin:36px auto;padding:0 24px;color:#20242a;background:#f7f8fa}h1,h2{line-height:1.3}h2{margin-top:32px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #cad0d8;vertical-align:top}a{color:#254b91}blockquote{border-left:3px solid #8799b8;margin:12px 0;padding-left:16px;white-space:pre-wrap}.full{white-space:pre-wrap}summary{cursor:pointer}section{border-top:1px solid #cad0d8;margin-top:24px;padding-top:12px}.request{font-weight:500}.status,small{color:#555e6c}li{margin:12px 0;overflow-wrap:anywhere}p,td,th{overflow-wrap:anywhere}</style><h1>${escape(state.title)}</h1><p>Saved REA investigation. Open this file in a browser to read it, or import this folder into Nodes for REA to continue working.</p>${sections.join('\n')}</html>`;
}

export async function exportInvestigation(store,id,parent,view){
  const destination=await fs.realpath(parent),dataRoot=await fs.realpath(store.root);
  if(inside(dataRoot,destination))throw new Error('Choose an export folder outside the app’s saved-investigation directory.');
  const state=structuredClone(await store.read(id)),source=store.directory(id),title=(state.title||'Investigation').replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,65)||'Investigation';
  const stage=await fs.mkdtemp(path.join(destination,'.rea-export-')),final=path.join(destination,`REA - ${title} - ${randomUUID().slice(0,8)}`),files=[];
  try{
    await fs.mkdir(path.join(stage,'evidence'));
    const write=async(relative,data)=>{await fs.writeFile(path.join(stage,relative),data);files.push({path:relative,sha256:hash(data)});};
    const seen=new Set();
    for(const evidence of state.evidence){
      if(!safeId(evidence.id)||seen.has(evidence.id))throw new Error('A saved snapshot has an invalid or duplicate identity.');seen.add(evidence.id);
      const raw=await containedFile(source,path.join(source,'evidence',`${evidence.id}.txt`));if(hash(raw)!==evidence.sha256)throw new Error('A saved snapshot no longer matches its source hash.');
      evidence.snapshotPath=`evidence/${evidence.id}.txt`;await write(evidence.snapshotPath,raw);
    }
    if(state.status==='inspecting')state.status='stopped';
    await write('investigation.json',JSON.stringify(state,null,2));await write('feature-collection.json',JSON.stringify(featureCollection(state),null,2));
    await write('view.json',JSON.stringify(cleanView(view),null,2));
    await write('workspace-map.json',JSON.stringify(serializeWorkspaceMap(state),null,2));
    const graph=investigationGraph(state);await write('graph.json',JSON.stringify({schemaVersion:1,investigationId:state.id,exportedAt:new Date().toISOString(),root:graph.root,nodes:[...graph.nodes.values()].map(({id,type,title,summary,parent,message,row,claim,evidence,product,finding,request,kept,latest,branchLevel})=>({id,type,title,summary,parent,messageId:message?.id,featureName:row?.name,branchFeatureName:message?.branchFeatureName,claim,evidence,product,finding,request,kept,latest,branchLevel})),edges:graph.edges},null,2));
    await write('index.html',report(state));await write('README.txt','REA investigation export\r\n\r\nOpen index.html to read the investigation.\r\nUse History > Import folder in Nodes for REA to continue working.\r\nKeep the whole folder together, including evidence/.\r\nSource snapshots and conversation content are included.\r\nLive re-inspection of local source folders needs those folders to be available on the destination computer.\r\n');
    await fs.writeFile(path.join(stage,'manifest.json'),JSON.stringify({format:'rea-investigation-folder',version:1,investigationId:state.id,exportedAt:new Date().toISOString(),files},null,2));
    await fs.rename(stage,final);return final;
  }catch(error){if(inside(destination,stage)&&path.basename(stage).startsWith('.rea-export-'))await fs.rm(stage,{recursive:true,force:true});throw error;}
}

export async function importInvestigation(store,folder){
  const source=await fs.realpath(folder),manifest=JSON.parse(await containedFile(source,path.join(source,'manifest.json')));
  if(manifest.format!=='rea-investigation-folder'||manifest.version!==1||!Array.isArray(manifest.files))throw new Error('Choose a REA investigation export folder.');
  const entry=manifest.files.find(file=>file.path==='investigation.json');if(!entry)throw new Error('The export is missing its investigation record.');
  const raw=await containedFile(source,path.join(source,'investigation.json'));if(hash(raw)!==entry.sha256)throw new Error('The exported investigation record has changed or is damaged.');
  const state=JSON.parse(raw);if(state.id!==manifest.investigationId||!Array.isArray(state.messages)||!Array.isArray(state.evidence)||!Array.isArray(state.targets))throw new Error('The exported investigation record is invalid.');
  const snapshots=[],seen=new Set();
  let view=cleanView();const viewEntry=manifest.files.find(file=>file.path==='view.json');if(viewEntry){const viewRaw=await containedFile(source,path.join(source,'view.json'));if(hash(viewRaw)!==viewEntry.sha256)throw new Error('The exported graph layout is damaged.');view=cleanView(JSON.parse(viewRaw));}
  for(const evidence of state.evidence){
    if(!safeId(evidence.id)||seen.has(evidence.id)||!/^[a-f0-9]{64}$/.test(evidence.sha256||''))throw new Error('The export contains an invalid snapshot identity.');seen.add(evidence.id);
    const relative=`evidence/${evidence.id}.txt`,record=manifest.files.find(file=>file.path===relative),data=await containedFile(source,path.join(source,relative));
    if(!record||hash(data)!==record.sha256||record.sha256!==evidence.sha256)throw new Error('An exported source snapshot is missing or damaged.');snapshots.push({id:evidence.id,data});
  }
  const originalId=state.id;state.id=randomUUID();state.title=`${state.title||'Investigation'} (imported)`;state.importedFrom={investigationId:originalId,importedAt:new Date().toISOString()};if(state.status==='inspecting')state.status='stopped';
  const dataRoot=path.resolve(store.root);await fs.mkdir(dataRoot,{recursive:true});const stage=await fs.mkdtemp(path.join(dataRoot,'.rea-import-')),final=store.directory(state.id);
  try{
    await fs.mkdir(path.join(stage,'evidence'));for(const snapshot of snapshots)await fs.writeFile(path.join(stage,'evidence',`${snapshot.id}.txt`),snapshot.data);
    for(const evidence of state.evidence)evidence.snapshotPath=path.join(final,'evidence',`${evidence.id}.txt`);
    state.updatedAt=new Date().toISOString();await fs.writeFile(path.join(stage,'investigation.json'),JSON.stringify(state,null,2));if(state.collectionCreatedAt)await fs.writeFile(path.join(stage,'feature-collection.json'),JSON.stringify(featureCollection(state),null,2));
    await fs.rename(stage,final);return {state,view};
  }catch(error){if(inside(dataRoot,stage)&&path.basename(stage).startsWith('.rea-import-'))await fs.rm(stage,{recursive:true,force:true});throw error;}
}

export async function investigationDeletionPath(store,id){
  await store.read(id);const root=await fs.realpath(store.root),directory=store.directory(id),actual=await fs.realpath(directory);
  if(!inside(root,actual)||path.resolve(actual).toLowerCase()!==path.resolve(directory).toLowerCase())throw new Error('The saved investigation folder is not in the app’s data directory.');
  return directory;
}
