// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {activeSavedStep} from '../lib/saved-step-state.mjs';
import {exactReading,READING_DESTINATIONS} from '../lib/node-actions.mjs';
import {appendDelivery} from './delivery.js';
import {productsFor,originsFor} from '../lib/collection.mjs';
import {recordedParts} from '../lib/recorded-parts.mjs';
import {appendFindingCategory,appendCategoryKey} from './finding-category.js';
import {appendResponseUnderstanding,appendFindingContext} from './evidence-understanding.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,run)=>{const n=el('button',text,'text-button');n.type='button';n.onclick=run;return n;};
export function renderReading(view,panel,record,result){
  const destination=view.ws.reader?.destination||view.readingDestination||'summary',records=exactReading(view.state,record,result,destination),tabs=el('div',undefined,'reading-destinations');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Reading destination');
  const labels=['Summary','Latest / Changes','Evidence / Receipts','Attempt history'];
  READING_DESTINATIONS.forEach((key,i)=>{const n=button(labels[i],()=>{const scroll=document.getElementById('node-workbench');view.readingScroll??={};view.readingScroll[destination]=scroll.scrollTop;if(view.ws.reader)view.ws.reader.destination=key;else view.readingDestination=key;view.draw();scroll.scrollTop=view.readingScroll[key]||0;view.persist();document.querySelector(`[data-reading-destination="${key}"]`)?.focus({preventScroll:true});});n.dataset.readingDestination=key;n.setAttribute('aria-pressed',String(key===destination));tabs.append(n);});panel.append(tabs);
  if(destination==='evidence'){view.renderEvidence(panel,record,records.anchor);return;}
  if(destination==='history'){
    panel.append(el('h2','Attempt history'),el('p','Original attempts and saved results remain separate records. Reading does not retry work.'));
    for(const entry of records.history){const r=entry.record,section=el('section',undefined,'reading-history-record');section.append(el('small',`${entry.kind==='attempt'?'Attempt':'Saved result'} · ${entry.at||'Time not recorded'} · ${entry.id}`));
      if(entry.kind==='attempt'){section.append(el('h3',r.question||r.productName||'Saved attempt'),el('p',`${r.status||'Unknown status'}${r.reason?`: ${r.reason}`:''}`));if(r.aiRecovery)section.append(el('p',`AI recovery: ${r.aiRecovery.status||'Recorded'} · ${r.aiRecovery.message||''}`));if(r.resultId)section.append(el('small',`Recorded result: ${r.resultId}`));section.append(button('Read attempt and recovery',()=>view.reveal(`attempt:${r.id}`)));}
      else section.append(el('p',r.overview||r.understanding||r.text||'Saved answer'),button('Read exact saved response',()=>view.openReader(`turn:${r.id}`)));
      panel.append(section);
    }
    if(!records.history.length)panel.append(el('p','No branch-linked attempt or result is recorded. Legacy records without a branch link are not assigned by guess.','material-limit'));
    const unknown=(view.state.attempts||[]).filter(a=>!a.branchFeatureName);if(record&&unknown.length){const detail=el('details');detail.append(el('summary',`${unknown.length} investigation-wide or legacy attempt(s); feature linkage unknown`));for(const attempt of unknown)detail.append(button(attempt.question||attempt.id,()=>view.reveal(`attempt:${attempt.id}`)));panel.append(detail);}return;
  }
  const shown=records.shown;
  if(destination==='latest')panel.append(el('small','Latest saved result; this does not replace the Summary anchor.','basis-label'));
  if(!shown){panel.append(el('h2',record?.title||'No saved finding'));if(record){appendDiscovery(view,panel,record);view.guidance(panel,record.id);view.comparison(panel);}else panel.append(el('p','No saved finding is available.'));return;}
  if(view.renderConnectionBoundary(panel,shown))return;
  const direction=view.map.nodes.get(view.ws.inspected)?.type==='direction';
  if(destination==='summary'&&direction)view.guidance(panel,view.ws.inspected);
  if(activeSavedStep(view,view.ws.inspected||record?.id))panel.append(el('small','Previous saved result — the current step has not returned a new result.','basis-label'));
  panel.append(el('h2',shown.overview||shown.understanding||shown.text||'Saved finding'),el('small',`Saved result ${shown.id} · ${shown.createdAt||'Time not recorded'}`));
  appendResponseUnderstanding(view,panel,shown);
  view.renderInspectionBoundary(panel,shown);
  if(shown.auditScope?.noNewInspection||shown.newEvidenceCount===0)panel.append(el('p','This saved result used retained evidence without fresh source inspection.','material-limit'));
  if(shown.caveat)panel.append(el('p',shown.caveat,'material-limit'));
  comparisonOrigins(panel,shown);
  for(const finding of shown.findings||[]){
    const section=el('section',undefined,'finding-reading-row');section.append(el('h3',finding.question||'Saved finding'));
    appendFindingCategory(section,view.state,shown,finding);section.append(el('p',finding.finding||''));
    appendFindingContext(view,section,shown,finding);
    if(destination==='latest')section.append(el('small',finding.change?`Recorded change: ${finding.change}`:'No change metadata was recorded.'));
    const claims=[...new Set(finding.claimIndexes||[])].map(index=>shown.claims?.[index]).filter(Boolean);
    if(claims.length){const support=el('details');support.append(el('summary','Supporting evidence and reasoning'));for(const claim of claims)view.support(support,claim);section.append(support);}
    panel.append(section);
  }
  if(shown.findings?.length)appendCategoryKey(panel);
  if(destination==='latest'&&!shown.findings?.length)panel.append(el('p','No change metadata was recorded.'));
  if(destination==='latest'){const earlier=records.history.filter(x=>x.kind==='result'&&x.id!==shown.id);if(earlier.length){const details=el('details');details.append(el('summary','Earlier exact results'));for(const x of earlier)details.append(button(`${x.at||'Undated'} · ${x.id}`,()=>view.openReader(`turn:${x.id}`)));panel.append(details);}}
  if(destination==='summary'){
    if(!direction)view.guidance(panel,view.ws.inspected||record?.id);appendDelivery(panel,view.state,shown,{exportDelivery:view.actions.exportDelivery,notify:view.actions.notify});
    if(record){const original=el('details');original.append(el('summary','Original discovery and support'));appendDiscovery(view,original,record);panel.append(original);}
    view.comparison(panel);
  }
  const detail=el('details');detail.append(el('summary','Original saved answer and scope'));for(const text of new Set([shown.understanding,shown.text,shown.continuation?.reason,shown.continuation?.uncertainty,...(shown.openQuestions||[])].filter(Boolean)))detail.append(el('p',text));detail.append(el('small',`Feature: ${shown.branchFeatureName||shown.focus?.featureName||'Whole investigation'}`));panel.append(detail);
}
function appendDiscovery(view,panel,record){
  const basis=record.row.evidenceBasis;panel.append(el('span',basis==='inferred'?'Inference':basis==='proposed'?'Proposal':basis==='observed'?'Recorded evidence':'Source description','basis-label'));
  const claims=(record.row.claimIndexes||[]).map(i=>record.message.claims?.[i]).filter(Boolean);
  panel.append(el('p',claims[0]?.text||record.row.displayQuestion||record.row.investigate||'No supporting description was retained.'));for(const claim of claims)view.support(panel,claim);
  const limits=el('details');limits.append(el('summary','Details and limits'),el('p',record.message.caveat||'Implementation and runtime behavior are established only by their recorded evidence.','material-limit'));panel.append(limits);
  const parts=recordedParts(view.state,record);if(parts.length){const details=el('details');details.append(el('summary','Recorded parts and support'));for(const part of parts)details.append(el('h3',part.name),el('p',part.quote),el('small','Source-described detail; runtime behavior remains unverified.'));panel.append(details);}
  for(const origin of originsFor(view.state,record.message,record.row)){const product=productsFor(view.state).find(p=>p.id===origin.productId);panel.append(el('h3',product?.name||origin.productId),el('p',origin.description));}
}
export function comparisonOrigins(panel,message){
  const sources=message?.auditScope?.sources;if(!Array.isArray(sources)||!sources.length)return;
  const section=el('section',undefined,'comparison-origins');section.append(el('h3','Compared saved results'));
  sources.forEach((source,i)=>{section.append(el('h4',`${i?'B':'A'} · ${source.investigationTitle||source.title||source.investigationId}`),el('p',`${source.featureName||'Whole investigation'} · ${source.messageId||source.resultId||'Saved result'}`),el('small',`${source.resultCreatedAt||source.createdAt||'Time not recorded'} · Original investigation ${source.investigationId||'Unknown'}`));for(const limit of source.limitations||[])section.append(el('p',limit,'material-limit'));});panel.append(section);
}
