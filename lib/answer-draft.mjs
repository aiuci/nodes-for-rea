// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {createHash} from 'node:crypto';
const stamp=()=>new Date().toISOString();
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

// A draft is retained output, never a completed finding or verified evidence.
export function retainAnswerDraft(attempt,answer,{stage='synthesis'}={}){
 const prior=attempt.answerDraft,revision=(prior?.revision||0)+1;
 const versions=prior?[...(prior.versions||[]),{revision:prior.revision,hash:prior.hash,status:prior.status,answer:prior.answer,validation:prior.validation}].slice(-2):[];
 attempt.answerDraft={revision,hash:digest(answer),status:'unchecked',stage,savedAt:stamp(),answer:structuredClone(answer),versions};
 return {revision,hash:attempt.answerDraft.hash};
}
export function validateAnswerDraft(attempt,identity,errors){
 const draft=attempt.answerDraft;
 if(!draft||draft.revision!==identity.revision||draft.hash!==identity.hash){recordRunStage(attempt,'validation','ignored',{faultType:'STALE_VALIDATION',revision:identity.revision,currentRevision:draft?.revision||null,recovery:'Current saved draft retained.'});return false;}
 draft.status=errors.length?'invalid':'validated';draft.validation={at:stamp(),revision:draft.revision,hash:draft.hash,errors:structuredClone(errors)};return true;
}
export function recordRunStage(attempt,stage,outcome='started',detail){
 const event={at:stamp(),runId:attempt.id,stage,outcome,...(detail?{detail}: {})};
 attempt.stage={name:stage,at:event.at,outcome};(attempt.stageHistory||=[]).push(event);
 attempt.stageHistory=attempt.stageHistory.slice(-100);return event;
}
