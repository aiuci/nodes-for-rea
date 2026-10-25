// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {AiCheckpoint} from './ai-checkpoint.mjs';

// Read-only preflight. Never invokes a provider, consumes a checkpoint, changes
// the active investigation or writes the stored attempt.
export async function aiResumeStatus(store,id,attemptId){
  const state=await store.read(id),attempt=state.attempts?.find(a=>a.id===attemptId);
  const result={state,attemptId,ready:false,checkedAt:new Date().toISOString()};
  if(!attempt)return {...result,status:'missing',reason:'This saved attempt is no longer available. Latest saved results loaded.'};
  if(attempt.resultId||attempt.aiRecovery?.status==='resolved')return {...result,status:'completed',reason:'This request already completed. Latest saved results loaded.'};
  if(!['paused','waiting'].includes(attempt.aiRecovery?.status)||!attempt.aiRecovery.canResume)return {...result,status:'unavailable',reason:attempt.aiRecovery?.nextAction||'This attempt cannot resume. Review its saved evidence before starting a new request.'};
  try{await AiCheckpoint.load(store.directory(id),attempt,state);return {...result,status:'ready',ready:true,reason:'Saved request is ready to resume. Resuming uses your AI service.'};}
  catch(error){return {...result,status:Date.parse(attempt.aiRecovery.retryAt||'')>Date.now()?'waiting':'unavailable',reason:error.message};}
}
