// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {buildDelivery,deliveryMarkdown,takeawaysMarkdown,verificationFor} from '../lib/delivery.mjs';
import {runDeclaredChecks,createFinishedAsset} from './rea.js';

const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};

// Render plain Markdown structure without trusting model or evidence HTML.
function prose(text){
  const container=node('div',undefined,'delivery-prose');
  for(const paragraph of text.split(/\n\s*\n/)){
    const heading=paragraph.match(/^(#{1,6}) (.+)$/);
    if(heading){container.append(node('h4',heading[2]));continue;}
    if(paragraph.split('\n').every(line=>line.startsWith('- '))){const list=node('ul');for(const line of paragraph.split('\n'))list.append(node('li',line.slice(2)));container.append(list);}
    else container.append(node('p',paragraph));
  }
  return container;
}

function download(text,title){
  const blob=new Blob([text],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),link=node('a');
  link.href=url;link.download=`${title.replace(/[^a-zA-Z0-9 -]/g,'').trim().slice(0,70)||'investigation'}-result.md`;
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function copyText(text){
  try{await navigator.clipboard.writeText(text);return;}catch{}
  // Electron denies general clipboard permissions; copy only this user-selected output.
  const previous=document.activeElement,area=node('textarea',text);area.readOnly=true;area.style.position='fixed';area.style.left='-9999px';document.body.append(area);area.select();
  const copied=document.execCommand('copy');area.remove();previous?.focus({preventScroll:true});if(!copied)throw new Error('Clipboard copy was unavailable. Use Save Markdown.');
}

export function appendDelivery(panel,state,message,{exportDelivery,notify=()=>{}}={}){
  if(message?.role!=='assistant')return;
  const delivery=buildDelivery(state,message),asset=node('details',undefined,'source delivery-output');asset.dataset.messageId=message.id;
  asset.append(node('summary','Final asset · TLDR + COMPREHENSIVE'));
  asset.append(node('small',`${delivery.form}${delivery.branch?` · ${delivery.branch}`:''}`));
  asset.append(node('p',`Included scope: ${delivery.branch||'this saved result'} · ${delivery.evidenceIds.length} retained sources. Collapsing the map does not change this output scope.`,'declared-check-note'));
  const tabs=node('div',undefined,'delivery-actions'),content=node('div');let active='tldr';
  const buttons=['tldr','comprehensive'].map(depth=>{
    const button=node('button',depth==='tldr'?'TLDR':'COMPREHENSIVE');button.type='button';button.setAttribute('aria-pressed',String(depth===active));
    button.onclick=()=>{active=depth;for(const item of buttons)item.setAttribute('aria-pressed',String(item===button));content.replaceChildren(prose(delivery.asset[active]));};tabs.append(button);return button;
  });
  content.replaceChildren(prose(delivery.asset.tldr));asset.append(tabs,content);
  if(window.investigation.finalize){const create=node('button',delivery.generated?'Recreate finished asset':'Create finished asset','create-finished-asset');create.type='button';create.dataset.reaWork='true';create.disabled=document.getElementById('send').disabled;create.onclick=()=>createFinishedAsset(state,message);asset.append(create,node('p','Produce the requested deliverable from this saved branch. This uses your connected AI and performs no new target inspection.','declared-check-note'));}
  function actions(parent,kind,text){
    const bar=node('div',undefined,'delivery-actions');
    const copy=node('button',kind==='asset'?'Copy both depths':'Copy takeaways');copy.type='button';
    copy.onclick=()=>copyText(text).then(()=>notify(kind==='asset'?'Copied final asset at both depths.':'Copied investigation takeaways.')).catch(error=>notify(error,{context:'clipboard',action:{label:'Try copying again',run:()=>copy.click()}}));
    const save=node('button','Save Markdown');save.type='button';save.dataset.reaWork='true';save.disabled=document.getElementById('send').disabled;
    save.onclick=async()=>{try{if(exportDelivery){if(await exportDelivery(state.id,message.id,kind))notify('Saved Markdown.');}else download(text,delivery.title);}catch(error){notify(error);}};
    bar.append(copy,save);parent.append(bar);
  }
  actions(asset,'asset',delivery.asset.markdown);
  if(window.investigation.exportEvidence){const exportAll=node('button','Export investigation with evidence');exportAll.type='button';exportAll.dataset.reaWork='true';exportAll.disabled=document.getElementById('send').disabled;exportAll.onclick=async()=>{try{const folder=await window.investigation.exportEvidence(state.id);if(folder)notify('Exported the whole investigation with raw evidence and checks.');}catch(error){notify(error);}};asset.append(exportAll);}
  if(window.investigation.verify){const check=node('button','Run declared checks…','run-declared-checks');check.type='button';check.disabled=document.getElementById('send').disabled;check.onclick=()=>runDeclaredChecks(state,message);asset.append(check,node('p','Choose a JSON manifest with independently supplied expectations. This performs its declared target execution or browser actions.','declared-check-note'));}
  panel.append(asset);
  const takeaways=node('details',undefined,'source delivery-output delivery-takeaways');takeaways.dataset.messageId=message.id;takeaways.append(node('summary','What this investigation established'));
  const text=takeawaysMarkdown(delivery);takeaways.append(prose(text.replace(/^# Investigation takeaways\n\n/,'')));actions(takeaways,'takeaways',text);panel.append(takeaways);
  const runs=verificationFor(state,message);
  if(runs.length){const checks=node('details',undefined,'source delivery-output');checks.append(node('summary','Recorded behavioral checks'));for(const run of runs){checks.append(node('h4',`${run.scope||'Recorded check'} · ${run.status}`));for(const test of run.cases||[]){checks.append(node('p',`${test.id||'Case'}: ${test.status}${test.reason?` · ${test.reason}`:''}`));const values=node('pre',JSON.stringify({input:test.input,expected:test.expected,actual:test.actual},null,2));checks.append(values);}}panel.append(checks);}
}

export {deliveryMarkdown};
