// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Describe recorded, successful scope. Never infer a failed producer's cause
// from an assistant summary or turn a selected view's completeness into coverage.
export function selectedManagedScopes(state,message){
  const ids=new Set((message?.claims||[]).map(c=>c.evidenceId));
  return (state.evidence||[]).filter(e=>ids.has(e.id)&&e.operation==='inspect_managed_members'&&e.evidenceStatus!=='inspection-failed'&&Array.isArray(e.parameters?.type_names)&&e.parameters.type_names.length).map(e=>({evidenceId:e.id,path:e.parameters.path,types:e.parameters.type_names.filter(t=>typeof t==='string'),limitations:e.limitations||[]}));
}
