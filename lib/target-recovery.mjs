// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import path from 'node:path';
import {classifyTarget} from './targets.mjs';
import {installedTargets} from './installed-targets.mjs';
import {recoveryFor} from './target-recovery-state.mjs';
import {rankApplicationCandidates} from './application-candidates.mjs';
export async function diagnoseTarget(locator,{initial,installed=installedTargets,classify=classifyTarget}={}){
  let issue=initial,recognized;
  if(!issue)try{const t=await classify(locator);if(t.kind==='artifact'&&t.targetType!=='unsupported'){recognized=t;issue={locator,candidates:[t.root],partial:(t.limitations||[]).some(text=>/coverage is partial/.test(text))};}else return {locator,productName:path.basename(locator),status:'boundary',candidates:[],limitations:['No application artifact was identified here. Choose another application or a source repository.']};}catch(error){issue=error.targetResolution;if(!issue)return {locator,productName:path.basename(locator),status:'boundary',candidates:[],limitations:[error.message]};}
  const metadata=await installed(locator,issue.candidates||[]),candidates=[],seen=new Set();
  for(const record of [...metadata.records.slice(0,24),...(issue.candidates||[]).map(file=>({path:file,name:path.basename(file),source:'Selected folder',reason:'Found inside the selected folder; its role in the installed product is not established.'}))]){

    let target;try{target=await classify(record.path);}catch{continue;}if(target.kind!=='artifact'||target.targetType==='unsupported')continue;
    const key=target.root.toLowerCase(),existing=candidates.find(c=>c.path.toLowerCase()===key);if(seen.has(key)){if(record.source&&!existing.sources.includes(record.source))existing.sources.push(record.source);continue;}seen.add(key);
    candidates.push({path:target.root,name:record.name||record.displayName||path.basename(target.root),description:record.description||'',reason:record.reason,sources:[record.source],installed:['Windows installation record','Start menu shortcut'].includes(record.source),supported:true,sha256:target.identity.sha256});
  }
  for(const [index,c]of candidates.entries()){const same=candidates.slice(0,index).find(other=>other.sha256===c.sha256);if(same)c.reason+=` Same file contents as ${same.name} at ${same.path}.`;}
  const ranked=rankApplicationCandidates(candidates,{locator,partial:!!issue.partial||metadata.records.length>24}),recommended=ranked.find(c=>c.recommended);
  return {locator,productName:recommended?.name||(candidates.length===1?candidates[0].name:path.basename(locator)),status:candidates.length?'choice':'boundary',checkedAt:new Date().toISOString(),candidates:ranked,limitations:[...metadata.limitations,...(recognized?.limitations||[]),...(metadata.records.length>24?['Application metadata review stopped at 24 records; choose the application explicitly.']:[]),...(issue.partial?['Folder inventory was bounded; other components may exist.']:[])]};
}
export async function prepareTargetRecovery(store,id,attemptId,{choice,otherPath,diagnose=diagnoseTarget}={}){
  const state=await store.read(id),attempt=state.attempts?.find(a=>a.id===attemptId),prior=recoveryFor(attempt);if(!prior)throw new Error('This attempt has no target-identification recovery.');
  let recovery=await diagnose(otherPath||prior.locator);
  if(choice){const candidate=recovery.candidates.find(c=>c.path===choice);if(!candidate)throw new Error('That application is no longer available. Review the candidates again.');recovery={...recovery,status:'ready',selected:{...candidate},confirmedAt:new Date().toISOString()};}
  recovery.originalLocator=prior.originalLocator||prior.locator;
  (attempt.targetRecoveryHistory||=[]).push(prior);attempt.targetRecovery=recovery;await store.save(state);return state;
}
