// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Read-only projection of knowledge versus execution outcomes, including legacy records.
export function findingSupport(state,message,finding){
  return (finding.claimIndexes||[]).some(index=>{
    const claim=message.claims?.[index],source=state.evidence?.find(e=>e.id===claim?.evidenceId);
    return claim&&claim.state!=='proposed'&&source&&source.evidenceStatus!=='inspection-failed'&&claim.quote?.trim()&&(source.text?.includes(claim.quote)||(source.limitations||[]).includes(claim.quote));
  });
}
export function resultOutcome(state,message){
  const findings=(message?.findings||[]).filter(f=>findingSupport(state,message,f)).length;
  const openQuestions=(message?.findings||[]).filter(f=>f.change==='gap'||!findingSupport(state,message,f)).length;
  const status=message?.continuation?.status;
  const label=status==='blocked'?(findings?'Findings · further work blocked':'Blocked attempt'):status==='complete'?'Question complete':findings?'Supported findings':'Saved answer';
  return {status:status||'saved',findings,openQuestions,label};
}
export function featureOutcome(state,name){
  const key=name.trim().toLowerCase(),results=(state.messages||[]).filter(m=>m.role==='assistant'&&!m.features?.length&&(m.branchFeatureName||m.focus?.featureName||'').trim().toLowerCase()===key);
  const attempts=(state.attempts||[]).filter(a=>(a.branchFeatureName||'').trim().toLowerCase()===key);
  const latest=results.at(-1),attempt=attempts.at(-1),outcome=latest?resultOutcome(state,latest):null;
  let newerAttempt=attempt&&!attempt.resultId&&(!latest?.createdAt||attempt.startedAt>=latest.createdAt)?attempt:null;
  if(newerAttempt?.status==='running'&&state.status!=='inspecting')newerAttempt={...newerAttempt,status:'stopped',reason:newerAttempt.reason||'The previous session ended before this attempt completed.'};
  return {latest,attempt:newerAttempt,outcome,label:newerAttempt?`${newerAttempt.status==='stopped'?'Stopped':newerAttempt.status==='running'?'Running':'Failed'} attempt`:outcome?.label||'Discovered · not investigated'};
}
