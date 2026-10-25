// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {renderUserError,clearUserError} from './user-feedback.js';
import {createWorkspaceSaveQueue} from '../lib/workspace-save-queue.mjs';
import {installOnboarding} from './onboarding.js';
import {normalizeStepLimit,createStepRun,stepProgress,resultSnapshot,newSavedResult} from '../lib/auto-deepen.mjs';
import {ensureThemeControls} from './theme.js';
import {explainFailure} from '../lib/failure-recovery.mjs';
import {installActiveNodeReturn} from './active-node-return.js';
import {installPointerNodeFocus} from './pointer-node-focus.js';
import {installDocumentUI} from './document-ui.js';
import {installAgentUI} from './agent-ui.js';
import {installTextDictation} from './text-dictation.js';
import {autoDeepenBoundary} from '../lib/guidance.mjs';
import {installHistoryDismissal} from './history-panel.js';
import {useInProject} from './project-handoff.js';
import {createHistoryEntry} from './history-entry.js';
import {selectedFeature,resolveSelection} from '../lib/selection.mjs';
import {productsFor,collectionIntent} from '../lib/collection.mjs';
import {inventoryRecord} from '../lib/discovery-inventory.mjs';
import {WorkspaceView} from './workspace-view.js';
import {requestFeature} from '../lib/workspace.mjs';
import {installDiscoveryFeedback} from './discovery-feedback.js';
import {resultOutcome} from '../lib/outcomes.mjs';
import {pendingTargetAttempt,waitingTargetAttempt,targetSelectionMessage} from '../lib/target-recovery-state.mjs';
const api=window.investigation,$=id=>document.getElementById(id);
document.addEventListener('rea-operation-state',async event=>{if(!event.detail&&state)state.draft=$('message').value;setBusy(event.detail);if(!event.detail&&backRequested&&!depthRun){try{await returnToFeatures();notify('');}catch(error){backRequested=false;notify(error);}}});
installHistoryDismissal();
let documentUI,agentUI;
let state,busy=false,fileBusy=false,starting=false,updateReady=false,restarting=false,draftTimer,backRequested=false,depthRun=null,execution=null,pendingSelection=Promise.resolve(),pendingCollection=Promise.resolve(),uiRevision=0,draftRevision=0;
let agentSetupNeeded=false;
const agentSetupPrompt=document.createElement('p');agentSetupPrompt.id='agent-setup-prompt';agentSetupPrompt.className='agent-setup-prompt';agentSetupPrompt.setAttribute('role','status');agentSetupPrompt.textContent='Connect your agent before investigating. Your source and draft are kept.';agentSetupPrompt.hidden=true;$('composer').prepend(agentSetupPrompt);
function syncAgentSetupPrompt(){agentSetupPrompt.hidden=!agentSetupNeeded||busy||starting;if(agentSetupNeeded&&!busy&&!starting)$('send').textContent='Connect your agent';}
async function refreshAgentSetup(){if(!state)return;const id=state.id;try{const info=await api.connectionInfo();if(state?.id!==id)return;agentSetupNeeded=!!info.autoOpen;setBusy(busy);}catch{/* A failed status read is not evidence of a missing agent. */}}
function openAgentSetup(){document.dispatchEvent(new CustomEvent('setup-agent-request'));}
document.addEventListener('agent-connection-changed',()=>refreshAgentSetup());
const workspaceSaves=createWorkspaceSaveQueue((id,snapshot)=>api.workspace(id,snapshot));
let saveSlowTimer=null,saveSlowOwner=null;
const label=row=>row.displayLabel||row.name;
const featureIdentity=name=>(name||'').trim().toLowerCase();
ensureThemeControls();
const graphView=new WorkspaceView({choose,keep,submit,recoverTarget,diagnoseFailure,resumeFailure:resumeInterrupted,retryFailure:attempt=>{if(confirm('Retry the original request once? This may repeat inspection work and use your AI service. Saved evidence will be kept.'))submit(attempt.question,attempt.branchFeatureName||null,{retryFailureAttemptId:attempt.id,preserveDraft:true,automation:{maxSteps:1}});},retryAI:resumeSavedAI,refreshAI:attempt=>refreshSavedAI(attempt),continueTarget:attempt=>submit(attempt.question,null,{recoveryAttemptId:attempt.id,continuing:true,preserveDraft:true,nodeId:`attempt:${attempt.id}`,automation:{maxSteps:1}}),stop:stopExecution,pause:()=>{if(agentUI?.running){api.agentPause().catch(error=>notify(error));return;}if(depthRun){depthRun.pauseRequested=true;showRunProgress('Pausing after current step');}},showSource:api.showSource,exportDelivery:api.exportDelivery,notify,
  openSetup:()=>$('setup-open').click(),retryPreflight:()=>{const request=state.preflight?.request;if(request?.text&&confirm('Recheck prerequisites and retry the saved request? Research starts only if required checks pass, and may use your selected AI account or credits. Your current draft is preserved.'))submit(request.text,request.branchFeatureName,{...request.options,preserveDraft:true,automation:{maxSteps:1}});},
  workspace:ws=>{if(state){state.workspace=ws;saveWorkspace();}},destination:updateDestination,
  inspected:()=>{updateDestination();agentUI?.browsing();},challenge:result=>graphView.previewAction(`turn:${result.id}`,'verify'),
  openAgentControl:(investigationId,nodeId)=>agentUI?.openFromFeature({investigationId,nodeId}),
  operationState:()=>({busy,fileBusy,starting,restarting,backRequested,updateReady}),comparisonCandidates:options=>api.comparisonCandidates(options),compareSaved:payload=>savedComparison(payload),comparisonStatus:(id,operationId)=>savedComparisonStatus(id,operationId),
  compare:messages=>{if(messages.length===2)submit(`Compare the saved findings for ${messages.map(m=>m.focus?.displayLabel||m.branchFeatureName||m.title).join(' and ')}. Preserve evidence and unknowns for each side.`,null,{auditIds:messages.map(m=>m.id)});},
  autoThree:()=>{$('auto-deepen').checked=true;$('depth-options').hidden=false;$('depth-limit').value='3';$('depth-value').textContent='3';saveDepthSettings();}});
