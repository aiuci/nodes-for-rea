// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {investigationDeletionPath} from './archive.mjs';
import {investigationIdentity} from './navigation.mjs';
import {historyPresentation} from './history-presentation.mjs';
export async function deleteHistoryBatch(store,input,{confirm,trash,beforeDelete=async()=>{},mark=()=>{}}){
  if(!Array.isArray(input)||!input.length||input.length>1000||input.some(id=>typeof id!=='string'))throw new Error('Select saved investigations to delete.');
  const ids=[...new Set(input)],items=[];
  for(const id of ids){const state=await store.read(id);await investigationDeletionPath(store,id);const identity=investigationIdentity(state),info=historyPresentation({...identity,id,updatedAt:state.updatedAt});items.push({id,title:info.title,shortId:info.shortId,updatedAt:state.updatedAt,savedAt:info.savedAt});}
  if(!await confirm(items))return {deletedIds:[],failed:[]};
  await beforeDelete();
  // Revalidate the entire selection before any directory leaves the store.
  const paths=new Map();for(const id of ids)paths.set(id,await investigationDeletionPath(store,id));
  const deletedIds=[],failed=[];
  for(const item of items){
    try{await beforeDelete();mark(item.id,true);await trash(paths.get(item.id));deletedIds.push(item.id);}
    catch(error){mark(item.id,false);failed.push({id:item.id,title:item.title,error:error.message});}
  }
  return {deletedIds,failed};
}
