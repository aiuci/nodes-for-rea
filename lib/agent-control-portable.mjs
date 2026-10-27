// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {scrubCredentials} from './document-privacy.mjs';

const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const canonical=v=>Array.isArray(v)?v.map(canonical):plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const string=(v,max=50000)=>{if(typeof v!=='string')return '';if(v.length>max)throw Error('Portable Agent Control text exceeds its safe limit. Original records are unchanged.');return v;};
const bounded=(v,max=10000)=>{if(!Array.isArray(v))return [];if(v.length>max)throw Error('Portable Agent Control records exceed their safe limit. Original records are unchanged.');return v;};
const strings=v=>bounded(v).filter(x=>typeof x==='string').map(x=>string(x));
const fields=(raw,names,max=50000)=>Object.fromEntries(names.filter(k=>typeof raw?.[k]==='string').map(k=>[k,string(raw[k],max)]));
const integer=v=>Number.isSafeInteger(v)&&v>=0?v:0;
const prerequisite=value=>typeof value==='string'?string(value):plain(value)?{...fields(value,['kind','reason']),...(typeof value.url==='string'?{url:portableURL(value.url)}:{})}:'';
function portableURL(value){try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol))return '';url.username='';url.password='';url.search='';url.hash='';return url.href;}catch{return '';}}
function origin(value={}){return {...fields(value,['kind','nodeId','messageId','areaId']),evidenceIds:strings(value.evidenceIds)};}
function followUp(value){return {...fields(value,['id','title','question','why','relationship','status','savedAt','createdAt','updatedAt','messageId','reason']),origin:origin(value.origin),prerequisite:prerequisite(value.prerequisite),...(value.continuationRequired===true?{continuationRequired:true}:{})};}
function coverage(value){
  if(!plain(value))return null;
  bounded(value.areas);bounded(value.boundaries);
  return {version:1,...fields(value,['summary','label','scope','updatedAt']),areas:(Array.isArray(value.areas)?value.areas:[]).slice(0,10000).map(area=>({...fields(area,['id','nodeId','label','status','reason','question']),evidenceIds:strings(area.evidenceIds),...(area.prerequisite?{prerequisite:prerequisite(area.prerequisite)}:{}),...Object.fromEntries(['supported','complete','supportedComplete'].filter(k=>typeof area[k]==='boolean').map(k=>[k,area[k]]))})),inspected:strings(value.inspected),unexplored:strings(value.unexplored),blocked:strings(value.blocked),questions:strings(value.questions),boundaries:(Array.isArray(value.boundaries)?value.boundaries:[]).slice(0,10000).map(boundary=>typeof boundary==='string'?string(boundary):fields(boundary,['kind','sourceId','messageId','locator','reason'])),stop:plain(value.stop)?fields(value.stop,['kind','reason','next']):null,wholeApplicationComplete:false,accessNeedsVerification:true};
}

// This is deliberately an allowlist, never a spread/copy of the runtime record.
// Browser handles, cookies, selected partitions and connection data have no DTO.
export function portableAgentControl(raw,{investigationId=raw?.investigationId,inactive=false,paths=[]}={}){
  if(!raw)return null;
  if(raw.version!==1||!Array.isArray(raw.messages)||!Array.isArray(raw.followUps))throw Error('Unsupported Agent Control record.');
  const control={version:1,investigationId,revision:integer(raw.revision),generation:integer(raw.generation),updatedAt:string(raw.updatedAt),messages:bounded(raw.messages,20000).map(message=>({...fields(message,['id','role','text','status','createdAt','updatedAt','followUpId','replyTo','kind','nodeId','reason','supersededBy','evidenceId','runId','stepId']),...(message.continuationRequired===true?{continuationRequired:true}:{})})),coverage:coverage(raw.coverage),followUps:bounded(raw.followUps).map(followUp)};
  if(Array.isArray(raw.accessRequests))control.accessRequests=bounded(raw.accessRequests).map(request=>({...fields(request,['id','status','kind','nodeId','reason','requestedAt','checkedAt','evidenceId','lastObservedStatus']),...Object.fromEntries(['url','origin','observedUrl'].filter(k=>typeof request[k]==='string').map(k=>[k,portableURL(request[k])]))}));
  if(inactive){
    control.generation++;
    for(const message of control.messages)if(message.role==='user'&&['queued','applying'].includes(message.status)){message.status='not-applied';message.continuationRequired=true;message.reason='Reopened inactive. Explicitly continue this direction before new work; access prerequisites need verification.';}
    for(const item of control.followUps)if(['queued','active'].includes(item.status)){item.status='saved';item.savedAt||=item.updatedAt||control.updatedAt;item.continuationRequired=true;item.reason='Reopened inactive. Explicitly continue this path and recheck its prerequisites.';}
    for(const request of control.accessRequests||[])if(request.status!=='public'){request.lastObservedStatus=request.lastObservedStatus||request.status;request.status='unverified';}
  }
  return scrubCredentials(control,{paths}).value;
}

