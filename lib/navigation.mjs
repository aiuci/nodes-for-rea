// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function investigationIdentity(state){
  const discovery=state.messages?.find(message=>message.features?.length&&message.title);
  const title=String(state.savedName||discovery?.title||state.title||'New investigation').replace(/[\r\n\x00-\x1f]/g,' ').trim();
  return {title,shortId:state.id.slice(0,8),sources:(state.targets||[]).map(target=>target.locator).join(' · ')};
}
async function changed(file,data){let exists=false;try{exists=true;if((await fs.readFile(file)).equals(Buffer.isBuffer(data)?data:Buffer.from(data)))return false;}catch(error){if(error.code!=='ENOENT')throw error;exists=false;}if(exists&&process.platform==='win32'&&path.basename(file)==='desktop.ini')await exec('attrib.exe',['-h','-s',file],{windowsHide:true});await fs.writeFile(file,data);return true;}
export async function writeNavigation(root,states){
  const realRoot=await fs.realpath(root);
  for(const state of states){
    if(!/^[\da-f-]{36}$/.test(state.id))continue;
    const directory=path.join(root,state.id),actual=await fs.realpath(directory),relative=path.relative(realRoot,actual);
    if(relative.startsWith('..')||path.isAbsolute(relative)||path.basename(actual)!==state.id)continue;
    const {title,shortId,sources}=investigationIdentity(state),label=`${title} [${shortId}]`;
    await changed(path.join(directory,'ABOUT.txt'),`${title}\r\nID: ${state.id}\r\nUpdated: ${state.updatedAt}\r\nSources: ${sources||'No sources yet'}\r\n\r\nOpen this investigation from History in its REA app.\r\ninvestigation.json contains the conversation and saved branches.\r\nevidence/ contains source snapshots.\r\nThe folder's underlying ID keeps saved source paths stable.\r\n`);
    if(process.platform==='win32'){
      const ini=path.join(directory,'desktop.ini'),updated=await changed(ini,Buffer.from('\ufeff[.ShellClassInfo]\r\nLocalizedResourceName='+label.slice(0,150)+'\r\nInfoTip=REA investigation '+shortId+'\r\n','utf16le'));
      if(updated){await exec('attrib.exe',['+r',directory],{windowsHide:true});await exec('attrib.exe',['+h','+s',ini],{windowsHide:true});}
    }
  }
  const rows=states.map(state=>{const identity=investigationIdentity(state);return `<tr><td><strong>${escape(identity.title)}</strong><br><small>${escape(identity.shortId)}</small></td><td>${escape(identity.sources||'No sources yet')}</td><td>${escape(state.updatedAt)}</td><td><a href="${state.id}/ABOUT.txt">Folder guide</a> · <a href="${state.id}/investigation.json">Conversation</a></td></tr>`;}).join('');
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'"><title>Saved REA investigations</title><style>body{font:16px/1.5 system-ui;max-width:1200px;margin:36px auto;padding:0 24px;background:#f7f8fa;color:#20242a}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px;border-bottom:1px solid #c8ced7;vertical-align:top;overflow-wrap:anywhere}a{color:#175799}small{color:#535e6d}</style><h1>Saved investigations</h1><p>Find the matching title in your app's History. Use Show folder there to open its files. Windows Explorer displays each folder's title and short ID; the underlying ID stays stable for saved source paths.</p><table><thead><tr><th>Investigation / ID</th><th>Sources</th><th>Last saved</th><th>Files</th></tr></thead><tbody>${rows}</tbody></table></html>`;
  const temporary=path.join(root,`.navigation-${randomUUID()}.tmp`);await fs.writeFile(temporary,html);await fs.rename(temporary,path.join(root,'START HERE.html'));
}
