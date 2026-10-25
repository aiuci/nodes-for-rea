// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {identifyTargets} from './sources.mjs';

export function purposeContext(state){
  const initialRequest=state.purpose?.initialRequest||state.messages?.find(m=>m.role==='user')?.text||'';
  return {initialRequest,current:state.purpose?.current||ordinaryPurpose(initialRequest),history:state.purpose?.history||[]};
}
function ordinaryPurpose(message){
  let text=message;for(const target of identifyTargets(message))text=text.replace(target,'');
  return text.replace(/["“”]/g,'').trim();
}
export function establishPurpose(state,message,{explicit=false}={}){
  const previous=purposeContext(state),initialRequest=previous.initialRequest||message;
  const refinement=/^\s*(?:(?:my|our|the) (?:goal|purpose|objective)(?:\s+(?:is|now is))?\s*[:—-]?|purpose\s*:|(?:I|we) want to\b|(?:I am|I'm|I’m|we are|we're) (?:studying|investigating|researching)\b)/i.test(message);
  const candidate=ordinaryPurpose(message);
  if(candidate&&(explicit||refinement||!previous.current)){
    const history=[...previous.history];if(candidate!==previous.current)history.push({text:candidate,at:new Date().toISOString(),source:'user'});
    state.purpose={initialRequest,current:candidate,history};
  }else state.purpose={...previous,initialRequest};
  return state.purpose;
}
