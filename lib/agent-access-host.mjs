// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {randomUUID} from 'node:crypto';
import {agentCoverage} from './agent-coverage.mjs';

export function installAgentAccessHost({handle,store,guide,manager,idle,isBusy=()=>false,runIdle=work=>work(),onUpdate=async()=>{}}){
  const pending=new Map(),generations=new Map();
  const emit=async(id,control)=>{await guide.onControl(id,control);return control;};
  const target=async(id,value)=>{const state=await store.read(id),url=manager.urlPolicy(value);if(!(state.targets||[]).some(t=>t.kind==='website'&&new URL(t.locator).origin===url.origin))throw Error('Choose a resource on this investigation’s approved website origin. Add a different source explicitly before opening it here.');return url.href;};
  const record=async(id,observation)=>{observation={...observation};for(const key of ['url','observedUrl'])if(observation[key]){const url=new URL(observation[key]);url.search='';url.hash='';observation[key]=url.href;}const control=await guide.control.mutate(id,c=>{c.accessRequests||=[];let prior=c.accessRequests.find(r=>r.origin===observation.origin);if(!prior){prior={id:randomUUID(),requestedAt:new Date().toISOString()};c.accessRequests.push(prior);}Object.assign(prior,observation);});return emit(id,control);};
  const hydrate=async id=>{const state=await store.read(id),current=await guide.control.read(id);for(const request of current.accessRequests||[])if(request.url&&state.targets?.some(t=>t.kind==='website'&&new URL(t.locator).origin===request.origin)){if(request.status==='public')manager.clearIntent?.(id,request.url);else manager.selectIntent?.(id,request.url);}return current;};
  manager.prepare=hydrate;
  const isOpen=(id,url)=>manager.isOpen?manager.isOpen(id,url):manager.has(id,url);
  const refresh=async(id,session)=>{const state=await store.read(id);let current=await hydrate(id);if((current.accessRequests||[]).some(r=>r.status==='read'&&!isOpen(id,r.url)))current=await guide.control.mutate(id,c=>{for(const r of c.accessRequests||[])if(r.status==='read'&&!isOpen(id,r.url)){r.status='unverified';r.reason='Historical page evidence is retained. Open the Nodes browser and read this resource to verify current access.';}});const coverage=agentCoverage(state,session===undefined?await guide.read(id):session,current.accessRequests||[]);if(JSON.stringify(current.coverage)===JSON.stringify(coverage))return current;return emit(id,await guide.control.mutate(id,c=>{c.coverage=coverage;}));};
  manager.onObservation=async(id,observation)=>{await record(id,observation);await refresh(id);};
  const capture=async(id,url,{signal,session,onUpdate:boundaryUpdate=onUpdate}={})=>{
    signal?.throwIfAborted();let source;try{source=await manager.read(id,url,{signal});}catch(error){if(error.evidence&&!signal?.aborted){const state=await store.read(id);signal?.throwIfAborted();await store.addEvidence(state,error.evidence);await refresh(id,session);await boundaryUpdate(session,state);}throw error;}signal?.throwIfAborted();
    const state=await store.read(id);signal?.throwIfAborted();await store.addEvidence(state,source);signal?.throwIfAborted();
    await emit(id,await guide.control.append(id,{id:`access:${source.id}`,role:'system',kind:'access',text:`Content read in the selected Nodes session: ${source.locator}. It is retained as evidence for this investigation; subsequent reasoning can use it. This page read does not prove whole-product access.`,evidenceId:source.id}));
    await refresh(id,session);await boundaryUpdate(session,state);return {control:await guide.control.read(id),investigation:await store.read(id)};
  };
  const boundary=async(id,options)=>{const requests=pending.get(id)||[];pending.delete(id);for(const request of requests){options.signal?.throwIfAborted();try{await capture(id,request.url,options);}catch(error){if(options.signal?.aborted)throw error;await emit(id,await guide.control.append(id,{id:`access-request:${request.id}`,role:'system',kind:'access',text:error.message}));}}await refresh(id,options.session);};
  handle('agent-access-open',async(id,value)=>{const url=await target(id,value);return {observation:await manager.open(id,url),control:await refresh(id)};});
  handle('agent-access-read',async(id,value)=>{
    const generation=generations.get(id)||0,url=await target(id,value);if(generation!==(generations.get(id)||0))throw Error('Stopped before this selected-page read.');
    if(isBusy()){
      if(!guide.activeRun||guide.activeInvestigation!==id)throw Error('Finish the current manual inspection before reading this selected page. Your URL is kept.');
      const requests=pending.get(id)||[];if(!requests.some(r=>r.url===url))requests.push({id:randomUUID(),url});pending.set(id,requests);
      const control=await record(id,{status:'queued',url,origin:new URL(url).origin,reason:'Selected-page read queued after the current inspection. No page content has been added yet.',checkedAt:new Date().toISOString()});return {queued:true,control};
    }
    idle();return runIdle(signal=>capture(id,url,{signal}));
  });
  handle('agent-access-public',async(id,value)=>{const url=await target(id,value);manager.close(id,url);pending.delete(id);const control=await record(id,{status:'public',url,origin:new URL(url).origin,reason:'You chose to continue within public scope. Selected-session access is no longer used.',checkedAt:new Date().toISOString()});return refresh(id).then(control=>({control}));});
  return {refresh,hydrate,boundary,cancel:async id=>{generations.set(id,(generations.get(id)||0)+1);pending.delete(id);const control=await guide.control.mutate(id,c=>{for(const r of c.accessRequests||[])if(r.status==='queued'){r.status='unverified';r.reason='Stopped before this selected-page read. Read the intended page explicitly to continue.';}});await emit(id,control);},capture};
}