const feedback=installDiscoveryFeedback({stop:stopExecution,restart:restartForUpdate,refresh:()=>{graphView.panelLayout.apply();graphView.connectWorkbench();}});
async function savedComparison(payload){
 const reason=busy||fileBusy||starting||restarting||backRequested;
 if(reason)throw new Error('Another operation is in progress. No comparison started.');
 if(state.id!==payload.destinationInvestigationId)throw new Error('The investigation changed. No comparison started.');
 const id=state.id;execution={subject:'Saved comparison',nodeId:payload.nodeId,kind:'comparison',cancelled:false};graphView.runningNode=payload.nodeId;graphView.runStatusOwner={investigationId:id,nodeId:payload.nodeId};graphView.activityStartedAt=performance.now();feedback.bind(payload.nodeId,'Saved comparison');setBusy(true);
 try{await Promise.all([pendingSelection.catch(()=>{}),pendingCollection.catch(()=>{}),workspaceSaves.flush()]);await saveWorkspace();
   if(state.id!==id)throw new Error('The investigation changed. No comparison started.');
   if(execution.cancelled)return {status:'unchanged',operationId:payload.operationId,message:'Stopped before comparison dispatch. No comparison started.'};
   const outcome=await api.compareSaved(payload);if(outcome.state&&state.id===id){state={...outcome.state,draft:$('message').value,draftContext:state.draftContext,workspace:graphView.ws};render();}return outcome;
 }finally{graphView.runningNode=null;graphView.runStatusOwner=null;execution=null;feedback.clear();setBusy(false);render();}
}
async function savedComparisonStatus(id,operationId){
 const outcome=await api.comparisonStatus(id,operationId);
 if(outcome.state&&state.id===id&&!busy&&!starting){state={...outcome.state,draft:$('message').value,draftContext:state.draftContext,workspace:graphView.ws};render();}return outcome;
}
async function refreshSavedAI(attempt,{quiet=false}={}){
 if(!state||busy||fileBusy||starting||restarting)return null;
 const id=state.id;fileBusy=true;setBusy(busy);
 try{
  const check=await api.aiResumeStatus(id,attempt.id);if(state.id!==id)return null;
  graphView.aiResumeChecks??=new Map();graphView.aiResumeChecks.set(`${id}:${attempt.id}`,{...check,state:undefined,seal:check.state.attempts?.find(a=>a.id===attempt.id)?.aiRecovery?.seal});
  state={...check.state,draft:$('message').value,draftContext:state.draftContext,workspace:graphView.ws};render();
  if(['completed','missing'].includes(check.status)){feedback.clear();notify(check.reason);}
  else if(!quiet)notify(check.reason);
  return check;
 }catch(error){if(!quiet)notify(error);return null;}
 finally{fileBusy=false;setBusy(busy);documentUI?.refresh();}
}
async function resumeSavedAI(attempt){
 const check=await refreshSavedAI(attempt);if(!check?.ready||busy||fileBusy||starting||restarting)return;
 const current=state.attempts?.find(a=>a.id===attempt.id);if(!current)return;
 return submit(current.question,current.branchFeatureName||null,{resumeAiAttemptId:current.id,preserveDraft:true,nodeId:current.nodeId||`attempt:${current.id}`,automation:{maxSteps:1}});
}
function refreshPausedAI(){const attempt=state?.attempts?.findLast(a=>!a.resultId&&['paused','waiting'].includes(a.aiRecovery?.status));if(attempt)void refreshSavedAI(attempt,{quiet:true});}
window.addEventListener('focus',refreshPausedAI);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPausedAI();});
async function diagnoseFailure(attemptId){
 if(busy||fileBusy||starting)return;fileBusy=true;setBusy(busy);const id=state.id;
 try{await saveDraft();const updated=await api.diagnoseFailure(id,attemptId);if(state.id===id){state={...updated,workspace:state.workspace,draft:state.draft,draftContext:state.draftContext};render();}return updated;}
 catch(error){notify(error);}finally{fileBusy=false;setBusy(busy);}
}
async function recoverTarget(attemptId,choice,other=false){
  if(busy||fileBusy||starting)return;fileBusy=true;setBusy(busy);const id=state.id;
  let selected;
  try{await saveDraft();const updated=await api.recoverTarget(id,attemptId,choice,other);if(updated&&state.id===id){state={...updated,workspace:state.workspace,draft:state.draft,draftContext:state.draftContext};feedback.clear();graphView.lastRunOutcome='';notify('');render();if(choice)selected=state.attempts.find(a=>a.id===attemptId&&a.targetRecovery?.status==='ready');}}
  catch(error){notify(error);}finally{fileBusy=false;setBusy(busy);}
  if(selected&&state.id===id)await graphView.actions.continueTarget(selected);
}
function contextForRecord(record,resultId=''){
  const item=graphView.map?.nodes.get(graphView.ws.inspected),nodeId=resultId?(item?.message?.id===resultId&&item.type!=='feature'?item.id:`turn:${resultId}`):'';
  return record?{kind:'feature',featureName:record.row.name,messageId:record.message.id,label:record.title,resultId,nodeId}:{kind:'all',featureName:'',messageId:'',label:'Whole investigation',resultId,nodeId};
}
function updateDestination(){
  if(!state)return;feedback.view(graphView.ws.inspected||'core');const owner=graphView.runStatusOwner;$('depth-progress').hidden=!owner||owner.investigationId!==state.id||(graphView.ws.inspected||'core')!==owner.nodeId||graphView.map?.nodes.get(owner.nodeId)?.type==='direction';const records=graphView.records||[],inspected=graphView.selectedRecord(),ctx=state.draft?.trim()?state.draftContext:contextForRecord(inspected);
  const select=$('draft-destination'),value=records.find(r=>featureIdentity(r.row.name)===featureIdentity(ctx?.featureName))?.row.name||ctx?.featureName||'';
  select.replaceChildren(new Option('Whole investigation',''));for(const record of records)select.append(new Option(record.title,record.row.name));
  if(value&&!records.some(r=>featureIdentity(r.row.name)===featureIdentity(value)))select.append(new Option(`${ctx.label||value} · unavailable`,value));select.value=value;
  const differs=!!state.draft?.trim()&&featureIdentity(value)!==featureIdentity(inspected?.row.name);
  $('draft-notice').textContent=differs?`Draft stays on ${ctx?.label||'the source node'}.`:'';
  $('draft-resume').hidden=!differs;
  $('draft-retarget').hidden=!differs;$('draft-retarget').textContent='Move draft here';
  $('composer').hidden=differs||!graphView.askOpen;syncAgentSetupPrompt();
  document.querySelector('.draft-bar').hidden=true;
}
function saveWorkspace(){
  if(!state||!api.workspace)return Promise.resolve();
  const revision=++uiRevision,id=state.id,patch={workspace:state.workspace,draft:state.draft||'',draftContext:state.draftContext||null};
  $('workspace-save').textContent='Saving…';$('workspace-save').dataset.pending='true';$('workspace-save').dataset.failed='false';
  if(saveSlowOwner!==id){clearTimeout(saveSlowTimer);saveSlowOwner=id;saveSlowTimer=setTimeout(()=>{if(state?.id===id&&$('workspace-save').dataset.pending==='true')$('workspace-save').textContent='Saving is taking longer. Latest draft kept here.';},3000);}
  const pending=workspaceSaves.enqueue(id,patch);
  pending.then(()=>{if(revision===uiRevision&&id===state.id){clearTimeout(saveSlowTimer);saveSlowOwner=null;$('workspace-save').textContent='Saved';$('workspace-save').dataset.pending='false';documentUI?.refresh();}},error=>{if(revision===uiRevision&&id===state.id){clearTimeout(saveSlowTimer);saveSlowOwner=null;$('workspace-save').textContent='Not saved · Retry';$('workspace-save').dataset.failed='true';$('workspace-save').dataset.pending='false';notify(error);}});
  return pending;
}
$('workspace-save').onclick=()=>{if($('workspace-save').dataset.failed==='true')saveWorkspace();};
$('draft-destination').onchange=()=>{draftRevision++;const record=graphView.records.find(r=>r.row.name===$('draft-destination').value);state.draftContext=contextForRecord(record);saveWorkspace();updateDestination();};
$('draft-retarget').onclick=()=>{draftRevision++;state.draftContext=contextForRecord(graphView.selectedRecord(),graphView.result?.id||'');graphView.askOpen=true;saveWorkspace();updateDestination();$('message').focus();};
function notify(text,action){
 const error=text&&typeof text==='object',message=error?String(text.message||text):text&&execution?`${execution.subject} · ${text}`:text;
 $('activity').textContent=message||'';$('activity').hidden=true;const notice=$('workspace-notice');
 if(error)renderUserError(notice,text,{...action,action:action?.run?action:action?.action,actions:{agent:openAgentSetup,setup:()=>$('setup-open').click(),save:()=>saveWorkspace(),open:()=>$('document-open').click(),dismiss:()=>notify('')}});
 else{clearUserError(notice,message||'');notice.hidden=!message;if(action){const retry=document.createElement('button');retry.type='button';retry.className='text-button';retry.textContent=action.label;retry.onclick=()=>action.run();notice.append(' ',retry);}}
 feedback.phase(message);if(execution&&(busy||starting)){graphView.runPhase=message;document.querySelectorAll('.growing-node.running .node-run-phase').forEach(label=>{label.textContent=message||'Investigating…';label.title=label.textContent;});}
}
const resuming=new Set();
async function resumeInterrupted(attempt){
 if(resuming.has(attempt.id)||busy||fileBusy||starting||restarting)return;
 resuming.add(attempt.id);
 try{const current=state.attempts?.find(a=>a.id===attempt.id);if(!current||current.resultId)return;
  return await submit(current.question,current.branchFeatureName||null,{resumeInterruptedAttemptId:current.id,preserveDraft:true,nodeId:current.nodeId||`attempt:${current.id}`,automation:{maxSteps:1}});
 }finally{resuming.delete(attempt.id);}
}
function stopExecution(){if(agentUI?.running){api.agentStop().catch(error=>notify(error));return;}if(depthRun){depthRun.cancelled=true;showRunProgress('Stopping');}if(execution?.kind==='comparison')execution.cancelled=true;graphView.cancelFocusMotion();notify('Stopping…');Promise.resolve(api.stop()).catch(error=>notify(error));}
function showRunProgress(prefix){if(!depthRun)return;graphView.stepRun=depthRun;graphView.runProgress=stepProgress(depthRun,prefix);$('depth-progress').textContent=graphView.runProgress;graphView.draw();}
function resizeInput(){const input=$('message');input.style.height='auto';input.style.height=`${Math.min(160,Math.max(48,input.scrollHeight))}px`;}
function setBusy(value){
  busy=value;$('apply-update').disabled=value||fileBusy||restarting;feedback.update(updateReady,value||fileBusy||restarting);for(const id of ['new','file-new','welcome-start','welcome-folder','folder','send','export-graph','export-kept','export-investigation','import-history','guided-deepen','document-open','document-save','document-save-as','document-share'])$(id).disabled=value||fileBusy||starting||restarting;
  $('export-kept').disabled=value||fileBusy||starting||restarting||!state?.keptFeatures?.length;document.querySelectorAll('.history-entry button').forEach(button=>button.disabled=value||fileBusy);graphView.fileBusy=fileBusy||restarting;graphView.starting=starting;graphView.setBusy(value);$('stop').hidden=!(value||starting);
  const selected=state&&selectedFeature(state);$('activate').hidden=true;$('activate').disabled=value;
  $('back').hidden=!state?.messages.length;$('send').textContent=value?(state?.messages.length?'Running…':'Discovering…'):(state?.messages.length?'Send':'Discover');
  syncAgentSetupPrompt();
  $('message').placeholder=!state?.messages.length?'Website, app path, or question…':graphView.selectedRecord()?`Ask about ${graphView.selectedRecord().title}…`:'Add a source or ask about this investigation…';
}
const recoveredViews=new Set();
function render(){
  documentUI?.refresh();feedback.context(state.id);
  $('welcome').hidden=true;graphView.update(state,busy);
  $('export-kept').hidden=!state.keptFeatures?.length;$('view-latest-result').hidden=true;
  $('message').value=state.draft||'';resizeInput();setBusy(busy);agentUI?.refresh();
  if(state.workspaceRecovery&&!recoveredViews.has(state.id)){recoveredViews.add(state.id);notify(state.workspaceRecovery.message);}
}
async function choose(message,row){
  if(busy||backRequested)return;
  const id=state.id;state.selection={messageId:message.id,featureName:row.name,displayLabel:label(row)};
  const save=pendingSelection.catch(()=>{}).then(()=>api.select(id,message.id,row.name));pendingSelection=save;
  await save;render();
}
function renderCollectionChange(){
 const focused=document.activeElement,composer=focused===$('message'),caret=composer?{start:focused.selectionStart,end:focused.selectionEnd,direction:focused.selectionDirection,scroll:focused.scrollTop}:null;
 const nodeId=focused?.closest?.('[data-node-id]')?.dataset.nodeId,selector=['.outline-node','.outline-actions','.node-bookmark','.growing-node-open'].find(key=>focused?.matches?.(key)),id=state.id,inspected=graphView.ws.inspected;
 let ownsFocus=true,restoredCaret=false;const same=target=>selector&&target?.matches?.(selector)&&target.closest('[data-node-id]')?.dataset.nodeId===nodeId;
 const followFocus=event=>{if(event.target!==focused&&event.target!==document.body&&event.target!==document.documentElement&&!same(event.target))ownsFocus=false;};
 let expiry,scheduled=false;const cancel=()=>{ownsFocus=false;},cleanup=()=>{ownsFocus=false;document.removeEventListener('focusin',followFocus,true);document.removeEventListener('pointerdown',cancel,true);document.removeEventListener('keydown',cancel,true);clearTimeout(expiry);};
 if(selector){document.addEventListener('focusin',followFocus,true);document.addEventListener('pointerdown',cancel,true);document.addEventListener('keydown',cancel,true);}
 const restore=()=>{
  if(!ownsFocus||state.id!==id||graphView.ws.inspected!==inspected)return;
  const active=document.activeElement;if(active!==document.body&&active!==document.documentElement&&active!==focused&&!same(active))return;
  const replacement=focused?.isConnected?focused:selector&&[...document.querySelectorAll(selector)].find(same);
  if(!replacement||replacement.disabled||!replacement.getClientRects().length)return;
  if(document.activeElement!==replacement)replacement.focus({preventScroll:true});
  if(caret&&!restoredCaret){replacement.setSelectionRange(caret.start,caret.end,caret.direction);replacement.scrollTop=caret.scroll;restoredCaret=true;}
 };
 try{
  render();restore();
  // A collection notice can resize the canvas and rebuild the Outline once more.
  // Keep only this completion's stable control through that finite redraw.
  if(selector){expiry=setTimeout(cleanup,150);requestAnimationFrame(()=>requestAnimationFrame(()=>{restore();cleanup();}));scheduled=true;}
 }finally{if(selector&&!scheduled)cleanup();}
}
async function keep(message,row,value,command){
  if(busy||fileBusy||starting||restarting||backRequested)return;
  const id=state.id,retry=()=>{if(state.id===id)return keep(message,row,value,command);},restore=()=>{if(state.id===id)return keep(message,row,true);};
  fileBusy=true;setBusy(busy);documentUI?.refresh();
  try{
    const save=pendingCollection.catch(()=>{}).then(()=>command?api.send(id,command.text,row.name,{preserveDraft:true,collectionRequestId:command.requestId,collectionChoice:{messageId:message.id,featureName:row.name,keep:value}}):api.keep(id,message.id,row.name,value));pendingCollection=save;
    const updated=await save;if(state.id!==id)return;
    const failure=updated.collectionSaveError;
    if(updated.keptFeatures){state.keptFeatures=updated.keptFeatures;state.removedKeptFeatures=updated.removedKeptFeatures;state.collectionCreatedAt=updated.collectionCreatedAt;if(command){state.messages=updated.messages;state.status=updated.status;if(!failure&&$('message').value===command.text){state.draft='';state.draftContext=null;}}renderCollectionChange();}
    if(failure){
      const outcome=failure.outcome==='saved'?`Your choice was saved, but collection export or navigation files could not finish updating.`:failure.outcome==='unchanged'?'Your saved collection is unchanged.':'Could not confirm that your choice was saved. Retry applies the same choice.';
      notify(new Error(`Could not finish saving ${value?'Keep':'Remove'} for ${label(row)}. ${outcome} ${failure.message}`),{context:'save',label:'Retry collection save',run:retry});
    }else if(value)notify(`${label(row)} is in your collection. Any saved collection history has been restored.`);
    else notify(`${label(row)} was removed from your collection. Its history is saved; Keep restores it.`,{label:'Restore to collection',run:restore});
  }catch(error){if(state.id===id)notify(new Error(`Could not confirm ${value?'Keep':'Remove'} for ${label(row)}. Your last displayed choice is unchanged. ${error.message}`),{context:'save',label:'Retry collection save',run:retry});}
  finally{fileBusy=false;setBusy(busy);documentUI?.refresh();if(command&&state.id===id)await saveWorkspace().catch(()=>{});}
}
async function returnToFeatures(){
  await pendingSelection.catch(()=>{});backRequested=false;graphView.back();await saveDraft();
}
async function submit(text,branchFeatureName,options={}){
  if(busy||fileBusy||starting||restarting||backRequested||!text.trim())return;
  const localCollection=collectionIntent(state,text);
  if(localCollection&&!localCollection.clarification){const record=inventoryRecord(state,localCollection);if(record)return keep(record.message,record.row,localCollection.keep,{text,requestId:crypto.randomUUID()});}
  // Check the connection before creating execution state, clocks or result feedback.
  const connectionOwner=state.id;let connectionNeeded=false;starting=true;setBusy(false);
  try{const info=await api.connectionInfo();if(state.id!==connectionOwner)return;agentSetupNeeded=connectionNeeded=!!info.autoOpen;if(connectionNeeded){state.draft=$('message').value;await saveWorkspace();}}
  catch(error){notify(error,{category:'connection'});return;}
  finally{starting=false;setBusy(false);}
  if(state.id!==connectionOwner)return;
  if(connectionNeeded){feedback.clear();graphView.lastRunOutcome='';graphView.runStatusOwner=null;$('depth-progress').textContent='';notify('');syncAgentSetupPrompt();openAgentSetup();return;}
  const explicit=branchFeatureName!==undefined,submittedDraft=$('message').value,submittedText=text;
  if(!explicit){const matches=requestFeature(text,graphView.records);if(matches.length>1){notify('Open the feature node that should receive this question.');return;}if(matches.length===1)state.draftContext=contextForRecord(matches[0]);const ctx=state.draftContext||contextForRecord(graphView.selectedRecord());branchFeatureName=ctx.featureName||null;if(ctx.featureName&&!graphView.records.some(r=>featureIdentity(r.row.name)===featureIdentity(ctx.featureName))){notify('This draft’s node is unavailable. Open a node and use Move draft here before sending.');return;}if(ctx.resultId){options.parentResultId=ctx.resultId;options.parentNodeId=ctx.nodeId||`turn:${ctx.resultId}`;}if(ctx.resultId&&/^(?:what supports|where did|show (?:me )?(?:the )?evidence|is .+ supported)/i.test(text.trim()))options.auditIds=[ctx.resultId];}
  const submittedContext=state.draftContext?{...state.draftContext}:null,submittedContextKey=JSON.stringify(submittedContext),submittedRevision=draftRevision;
  const executionNodeId=options.nodeId||options.parentNodeId||(!explicit&&state.draftContext?.nodeId)||(branchFeatureName?graphView.records.find(r=>featureIdentity(r.row.name)===featureIdentity(branchFeatureName))?.id:null)||(!explicit?'core':graphView.ws.inspected||'core');
  const submittedId=state.id,discovering=!state.messages.length,total=options.auditIds?1:normalizeStepLimit(options.automation?options.automation.maxSteps:$('auto-deepen').checked?$('depth-limit').value:1);
  // The same intent exists before any startup await, including pending saves.
  const run=depthRun=createStepRun(total),valid=()=>state.id===submittedId&&!run.cancelled&&!backRequested;
  let ending='',failure='',lastOutcome=null,started=false,pendingResultSnapshot=null,consumedDraft=false;
  execution={subject:branchFeatureName||'This application',nodeId:executionNodeId};feedback.bind(execution.nodeId,discovering?'':execution.subject);starting=true;graphView.runStatusOwner={investigationId:submittedId,nodeId:execution.nodeId};graphView.activityStartedAt=performance.now();graphView.preparingNode=execution.nodeId;graphView.runPhase='Preparing investigation.';run.current=1;showRunProgress();feedback.source(text);feedback.start(discovering?'Starting discovery.':'Preparing investigation.');setBusy(false);$('send').textContent='Starting.';
  const draftChanged=()=>draftRevision!==submittedRevision||$('message').value!==submittedDraft||JSON.stringify(state.draftContext||null)!==submittedContextKey;
  const pauseForDraft=()=>$('message').value.trim()&&draftChanged()&&featureIdentity(state.draftContext?.featureName)===featureIdentity(branchFeatureName);
  const restoreSubmittedDraft=()=>{if(explicit||!consumedDraft||draftRevision!==submittedRevision||$('message').value!==''||state.draftContext!=null)return;state.draft=submittedText;state.draftContext=submittedContext?{...submittedContext}:null;$('message').value=submittedText;resizeInput();};
  try{
    const update=await api.runtimeUpdate();if(!valid())return;
    if(update){showUpdate(true);ending='An app update is ready. Use Restart to update beside your source before continuing.';$('node-update-restart').focus();return;}
    clearTimeout(draftTimer);await Promise.all([pendingSelection.catch(()=>{}),pendingCollection.catch(()=>{}),workspaceSaves.flush()]);if(!valid())return;
    if(run.pauseRequested){ending='Paused before investigation.';return;}
    // Consume only the unchanged submitted buffer. The host preserves drafts
    // because a newer one can arrive after dispatch, while reasoning is in flight.
    if(!explicit&&submittedDraft===submittedText&&!draftChanged()){state.draft='';state.draftContext=null;$('message').value='';consumedDraft=true;await saveWorkspace();if(!valid())return;}
    starting=false;started=true;graphView.preparingNode=null;graphView.runningNode=executionNodeId;
    setBusy(true);$('depth-limit').disabled=true;$('welcome').hidden=true;resizeInput();feedback.start(discovering?'Discovering.':'Investigating.',discovering);
    while(run.dispatched<run.total&&valid()){
      if(run.pauseRequested||run.dispatched>0&&pauseForDraft()){ending=pauseForDraft()?'Paused for your draft.':'Paused after current step. Continue from the saved finding.';break;}
      run.current=run.dispatched+1;run.phase='preparing';showRunProgress();notify(options.auditIds?'Reviewing retained support.':`Investigating ${branchFeatureName||'this application'}.`);graphView.pending(text);
      if(run.dispatched===0&&graphView.navigation?.autoFollow!==false){await graphView.focusExecutionNode(executionNodeId);if(!valid())break;}
      if(!valid()||run.pauseRequested||run.dispatched>0&&pauseForDraft())break;
      graphView.beginGrowth(graphView.runningNode||'core');
      const before=pendingResultSnapshot=resultSnapshot(state),previous=state.messages.findLast(message=>message.role==='assistant');
      // Focus and preparation consume no requests. Increment only at the IPC boundary.
      run.phase='current';run.dispatched++;showRunProgress();
      if(options.recoveryAttemptId){state={...state,status:'inspecting'};render();}
      const updated=options.auditIds?await api.audit(submittedId,options.auditIds,text,{preserveDraft:true}):await api.send(submittedId,text,branchFeatureName,{...options,preserveDraft:true});
      run.current=null;
      if(state.id!==submittedId||updated.id!==submittedId){ending='Investigation changed; no further request was sent.';break;}
      const draft=$('message').value;state={...updated,draft,draftContext:state.draftContext,workspace:state.workspace};
      const latest=newSavedResult(state,before);pendingResultSnapshot=null;if(latest){run.completed++;lastOutcome=resultOutcome(state,latest);}showRunProgress();notify('');render();
      if(waitingTargetAttempt(state)){ending=targetSelectionMessage(waitingTargetAttempt(state));break;}
      if(state.preflight?.status==='blocked'){restoreSubmittedDraft();ending=state.preflight.canceled?'Readiness check canceled. Your request is preserved.':'Setup required before investigation. Your target and request are preserved.';graphView.ws.inspected='utility:preflight';graphView.draw();$('node-workbench').scrollTop=0;break;}
      if(!valid()){ending=run.cancelled?'Stopped by you.':'Returning to features.';break;}
      if(run.pauseRequested){ending='Paused after current step. Continue from the saved finding.';break;}
      if(!latest){ending='No new completed finding; no further request was sent.';break;}
      if(options.auditIds)break;
      const boundary=autoDeepenBoundary(latest,previous,{evidence:state.evidence});if(boundary){ending=boundary;break;}
      if(run.dispatched===run.total){ending=run.total===1?`${lastOutcome?.label||'Answer saved'} for ${branchFeatureName||'this investigation'}.`:'Stopped at your limit. Further investigation may remain.';break;}
      if(pauseForDraft()){ending='Paused for your draft.';break;}
      if(!latest.recommendation?.trim()){ending='No further recommendation.';break;}
      text=latest.recommendation;options.parentResultId=latest.id;options.parentNodeId=`turn:${latest.id}`;options.continuing=true;
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }catch(error){
    if(run.cancelled)ending='Stopped by you.';
    else{const info=explainFailure({reason:error.message});failure=info.explanation+' '+info.nextAction;}
    if(state.id===submittedId){try{const saved=await api.open(submittedId);if(state.id===submittedId){state={...saved,draft:$('message').value,draftContext:state.draftContext,workspace:state.workspace};const latest=pendingResultSnapshot&&newSavedResult(state,pendingResultSnapshot);if(latest){run.completed++;lastOutcome=resultOutcome(state,latest);}}}catch{}restoreSubmittedDraft();}
  }finally{
    run.current=null;starting=false;graphView.stepRun=null;graphView.preparingNode=null;graphView.runningNode=null;graphView.finished();$('depth-limit').disabled=false;
    const stopped=run.cancelled?'Stopped by you.':backRequested?'Returning to features.':ending||(!started?'Paused before investigation.':run.pauseRequested?'Paused before next step.':run.completed?`${lastOutcome?.label||'Answer saved'} for ${branchFeatureName||'this investigation'}.`:'No new completed answer.');
    const waiting=!failure&&!run.cancelled&&waitingTargetAttempt(state),setupBoundary=!failure&&!run.cancelled&&state.preflight?.status==='blocked'&&!!state.preflight.request;
    graphView.lastStepOutcome={...graphView.runStatusOwner,request:submittedText,status:failure?'failed':run.cancelled?'stopped':setupBoundary?'blocked':run.completed?'saved':'idle'};
    graphView.lastRunOutcome=waiting?targetSelectionMessage(waiting):setupBoundary?'':stepProgress(run,failure?(state.attempts?.findLast(a=>a.aiRecovery?.status==='paused')?.aiRecovery.message||`Failed: ${failure}`):stopped);graphView.runProgress='';$('depth-progress').textContent=graphView.lastRunOutcome;depthRun=null;
    if(state.id===submittedId){state.draft=$('message').value;if(run.cancelled&&!run.completed)restoreSubmittedDraft();}
    setBusy(false);$('send').textContent=state.messages.length?'Send':'Discover';
    if(backRequested){await returnToFeatures();}else{render();if(started&&!$('composer').hidden){const step=$('workspace-inspector').querySelector('[data-saved-step-run]');if(step&&!step.disabled)step.focus({preventScroll:true});else if(graphView.map?.nodes.get(graphView.ws.inspected)?.type!=='direction')$('message').focus();}}
    notify(failure?new Error(failure):graphView.lastRunOutcome);
    if(waiting||setupBoundary||failure&&pendingTargetAttempt(state)){feedback.clear();}else feedback.finish(failure?(discovering?'Discovery failed':'Investigation failed'):run.cancelled?'Stopped':state.preflight?.status==='blocked'?'Setup required':lastOutcome?.status==='blocked'?(discovering?'Discovery blocked':lastOutcome.label):discovering&&run.completed?'Discovery complete':run.completed?lastOutcome?.label||'Answer saved':'No completed answer',graphView.lastRunOutcome);execution=null;
    if(state.id===submittedId)await saveWorkspace().catch(error=>notify(error));
  }
}
$('view-latest-result').onclick=()=>graphView.reveal(graphView.graph.latest);
function saveDepthSettings(){graphView.ws.autoDeepen=$('auto-deepen').checked;graphView.ws.depthLimit=normalizeStepLimit($('depth-limit').value);$('depth-limit').value=String(graphView.ws.depthLimit);$('depth-value').textContent=String(graphView.ws.depthLimit);graphView.persist();graphView.draw();}
$('depth-limit').oninput=()=>{$('depth-value').textContent=$('depth-limit').value;saveDepthSettings();};
$('auto-deepen').onchange=()=>{$('depth-options').hidden=!$('auto-deepen').checked;saveDepthSettings();if(depthRun&&!$('auto-deepen').checked){depthRun.pauseRequested=true;showRunProgress('Automatic continuation off; finishing current step');}};
$('composer').onsubmit=event=>{event.preventDefault();submit($('message').value);};
$('message').onkeydown=event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();submit($('message').value);}};
$('message').oninput=()=>{draftRevision++;resizeInput();clearTimeout(draftTimer);const text=$('message').value;state.draft=text;if(text.trim()&&!state.draftContext)state.draftContext=contextForRecord(graphView.selectedRecord(),graphView.result?.id||'');if(!text.trim())state.draftContext=null;const matches=requestFeature(text,graphView.records);if(matches.length===1)state.draftContext=contextForRecord(matches[0]);updateDestination();saveWorkspace();};
$('folder').onclick=async()=>{try{const folder=await api.chooseFolder();if(folder){graphView.openRoot();$('message').value+=`${$('message').value?'\n':''}"${folder}"\n`;$('message').dispatchEvent(new Event('input'));$('message').focus();}}catch(error){notify(error);}};
$('stop').onclick=stopExecution;
$('activate').onclick=async()=>{await pendingSelection.catch(()=>{});const selected=selectedFeature(state);if(selected&&!busy&&!backRequested)submit(`Explore ${label(selected)}`);};
$('back').onclick=async()=>{backRequested=true;try{if(busy||starting){if(depthRun){depthRun.pauseRequested=true;showRunProgress('Returning after current step');}}else await returnToFeatures();}catch(error){backRequested=false;notify(error);}};
for(const [id,save,message]of [['export-graph',api.exportGraph,'Saved investigation graph.'],['export-kept',api.exportFeatures,'Saved feature collection.']])$(id).onclick=async()=>{try{await pendingCollection.catch(()=>{});if(await save(state.id))notify(message);}catch(error){notify(error,{context:'export',action:{label:'Try export again',run:()=>$(id).click()}});}};
async function saveDraft(){clearTimeout(draftTimer);state.draft=$('message').value;graphView.flush();await Promise.all([pendingSelection.catch(()=>{}),pendingCollection.catch(()=>{}),workspaceSaves.flush()]);}
function exportedView(){
  let nodes=[];const features=[];try{nodes=JSON.parse(localStorage.getItem(`rea-node-positions:${state.id}`)||'[]');for(const key of Object.keys(localStorage)){const prefix=`rea-feature-positions:${state.id}:`;if(key.startsWith(prefix))features.push([key.slice(prefix.length),JSON.parse(localStorage.getItem(key))]);}}catch{}let hiddenDirections=[];try{hiddenDirections=JSON.parse(localStorage.getItem(`rea-hidden-directions:${state.id}`)||'[]');}catch{}let accordion=[];try{accordion=JSON.parse(localStorage.getItem(`rea-accordion-positions:${state.id}`)||'[]');}catch{}return {nodes,features,hiddenDirections,accordion};
}
$('export-investigation').onclick=async()=>{
  if(busy||fileBusy)return;fileBusy=true;setBusy(busy);
  try{await saveDraft();const folder=await api.exportInvestigation(state.id,exportedView());if(folder)notify(`Exported investigation to ${folder}`);}catch(error){notify(error);}finally{fileBusy=false;setBusy(busy);}
};
$('import-history').onclick=async()=>{
  if(busy||fileBusy)return;fileBusy=true;setBusy(busy);
  try{await saveDraft();const imported=await api.importInvestigation();if(imported){state=imported.state;localStorage.setItem(`rea-accordion-positions:${state.id}`,JSON.stringify(imported.view.accordion||[]));localStorage.setItem(`rea-node-positions:${state.id}`,JSON.stringify(imported.view.nodes));localStorage.setItem(`rea-hidden-directions:${state.id}`,JSON.stringify(imported.view.hiddenDirections||[]));for(const [id,positions]of imported.view.features)localStorage.setItem(`rea-feature-positions:${state.id}:${id}`,JSON.stringify(positions));$('depth-progress').textContent='';$('history-panel').hidden=true;$('history').setAttribute('aria-expanded','false');render();notify('Imported investigation.');}}catch(error){notify(error);}finally{fileBusy=false;setBusy(busy);}
};
$('new').onclick=async()=>{if(busy||fileBusy)return;fileBusy=true;setBusy(busy);try{await saveDraft();const next=await api.create();if(!next)return;state=next;$('depth-progress').textContent='';$('node-settings').open=false;render();graphView.openRoot();notify('');$('message').focus();}catch(error){notify(error);}finally{fileBusy=false;setBusy(busy);documentUI?.refresh();}};
$('file-new').onclick=()=>$('new').click();
const historySelected=new Set();
function syncHistorySelection(){
  $('history-selection-count').textContent=`${historySelected.size} selected`;
  $('history-delete-selected').disabled=!historySelected.size||busy||fileBusy;$('history-clear-selection').disabled=!historySelected.size||fileBusy;
  for(const box of document.querySelectorAll('[data-history-select]'))box.checked=historySelected.has(box.dataset.historySelect);
}
async function deleteHistoryItems(ids){
  if(busy||fileBusy||!ids.length)return;fileBusy=true;setBusy(busy);syncHistorySelection();
  try{await saveDraft();const result=await api.deleteInvestigations(ids);for(const id of result.deletedIds){historySelected.delete(id);for(const key of Object.keys(localStorage))if(key===`rea-accordion-positions:${id}`||key===`rea-node-positions:${id}`||key===`rea-hidden-directions:${id}`||key.startsWith(`rea-feature-positions:${id}:`))localStorage.removeItem(key);}
    if(result.state){state=result.state;$('depth-progress').textContent='';render();}
    await renderHistory();if(result.deletedIds.length||result.failed.length)notify(`${result.deletedIds.length} investigation${result.deletedIds.length===1?'':'s'} moved to the Recycle Bin.${result.failed.length?` ${result.failed.length} could not be deleted: ${result.failed.map(item=>`${item.title}: ${item.error}`).join('; ')}`:''}`);
  }catch(error){notify(error);}finally{fileBusy=false;setBusy(busy);syncHistorySelection();documentUI?.refresh();}
}
$('history-delete-selected').onclick=()=>deleteHistoryItems([...historySelected]);
$('history-clear-selection').onclick=()=>{historySelected.clear();syncHistorySelection();};
async function renderHistory(){
  const panel=$('history-panel'),list=await api.history();$('history-list').replaceChildren();const available=new Set(list.map(item=>item.id));for(const id of historySelected)if(!available.has(id))historySelected.delete(id);
  $('history-summary').textContent=`${list.length} saved session${list.length===1?'':'s'} · Most recently saved first`;
  for(const item of list){
    const entry=createHistoryEntry(item,{current:item.id===state?.id,selected:historySelected.has(item.id),onSelect:checked=>{if(checked)historySelected.add(item.id);else historySelected.delete(item.id);syncHistorySelection();},
      onOpen:async()=>{if(busy||fileBusy)return;fileBusy=true;setBusy(busy);try{await saveDraft();const next=await api.open(item.id);if(!next)return;state=next;$('depth-progress').textContent='';panel.hidden=true;$('history').setAttribute('aria-expanded','false');render();notify('');}catch(error){notify(error);}finally{fileBusy=false;setBusy(busy);documentUI?.refresh();}},
      onUseProject:async trigger=>{if(busy||fileBusy)return;fileBusy=true;setBusy(busy);try{await saveDraft();await useInProject(api,item.id,{notify,returnFocus:trigger});}catch(error){notify(error);}finally{fileBusy=false;setBusy(busy);}},
      onDelete:()=>deleteHistoryItems([item.id]),onFolder:()=>api.savedFiles(item.id).catch(error=>notify(error))});
    $('history-list').append(entry);
  }
  if(!list.length){const empty=document.createElement('p');empty.className='history-empty';empty.textContent='No saved investigations yet. Start a new investigation or import one.';$('history-list').append(empty);}
  setBusy(busy);syncHistorySelection();
}
$('saved-files').onclick=()=>api.savedFiles().catch(error=>notify(error));
$('history').onclick=async()=>{
  try{
    const panel=$('history-panel');panel.hidden=!panel.hidden;$('history').setAttribute('aria-expanded',String(!panel.hidden));if(panel.hidden)return;
    await renderHistory();if(!panel.hidden)$('close-history').focus();
  }catch(error){notify(error);}
};

