// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {explainFailure,failedAttempt,failureHistory} from '../lib/failure-recovery.mjs';
import {feedbackHeading,feedbackButton} from './user-feedback.js';
import {appendSavedAnswerDraft} from './saved-answer-draft.js';
const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text||'';return n;};
export function renderFailureRecovery(panel,view,item){
 if(view.busy)return false;
 const owner=item?.id||'core',history=(view.state.attempts||[]).filter(a=>item?.type==='attempt'?a.id===item.attempt.id:(a.nodeId||'core')===owner||owner==='core'&&!a.branchFeatureName);
 const attempt=history.findLast(failedAttempt);
 if(!attempt){if(history.some(a=>a.recovery)){const details=el('details');details.append(el('summary','Attempt history'));for(const a of history){details.append(el('p',`${a.startedAt||''} · ${a.resultId?'completed':a.recovery?.resolvedAt?'resolved':a.status}`));for(const e of failureHistory(a))details.append(el('p',`${e.at||''} · ${e.event}${e.error?' · '+e.error:''}`));}panel.append(details);}return false;}
 if(attempt.aiRecovery||attempt.targetRecovery)return false;
 const info=explainFailure(attempt),r=attempt.recovery,section=el('section');section.className='target-recovery';section.dataset.failureRecovery=attempt.id;
 const interrupted=info.category==='interrupted',routePlanning=attempt.kind==='planning'&&info.category==='validation';
 section.append(feedbackHeading(info.title,info.category),el('p',info.explanation),el('p','Your map, goal and saved evidence are retained.'));
 appendSavedAnswerDraft(section,attempt);
 const button=(label,fn,primary=false,icon='check')=>{const b=feedbackButton(label,fn,{primary,icon});b.dataset.work='true';b.disabled=!!view.busy||!!view.fileBusy;return b;};
 if(interrupted){section.append(el('p','Resume uses the saved request and context. This unfinished inspection step may repeat and may use your selected AI account. Required readiness checks run first.'));
  section.append(button(attempt.kind==='planning'?'Return to Agent Control':'Resume investigation',()=>attempt.kind==='planning'?document.getElementById('agent-open').click():view.actions.resumeFailure(attempt),true,'resume'));
 }else section.append(el('p',info.nextAction));
 if(routePlanning)section.append(button('Plan the route',()=>document.getElementById('agent-open').click(),true,'resume'));
 else{
 section.append(button('Check readiness',()=>view.actions.diagnoseFailure(attempt.id),!interrupted,'check'));
 if(info.category!=='evidence-validation')section.append(button('Review settings',()=>view.actions.openSetup(),false,'settings'));
 if(r?.diagnostic){section.append(el('p',r.diagnostic.checks.summary));if(r.diagnostic.canRetry&&!r.diagnostic.used&&!interrupted)section.prepend(button(attempt.kind==='planning'?'Return to Agent Control to retry planning':'Retry saved request',()=>attempt.kind==='planning'?document.getElementById('agent-open').click():view.actions.retryFailure(attempt),true,'resume'));else if(!r.diagnostic.canRetry)section.append(el('p','No investigation restarted. Review the readiness result above; checking readiness does not change settings or install software.'));}
 }
 const details=el('details');details.append(el('summary','Details and attempt history'));
 for(const a of history){details.append(el('strong',`${a.startedAt||''} · ${a.resultId?'completed':a.recovery?.resolvedAt?'resolved':a.status}`),el('pre',a.reason||''));for(const event of failureHistory(a))details.append(el('p',`${event.at||''} · ${event.event}${event.outcome?' · '+event.outcome:''}`));}
 if(r?.diagnostic?.checks.detail)details.append(el('pre',r.diagnostic.checks.detail));section.append(details);panel.append(section);view.askOpen=false;return true;
}
