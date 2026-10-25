// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {feedbackHeading,feedbackButton,renderUserError} from './user-feedback.js';
import {appendSavedAnswerDraft} from './saved-answer-draft.js';
const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text||'';return n;};
export function renderAiRecovery(panel,view,item){
  const attempt=item?.type==='attempt'?item.attempt:item?.type==='root'?view.state.attempts?.findLast(a=>!a.resultId&&['paused','waiting'].includes(a.aiRecovery?.status)):null;
  const recovery=attempt?.aiRecovery;if(attempt?.resultId||!recovery||!['paused','waiting'].includes(recovery.status))return false;
  const checked=view.aiResumeChecks?.get(`${view.state.id}:${attempt.id}`),availability=checked?.seal===recovery.seal?checked:null;
  const section=el('section');section.className='target-recovery';section.dataset.aiRecovery=attempt.id;
  const titles={quota:'AI usage quota reached','rate-limit':'AI temporarily rate-limited',network:'AI connection interrupted','network-blocked':'Agent network access blocked',timeout:'AI response timed out'};
  section.append(feedbackHeading(titles[recovery.category]||'AI request paused',recovery.category==='network'?'connection':recovery.category),el('p','Investigation paused. Saved evidence and completed reasoning are retained.'),el('p',recovery.category==='network-blocked'?'Check the selected agent connection. If another installed version is available, choose it and resume this saved request. Your REA evidence is retained.':recovery.nextAction));
  appendSavedAnswerDraft(section,attempt);
  if(recovery.retryAt)section.append(el('p',`Retry after ${new Date(recovery.retryAt).toLocaleString()}.`));
  if(availability&&!availability.ready)section.append(el('p',availability.reason));
  const button=(text,action)=>{const b=feedbackButton(text,action,{primary:text==='Resume investigation',icon:text==='Resume investigation'?'resume':'check'});b.dataset.work='true';b.disabled=!!view.busy||!!view.fileBusy;return b;};
  if(recovery.canResume){const resume=button('Resume investigation',()=>view.actions.retryAI(attempt));resume.dataset.unavailable=String(availability?.ready===false||Date.parse(recovery.retryAt||'')>Date.now());resume.disabled||=resume.dataset.unavailable==='true';section.append(resume);}
  if(view.actions.refreshAI)section.append(button('Refresh saved status',()=>view.actions.refreshAI(attempt)));
  const composerKey=`${view.state.id}:${attempt.id}`;
  if(availability?.status==='unavailable'||!recovery.canResume)section.append(button('Ask a new question',()=>{view.aiRecoveryComposerKey=composerKey;view.ask();}));
  section.append(button('Check AI connection',()=>document.dispatchEvent(new CustomEvent('setup-agent-request'))));
  section.append(button('Copy diagnostics',async()=>{try{await window.investigation.setupReport();section.append(el('p','Diagnostics copied. Account details, paths and raw output are excluded.'));}catch{section.append(el('p','Could not copy diagnostics. Open agent settings and retry.'));}}));
  const details=el('details');details.append(el('summary','Details and attempt history'),el('pre',attempt.reason||''));for(const event of attempt.recovery?.history||[])details.append(el('p',`${event.at} · ${event.event}${event.error?' · '+event.error:''}`));section.append(details);
  panel.append(section);view.askOpen=view.aiRecoveryComposerKey===composerKey;return true;
}