document.addEventListener('dragover',event=>{event.preventDefault();if(!busy&&!fileBusy)document.body.classList.add('target-dragging');});
document.addEventListener('dragleave',event=>{if(!event.relatedTarget)document.body.classList.remove('target-dragging');});
document.addEventListener('drop',event=>{event.preventDefault();document.body.classList.remove('target-dragging');if(busy||fileBusy||starting||restarting)return;const paths=[...event.dataTransfer.files].map(file=>api.pathForFile(file));if(paths.length===1&&/\.reanodes$/i.test(paths[0])){documentUI.openDropped(paths[0]);return;}const text=paths.length?paths.map(path=>`"${path}"`).join('\n'):(event.dataTransfer.getData('text/uri-list').split('\n').filter(line=>line&&!line.startsWith('#')).join('\n')||event.dataTransfer.getData('text/plain')).trim();if(text){graphView.openRoot();$('message').value+=($('message').value?'\n':'')+text+'\n';$('message').dispatchEvent(new Event('input'));$('message').focus();}});
function showUpdate(changed){updateReady=!!changed;$('apply-update').hidden=!changed;feedback.update(updateReady,busy||fileBusy||restarting);}
api.onRuntimeUpdate(showUpdate);api.runtimeUpdate().then(showUpdate).catch(error=>notify(error));
async function restartForUpdate(){if(busy||fileBusy||starting||restarting)return;restarting=true;feedback.restarting(true);$('apply-update').disabled=true;$('send').disabled=true;let requested=false;try{await saveDraft();requested=!!await api.applyUpdate();if(!requested){showUpdate(false);notify('The app is current. Choose Discover or Send to continue.');}}catch(error){notify(error);}finally{if(!requested){restarting=false;feedback.restarting(false);$('apply-update').disabled=busy||fileBusy;$('send').disabled=busy||fileBusy;}}}
$('apply-update').onclick=restartForUpdate;
api.onActivity(text=>{if(busy)notify(text);agentUI?.activity(text);});
agentUI=installAgentUI({api,getState:()=>state,acceptState:next=>{state={...next,workspace:state.workspace,draft:state.draft,draftContext:state.draftContext};render();},graphView,isManualBusy:()=>busy||fileBusy||starting,setAgentBusy:value=>{setBusy(value);render();},notify});
installTextDictation({api,getContext:field=>JSON.stringify([state?.id||'app',field.id==='message'?[state?.workspace?.inspected,state?.draftContext]:null])});
const activeNodeReturn=installActiveNodeReturn({view:graphView,getActive:()=>agentUI.running?{mode:'agent',investigationId:state?.id,nodeId:agentUI.activeNodeId}:execution&&(busy||starting)?{mode:'manual',investigationId:state?.id,nodeId:execution.nodeId}:null,returnToAgent:()=>agentUI.returnToActive()});
window.addEventListener('beforeunload',()=>activeNodeReturn.dispose(),{once:true});
graphView.navigation.bind({getActive:()=>agentUI.running?{nodeId:agentUI.activeNodeId}:execution&&(busy||starting)?{nodeId:execution.nodeId}:null,onManual:()=>agentUI.browsing(),onFollow:value=>agentUI.setFollowing(value),onResume:()=>agentUI.setFollowing(true)});
const pointerNodeFocus=installPointerNodeFocus({view:graphView,onBrowse:()=>activeNodeReturn.cancelPending()});
window.addEventListener('beforeunload',()=>pointerNodeFocus.dispose(),{once:true});
// Opening draws under the file guard; finish deferred preset upgrades once idle.
documentUI=installDocumentUI({api,getState:()=>state,acceptState:next=>{state=next;$('depth-progress').textContent='';$('history-panel').hidden=true;$('history').setAttribute('aria-expanded','false');$('node-settings').open=false;render();},flush:saveDraft,busy:()=>busy||fileBusy||starting||restarting,fileBusy:value=>{fileBusy=value;setBusy(busy);if(!value)graphView.upgradeComposedLayout();},notify});
const tourStyle=document.createElement('link');tourStyle.rel='stylesheet';tourStyle.href='./onboarding.css';const tourStyleReady=new Promise(resolve=>{tourStyle.onload=tourStyle.onerror=resolve;});document.head.append(tourStyle);
const quickTour=installOnboarding({api,getState:()=>state,flush:saveDraft,busy:()=>busy||fileBusy||starting||restarting,
  acceptState:next=>{state=next;render();graphView.openRoot();},
  run:async question=>{if($('message').value.trim()&&$('message').value!==question)throw Error('There is an unsent question in this example. Keep or send it before starting the prepared question, or choose a fresh example.');graphView.openRoot();$('message').value=question;$('message').dispatchEvent(new Event('input'));await saveDraft();await submit(question,undefined,{automation:{maxSteps:1}});},
  showFinding:async finding=>{graphView.openReader(`turn:${finding.messageId}`);},
  newInvestigation:async()=>{await saveDraft();const next=await api.create();if(!next)throw Error('Your example is saved. Finish the document dialog before creating another investigation.');state=next;render();graphView.openRoot();}
});
api.load().then(async result=>{state=result.state;if(state.draft?.trim()&&!state.draftContext){const selected=selectedFeature(state);state.draftContext=selected?{kind:'feature',featureName:selected.name,messageId:selected.messageId,label:label(selected)}:contextForRecord(null);}render();void refreshAgentSetup();if(graphView.nodeOpen&&$('agent-panel').hidden){const step=$('workspace-inspector').querySelector('[data-saved-step-run]');if(step&&!step.disabled)step.focus({preventScroll:true});else $('message').focus();}await tourStyleReady;await quickTour.boot(result);}).catch(error=>notify(error));

document.addEventListener('rea-state-changed',event=>{if(!event.detail||event.detail.id!==state?.id)return;state={...event.detail,draft:$('message').value,draftContext:state.draftContext,workspace:state.workspace};render();});



document.addEventListener('setup-resume-request',event=>{const info=event.detail;if(info?.id===state?.id&&!busy&&!fileBusy){const r=info.request;submit(r.text,r.branchFeatureName??null,{...r.options,preserveDraft:true});}});
