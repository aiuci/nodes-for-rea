// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Saved receipts only: no Investigator, REA client, target acquisition or execution.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {finalAssetContext} from './finalize.mjs';
import {buildSupportAnswer} from './support-audit.mjs';
import {attachDelivery} from './delivery.mjs';
import {validateInvestigation} from './investigation-document.mjs';
import {atomicReplace} from './atomic-replace.mjs';
import {redactText} from './document-privacy.mjs';

const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const recordId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,stable(value[key])])):value;
const digest=value=>hash(JSON.stringify(stable(value)));
const cleanRecord=record=>{const copy=structuredClone(record);delete copy.snapshotPath;return copy;};
const stopped=signal=>signal?.throwIfAborted();
const inside=(root,file)=>{const rel=path.relative(root,file);return rel!==''&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
const fail=message=>{throw new Error(`${message} No comparison started.`);};
const safeText=(value,max=500)=>redactText(String(value||'')).text.replace(/(?:[A-Za-z]:[\\/]|\\\\)[^\s"<>]+|\/(?:Users|home|tmp)\/[^\s"<>]+/g,'[local source path withheld]').slice(0,max);
const researchSeal=state=>digest({messages:state.messages,evidence:(state.evidence||[]).map(cleanRecord),targets:state.targets,attempts:state.attempts,verificationRuns:state.verificationRuns});
const operationPath=(store,id,op)=>{if(!uuid(id)||!uuid(op))throw new Error('Invalid comparison identity.');return path.join(store.directory(id),'.comparisons',op);};
const payloadProjection=p=>({operationId:p.operationId,destinationInvestigationId:p.destinationInvestigationId,anchorResultId:p.anchorResultId,selections:p.selections,request:p.request.trim(),nodeId:p.nodeId||`turn:${p.anchorResultId}`});
export function comparisonRequestDigest(payload){validatePayload(payload);return digest(payloadProjection(payload));}
function validatePayload(p){
  if(!p||!uuid(p.operationId)||!uuid(p.destinationInvestigationId)||!recordId(p.anchorResultId)||p.preserveDraft!==true)fail('Choose a local saved comparison destination.');
  if(typeof p.request!=='string'||!p.request.trim()||p.request.length>18000)fail('Enter a comparison question under 18,000 characters.');
  if(!Array.isArray(p.selections)||p.selections.length!==2||p.selections.some(s=>!uuid(s?.investigationId)||!recordId(s.messageId)||!/^([a-f0-9]{64})$/.test(s.selectionDigest||'')))fail('Choose two explicit saved result selections.');
  if(new Set(p.selections.map(s=>JSON.stringify([s.investigationId,s.messageId]))).size!==2)fail('Choose two distinct saved results.');
  if(p.selections[0].investigationId!==p.destinationInvestigationId||p.selections[0].messageId!==p.anchorResultId)fail('Side A must be the initiating local saved result.');
  if(p.nodeId!==undefined&&(typeof p.nodeId!=='string'||p.nodeId.length>300))fail('Invalid comparison origin node.');
}
async function sourceDirectory(store,id){
  const root=await fs.realpath(store.root),expected=store.directory(id),actual=await fs.realpath(expected);
  if(!inside(root,actual)||path.resolve(actual).toLowerCase()!==path.resolve(expected).toLowerCase())fail('Saved investigation resolves outside its owned directory.');
  return actual;
}
async function readRaw(store,state,evidence){
  if(!recordId(evidence.id)||typeof evidence.text!=='string'||!/^([a-f0-9]{64})$/.test(evidence.sha256||''))fail(`Receipt ${evidence.id} has invalid saved metadata.`);
  if(evidence.portableAttachment&&evidence.portableAttachment.status!=='bundled')fail(`Receipt ${evidence.id} is ${evidence.portableAttachment.status}; its snapshot is unavailable.`);
  const directory=await sourceDirectory(store,state.id),base=path.join(directory,'evidence'),actualBase=await fs.realpath(base);
  if(path.resolve(base).toLowerCase()!==path.resolve(actualBase).toLowerCase())fail(`Receipt ${evidence.id} has an unsafe evidence directory.`);
  const file=await fs.realpath(path.join(base,`${evidence.id}.txt`));if(!inside(actualBase,file))fail(`Receipt ${evidence.id} resolves outside its saved evidence directory.`);
  const stat=await fs.stat(file);if(!stat.isFile()||stat.size>32*1024*1024)fail(`Receipt ${evidence.id} is not a bounded regular snapshot.`);
  const raw=await fs.readFile(file);if(hash(raw)!==evidence.sha256)fail(`Receipt ${evidence.id} raw SHA-256 does not match its saved capture.`);
  return raw;
}
async function selectedContext(store,selection,side,signal){
  stopped(signal);let state;
  try{await sourceDirectory(store,selection.investigationId);state=await store.read(selection.investigationId);}catch(error){fail(`Side ${side} saved investigation is unavailable (${error.code||'unreadable'}).`);}
  if(state.id!==selection.investigationId||!Array.isArray(state.messages)||!Array.isArray(state.evidence)||state.messages.some(m=>!m||!recordId(m.id))||state.evidence.some(e=>!e||!recordId(e.id)))fail(`Side ${side} has corrupt saved research.`);
  if(new Set(state.messages.map(m=>m.id)).size!==state.messages.length||new Set(state.evidence.map(e=>e.id)).size!==state.evidence.length)fail(`Side ${side} has duplicate saved identities.`);
  const message=state.messages.find(m=>m.id===selection.messageId&&m.role==='assistant');if(!message)fail(`Side ${side} result ${selection.messageId} is missing.`);
  let context;try{context=structuredClone(finalAssetContext(state,message));}catch{fail(`Side ${side} result ${selection.messageId} has corrupt branch context.`);}
  context.source={side,investigationId:state.id,investigationTitle:state.title||'',messageId:message.id,title:message.title||'',featureName:message.branchFeatureName||message.focus?.featureName||'',resultCreatedAt:message.createdAt||''};
  const earlier=state.messages.slice(0,state.messages.indexOf(message)+1),discovery=earlier.findLast(m=>m.features?.some(f=>f.name===context.source.featureName));
  if(context.feature&&discovery)context.featureClaimSupport=(context.feature.claimIndexes||[]).map(index=>({index,claim:structuredClone(discovery.claims?.[index])}));
  // Archive the complete chosen branch records, including older/unknown saved
  // fields. historicalRecord retains original IDs and metadata as inert data;
  // only the known reference fields in the model-facing result are remapped.
  context.results=context.results.map(result=>{const original=state.messages.find(m=>m.id===result.id);return {...structuredClone(original),...result,historicalRecord:structuredClone(original)};});
  if(message.auditScope?.sources)context.comparisonSources=structuredClone(message.auditScope.sources);
  const ids=new Set(context.evidence.map(e=>e.id));for(const support of context.featureClaimSupport||[])if(support.claim?.evidenceId)ids.add(support.claim.evidenceId);for(const result of context.results)for(const claim of result.claims||[])if(claim.evidenceId)ids.add(claim.evidenceId);for(const run of context.verificationRuns||[])for(const id of run.evidenceIds||[])ids.add(id);
  for(const source of message.auditScope?.sources||[]){if(source.contextEvidenceId)ids.add(source.contextEvidenceId);for(const receipt of source.receiptMap||[])ids.add(receipt.receiptId);}
  const receipts=[];let bytes=0;
  for(const id of ids){stopped(signal);const e=state.evidence.find(item=>item.id===id);if(!e)fail(`Side ${side} result ${message.id} refers to missing receipt ${id}.`);
    if(e.stale||e.applicability==='changed')fail(`Side ${side} receipt ${id} is historical after a target change; reselect supported saved evidence.`);
    let raw;try{raw=await readRaw(store,state,e);}catch(error){fail(`Side ${side} result ${message.id}: ${error.message}`);}
    bytes+=raw.length;if(bytes>64*1024*1024)fail(`Side ${side} saved context exceeds 64 MiB.`);
    receipts.push({record:cleanRecord(e),raw});
  }
  context.evidence=receipts.map(({record})=>record);
  const digestContext=structuredClone(context);delete digestContext.source.side;
  const selectionDigest=digest(digestContext);return {state,message,context,receipts,selectionDigest};
}
export async function listComparisonCandidates(store,options={}){
  const offset=Number.isInteger(options.offset)&&options.offset>=0?options.offset:0,limit=Math.max(1,Math.min(100,Number.isInteger(options.limit)?options.limit:100));
  if(options.investigationId&&!uuid(options.investigationId))throw new Error('Invalid saved investigation.');
  if(options.messageId&&(!options.investigationId||!recordId(options.messageId)))throw new Error('Exact saved result lookup requires a valid investigation and result.');
  let entries;try{entries=await fs.readdir(store.root,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return {candidates:[],unavailableCount:0,hasMore:false};throw error;}
  const candidates=[];let unavailableCount=0;
  for(const entry of entries){if(!entry.isDirectory()||!uuid(entry.name)||options.investigationId&&options.investigationId!==entry.name)continue;let state;
    try{await sourceDirectory(store,entry.name);state=await store.read(entry.name);if(state.id!==entry.name||!Array.isArray(state.messages)||!Array.isArray(state.evidence)||state.messages.some(m=>!m||!recordId(m.id)))throw new Error();}catch{unavailableCount++;continue;}
    const messages=state.messages.filter(m=>m.role==='assistant'&&(!options.messageId||m.id===options.messageId));
    if(options.messageId&&!messages.length){unavailableCount++;candidates.push({investigationId:state.id,messageId:options.messageId,selectionDigest:'',investigationTitle:safeText(state.title,160),title:'Unavailable saved result',featureName:'',resultCreatedAt:'',overview:'',evidenceCount:0,availability:'unavailable',limitations:['Selected saved result is missing.'],reason:'Selected saved result is missing.'});}
    for(const message of messages){
      candidates.push({investigationId:state.id,messageId:message.id,selectionDigest:'',investigationTitle:safeText(state.title,160),title:safeText(message.title,160),featureName:safeText(message.branchFeatureName||message.focus?.featureName,160),resultCreatedAt:typeof message.createdAt==='string'?message.createdAt:'',overview:safeText(message.overview||message.text,500),evidenceCount:0,availability:'available',limitations:['Saved evidence only; no new inspection.','Current target applicability is not established by this comparison.']});
    }
  }
  candidates.sort((a,b)=>b.resultCreatedAt.localeCompare(a.resultCreatedAt)||a.investigationId.localeCompare(b.investigationId)||a.messageId.localeCompare(b.messageId));
  const page=candidates.slice(offset,offset+limit);
  // Snapshot validation is bounded to this page, rather than rereading every
  // saved branch before the first hundred summaries can be displayed.
  for(const candidate of page){if(candidate.availability==='unavailable')continue;try{const selected=await selectedContext(store,candidate,'selected');candidate.selectionDigest=selected.selectionDigest;candidate.evidenceCount=selected.receipts.length;}catch(error){candidate.reason=safeText(error.message);candidate.availability='unavailable';candidate.limitations=[candidate.reason];unavailableCount++;}}
  return {candidates:page,unavailableCount,hasMore:candidates.length>offset+limit};
}
function remapContext(input,evidenceMap,resultMap,prefix){
  const context=structuredClone(input),claim=c=>{if(c?.evidenceId)c.evidenceId=evidenceMap.get(c.evidenceId)||c.evidenceId;};
  for(const result of context.results){result.id=resultMap.get(result.id);for(const c of result.claims||[])claim(c);if(result.parentResultId)result.parentResultId=resultMap.get(result.parentResultId)||null;for(const c of result.finalAsset?.supportingClaims||[])claim(c);if(result.finalAsset?.sourceMessageIds)result.finalAsset.sourceMessageIds=result.finalAsset.sourceMessageIds.map(id=>resultMap.get(id)||id);if(result.delivery?.evidenceIds)result.delivery.evidenceIds=result.delivery.evidenceIds.map(id=>evidenceMap.get(id)||id);}
  for(const support of context.featureClaimSupport||[])claim(support.claim);
  for(const e of context.evidence)e.id=evidenceMap.get(e.id);
  context.verificationRuns=(context.verificationRuns||[]).map((run,index)=>({...run,id:`${prefix}_v_${index}`,messageId:resultMap.get(run.messageId)||'',evidenceIds:(run.evidenceIds||[]).map(id=>evidenceMap.get(id)||id),historical:true}));
  return context;
}
export async function prepareSavedComparison(store,payload,{signal}={}){
  validatePayload(payload);stopped(signal);const selected=[];
  for(let i=0;i<2;i++){const source=await selectedContext(store,payload.selections[i],i?'B':'A',signal);if(source.selectionDigest!==payload.selections[i].selectionDigest)fail(`Side ${i?'B':'A'} saved selection changed; select it again.`);selected.push(source);}
  const destination=selected[0].state,map=validateInvestigation(destination);if(payload.nodeId&&!map.nodes.has(payload.nodeId))fail('The initiating node is no longer available.');
  const prefix=`cmp_${payload.operationId.replaceAll('-','')}`,contexts=[],receipts=[],sources=[],copiedAt=new Date().toISOString(),used=new Set(destination.evidence.map(e=>e.id));
  for(let i=0;i<2;i++){
    const source=selected[i],side=i?'B':'A',sidePrefix=`${prefix}_${side.toLowerCase()}`,evidenceMap=new Map(source.receipts.map(({record},index)=>[record.id,`${sidePrefix}_${index}`])),resultMap=new Map(source.context.results.map((r,index)=>[r.id,`${sidePrefix}_r_${index}`]));
    const receiptMap=[];
    for(const {record,raw} of source.receipts){const id=evidenceMap.get(record.id);if(used.has(id))fail('Comparison receipt identity already exists.');used.add(id);
      const origin={...source.context.source,evidenceId:record.id,originalKind:record.kind||'unknown',sha256:record.sha256,textSha256:hash(record.text),originalSha256:record.originalSha256||null,locator:record.locator||'',targetIdentity:record.targetIdentity||null,operation:record.operation||null,parameters:record.parameters||null,locations:record.locations||null,reaEvidenceId:record.reaEvidenceId||null,priorComparisonOrigin:record.comparisonOrigin||null,sourceResultDigest:source.selectionDigest,copiedAt};
      const metadata={id,kind:record.kind==='comparison-context'?'comparison-context':'comparison-receipt',title:`${side}: ${source.context.source.featureName||source.context.source.investigationTitle} — retained evidence`,text:record.text,sha256:record.sha256,evidenceStatus:record.evidenceStatus||(record.kind==='file'?'static':record.kind==='page'?'description':'unknown'),sourceCoverage:record.sourceCoverage,authority:record.authority,capturedAt:record.capturedAt,applicability:record.applicability||'unknown',stale:!!record.stale,limitations:[...(record.limitations||[]),'Copied retained evidence; no new inspection.'],comparisonOrigin:origin};
      receipts.push({record:metadata,raw});receiptMap.push({originalEvidenceId:record.id,receiptId:id,sha256:record.sha256});
    }
    const context=remapContext(source.context,evidenceMap,resultMap,sidePrefix),contextEvidenceId=`${sidePrefix}_context`,raw=Buffer.from(JSON.stringify(context,null,2));
    if(used.has(contextEvidenceId))fail('Comparison context identity already exists.');used.add(contextEvidenceId);
    receipts.push({record:{id:contextEvidenceId,kind:'comparison-context',title:`${side}: complete saved comparison context`,text:raw.toString('utf8'),sha256:hash(raw),evidenceStatus:'context-transcript',limitations:['Saved answer and check context; not primary factual evidence.','No new inspection or behavioral checks.'],comparisonOrigin:{...source.context.source,sourceResultDigest:source.selectionDigest,copiedAt}},raw});
    const recordedChecks=(source.context.verificationRuns||[]).map(run=>({scope:run.scope||'Recorded source check',status:run.status||'unknown',cases:(run.cases||[]).map(c=>({id:c.id,status:c.status})),limitations:run.limitations||[],historical:true}));
    contexts.push(context);sources.push({...source.context.source,selectionDigest:source.selectionDigest,contextEvidenceId,receiptMap,recordedChecks});
  }
  return {payload:structuredClone(payload),requestDigest:comparisonRequestDigest(payload),researchSeal:researchSeal(destination),contexts,receipts,sources};
}
async function journalDirectory(store,id,op,{create=false}={}){
  operationPath(store,id,op);const source=await sourceDirectory(store,id);let directory=source;
  // Check each existing component before any mkdir. Recursive mkdir would
  // follow a linked .comparisons parent and mutate its target before validation.
  for(const name of ['.comparisons',op]){
    const parent=directory;directory=path.join(parent,name);let stat;
    try{stat=await fs.lstat(directory);}catch(error){if(error.code!=='ENOENT')throw error;if(!create)return null;
      if(path.resolve(await fs.realpath(parent)).toLowerCase()!==path.resolve(parent).toLowerCase())throw new Error('Unsafe comparison operation directory.');
      try{await fs.mkdir(directory);}catch(mkdirError){if(mkdirError.code!=='EEXIST')throw mkdirError;}stat=await fs.lstat(directory);
    }
    if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Unsafe comparison operation directory.');
    const actual=await fs.realpath(directory);if(!inside(source,actual)||path.resolve(actual).toLowerCase()!==path.resolve(directory).toLowerCase())throw new Error('Unsafe comparison operation directory.');
  }
  return directory;
}
async function journalRead(store,id,op){const directory=await journalDirectory(store,id,op);if(!directory)return null;try{return JSON.parse(await fs.readFile(path.join(directory,'operation.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function journalWrite(store,id,op,value){const directory=await journalDirectory(store,id,op,{create:true});const temporary=path.join(directory,`status-${randomUUID()}.tmp`);await fs.writeFile(temporary,JSON.stringify(value,null,2));await atomicReplace(temporary,path.join(directory,'operation.json'));}
async function committedState(store,id,op,requestDigest,expected){
  const state=await store.read(id),matches=state.messages.filter(m=>m.role==='assistant'&&m.auditScope?.operationId===op);if(matches.length!==1)return {state,found:false};
  const result=matches[0];if(requestDigest&&result.auditScope.requestDigest!==requestDigest)throw new Error('This comparison operation ID belongs to a different request.');
  if(expected&&digest(result)!==expected.resultDigest)throw new Error('Saved comparison result differs from its commit receipt.');
  const ids=result.auditScope.sources.flatMap(s=>[s.contextEvidenceId,...s.receiptMap.map(r=>r.receiptId)]);
  for(const receiptId of new Set(ids)){const e=state.evidence.find(e=>e.id===receiptId);if(!e)throw new Error('Saved comparison receipt metadata is missing.');if(expected?.receiptDigests?.[receiptId]&&digest(cleanRecord(e))!==expected.receiptDigests[receiptId])throw new Error('Saved comparison receipt metadata changed.');await readRaw(store,state,e);}
  return {state,found:true};
}
export async function comparisonStatus(store,id,op,{requestDigest,ignoreActive=false}={}){
  operationPath(store,id,op);let journal;const owned=()=>!ignoreActive&&running.get(JSON.stringify([store.root,id,op]));
  const activeStatus=()=>({status:'running',operationId:op,requestDigest:owned().requestDigest,message:owned().signal?.aborted?'Stopping this comparison. Waiting for the active operation to finish; no second AI request started.':'This comparison is running. No second AI request started.'});
  try{journal=await journalRead(store,id,op);if(requestDigest&&journal&&journal.requestDigest!==requestDigest)throw new Error('This comparison operation ID belongs to a different request.');const saved=await committedState(store,id,op,requestDigest||journal?.requestDigest,journal);
    if(saved.found)return {status:'saved',operationId:op,requestDigest:journal?.requestDigest||requestDigest,message:'Comparison saved. Originals retained; no new inspection.',state:saved.state};
    if(owned())return activeStatus();
    if(journal?.researchSeal&&researchSeal(saved.state)===journal.researchSeal&&journal.status!=='running')return {status:'unchanged',operationId:op,requestDigest:journal.requestDigest,message:'No comparison was saved. Prior AI work may have occurred; it will not be retried automatically.',state:saved.state};
  }catch(error){if(/different request/.test(error.message))throw error;if(owned())return activeStatus();}
  return {status:'uncertain',operationId:op,requestDigest:journal?.requestDigest,message:'Saved outcome is uncertain. No comparison restarted. Check saved status without retrying AI.'};
}
export async function commitSavedComparison(store,prepared,answer,{signal,beforeSave=async()=>{},promote=async(file,raw)=>fs.writeFile(file,raw,{flag:'wx'})}={}){
  const {payload:p}=prepared;stopped(signal);
  // Revalidate both selections after reasoning; retain the newest local draft/view/collection.
  const fresh=await prepareSavedComparison(store,p,{signal});if(fresh.researchSeal!==prepared.researchSeal)throw new Error('Saved research changed during comparison. Nothing was appended.');
  let state=await store.read(p.destinationInvestigationId);const base=state.messages.find(m=>m.id===p.anchorResultId),createdAt=new Date().toISOString(),branch=base.branchFeatureName||base.focus?.featureName;
  const result={...answer,id:randomUUID(),role:'assistant',text:answer.answer||answer.overview||'',createdAt,branchFeatureName:branch,focus:base.focus,parentResultId:base.id,parentNodeId:p.nodeId||`turn:${base.id}`,auditScope:{kind:'comparison',version:1,noNewInspection:true,operationId:p.operationId,requestDigest:prepared.requestDigest,sourceMessageIds:prepared.sources.filter(s=>s.investigationId===state.id).map(s=>s.messageId),sources:prepared.sources}};
  const evidenceDirectory=path.join(await sourceDirectory(store,state.id),'evidence');await fs.mkdir(evidenceDirectory,{recursive:true});if(path.resolve(await fs.realpath(evidenceDirectory)).toLowerCase()!==path.resolve(evidenceDirectory).toLowerCase())throw new Error('Unsafe destination evidence directory.');
  for(const receipt of prepared.receipts)state.evidence.push({...receipt.record,snapshotPath:path.join(evidenceDirectory,`${receipt.record.id}.txt`)});
  const requestMessage={id:randomUUID(),role:'user',text:p.request.trim(),createdAt,branchFeatureName:branch};state.messages.push(requestMessage,result);state.status='saved';attachDelivery(state,result);validateInvestigation(state);
  const journal={operationId:p.operationId,requestDigest:prepared.requestDigest,researchSeal:prepared.researchSeal,status:'committing',resultDigest:digest(result),receiptDigests:Object.fromEntries(prepared.receipts.map(r=>[r.record.id,digest(r.record)]))};
  await journalWrite(store,state.id,p.operationId,journal);const created=[];let saving=false;
  try{
    // Stage all exact bytes inside this operation before publishing any metadata.
    const stage=path.join(operationPath(store,state.id,p.operationId),'receipts');await fs.mkdir(stage);const stageActual=await fs.realpath(stage);if(path.resolve(stageActual).toLowerCase()!==path.resolve(stage).toLowerCase())throw new Error('Unsafe comparison staging directory.');
    for(const receipt of prepared.receipts){stopped(signal);await fs.writeFile(path.join(stage,`${receipt.record.id}.txt`),receipt.raw,{flag:'wx'});}
    for(const receipt of prepared.receipts){stopped(signal);const file=path.join(evidenceDirectory,`${receipt.record.id}.txt`);if(!inside(evidenceDirectory,file))throw new Error('Unsafe comparison receipt path.');await promote(file,await fs.readFile(path.join(stage,`${receipt.record.id}.txt`)));created.push(file);}
    await beforeSave();stopped(signal);
    const checked=await prepareSavedComparison(store,p,{signal});if(checked.researchSeal!==prepared.researchSeal)throw new Error('Saved research changed before comparison commit.');
    const latest=await store.read(p.destinationInvestigationId);if(researchSeal(latest)!==prepared.researchSeal)throw new Error('Saved research changed before comparison commit.');
    state={...latest,evidence:[...latest.evidence,...state.evidence.slice(latest.evidence.length)],messages:[...latest.messages,requestMessage,result],status:'saved'};validateInvestigation(state);
    stopped(signal);saving=true;await store.save(state);
  }catch(error){
    if(!saving){for(const file of created)await fs.rm(file,{force:true});await journalWrite(store,state.id,p.operationId,{...journal,status:'unchanged'});throw error;}
    const outcome=await comparisonStatus(store,state.id,p.operationId,{requestDigest:prepared.requestDigest,ignoreActive:true});if(outcome.status==='saved')outcome.message='Comparison saved; a derived output update failed. Check saved status before any new action.';return outcome;
  }
  return comparisonStatus(store,state.id,p.operationId,{requestDigest:prepared.requestDigest,ignoreActive:true});
}
const running=new Map();
export async function compareSaved(store,payload,{signal,config,getConfig,directory,onProgress=()=>{},reasoning,beforeSave,promote}={}){
  const requestDigest=comparisonRequestDigest(payload),key=JSON.stringify([store.root,payload.destinationInvestigationId,payload.operationId]);
  if(running.has(key)){if(running.get(key).requestDigest!==requestDigest)throw new Error('This comparison operation ID belongs to a different request.');return {status:'running',operationId:payload.operationId,requestDigest,message:'Comparison is already running. No second AI request started.'};}
  // Set the process-local admission guard before any preparation awaits.
  running.set(key,{requestDigest,signal});let prepared,reasoningStarted=false;
  try{
    const prior=await journalRead(store,payload.destinationInvestigationId,payload.operationId);if(prior){if(prior.requestDigest!==requestDigest)throw new Error('This comparison operation ID belongs to a different request.');return comparisonStatus(store,payload.destinationInvestigationId,payload.operationId,{requestDigest});}
    prepared=await prepareSavedComparison(store,payload,{signal});stopped(signal);
    await journalWrite(store,payload.destinationInvestigationId,payload.operationId,{operationId:payload.operationId,requestDigest,researchSeal:prepared.researchSeal,status:'running'});
    const settings=getConfig?await getConfig():config;stopped(signal);
    const evidence=prepared.receipts.filter(r=>r.record.kind==='comparison-receipt').map(r=>r.record);
    reasoningStarted=true;const answer=await buildSupportAnswer(prepared.contexts,evidence,payload.request,{config:settings,directory:directory||store.directory(payload.destinationInvestigationId),signal,onProgress,reasoning,comparison:true,explicitOrigins:true});stopped(signal);
    return await commitSavedComparison(store,prepared,answer,{signal,beforeSave,promote});
  }catch(error){
    if(prepared)await journalWrite(store,payload.destinationInvestigationId,payload.operationId,{operationId:payload.operationId,requestDigest,researchSeal:prepared.researchSeal,status:'unchanged'}).catch(()=>{});
    if(reasoningStarted){const notice=new Error(`${error.message.replace(/\s*No comparison started\./g,'')} No comparison saved. AI work may have occurred; it will not be retried automatically.`,{cause:error});notice.name=error.name;throw notice;}
    throw error;
  }finally{running.delete(key);}
}
