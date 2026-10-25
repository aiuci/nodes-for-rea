// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {resultOutcome} from '../lib/outcomes.mjs';
export function agentDirectionState(step,session,state){
  if(step.status==='done'){
    if(step.action==='reveal')return {phase:'completed',label:'Completed',completed:true};
    const result=state.messages?.find(message=>message.id===step.resultId);
    if(!result)return {phase:'unavailable',label:'Saved result unavailable',completed:false};
    const outcome=resultOutcome(state,result);
    if(outcome.status==='blocked')return {phase:'blocked',label:'Blocked',completed:false};
    if(!outcome.findings)return {phase:'no-finding',label:'No supported finding',completed:false};
    return {phase:'completed',label:'Completed',completed:true};
  }
  if(step.status==='pending'){
    if(session.status==='running'&&session.currentNode===step.nodeId)return {phase:'active',label:'Active',completed:false};
    if(session.status==='paused'&&step.beforeResultIds)return {phase:'paused',label:'Paused',completed:false};
    return {phase:session.status==='proposed'?'suggested':'ready',label:session.status==='proposed'?'Suggested':'Ready',completed:false};
  }
  const label=({blocked:'Blocked',skipped:'Skipped',failed:'Failed',stopped:'Stopped'})[step.status]||'Not completed';
  return {phase:step.status||'pending',label,completed:false};
}
