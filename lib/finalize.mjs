// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {reason,validateClaims,referenceErrors} from './agent.mjs';
import {purposeContext} from './purpose.mjs';
const string={type:'string'};
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
export const finalAssetSchema=object({title:string,form:string,tldr:string,comprehensive:string,claimIndexes:{type:'array',items:{type:'integer'}},supportingClaims:{type:'array',items:object({text:string,state:{type:'string',enum:['observed','inferred','proposed']},evidenceId:string,quote:string})}});

export function finalAssetContext(state,message){
  const index=state.messages.findIndex(item=>item.id===message.id),earlier=state.messages.slice(0,index+1),branch=message.branchFeatureName||message.focus?.featureName||'';
  const results=earlier.filter(item=>item.role==='assistant'&&(item.id===message.id||branch&&(item.branchFeatureName||item.focus?.featureName)===branch));
  const map=earlier.findLast(item=>item.features?.some(row=>row.name===branch)),row=map?.features?.find(row=>row.name===branch);
  const claims=[...results.flatMap(item=>item.claims||[]),...(row?.claimIndexes||[]).map(index=>map.claims[index])].filter(Boolean),ids=new Set(claims.map(claim=>claim.evidenceId).filter(Boolean));
  const evidence=state.evidence.filter(source=>ids.has(source.id));
  const comparisonContexts=(message.auditScope?.sources||[]).map(source=>{const receipt=state.evidence.find(e=>e.id===source.contextEvidenceId&&e.kind==='comparison-context');try{return {side:source.side,context:JSON.parse(receipt.text),historical:true};}catch{return {side:source.side,unavailable:true,limitation:'Archived source context is unavailable; no source checks were repeated.'};}});
  return {...(message.auditScope?.sources?{comparisonSources:structuredClone(message.auditScope.sources),comparisonContexts,comparisonBoundary:"Comparison of saved receipts only; source checks are historical, not checks performed by this result."}:{}),purpose:message.purpose||purposeContext(state).current,request:earlier.findLast(item=>item.role==='user')?.text||'',feature:row||null,results:results.map(item=>({id:item.id,title:item.title,answer:item.text||item.answer,findings:item.findings,behavior:item.behavior,claims:item.claims,caveat:item.caveat,continuation:item.continuation,inspectionErrors:item.inspectionErrors})),evidence:evidence.map(({id,text,locator,sha256,targetIdentity,operation,evidenceStatus,applicability,stale,limitations})=>({id,text,locator,sha256,targetIdentity,operation,evidenceStatus,applicability,stale,limitations})),verificationRuns:(state.verificationRuns||[]).filter(run=>results.some(item=>item.id===run.messageId))};
}

export async function finalizeAsset(state,message,{config,directory,signal,onProgress=()=>{},reasoning=reason}={}){
  const context=finalAssetContext(state,message),allowed=context.evidence;
  const task=`Produce the finished asset requested by the user from this saved feature branch. Choose its form from the user's objective: an explanation, specification, comparison, requirements, or other supported deliverable. Do not substitute a plan unless a plan was requested. The entire asset has two reader-chosen depths: tldr is short and independently useful; comprehensive supplies complete useful detail. Do not include the TLDR or COMPREHENSIVE headings inside these fields; the app renders them. Both depths agree on facts, authority, uncertainty and verification scope. Preserve consequential limits in BOTH depths. Use complete branch evidence and validated findings, compress repetition, and preserve stable conclusions without inventing discoveries. No new inspection or execution occurs during this operation. Do not add facts, requirements, authorization, verified labels or decisions unsupported by this context. Static code is not runtime observation; quote membership is not behavioral verification; user-supplied expected values are attributed expectations. Changed artifact evidence is historical and cannot support current behavior without a new check. Proposed adaptations stay proposals. Do not expose process or hidden reasoning. supportingClaims lists every material source-backed assertion with a supplied evidenceId and exact quote; inferred interpretations are labeled inferred and unsupported design proposals proposed. claimIndexes references this supportingClaims array. Retain failed checks and untested behavior. No comparative benefit or cost saving is established by a working connection.`;
  onProgress('Creating the finished asset from saved branch evidence…');
  let asset=await reasoning(config,finalAssetSchema,JSON.stringify({task,context}),directory,signal,onProgress);
  const errors=()=>referenceErrors({claims:asset.supportingClaims},allowed);
  if(errors().length)asset=await reasoning(config,finalAssetSchema,JSON.stringify({task,context,draft:asset,errors:errors(),repair:'Copy exact evidence quotes or remove unsupported assertions; retain all material limits.'}),directory,signal,onProgress);
  const checked=validateClaims({claims:asset.supportingClaims},allowed);if(checked.rejectedClaimCount)throw new Error('The finished asset contained unsupported source references. The saved investigation is unchanged.');
  if(!asset.tldr?.trim()||!asset.comprehensive?.trim()||asset.claimIndexes?.some(index=>!Number.isInteger(index)||index<0||index>=checked.claims.length))throw new Error('The finished asset did not retain valid reading depths and references.');
  if(allowed.length&&!checked.claims.some(claim=>claim.evidenceId))throw new Error('The finished asset did not cite its retained branch evidence.');
  return {...asset,supportingClaims:checked.claims,generatedAt:new Date().toISOString(),sourceMessageIds:context.results.map(item=>item.id)};
}
