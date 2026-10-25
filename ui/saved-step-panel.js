// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {activeSavedStep,applicationFeatureStep,savedStepState} from '../lib/saved-step-state.mjs';
import {guard} from './flywheel-actions.js';
import {normalizeStepLimit} from '../lib/auto-deepen.mjs';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function renderSavedStep(view,panel,{id,spec,fromReport=false}){
 const item=view.map.nodes.get(id),section=el('section',undefined,'node-guidance saved-step-panel'),model=savedStepState(view,id,spec),feature=applicationFeatureStep(view.state,item,spec);
 section.dataset.stepState=model.state;
 section.append(el('small',model.active?'Current activity':'Next step','guidance-label'));
 section.append(el('h2',feature?'Understand what this app can do':spec.request));
 if(feature)section.append(el('p','Application code was found. Explore it to look for features and workflows; these are not established yet.'));
 else section.append(el('p',spec.reason));
 const status=el('p',model.status,'saved-step-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');section.append(status);
 if(model.active){
  if(view.actions.stop){const stop=el('button',model.state==='stopping'?'Stopping…':'Stop','inspector-action');stop.type='button';stop.dataset.savedStepStop='true';stop.disabled=model.state==='stopping';stop.onclick=()=>{if(!activeSavedStep(view,id)||stop.disabled)return;stop.disabled=true;stop.textContent='Stopping…';view.actions.stop();};section.append(stop);}
 }else{
  const run=el('button',feature?'Explore features':'Run this step','inspector-action primary');run.type='button';run.dataset.savedStepRun=id;run.dataset.work='true';const reason=guard(view);run.disabled=!!reason;run.dataset.unavailable=String(!!reason);run.title=reason||'Review this saved step before starting. Your draft is kept.';run.setAttribute('aria-description',run.title);
  const investigationId=view.state.id,selection=view.ws.inspected||'core';
  run.onclick=()=>{
   if(run.disabled)return;
   if(view.state.id!==investigationId||(view.ws.inspected||'core')!==selection){view.actions.notify('The selected node changed. Open this step again.');return;}
   const blocked=guard(view);if(blocked){view.actions.notify(blocked);return;}
   run.disabled=true;
   // Exactly the same preview, stale-source checks, approvals and one-step action as the node menu.
   const dialog=view.previewAction(id,'deeper',run);
   if(dialog)dialog.addEventListener('close',()=>{if(run.isConnected)run.disabled=!!guard(view);},{once:true});
   else run.disabled=!!guard(view);
  };
  section.append(run);
  if(reason)section.append(el('p',reason,'material-limit'));
 }
 const details=el('details');details.append(el('summary','Step details'),el('p',spec.request),el('p',spec.reason),el('small',`Target: ${spec.target||'Whole application'}`),el('small','Runs one investigation step after review. Existing readiness and approval checks still apply.'));
 if(view.ws.autoDeepen)details.append(el('small',`Your separate automatic-continuation setting allows up to ${normalizeStepLimit(view.ws.depthLimit)} steps; this action runs once.`));
 section.append(details);panel.append(section);return section;
}
