// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {randomUUID} from 'node:crypto';

// The host owns the payload and one-use token; a renderer reply cannot replace it.
export function createDialogConfirmation({getWindow,handle,channel,busyMessage}){
 let pending;
 const settle=(token,approved)=>{if(!pending||pending.token!==token)return false;const request=pending;pending=null;request.cleanup();request.resolve(approved===true);try{if(!request.window.isDestroyed()&&!request.window.webContents.isDestroyed())request.window.webContents.send(`${channel}-dismiss`,token);}catch{/* A closing renderer must not turn cancellation into a failed request. */}return true;};
 handle(`${channel}-answer`,(token,approved)=>settle(token,approved));
 return {cancel(){return pending?settle(pending.token,false):false;},confirm(payload={}){
  if(pending)throw new Error(busyMessage||'Finish the open confirmation first.');
  const window=getWindow();if(!window||window.isDestroyed())return Promise.resolve(false);
  return new Promise(resolve=>{
   const token=randomUUID(),cancel=()=>settle(token,false),wc=window.webContents;
   const cleanup=()=>{window.removeListener('close',cancel);wc.removeListener('destroyed',cancel);wc.removeListener('did-start-navigation',cancel);};
   pending={token,resolve,window,cleanup};window.once('close',cancel);wc.once('destroyed',cancel);wc.once('did-start-navigation',cancel);
   try{wc.send(channel,{...payload,token});}catch{cancel();}
  });
 }};
}
