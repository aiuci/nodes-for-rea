// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {randomUUID} from 'node:crypto';
import {answerSchema, reason, validateClaims, presentationErrors} from './agent.mjs';
import {finalAssetContext} from './finalize.mjs';
import {attachDelivery} from './delivery.mjs';

// This path has no planner, REA client, acquisition or target execution.
export async function auditSavedSupport(state, messageIds, request, {config, directory, signal, onProgress=()=>{}, reasoning=reason}={}) {
  if(!Array.isArray(messageIds)||messageIds.length<1||messageIds.length>2||new Set(messageIds).size!==messageIds.length)throw new Error('Choose one saved finding or two saved results to compare.');
  if(typeof request!=='string'||!request.trim()||request.length>18000)throw new Error('Enter a support question under 18,000 characters.');
  const messages=messageIds.map(id=>state.messages.find(m=>m.id===id&&m.role==='assistant'));
  if(messages.some(m=>!m))throw new Error('A selected result is unavailable.');
  const contexts=messages.map(m=>finalAssetContext(state,m)),allowed=new Set(contexts.flatMap(c=>c.evidence.map(e=>e.id))),evidence=state.evidence.filter(e=>allowed.has(e.id));
  const answer=await buildSupportAnswer(contexts,evidence,request,{config,directory,signal,onProgress,reasoning,comparison:messageIds.length===2});
  const base=messages[0],createdAt=new Date().toISOString(),branch=base.branchFeatureName||base.focus?.featureName;
  const result={...answer,id:randomUUID(),role:'assistant',text:answer.answer||answer.overview||'',createdAt,branchFeatureName:branch,focus:base.focus,parentResultId:base.id,parentNodeId:`turn:${base.id}`,auditScope:{sourceMessageIds:messageIds,kind:messageIds.length===2?'comparison':'support-review',noNewInspection:true}};
  state.messages.push({id:randomUUID(),role:'user',text:request,createdAt,branchFeatureName:branch},result);
  state.understanding=answer.overview||state.understanding;state.status='saved';attachDelivery(state,result);
  return result;
}

export async function buildSupportAnswer(contexts,evidence,request,{config,directory,signal,onProgress=()=>{},reasoning=reason,comparison=false,explicitOrigins=false}={}){
  onProgress(comparison?'Comparing retained findings and support…':'Auditing the selected finding against its retained support…');
  const task=`Answer the user's question using ONLY the supplied saved result contexts. No target inspection or runtime execution occurs. ${comparison?'Compare both explicitly selected areas; keep source attribution and unknowns distinct.':'Audit support for the selected finding. If a detail has no relevant supporting passage, explicitly qualify or withdraw it. A quote match does not prove its interpretation. Do not explain a missing detail by saying it is common in similar systems.'} ${explicitOrigins?'The user explicitly selected these two saved origins. Use both supplied subjects only. Host source metadata controls attribution. Context transcripts are not factual evidence. Source checks are historical; this comparison performs no new checks.':''} Return the answer schema: features/products/mechanismCoverage may be empty, findings is a concise question/finding table, claims lists exact supporting quotes for every supported factual assertion and labels inferences. Unsupported details remain explicit gaps with empty claimIndexes. Preserve consequential uncertainty. recommendation may be empty; continuation must be complete or blocked because there is no new inspection on this route. Set behavior.unknowns to material missing support where relevant. Do not claim that any behavior was tested unless an included finite check actually records it. All claim indexes reference claims. This answer supplements the original retained result; the original is not overwritten.`;
  signal?.throwIfAborted();
  let answer=await reasoning(config,answerSchema,JSON.stringify({task,request,contexts}),directory,signal,onProgress);
  signal?.throwIfAborted();
  const checked=validateClaims(answer,evidence);
  if(checked.rejectedClaimCount)throw new Error('The support review contained invalid source references. The original finding is retained.');
  answer={...answer,claims:checked.claims,features:[],continuation:{...answer.continuation,status:answer.continuation?.status==='blocked'?'blocked':'complete'},recommendation:''};
  const errors=presentationErrors(answer,evidence.length>0);if(errors.length)throw new Error(`The support review could not be saved: ${errors.join(' ')}`);
  return answer;
}
