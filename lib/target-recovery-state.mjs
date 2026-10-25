// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Shared presentation of new and legacy target-identification failures.
export function recoveryFor(attempt){
  if(attempt?.targetRecovery)return attempt.targetRecovery;
  if(!/This folder contains several possible applications/.test(attempt?.reason||''))return null;
  const locator=(attempt.question||'').match(/(?:[A-Za-z]:[\\/][^"\r\n]+|\/[^"\r\n]+)/)?.[0]?.trim();
  return locator?{locator,productName:locator.split(/[\\/]/).filter(Boolean).at(-1),status:'needed',candidates:[]}:null;
}
export function pendingTargetAttempt(state){return [...(state.attempts||[])].reverse().find(a=>recoveryFor(a)&&!a.resultId&&!recoveryFor(a).continuedAt);}
// Derive this for legacy saved attempts too; retain their original diagnostics.
export function targetSelection(attempt){const r=recoveryFor(attempt);return !!r&&!r.selected&&['needed','choice','ready'].includes(r.status);}
export function blockedTargetAttempt(state){const a=pendingTargetAttempt(state);return a&&recoveryFor(a)?.selected&&(state.preflight?.status==='blocked'||recoveryFor(a).status==='blocked')?a:null;}
export function waitingTargetAttempt(state){const a=pendingTargetAttempt(state);return targetSelection(a)?a:null;}
export function targetSelectionMessage(attempt){const r=recoveryFor(attempt),n=r?.candidates?.length||0;return n?`Found ${n} possible application target${n===1?'':'s'}. Waiting for your selection`:'Choose application · Waiting for your selection';}
export function applicationFilename(candidate){return candidate?.path?.split(/[\\/]/).at(-1)||candidate?.name||'Application';}
export function recoveryTitle(state){if(!/^(?:[A-Za-z]:[\\/]|["']?[A-Za-z]:[\\/])/.test(state.title||''))return state.title;const attempt=[...(state.attempts||[])].reverse().find(a=>recoveryFor(a)),r=recoveryFor(attempt);return r?.productName||state.title;}
