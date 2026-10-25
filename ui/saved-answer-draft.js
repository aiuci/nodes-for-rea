// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
export function appendSavedAnswerDraft(panel,attempt){
 const draft=attempt?.answerDraft;if(!draft?.answer)return false;
 const details=el('details');details.className='saved-answer-draft';details.dataset.draftRevision=String(draft.revision);
 const label=draft.status==='validated'?'source checks passed':draft.status==='invalid'?'source checks need attention':'not checked yet';
 details.append(el('summary',`Read saved answer draft — ${label}`),el('p','This retained draft is not a completed finding. It is included when you save this investigation. Reading it does not restart research.'));
 if(attempt.stageHistory?.some(event=>event.detail?.faultType==='STALE_VALIDATION'))details.append(el('p','An older validation result was ignored. You are reading the current saved draft.'));
 for(const text of [draft.answer.overview,draft.answer.answer,...(draft.answer.findings||[]).map(row=>[row.question,row.finding].filter(Boolean).join('\n'))].filter(Boolean)){const p=el('p',text);p.style.whiteSpace='pre-wrap';details.append(p);}
 if(draft.validation?.errors?.length){details.append(el('strong','Checks still needed'));for(const error of draft.validation.errors)details.append(el('p',typeof error==='string'?error:error.reason||'A saved reference needs checking.'));}
 panel.append(details);return true;
}
