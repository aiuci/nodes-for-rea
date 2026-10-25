// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Presentation-only contracts. Research records and execution remain host owned.
export const FEATURE_ACTIONS = Object.freeze([
  ['inspect','Investigate this feature'],['trace','Follow connections'],['probe','Explore another angle'],['deeper','Take the next step'],
  ['auto','Continue automatically'],['verify','Check this finding'],['compare','Compare two findings'],['ask','Ask my own question']
]);
export const FEATURE_ACTION_HELP = Object.freeze({"inspect": "Investigate the feature using its original saved question.", "trace": "Choose relationships to investigate, such as dependencies or data flow.", "probe": "Choose an alternative direction or enter a separate question.", "deeper": "Run the recommended next investigation step once.", "auto": "Follow successive investigation steps within your chosen maximum.", "verify": "Review whether the saved evidence supports this finding.", "compare": "Compare two selected saved results and their evidence.", "ask": "Open the question composer. Send when ready."});
export const ROOT_ACTIONS = Object.freeze([['discover','Discover Features'],['coverage','Scope & Coverage'],['sources','Add Sources'],['ask','Ask my own question']]);
export const READING_DESTINATIONS = Object.freeze(['summary','latest','evidence','history']);
const key = value => (value||'').trim().toLowerCase();
export function actionBlock(state={},kind='work') {
  if(state.fileBusy)return 'A file or collection save is in progress.';
  if(state.restarting)return 'The app is restarting.';
  if(state.backRequested)return 'Returning to the previous workspace.';
  if(kind==='read')return '';
  if(state.starting||state.preparingNode)return 'An investigation is preparing.';
  if(kind==='presentation')return '';
  if(state.busy)return 'An investigation is already running. Use its Stop control.';
  if(kind==='work'&&state.updateReady)return 'An app update is ready. Restart to update before new work.';
  return '';
}
export function featureActionReason(id,{guard='',record,result,spec,traceReason='',compareAvailable=true}={}) {
  if(id==='ask')return '';
  if(guard)return guard;
  if(id==='verify')return !result||result.role!=='assistant'||result.features?.length?'No saved finding to verify.':'';
  if(!record?.row?.name?.trim())return 'This node has no available feature branch.';
  if(['deeper','auto'].includes(id)&&!spec)return 'No runnable next step is recorded.';
  if(['verify','compare'].includes(id)&&(!result||result.role!=='assistant'||result.features?.length))return id==='verify'?'No saved finding to verify.':'Investigate this feature first.';
  if(id==='trace'&&traceReason)return traceReason;
  if(id==='compare'&&!compareAvailable)return 'Saved comparison is unavailable in this app version.';
  return '';
}
export function branchHistory(state,featureName) {
  const branch=key(featureName),messages=(state.messages||[]).filter(m=>m.role==='assistant'&&!m.features?.length&&key(m.branchFeatureName||m.focus?.featureName)===branch);
  const attempts=(state.attempts||[]).filter(a=>key(a.branchFeatureName)===branch);
  return [...messages.map(message=>({kind:'result',id:message.id,at:message.createdAt||'',record:message})),...attempts.map(attempt=>({kind:'attempt',id:attempt.id,at:attempt.createdAt||attempt.startedAt||'',record:attempt}))].sort((a,b)=>String(a.at).localeCompare(String(b.at)));
}
export function exactReading(state,record,result,destination='summary') {
  const name=record?.row?.name||result?.branchFeatureName||result?.focus?.featureName||'',latest=(state.messages||[]).findLast(m=>m.role==='assistant'&&!m.features?.length&&key(m.branchFeatureName||m.focus?.featureName)===key(name));
  return {anchor:result||null,shown:destination==='latest'?latest:result||null,history:branchHistory(state,name)};
}
export function stableNodeReference(investigationId,nodeId) {return `reanodes:${encodeURIComponent(investigationId)}/${encodeURIComponent(nodeId)}`;}