export function validatePortableAgentControl(raw,investigationId){
  if(!plain(raw)||raw.version!==1||raw.investigationId!==investigationId||!Array.isArray(raw.messages)||raw.messages.length>20000||!Array.isArray(raw.followUps)||raw.followUps.length>10000)throw Error('Invalid portable Agent Control schema.');
  const projected=portableAgentControl(raw);
  if(JSON.stringify(canonical(projected))!==JSON.stringify(canonical(raw)))throw Error('Unsupported or unsafe portable Agent Control fields.');
  const opaqueIdentity=value=>/^[a-zA-Z0-9:_-]{1,180}$/.test(value||'');
  // Coverage IDs are existing logical graph keys (including feature labels),
  // never archive paths or opaque message IDs. Preserve them and their links.
  const coverageIdentity=value=>typeof value==='string'&&value.length>0&&value.length<=180&&value.trim()===value&&!/[\u0000-\u001f\u007f]/u.test(value);
  const unique=(items,label,valid=opaqueIdentity)=>{const ids=new Set();for(const item of items){if(!valid(item.id)||ids.has(item.id))throw Error(`Invalid or duplicate portable ${label} identity.`);ids.add(item.id);}return ids;};
  const messages=unique(raw.messages,'message');unique(raw.followUps,'follow-up');
  for(const message of raw.messages){if(!['user','agent','system'].includes(message.role)||typeof message.text!=='string'||!message.text.trim()||message.text.length>10000)throw Error('Invalid portable conversation message.');if(message.status&&!['queued','applying','applied','answered','needs-clarification','not-applied'].includes(message.status))throw Error('Invalid portable direction state.');if(message.replyTo&&!messages.has(message.replyTo))throw Error('Portable conversation reply has no origin.');}
  for(const item of raw.followUps)if(!['suggested','saved','queued','active','completed','blocked'].includes(item.status)||!item.question?.trim()||!item.origin?.nodeId||!['direction','coverage','open-question'].includes(item.origin.kind))throw Error('Invalid portable saved path.');
  if(raw.coverage){
    if(!['uncertain','limited','sufficient'].includes(raw.coverage.summary)||!raw.coverage.scope?.trim())throw Error('Invalid portable coverage summary.');
    unique(raw.coverage.areas,'coverage area',coverageIdentity);
    for(const area of raw.coverage.areas)if(!['inspected','unexplored','blocked'].includes(area.status)||!area.label?.trim())throw Error('Invalid portable coverage area.');
  }
  if(raw.accessRequests){unique(raw.accessRequests,'access request');for(const request of raw.accessRequests)if(!['requested','queued','unverified','blocked','read','public','verified','expired','closed','cancelled'].includes(request.status))throw Error('Invalid portable access request.');}
  return raw;
}

export async function readPortableAgentControl(store,id,options={}){
  let raw;try{raw=JSON.parse(await fs.readFile(path.join(store.directory(id),'agent-control.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}
  return portableAgentControl(raw,{...options,investigationId:options.investigationId||id});
}

// A portable DTO contributes to dirty/review state, without binding runtime auth.
export function controlDocumentFingerprint(state,control){
  const value=structuredClone(state);delete value.updatedAt;delete value.documentRecovery;delete value.documentNotice;
  for(const e of value.evidence||[])e.snapshotPath=`evidence/${e.id}.txt`;
  if(control){const portable=portableAgentControl(control,{investigationId:value.portableIdentity?.id||value.id});delete portable.revision;delete portable.generation;delete portable.updatedAt;value.portableAgentControl=portable;}
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
