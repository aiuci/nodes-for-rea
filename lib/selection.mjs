// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {inventoryRecords,inventoryRecord} from './discovery-inventory.mjs';
export function featureMap(state){return state.messages.findLast(message=>message.role==='assistant'&&message.features?.length);}
export function selectedFeature(state){
  const selection=state.selection;if(!selection)return null;
  const record=inventoryRecord(state,selection);
  return record?{...record.row,messageId:record.message.id}:null;
}
export function selectFeature(state,messageId,featureName){
  const record=inventoryRecord(state,{messageId,featureName});
  if(!record)throw new Error('That feature is no longer available in this investigation.');
  const {row}=record;
  state.selection={messageId:record.message.id,featureName:row.name,displayLabel:row.displayLabel||row.name,selectedAt:new Date().toISOString()};
  return selectedFeature(state);
}
export function reconcileSelection(state,message){
  if(!state.selection)return;
  const match=message.features?.find(row=>row.name.trim().toLowerCase()===state.selection.featureName.trim().toLowerCase());
  if(match)selectFeature(state,message.id,match.name);
  // A smaller rediscovery is a new presentation, not deletion of earlier work.
  else if(!selectedFeature(state))state.selection=null;
}
const normalize=text=>text.toLowerCase().replace(/[“”"'‘’]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function resolveSelection(state,text){
  const map=featureMap(state),records=inventoryRecords(state),request=normalize(text);
  const directed=/^(?:select|focus on|explore|investigate|examine|look at|compare|tell me about)\b/i.test(text.trim());
  const matches=records.filter(({row})=>[row.name,row.displayLabel].filter(Boolean).some(label=>{
    const term=normalize(label),contained=` ${request} `.includes(` ${term} `);
    return contained&&(directed||term.includes(' ')||request===term||['about','does','do','is','are'].some(prefix=>` ${request} `.includes(` ${prefix} ${term} `)));
  }));
  // A longer explicit label takes precedence over a label contained within it.
  const specific=matches.filter(({row})=>!matches.some(other=>other.row!==row&&normalize(other.row.displayLabel||other.row.name).includes(normalize(row.displayLabel||row.name))));
  if(specific.length===1){selectFeature(state,specific[0].message.id,specific[0].row.name);return {selectionOnly:/^(select|focus on)\b/i.test(text.trim())};}
  if(/^(?:investigate|explore)\s+(?:that|this)[.!?\s]*$|^(?:go deeper|continue|tell me more)[.!?\s]*$/i.test(text.trim())){
    if(selectedFeature(state))return {};
    const recommendation=map?.features?.find(row=>row.name.trim().toLowerCase()===map.recommendation?.trim().toLowerCase());
    if(recommendation){selectFeature(state,map.id,recommendation.name);return {};}
    if(!state.understanding)return {clarification:'Choose a feature or describe what you want to investigate.'};
  }
  return {};
}
export function savedStatus(state){
  if(state.status)return state.status;
  const last=state.messages.at(-1);
  return last?.role==='system'?(/stopp|abort/i.test(last.text)?'stopped':'failed'):last?.role==='assistant'?'saved':'ready';
}
