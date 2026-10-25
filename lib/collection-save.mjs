// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {randomUUID} from 'node:crypto';
import {keepFeature,collectionIntent} from './collection.mjs';

const signature=state=>JSON.stringify([state.keptFeatures||[],state.removedKeptFeatures||[],state.collectionCreatedAt,state.messages?.filter(message=>message.collectionCommand)||[]]);

// InvestigationStore.save commits the canonical record before its collection
// projection/navigation. A later failure must not be reported as a rollback.
// Return only a verified disk state, with a warning and the same idempotent retry.
export async function saveCollectionChange(store,id,messageId,featureName,keep){
  const state=await store.read(id),before=signature(state);
  keepFeature(state,messageId,featureName,keep);
  return saveCollectionState(store,state,before);
}

async function saveCollectionState(store,state,before){
  const desired=signature(state),id=state.id;
  try{await store.save(state);return state;}
  catch(error){
    let saved;try{saved=await store.read(id);}catch{}
    const actual=saved&&signature(saved),outcome=!saved?'uncertain':actual===desired?'saved':actual===before?'unchanged':'uncertain';
    return {...(saved||{id}),collectionSaveError:{message:error.message||'The local save failed.',outcome}};
  }
}

// Typed/spoken local commands share the same save contract as the Keep control.
// One command identity survives an explicit retry, including a canonical commit
// followed by projection failure. Existing research and unrelated drafts stay put.
export async function saveCollectionCommand(store,original,text,{requestId,choice}={}){
  const intent=collectionIntent(choice?{...original,selection:choice}:original,text);
  if(!intent||intent.clarification)throw new Error(intent?.clarification||'That is not a saved collection command.');
  if(choice&&(choice.messageId!==intent.messageId||choice.featureName!==intent.featureName||choice.keep!==intent.keep))throw new Error('That collection request belongs to a different choice.');
  if(requestId!==undefined&&(typeof requestId!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(requestId)))throw new Error('Invalid collection request identity.');
  const state=structuredClone(original),before=signature(state),same=message=>message?.role==='user'&&message.text===text&&message.collectionCommand?.messageId===intent.messageId&&message.collectionCommand.featureName===intent.featureName&&message.collectionCommand.keep===intent.keep;
  delete state.collectionSaveError;delete state.collectionCommandResult;
  let request=requestId?state.messages.find(message=>message.id===requestId):same(state.messages.at(-1))?state.messages.at(-1):null;
  if(request&&!same(request))throw new Error('That collection request belongs to a different choice.');
  if(!request){request={id:requestId||randomUUID(),role:'user',text,createdAt:new Date().toISOString(),collectionCommand:{messageId:intent.messageId,featureName:intent.featureName,keep:intent.keep}};state.messages.push(request);}
  keepFeature(state,intent.messageId,intent.featureName,intent.keep);state.status='saved';
  const saved=await saveCollectionState(store,state,before);
  return {...saved,collectionCommandResult:{requestId:request.id,text,featureName:intent.featureName,keep:intent.keep}};
}
