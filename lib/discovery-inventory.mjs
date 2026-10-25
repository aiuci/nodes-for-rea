// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {productForEvidence} from './collection.mjs';

export const inventoryKey=name=>`feature:${name.trim().toLowerCase()}`;
const key=name=>name.trim().toLowerCase();
const assistants=state=>(state.messages||[]).filter(message=>message.role==='assistant');
const validReferences=(state,mechanism)=>(mechanism.references||[]).filter(ref=>typeof ref.quote==='string'&&ref.quote.trim()&&(state.evidence||[]).some(source=>source.id===ref.evidenceId&&source.evidenceStatus!=='inspection-failed'&&source.text?.includes(ref.quote)));

// A read-only union, independent of the selected recommendation, map visibility,
// or the latest curated presentation. Projection messages never enter history.
export function inventoryRecords(state){
  const messages=assistants(state),records=new Map();
  for(const message of messages)for(const row of message.features||[]){
    if(typeof row.name!=='string'||!row.name.trim())continue;
    records.set(inventoryKey(row.name),{id:inventoryKey(row.name),row,message,title:row.displayLabel||row.name,sourceKind:'feature-map'});
  }
  const inventories=messages.filter(message=>message.mechanismInventory).map(message=>({inventory:message.mechanismInventory,message}));
  if(state.mechanismInventory){
    const owner=messages.findLast(message=>message.mechanismInventory===state.mechanismInventory)||messages.findLast(message=>message.mechanismInventory)||messages.at(-1);
    inventories.push({inventory:state.mechanismInventory,message:owner});
  }
  const latestMechanisms=new Map();
  for(const {inventory,message:owner}of inventories)for(const mechanism of inventory.mechanisms||[]){
    if(mechanism.role==='positioning'||typeof mechanism.name!=='string'||!mechanism.name.trim())continue;
    const references=validReferences(state,mechanism);
    if(!references.length||references.length!==(mechanism.references||[]).length)continue;
    latestMechanisms.set(inventoryKey(mechanism.name),{inventory,owner,mechanism,references});
  }
  for(const {inventory,owner,mechanism,references}of latestMechanisms.values()){
    // Preserve independently named source capabilities even when a curated
    // shared row mentions their IDs. Names are inventory entries, not a shortlist.
    if(records.has(inventoryKey(mechanism.name)))continue;
    const claims=references.map(ref=>({text:mechanism.summary||mechanism.name,state:'observed',...ref}));
    const origins=[];
    for(const [index,claim]of claims.entries()){
      const source=(state.evidence||[]).find(source=>source.id===claim.evidenceId),product=productForEvidence(state,source);
      if(!product)continue;
      let origin=origins.find(origin=>origin.productId===product.id);
      if(!origin){origin={productId:product.id,description:mechanism.summary||mechanism.name,claimIndexes:[]};origins.push(origin);}
      origin.claimIndexes.push(index);
    }
    const row={name:mechanism.name,displayLabel:mechanism.name,investigate:`What is established about ${mechanism.name}, and what remains unknown?`,displayQuestion:`How does ${mechanism.name} work?`,parentName:'',category:'Discovered capabilities',evidenceBasis:'advertised',mechanismIds:[mechanism.id],claimIndexes:claims.map((_,index)=>index),origins};
    const message={id:owner?.id||'inventory:current',role:'assistant',createdAt:owner?.createdAt,title:owner?.title||state.title,features:[row],claims,mechanismInventory:inventory,inventoryProjection:true};
    records.set(inventoryKey(row.name),{id:inventoryKey(row.name),row,message,title:row.displayLabel,sourceKind:'mechanism-inventory'});
  }
  return [...records.values()].map(record=>{
    const results=messages.filter(message=>!message.features?.length&&key(message.branchFeatureName||message.focus?.featureName||'')===key(record.row.name));
    const investigated=results.length>0;
    return {...record,status:investigated?'investigated':'uninvestigated',investigated,resultIds:results.map(message=>message.id)};
  });
}

export function inventoryRecord(state,{messageId,featureName}={}){
  if(typeof featureName!=='string')return null;
  const saved=assistants(state).find(message=>message.id===messageId),row=saved?.features?.find(row=>key(row.name)===key(featureName));
  if(row)return {id:inventoryKey(row.name),row,message:saved,title:row.displayLabel||row.name,sourceKind:'feature-map'};
  const record=inventoryRecords(state).find(record=>key(record.row.name)===key(featureName));
  if(record&&(!messageId||record.message.id===messageId))return record;
  if(saved?.mechanismInventory)return inventoryRecords({...state,messages:[saved],mechanismInventory:null}).find(record=>key(record.row.name)===key(featureName))||null;
  return null;
}

export function inventoryCoverage(state){
  const records=inventoryRecords(state),boundaries=[];
  for(const source of state.evidence||[]){
    for(const reason of source.limitations||[])boundaries.push({kind:'source-limit',sourceId:source.id,reason});
    if(source.sourceCoverage?.partial)boundaries.push({kind:'partial-source',sourceId:source.id,reason:'Only part of this source has been inspected.'});
    if(source.evidenceStatus==='inspection-failed')boundaries.push({kind:'inaccessible',sourceId:source.id,reason:'Inspection did not provide usable evidence.'});
  }
  for(const target of state.targets||[])for(const reason of target.limitations||[])boundaries.push({kind:'target-limit',locator:target.locator,reason});
  for(const message of assistants(state))for(const reason of message.inspectionErrors||[])boundaries.push({kind:'inspection-error',messageId:message.id,reason});
  const discoveredRecords=records.filter(record=>!['proposed','inferred'].includes(record.row.evidenceBasis));
  const investigated=discoveredRecords.filter(record=>record.investigated).length,proposed=records.filter(record=>record.row.evidenceBasis==='proposed').length,inferred=records.filter(record=>record.row.evidenceBasis==='inferred').length;
  return {discovered:discoveredRecords.length,investigated,untouched:discoveredRecords.length-investigated,uninvestigated:discoveredRecords.length-investigated,proposed,inferred,candidates:proposed+inferred,totalFeatures:records.length,sourceCount:(state.evidence||[]).length,total:null,complete:false,unknown:true,boundaries:[...new Map(boundaries.map(boundary=>[JSON.stringify(boundary),boundary])).values()],explanation:'All retained discovered capabilities and separately labeled candidates are available. The total application feature count is unknown; discovery is not proof of complete coverage.'};
}
