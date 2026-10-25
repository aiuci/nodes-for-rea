// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Presentation of existing execution records; this module never starts work.
export function activeSavedStep(view,id){
 const owner=view.runStatusOwner;
 return owner?.investigationId===view.state?.id&&owner.nodeId===id&&!!(view.busy||view.starting||view.preparingNode);
}
export function applicationFeatureStep(state,item,spec){
 if(!/feature|workflow|user.facing/i.test(spec?.request||''))return false;
 if(!(state.targets||[]).some(t=>t.inspectionTarget?.targetType==='javascript'))return false;
 return (item?.message?.claims||[]).some(c=>c.state==='observed'&&/"framework"\s*:\s*"electron"/i.test(c.quote||'')&&(state.evidence||[]).some(e=>e.id===c.evidenceId&&e.kind==='artifact-manifest'));
}
export function savedStepState(view,id,spec){
 if(activeSavedStep(view,id)){
  const run=view.stepRun;
  if(run?.cancelled)return {state:'stopping',status:'Stopping… Saved evidence will be kept.',active:true};
  const running=run?run.phase==='current'&&run.dispatched>run.completed:!!view.busy&&!view.preparingNode;
  return {state:running?'running':'pending',status:running?'Investigating… The new result is not ready yet.':'Preparing this step… No new result yet.',active:true};
 }
 const recent=view.lastStepOutcome,recorded=(view.state.attempts||[]).findLast(a=>a.nodeId===id&&a.question===spec?.request);
 const attempt=recent?.investigationId===view.state.id&&recent.nodeId===id&&recent.request===spec?.request?{status:recent.status,resultId:recent.status==='saved'?'saved':undefined}:recorded;
 /* The execution record and result remain host-owned; the transient outcome only covers failures before a record exists. */
 if(attempt?.status==='blocked')return {state:'blocked',status:'This step is blocked. Review the inspection status and setup requirements.'};
 if(['failed','error'].includes(attempt?.status))return {state:'failed',status:'This step did not finish. Existing saved evidence is retained.'};
 if(['stopped','cancelled','canceled'].includes(attempt?.status))return {state:'stopped',status:'Stopped. Saved evidence is retained.'};
 if(attempt?.resultId)return {state:'saved',status:'A result was saved for this step. Further questions may remain.'};
 return {state:'idle',status:'This step has not started. Review it before running.'};
}
