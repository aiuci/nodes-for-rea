// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
export const MIN_STEPS=1,MAX_STEPS=20,DEFAULT_STEPS=5;

export function normalizeStepLimit(value){
  if(typeof value!=='number'&&typeof value!=='string'||typeof value==='string'&&!value.trim())return DEFAULT_STEPS;
  const number=Number(value);
  return Number.isFinite(number)?Math.max(MIN_STEPS,Math.min(MAX_STEPS,Math.trunc(number))):DEFAULT_STEPS;
}

export function createStepRun(maximum){return {total:normalizeStepLimit(maximum),current:null,dispatched:0,completed:0,phase:'preparing',cancelled:false,pauseRequested:false};}

export function stepProgress(run,prefix){
  const current=run.current?`${run.phase==='preparing'?'Preparing step':'Step'} ${run.current} of at most ${run.total}`:`Maximum ${run.total}`;
  return `${prefix?prefix+' · ':''}${current} · ${run.dispatched} dispatched · ${run.completed} completed`;
}

export function resultSnapshot(state){return new Set([...(state.messages||[]).filter(message=>message.role==='assistant').map(message=>message.id),...(state.attempts||[]).map(attempt=>attempt.resultId).filter(Boolean)]);}

export function newSavedResult(state,before){
  if(state.status!=='saved')return null;
  const latest=state.messages?.findLast(message=>message.role==='assistant');
  return latest?.id&&!before.has(latest.id)?latest:null;
}
