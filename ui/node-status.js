// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {branchStats} from '../lib/workspace-map.mjs';
import {featureOutcome} from '../lib/outcomes.mjs';
import {targetSelection,recoveryFor,waitingTargetAttempt,blockedTargetAttempt} from '../lib/target-recovery-state.mjs';
import {failedAttempt} from '../lib/failure-recovery.mjs';
import {findingCategory} from '../lib/finding-category.mjs';
import {responseDisplayLabel} from './evidence-understanding.js';

// Preserve the original caption wording in every disclosure and detail surface.
export function nodeStatus(view,item){
  if(item.type==='finding')return (item.category||findingCategory(view.state,item.message,item.finding)).label;
  if(item.type==='result')return responseDisplayLabel(view.state,item.message,{understanding:item.understanding,blocked:item.blocked});
  if(!view.busy&&(item.type==='root'&&blockedTargetAttempt(view.state)||item.type==='attempt'&&recoveryFor(item.attempt)?.selected&&!recoveryFor(item.attempt).continuedAt&&view.state.preflight?.status==='blocked'))return 'Inspection blocked';
  if(view.busy&&(item.type==='root'&&waitingTargetAttempt(view.state)?.targetRecovery?.status==='ready'||item.type==='attempt'&&recoveryFor(item.attempt)?.status==='ready'&&!recoveryFor(item.attempt).continuedAt))return 'Inspecting…';
  if(item.type==='root'&&waitingTargetAttempt(view.state)||item.type==='attempt'&&targetSelection(item.attempt)&&!recoveryFor(item.attempt).continuedAt)return 'Choose application';
  if(item.type==='attempt'&&targetSelection(item.attempt)&&recoveryFor(item.attempt).continuedAt)return 'Application selected';
  if(item.type==='root'&&view.state.status==='inspecting'||item.type==='attempt'&&item.attempt.status==='running'&&view.state.status==='inspecting')return 'Inspecting…';
  const stats=branchStats(view.map,item.id);if(['root','feature'].includes(item.type)&&view.state.attempts?.some(a=>a.recovery&&failedAttempt(a)&&(a.nodeId||'core')===item.id))return 'Needs attention · failed attempt retained in history';
  if(item.type==='feature'&&!['proposed','inferred'].includes(item.row?.evidenceBasis)){const outcome=featureOutcome(view.state,item.row.name);if(outcome.latest&&!outcome.attempt){const result=view.map.nodes.get(`turn:${outcome.latest.id}`);return responseDisplayLabel(view.state,outcome.latest,{understanding:result?.understanding,blocked:result?.blocked});}}
  return item.type==='root'?`Start here · ${stats.discovered} discovered`:item.type==='feature'?(item.row?.evidenceBasis==='proposed'?'Proposed · not discovered':item.row?.evidenceBasis==='inferred'?'Inferred · needs verification':featureOutcome(view.state,item.row.name).label):item.type==='constraint'?'Evidence boundary · not runnable':item.type==='direction'?(view.isCurrentDirection(item)?'Recommended next':'Earlier suggestion'):item.type==='attempt'?`${item.attempt.status} attempt`:item.type==='inventory'?'All discovered alternatives remain available':item.type==='finding'?(item.supported?(item.finding?.change==='gap'?'Supported limitation':'Supported finding'):item.finding?.change==='gap'?'Open question':'Unverified finding'):item.type==='discovery'?(view.ws.growth.some(r=>r.nodeId===item.id)?'Feature map updated':`${stats.discovered} discovered`):'Source';
}

export function nodeStatusMarker(status){
  if(status==='Observed')return {symbol:'✓',tone:'neutral'};
  if(status==='Inferred')return {symbol:'≈',tone:'uncertain'};
  if(status==='Unknown')return {symbol:'?',tone:'uncertain'};
  if(/Choose application/.test(status))return {symbol:'◇',tone:'neutral'};
  if(/Inspecting/.test(status))return {symbol:'•',tone:'active'};
  if(/running attempt/i.test(status))return {symbol:'•',tone:'active'};
  if(/blocked|failed|stopped|evidence boundary|supported limitation/i.test(status))return {symbol:'!',tone:'attention'};
  if(/proposed|inferred|unverified|open question/i.test(status))return {symbol:'?',tone:'uncertain'};
  return null;
}
