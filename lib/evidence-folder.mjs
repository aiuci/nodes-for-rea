// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {deliveryMarkdown} from './delivery.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const inside=(root,file)=>{const rel=path.relative(root,file);return !!rel&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};

export async function exportEvidenceFolder(store,id,parent,{state:projected,snapshots,extraFiles={}}={}){
  const destination=await fs.realpath(parent),dataRoot=await fs.realpath(store.root);if(destination===dataRoot||inside(dataRoot,destination))throw new Error('Choose an export folder outside saved investigations.');
  const state=structuredClone(projected||await store.read(id)),source=await fs.realpath(store.directory(id)),stage=await fs.mkdtemp(path.join(destination,'.rea-evidence-')),name=(state.title||'Investigation').replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').trim().slice(0,60)||'Investigation',final=path.join(destination,`REA evidence - ${name} - ${randomUUID().slice(0,8)}`),files=[];
  const write=async(relative,data)=>{await fs.writeFile(path.join(stage,relative),data);files.push({path:relative,sha256:digest(data)});};
  try{
    await fs.mkdir(path.join(stage,'evidence'));await fs.mkdir(path.join(stage,'outputs'));
    for(const record of state.evidence){
      if(!/^[a-zA-Z0-9_-]{1,100}$/.test(record.id))throw new Error('Invalid saved evidence identifier.');if(snapshots&&!snapshots.has(record.id)){if(record.portableAttachment?.status==='bundled')throw Error('Reviewed evidence bytes are missing.');continue;}const file=snapshots?path.join(source,'evidence',`${record.id}.txt`):await fs.realpath(path.join(source,'evidence',`${record.id}.txt`));if(!inside(source,file))throw new Error('Evidence resolves outside this investigation.');
      const raw=snapshots?snapshots.get(record.id):await fs.readFile(file);if(digest(raw)!==record.sha256)throw new Error('A retained evidence snapshot no longer matches its digest.');record.snapshotPath=`evidence/${record.id}.txt`;await write(record.snapshotPath,raw);
    }
    for(const [index,message]of state.messages.entries())if(message.role==='assistant')await write(`outputs/${String(index+1).padStart(3,'0')}-result.md`,deliveryMarkdown(state,message,{kind:'bundle'}));
    await write('investigation.json',JSON.stringify(state,null,2));await write('verification-results.json',JSON.stringify(state.verificationRuns||[],null,2));
    await write('README.txt','REA investigation evidence export\r\n\r\nRead outputs/ for finished assets and takeaways.\r\ninvestigation.json preserves saved feature/branch identity and provenance.\r\nevidence/ retains complete raw operations and source snapshots, including the REA session bundle when available.\r\nverification-results.json retains declared inputs, expectations, observations, failures and untested cases.\r\nmanifest.json contains SHA-256 checksums.\r\nCurrent target applicability is only as recently checked; live reinspection needs the original target and configured providers.\r\n');
    for(const [name,data]of Object.entries(extraFiles)){if(!['START-HERE.md','BUILD-BRIEF.md','HANDOFF.json','DECISIONS.json'].includes(name))throw Error('Unexpected handoff file.');await write(name,data);}
    await fs.writeFile(path.join(stage,'manifest.json'),JSON.stringify({format:'rea-evidence-folder',version:1,investigationId:id,exportedAt:new Date().toISOString(),files},null,2));await fs.rename(stage,final);return final;
  }catch(error){if(inside(destination,stage)&&path.basename(stage).startsWith('.rea-evidence-'))await fs.rm(stage,{recursive:true,force:true});throw error;}
}
