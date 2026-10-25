// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// HTML maxlength and JavaScript string length both count UTF-16 code units.
// Keep this input bound separate from route, investigation and provider budgets.
export const AGENT_GOAL_LIMIT=50000;
export function checkedAgentGoal(value,{allowEmpty=false}={}){
  if(typeof value!=='string')throw new Error('Enter a text goal.');
  if(value.length>AGENT_GOAL_LIMIT)throw new Error(`Your goal exceeds the ${AGENT_GOAL_LIMIT.toLocaleString('en-US')}-character limit. Shorten it before saving or planning; the previous saved goal is kept.`);
  if(!allowEmpty&&!value.trim())throw new Error('Enter a goal before planning.');
  return value;
}
