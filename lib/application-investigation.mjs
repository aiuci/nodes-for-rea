// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {classifyTarget} from './targets.mjs';
import {remainingApplicationTurns} from './application-run-view.mjs';
export {remainingApplicationTurns} from './application-run-view.mjs';

const stamp=()=>new Date().toISOString();
const units={turns:1,reads:3,models:12,operations:16};
const inside=(root,file)=>{const relative=path.relative(root,file);return relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);};
export class ApplicationAllowanceError extends Error{
  constructor(unit){super(`Application investigation allowance reached (${unit}). Resume keeps usage; explicitly grant additional work to extend it.`);this.code='APPLICATION_ALLOWANCE';}
}
export function grantApplicationWork(run,turns){
  if(!Number.isInteger(turns)||turns<1||turns>20)throw Error('Grant between 1 and 20 additional turns.');
  if(run.status==='answered')run.question=''; // An explicit new grant may select the next useful question; prior answers remain recorded.
  for(const [unit,perTurn]of Object.entries(units))run.limits[unit]+=perTurn*turns;
  run.grants.push({at:stamp(),turns,kind:run.grants.length?'additional':'initial'});run.status='ready';run.stopReason='';
}
export async function chargeApplication(state,store,unit,detail){
  const run=state.applicationRun;if(!run)return;
  if(unit==='maintenance'){run.used.maintenance=(run.used.maintenance||0)+1;run.usage.push({at:stamp(),unit,detail});await store.save(state);return;}
  if(run.used[unit]>=run.limits[unit]){run.status='allowance';run.stopReason=`Allowance reached: ${unit}.`;await store.save(state);throw new ApplicationAllowanceError(unit);}
  run.used[unit]++;if(unit==='turns')run.activeTurn={attemptId:detail,number:run.used.turns,status:'active'};
  run.usage.push({at:stamp(),unit,detail});await store.save(state);
}
export async function inventoryApplication(root){
  root=await fs.realpath(root);const queue=[{dir:root,depth:0}],components=[];let examined=0,partial=false;
  while(queue.length&&!partial){const {dir,depth}=queue.shift();for(const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(++examined>1000){partial=true;break;}
    if(entry.isSymbolicLink()||/^(?:node_modules|\.git|logs?|cache|userdata)$/i.test(entry.name))continue;
    const file=path.join(dir,entry.name),canonical=await fs.realpath(file);if(!inside(root,canonical))continue;
    if(entry.isDirectory()){if(depth<3)queue.push({dir:file,depth:depth+1});else partial=true;}
    else if(entry.isFile()&&/\.(?:exe|dll|asar|apk|msix|appx)$/i.test(entry.name))components.push({path:canonical,name:entry.name});
  }}
  return {root,components,examined,partial,limits:{entries:1000,depth:3}};
}
export async function prepareApplicationRun(state,store,incoming,{applicationMode,applicationRunId,additionalTurns,automation,request}={}){
  let run=state.applicationRun;
  if(applicationRunId&&run?.id!==applicationRunId)throw Error('The saved application allowance changed. Reopen this investigation.');
  if(run&&(applicationRunId||additionalTurns)){
    if(applicationMode&&applicationMode!==run.mode){if(applicationMode==='investigate'&&run.mode==='surface'&&additionalTurns){const previous=run.objective;run.mode='investigate';run.objective='Understand a meaningful application workflow by tracing relevant implementation evidence, choosing the question from the supplied application context.';if(state.purpose?.current===previous){state.purpose.current=run.objective;state.purpose.history.push({text:run.objective,at:stamp(),source:'application-investigation'});}}else throw Error('Resume preserves the saved investigation mode.');}
    if(additionalTurns)grantApplicationWork(run,additionalTurns);
    else if(run.status==='answered'&&remainingApplicationTurns(run)>0){run.question='';run.status='ready';}
    await store.save(state);return run;
  }
  if(!applicationMode)return null;
  if(!['investigate','surface'].includes(applicationMode))throw Error('Choose Investigate or Surface Pass.');
  if(run)throw Error('Resume the saved allowance or explicitly grant additional work.');
  const roots=[];for(const locator of incoming){if(/^https?:/.test(locator))continue;try{if((await fs.stat(locator)).isDirectory())roots.push(locator);}catch{}}
  if(roots.length!==1)return null;
  const scope=await inventoryApplication(roots[0]);
  const turns=applicationMode==='surface'?1:Math.max(1,Math.min(20,Number(automation?.maxSteps)||1));
  run=state.applicationRun={version:1,id:randomUUID(),mode:applicationMode,originalRequest:request||incoming.join('\n'),scope,objective:applicationMode==='surface'?'Produce a bounded overview of the supplied application.':'Understand a meaningful application workflow by tracing relevant implementation evidence, choosing the question from the supplied application context.',question:'',questions:[],status:'ready',limits:{turns:0,reads:0,models:0,operations:0},used:{turns:0,reads:0,models:0,operations:0},grants:[],usage:[],progress:[]};
  grantApplicationWork(run,turns);await store.save(state);return run;
}
export function applicationCandidates(state){
  const run=state.applicationRun;if(run?.mode!=='investigate')return [];
  // A filename alone is not an implementation finding. It only admits a lead
  // to the host's bounded candidate catalogue; identity is checked at dispatch.
  const leads=new Set((state.evidence||[]).filter(e=>e.evidenceStatus!=='inspection-failed').flatMap(e=>[...(e.text||'').matchAll(/[\w.+-]+\.(?:dll|exe|asar)/gi)].map(m=>m[0].toLowerCase())));
  return run.scope.components.filter(c=>leads.has(c.name.toLowerCase())&&!state.targets.some(t=>t.root?.toLowerCase()===c.path.toLowerCase())).slice(0,24);
}
export async function admitApplicationComponent(state,file,{classify=classifyTarget}={}){
  const run=state.applicationRun,candidate=applicationCandidates(state).find(c=>c.path===file);
  if(!candidate||run?.mode!=='investigate')throw Error('This component has no admitted application-scope lead.');
  const root=await fs.realpath(run.scope.root),canonical=await fs.realpath(file);
  if(root!==run.scope.root||canonical!==file||!inside(root,canonical))throw Error('The component resolves outside the inventoried application scope.');
  const target=await classify(canonical);
  if(target.kind!=='artifact'||target.targetType==='unsupported')throw Error('The component has no supported static inspection route.');
  const parent=state.targets.find(t=>t.locator===root||t.containerRoot===root);
  state.targets.push({...target,applicationRunId:run.id,applicationProductRoot:parent?.applicationProductRoot||parent?.root||root,containerRoot:root,admission:{at:stamp(),reason:'Referenced by retained application evidence',path:canonical,sha256:target.identity.sha256}});
  return state.targets.at(-1);
}
export function applicationContext(state){
  const run=state.applicationRun;if(!run)return undefined;
  return {id:run.id,mode:run.mode,objective:run.objective,question:run.question,scope:{root:run.scope.root,componentCount:run.scope.components.length,partial:run.scope.partial,limits:run.scope.limits},eligibleComponents:applicationCandidates(state),limits:run.limits,used:run.used,remainingTurns:remainingApplicationTurns(run),progress:run.progress.slice(-3),stopReason:run.stopReason};
}
const implementationOperations=new Set(['analyze_function','procedure_pseudo_code','read_function_instructions','trace_feature','trace_application_feature','inspect_managed_members','inspect_analysis_view','analyze_javascript_application']);
function implementationSource(source){
  if(source.kind==='file')return true;
  if(!implementationOperations.has(source.operation))return false;
  if(source.operation==='trace_feature'){
    try{const trace=JSON.parse(source.text);return (trace.references||[]).some(reference=>reference.containing_procedure?.found)||!!trace.call_path?.length;}catch{return false;}
  }
  return true;
}
function genuineObstacle(source){
  if(source.evidenceStatus!=='inspection-failed'&&source.operationStatus!=='failed')return false;
  // Bad arguments, guessed symbols and wrapper admission failures are not
  // inaccessible evidence. Keep their receipts, but never call them acceptance.
  try{const raw=JSON.parse(source.text),error=raw.error||raw.result?.error||{};return /^(?:provider_unavailable|tool_unavailable|permission_denied|access_denied|unsupported_format|resource_constraint|STAGE_TIMEOUT|ETIMEDOUT)$/.test(error.code||'');}catch{return false;}
}
export function concludeApplicationTurn(state,answer){
  const run=state.applicationRun;if(!run)return answer;
  if(run.activeTurn)run.activeTurn.status='completed';
  if(run.mode==='surface'){run.status='surface-saved';run.stopReason='Surface Pass overview saved; application investigation remains optional.';return {...answer,continuation:{status:'complete',uncertainty:'',impact:'',nextEvidence:'',reason:run.stopReason}};}
  const progress=answer.applicationProgress,claims=answer.claims||[];
  const support=(progress?.claimIndexes||[]).map(i=>claims[i]).filter(Boolean).map(c=>({claim:c,source:state.evidence.find(e=>e.id===c.evidenceId)}));
  const relevant=support.filter(({claim,source})=>claim.state!=='proposed'&&claim.quoteOrigin!=='inspection-limit'&&claim.quote?.trim()&&source&&!source.stale&&source.evidenceStatus!=='inspection-failed'&&source.operationStatus!=='failed'&&implementationSource(source));
  const supportKeys=relevant.map(({claim,source})=>JSON.stringify([source.locator,claim.quote.trim()])),priorKeys=new Set(run.progress.filter(p=>p.question===run.question).flatMap(p=>p.supportKeys||[]));
  const grounded=!!run.question?.trim()&&progress?.question===run.question&&progress.explanation?.trim()&&supportKeys.some(key=>!priorKeys.has(key));
  const obstacle=(progress?.obstacleEvidenceIds||[]).map(id=>state.evidence.find(e=>e.id===id)).filter(e=>e&&genuineObstacle(e));
  const genuine=!!run.question?.trim()&&progress?.decision==='boundary'&&progress.question===run.question&&progress.explanation?.trim()&&obstacle.length>0;
  const decision=grounded&&['advanced','answered'].includes(progress.decision)?progress.decision:genuine?'boundary':'unresolved';
  run.progress.push({at:stamp(),...progress,decision,grounded:!!grounded,supportKeys});
  run.status=decision==='answered'?'answered':decision==='boundary'?'boundary':remainingApplicationTurns(run)?'paused':'allowance';
  run.stopReason=decision==='answered'?progress.explanation:decision==='boundary'?progress.explanation:remainingApplicationTurns(run)?'Application question remains open. Resume uses the remaining saved allowance.':'Turn allowance reached; the application question remains open. Grant additional work explicitly to continue.';
  // An initial map, module open or unrelated function is never a completed
  // application answer. Preserve it as evidence with an honest unresolved state.
  return {...answer,continuation:{status:decision==='answered'?'complete':decision==='boundary'?'blocked':'continue',uncertainty:decision==='answered'?'':run.question,impact:decision==='answered'?'':run.objective,nextEvidence:decision==='answered'||decision==='boundary'?'':answer.continuation?.nextEvidence||'Trace implementation relevant to the saved application question.',reason:run.stopReason}};
}
