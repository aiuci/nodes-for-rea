// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {claimCategory,findingCategory} from './finding-category.mjs';

export const exampleSource='export function shippingFee(subtotal) {\n  return subtotal >= 50 ? 0 : 5;\n}\n';
export const exampleQuestion='When is shipping free, and what fee does this code specify otherwise? Inspect the supplied local source. Give one clear finding with an exact supporting source quotation. Distinguish static code inspection from runtime behavior, and state what the source does not establish. Do not execute the source.';
export function cleanTour(value={}){
  if(!value||value.version!==1)return {version:1,status:'new',step:0,investigationId:null,evidenceKey:null};
  return {version:1,status:['new','active','paused','skipped','done'].includes(value.status)?value.status:'paused',step:Number.isInteger(value.step)?Math.min(3,Math.max(0,value.step)):0,investigationId:/^[\da-f-]{36}$/.test(value.investigationId||'')?value.investigationId:null,evidenceKey:typeof value.evidenceKey==='string'&&value.evidenceKey.length<=100000?value.evidenceKey:null};
}
export function tourFinding(state,id){
  if(!id||state?.id!==id||state?.tutorialExample?.version!==1||state.status==='inspecting')return null;
  for(const message of [...(state.messages||[])].reverse()){
    if(message.role!=='assistant'||message.continuation?.status==='blocked')continue;
    for(const finding of message.findings||[]){
      const category=findingCategory(state,message,finding);if(category.key==='unknown')continue;
      for(const index of finding.claimIndexes||[]){const claim=message.claims?.[index],source=state.evidence?.find(e=>e.id===claim?.evidenceId);if(claimCategory(claim,source).key!=='unknown')return project(message,finding.finding||claim.text,claim,source,category);}
    }
    for(const claim of message.claims||[]){const source=state.evidence?.find(e=>e.id===claim.evidenceId),category=claimCategory(claim,source);if(category.key!=='unknown'&&claim.text?.trim())return project(message,claim.text,claim,source,category);}
  }
  return null;
}
function project(message,text,claim,source,category){return {messageId:message.id,text,quote:claim.quote,evidenceId:source.id,category,key:JSON.stringify([message.id,source.id,source.sha256||'',claim.quote])};}
export function mayFinishTour(tour,state,{workspaceSaved=false,snapshotReadable=false}={}){const finding=tourFinding(state,tour.investigationId);return !!finding&&finding.key===tour.evidenceKey&&workspaceSaved&&snapshotReadable;}
