// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {renderUserError,clearUserError} from './user-feedback.js';
import {explainFailure} from '../lib/failure-recovery.mjs';
import {createWorkClock} from './work-clock.js';
import {createAgentFollow} from './agent-follow.js';
import {renderAgentPlanner} from './agent-planner.js';
import {AGENT_GOAL_LIMIT} from '../lib/agent-goal.mjs';
import {installGoalVoice} from './goal-voice.js';
import {installAgentContextUI} from './agent-context-ui.js';
const $=id=>document.getElementById(id);
export function installAgentUI({api,getState,acceptState,graphView,isManualBusy,setAgentBusy,notify}){
  let session=null,folder=null,follow=true,pending=false,runPending=false,loadedId=null,voiceBusy=false,updateRevision=0,planning=null,planMessage='',planError=null;
  const follower=createAgentFollow(graphView);
  const goalDrafts=new Map(),startingContexts=new Map();let requestedContext=null,loadPromise=Promise.resolve();
  const contextInput=installAgentContextUI({api,getState,notify:message=>{contextDetails.open=true;if(message&&typeof message==='object')renderUserError($('agent-context-status'),message,{context:'attachment'});else clearUserError($('agent-context-status'),message);notify(message);},onChange:()=>{if(session?.status!=='running'){folder=contextInput.projectFolder;session=null;if(!planning){planMessage='';planClock.clear();}sync();}}});
  const contextDetails=document.createElement('details');contextDetails.className='agent-context-options';
  const contextSummary=document.createElement('summary');contextSummary.textContent='Context and access';contextDetails.append(contextSummary);$('agent-context-input').before(contextDetails);contextDetails.append($('agent-context-input'));
  const panel=$('agent-panel'),access=panel.querySelector('.agent-access-options'),planActions=$('agent-plan').parentElement,scopeNote=panel.querySelector(':scope > .agent-note');
  $('agent-route').after(contextDetails,access,scopeNote);
  const composer=document.createElement('div');composer.className='agent-goal-composer';const label=panel.querySelector('label[for=agent-goal]'),entry=panel.querySelector('.agent-goal-entry');label.before(composer);composer.append(label,entry,planActions,panel.querySelector('.agent-voice-feedback'));
  const goal=$('agent-goal'),goalCount=document.createElement('p');goal.removeAttribute('maxlength');goalCount.id='agent-goal-count';goalCount.className='agent-note';entry.after(goalCount);goal.setAttribute('aria-describedby',[goal.getAttribute('aria-describedby'),goalCount.id].filter(Boolean).join(' '));
  const updateGoalCount=()=>{goalCount.textContent=`${goal.value.length.toLocaleString('en-US')} / ${AGENT_GOAL_LIMIT.toLocaleString('en-US')} characters${goal.value.length>AGENT_GOAL_LIMIT?' — Over the limit. Your full text remains here; shorten it to save and plan.':''}`;goal.setAttribute('aria-invalid',String(goal.value.length>AGENT_GOAL_LIMIT));};goal.addEventListener('input',updateGoalCount);goal.addEventListener('agent-goal-restored',updateGoalCount);
  contextSummary.textContent='Limits and details';access.querySelector('summary').textContent='Read-only source limits';
  const planHint=document.createElement('p');planHint.id='agent-plan-hint';planHint.textContent='Review the proposed route before starting.';planActions.after(planHint);
  const target=document.createElement('p');target.id='agent-investigation-target';composer.prepend(target);
  const starting=document.createElement('p');starting.id='agent-starting-feature';starting.setAttribute('role','status');target.after(starting);
  const conflict=document.createElement('div');conflict.id='agent-context-conflict';conflict.hidden=true;
  const conflictText=document.createElement('p');conflictText.setAttribute('role','status');
  const useContext=document.createElement('button');useContext.type='button';useContext.id='agent-use-feature';useContext.textContent='Use this starting feature';
  const keepContext=document.createElement('button');keepContext.type='button';keepContext.id='agent-keep-context';keepContext.textContent='Keep existing context';conflict.append(conflictText,useContext,keepContext);starting.after(conflict);
  const whole=document.createElement('button');whole.type='button';whole.id='agent-whole-context';whole.textContent='Use whole investigation';starting.after(whole);
  const contextLocked=()=>pending||!!planning||voiceBusy||contextInput.busy||isManualBusy()||session?.status==='running';
  const acceptContext=value=>{if(contextLocked())return;startingContexts.set(getState().id,value);requestedContext=null;sync();};
  useContext.onclick=()=>acceptContext(requestedContext);keepContext.onclick=()=>{requestedContext=null;sync();};
  whole.onclick=()=>acceptContext(null);
  planActions.classList.add('agent-plan-actions');$('agent-plan').classList.add('primary');$('agent-replan').classList.add('primary');
  const ring=document.createElement('span');ring.className='node-activity-ring';ring.setAttribute('aria-hidden','true');ring.hidden=true;entry.append(ring);
  const progress=document.createElement('span');progress.className='agent-planning-progress';progress.hidden=true;
  const progressText=document.createElement('span');progressText.id='agent-planning-status';progressText.setAttribute('role','status');
  const elapsed=document.createElement('span');elapsed.id='agent-planning-elapsed';elapsed.className='work-elapsed';elapsed.setAttribute('aria-hidden','true');progress.append(progressText,elapsed);planActions.append(progress);
  const cancelPlanButton=document.createElement('button');cancelPlanButton.id='agent-plan-cancel';cancelPlanButton.type='button';cancelPlanButton.textContent='Cancel planning';cancelPlanButton.hidden=true;planActions.append(cancelPlanButton);
  const planClock=createWorkClock(elapsed);
  contextInput.mount(composer,entry,contextDetails);
  const presentation=document.createElement('link');presentation.rel='stylesheet';presentation.href='agent-control.css';document.head.append(presentation);
  const approvalFooter=document.createElement('div');approvalFooter.className='agent-approval-footer';const runActions=$('agent-run-selected').parentElement,approvalHint=panel.querySelector(':scope > .agent-note:last-of-type');
  $('agent-details').before(approvalFooter);approvalFooter.append($('agent-issue'),runActions);
  const accessBody=document.createElement('section');accessBody.className='agent-access-options';const accessTitle=document.createElement('h4');accessTitle.textContent='Read-only source limits';accessBody.append(accessTitle,...[...access.children].filter(n=>n.tagName!=='SUMMARY'));access.remove();contextDetails.append(accessBody,scopeNote,approvalHint);
  const recoveryConnection=document.createElement('button');recoveryConnection.type='button';recoveryConnection.textContent='Check AI connection';recoveryConnection.onclick=()=>$('connection-open').click();$('agent-issue').after(recoveryConnection);
  const diagnose=document.createElement('button');diagnose.type='button';diagnose.textContent='Diagnose failed step';recoveryConnection.after(diagnose);diagnose.onclick=async()=>{if(!session?.failureAttemptId)return;try{const updated=await api.diagnoseFailure(getState().id,session.failureAttemptId);acceptState(updated);sync();}catch(error){fail(error);}};
  new MutationObserver(()=>{if($('agent-context-status').textContent&&/error|failed|cannot|exceed|unavailable/i.test($('agent-context-status').textContent))contextDetails.open=true;}).observe($('agent-context-status'),{childList:true,subtree:true});
  const voice=installGoalVoice({api,getContext:()=>getState()?.id,rememberDraft:value=>goalDrafts.set(getState()?.id,value),onBusy:value=>{voiceBusy=value;sync();}});
  $('agent-goal').addEventListener('input',()=>goalDrafts.set(getState()?.id,$('agent-goal').value));
  const showPanel=open=>{if(!open)voice.cancel();$('agent-panel').hidden=!open;$('agent-open').setAttribute('aria-expanded',String(open));if(open){panel.scrollTop=0;$('agent-goal').focus({preventScroll:true});}else $('agent-open').focus({preventScroll:true});};
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();showPanel(false);}});
  const fail=error=>notify(error);
  const sync=()=>{
    graphView.navigation?.sync();updateGoalCount();
    const current=getState();if(!current)return;
    const route=$('agent-route');
    const context=startingContexts.get(current.id)||null;
    const same=session?.investigationId===current.id&&(session?.startingNode?.nodeId||null)===(context?.nodeId||null);diagnose.hidden=!same||!session?.failureAttemptId;diagnose.disabled=pending||isManualBusy();const status=same?session?.status:null;
    const working=planning?.id===current.id;
    entry.classList.toggle('running',working||voiceBusy);entry.setAttribute('aria-busy',String(working||voiceBusy));ring.hidden=!(working||voiceBusy);
    progress.hidden=!planMessage;if(planError)renderUserError(progressText,planError,{actions:{agent:()=>$('connection-open').click()}});else clearUserError(progressText,planMessage);cancelPlanButton.hidden=!working;cancelPlanButton.disabled=!!planning?.cancelled;
    $('agent-goal').disabled=status==='running'||pending;$('agent-folder').disabled=status==='running'||pending;
    voice.setBlocked(status==='running'||pending);
    contextInput.setLocked(status==='running'||pending);contextInput.setProjectInfo(same?session:null);
    starting.textContent=context?'Starting feature: '+context.title:'Starting context: Whole investigation';whole.hidden=!context;whole.disabled=contextLocked();conflict.hidden=!requestedContext;useContext.disabled=contextLocked();
    if(requestedContext)conflictText.textContent=`Requested starting feature: ${requestedContext.title}. Your existing goal and draft are kept. ${context?'Current starting feature: '+context.title:'The existing goal or route uses the whole investigation.'} Choose the context before planning a new route; an existing route will not be redirected.`;
    target.textContent='Investigating: '+(current.title||'Current investigation');target.title=target.textContent;
    contextSummary.textContent='Limits and details';
    if(same&&!goalDrafts.has(current.id)){$('agent-goal').value=session.goal||'';goalDrafts.set(current.id,$('agent-goal').value);}
    $('agent-folder-name').textContent=folder||session?.projectFolder||'No project folder selected';
    const project=folder||session?.projectFolder;scopeNote.textContent=`Planning sends saved excerpts${contextInput.items().length?` and ${contextInput.items().length} attached context items`:''} through your selected AI connection. Runs stay within saved targets: up to 6 directions, 3 new investigations.${project?` Read-only folder: ${project}.`:''}`;
    $('agent-plan').hidden=!working&&!!same&&status!=='complete'&&status!=='stopped';$('agent-plan').textContent='Plan the route →';$('agent-plan').disabled=voiceBusy||contextInput.busy||pending||isManualBusy()||!current.messages?.length||!!requestedContext||!$('agent-goal').value.trim()||goal.value.length>AGENT_GOAL_LIMIT;
    $('agent-replan').hidden=working||!same||!['paused','approved'].includes(status)||session.planCalls>=2;$('agent-replan').disabled=goal.value.length>AGENT_GOAL_LIMIT||!!requestedContext||voiceBusy||contextInput.busy||pending||isManualBusy();
    $('agent-run-selected').hidden=!same||status!=='proposed';$('agent-run-selected').disabled=!!requestedContext||pending||voiceBusy||contextInput.busy||isManualBusy()||!session?.route?.some(s=>s.status!=='skipped');
    $('agent-selection-tools').hidden=!same||status!=='proposed';
    $('agent-start').textContent=status==='paused'?(session?.aiRecovery?'Resume saved step':'Resume route'):'Agent, take the wheel →';
    $('agent-start').hidden=!same||!['approved','paused'].includes(status);$('agent-start').disabled=!!requestedContext||voiceBusy||contextInput.busy||pending||isManualBusy()||runPending||!session?.route?.some(s=>s.status==='pending')||session?.aiRecovery?.canResume===false||!!session?.failure&&!session?.failureAttemptId||!!session?.failureAttemptId&&(!current.attempts?.find(a=>a.id===session.failureAttemptId)?.recovery?.diagnostic?.canRetry||current.attempts?.find(a=>a.id===session.failureAttemptId)?.recovery?.diagnostic?.used);
    $('agent-pause').hidden=status!=='running';$('agent-stop').hidden=status!=='running';$('agent-return').hidden=status!=='running'||follow;
    renderAgentPlanner(route,same?session:null,current,{pending,onChange:sync,onSource:id=>api.showSource(current.id,id),fail});
    $('agent-selection-count').textContent=same?`${session.route?.filter(s=>s.status!=='skipped').length||0} of ${session.route?.length||0} directions included`:'';
    recoveryConnection.hidden=!same||(!session?.aiRecovery&&!session?.failure)||status!=='paused';
    $('agent-issue').hidden=!same||!session.stopReason;clearUserError($('agent-issue'));$('agent-issue').textContent=[session?.stopReason,session?.failure?.nextAction,session?.aiRecovery?.nextAction,session?.aiRecovery?.retryAt?`Retry after ${new Date(session.aiRecovery.retryAt).toLocaleString()}.`:''].filter(Boolean).join(' ');
    if(same&&status==='paused'&&(session?.failure||session?.aiRecovery)){const cause=session.failure?.explanation||session.aiRecovery?.message||session.stopReason;const canResume=!$('agent-start').disabled;renderUserError($('agent-issue'),new Error(cause),{title:session.stopReason||'This route is paused',message:[session.failure?.nextAction,session.aiRecovery?.nextAction,'Saved goal, route and completed findings remain available.'].filter(Boolean).join(' '),category:session.aiRecovery?.category==='network'?'connection':session.aiRecovery?.category||session.failure?.category,action:{label:canResume?'Resume route':session.failureAttemptId?'Check failed step':'Review agent connection',run:()=>canResume?$('agent-start').click():session.failureAttemptId?diagnose.click():recoveryConnection.click()}});}
    approvalFooter.hidden=!same||!['proposed','approved','paused','running'].includes(status)&&!session?.stopReason;
    const history=$('agent-history');history.replaceChildren();if(same)for(const item of session.history||[]){const p=document.createElement('p');p.textContent=`${item.at} · ${item.event}${item.nodeId?` · ${item.nodeId}`:''}${item.reason?` · ${item.reason}`:''}`;history.append(p);}
    const line=$('agent-status-line');line.hidden=!!planning||!pending&&(!same||!['running','paused','stopped','complete'].includes(status));
    if(pending&&!planning)line.textContent='Agent · Saving route approval.';
    else if(!line.hidden){const active=session.route?.find(s=>s.nodeId===session.currentNode&&s.status==='pending');line.textContent=status==='running'&&active?`Agent · ${active.action==='reveal'?'Showing':'Investigating'} ${active.title}. ${active.why}`:`Agent · ${session.stopReason||status}`;}
  };
  const focus=()=>graphView.navigation?.autoFollow===false?false:follower.update(session,getState()?.id);
  const receive=async payload=>{if(!payload?.session||payload.session.investigationId!==getState()?.id)return;
    if(planning?.cancelled&&payload.session.status==='proposed')return;
    if(session?.updatedAt&&payload.session.updatedAt&&payload.session.updatedAt<session.updatedAt)return;
    const firstActiveNode=session?.status!=='running'||!session?.currentNode;
    updateRevision++;session=payload.session;
    if(runPending&&firstActiveNode&&session.status==='running'&&session.currentNode&&!$('agent-panel').hidden)showPanel(false);
    graphView.runningNode=session.status==='running'?session.currentNode:null;
    if(payload.investigation)acceptState(payload.investigation);
    sync();if(session.status==='running'){graphView.draw();await focus();}
    else{follower.reset();if(runPending){runPending=false;setAgentBusy(false);}graphView.finished?.();}
  };
  const retryTimer=setInterval(()=>{if(session?.status==='running'&&follow)focus();},450);
  window.addEventListener('beforeunload',()=>{clearInterval(retryTimer);planClock.stop();},{once:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&follow)focus();});
  const browsing=()=>{if(session?.status==='running'&&follow){graphView.navigation?.setAutoFollow(false,false);follow=false;follower.pause();sync();}};
  for(const id of ['workspace-canvas','workspace-outline','map-layout','workspace-navigation'])for(const type of ['pointerdown','wheel','keydown'])$(id)?.addEventListener(type,event=>{if(event.isTrusted&&!event.target.closest('#canvas-navigation,#canvas-navigation-options,#canvas-minimap'))browsing();},{capture:true,passive:true});
  api.onAgentUpdate(receive);
  $('agent-open').onclick=()=>showPanel($('agent-panel').hidden);
  $('agent-close').onclick=()=>showPanel(false);
  $('agent-panel').addEventListener('agent-context-busy',()=>sync());
  const cancelPlanning=()=>{const request=planning;if(!request||request.cancelled)return;request.cancelled=true;planMessage='Cancelling planning…';sync();if(request.sent){request.cancellation=api.agentPlanCancel(request.id,request.token).then(accepted=>{if(!accepted){request.cancelled=false;if(planning===request){planMessage='Finishing planning…';sync();}}}).catch(error=>{request.cancelled=false;if(planning===request){planMessage='Could not cancel planning. Still waiting for the planner.';fail(error);sync();}});return request.cancellation;}};
  cancelPlanButton.onclick=cancelPlanning;
  const plan=async replan=>{
    if(requestedContext||voiceBusy||contextInput.busy||pending||planning||isManualBusy()||!$('agent-goal').value.trim())return;
    const id=getState()?.id,request={id,token:crypto.randomUUID(),sent:false,cancelled:false};planning=request;pending=true;planError=null;planMessage='Planning route…';notify('');planClock.start();ring.style.animationDelay='0s';sync();
    try{
      await contextInput.flushGoal();if(request.cancelled||getState()?.id!==id)return;
      request.sent=true;const result=await api.agentPlan(id,$('agent-goal').value,replan?session?.projectFolder:folder,replan,request.token,startingContexts.get(id)?.nodeId||null);
      await request.cancellation;
      if(request.cancelled||getState()?.id!==id)return;
      session=result;folder=session.projectFolder;contextInput.showSnapshot(session.context);planMessage='Route ready. Review directions below.';panel.scrollTop=0;showPanel(true);
    }catch(error){await request.cancellation;if(getState()?.id===id&&!request.cancelled){const info=explainFailure({reason:error.message});planError=error;planMessage=info.explanation+' '+info.nextAction;notify(error);try{const updated=await api.open(id);if(getState()?.id===id){acceptState(updated);graphView.openRoot();}}catch{}}}
    finally{if(planning===request){planClock.stop();planning=null;pending=false;if(getState()?.id===id&&request.cancelled)planMessage='Planning cancelled. Goal and context kept.';sync();}}
  };
  $('agent-plan').onclick=()=>plan(false);$('agent-replan').onclick=()=>plan(true);
  const approve=async()=>{const id=getState()?.id;if(requestedContext||!session||session.status!=='proposed'||(session.startingNode?.nodeId||null)!==(startingContexts.get(id)?.nodeId||null)||pending||voiceBusy||contextInput.busy)return false;pending=true;sync();try{const ids=session.route.map(s=>s.id),skipped=session.route.filter(s=>s.status==='skipped').map(s=>s.id);const approved=await api.agentApprove(id,ids,skipped);if(getState()?.id!==id)return false;session=approved;return true;}catch(error){fail(error);return false;}finally{pending=false;sync();}};
  const start=async()=>{if(session?.failureAttemptId&&!confirm('Retry the failed step once? This may repeat inspection work and use your AI service. Saved evidence is retained.'))return;if(requestedContext||(session?.startingNode?.nodeId||null)!==(startingContexts.get(getState()?.id)?.nodeId||null)||runPending||pending||voiceBusy||contextInput.busy||isManualBusy())return;const id=getState()?.id,revision=updateRevision;runPending=true;follow=true;graphView.navigation?.setAutoFollow(true,false);follower.resume();setAgentBusy(true);sync();try{const result=await api.agentStart(id);if(getState()?.id===id&&updateRevision===revision)session=result;}catch(error){fail(error);}finally{runPending=false;setAgentBusy(false);sync();}};
  $('agent-run-selected').onclick=async()=>{if(!session?.route.some(s=>s.status!=='skipped'))return;if(await approve())await start();};
  $('agent-start').onclick=start;
  $('agent-pause').onclick=()=>api.agentPause().catch(fail);
  $('agent-stop').onclick=()=>api.agentStop().catch(fail);
  const returnToActive=()=>{if(session?.status!=='running'||!session.currentNode)return false;graphView.navigation?.setAutoFollow(true,false);follow=true;follower.resume();const result=focus();sync();return result;};
  $('agent-return').onclick=returnToActive;
  const loadState=async id=>{if(planning&&planning.id!==id)cancelPlanning();loadedId=id;requestedContext=null;voice.cancel();planMessage='';if(!planning)planClock.clear();$('agent-goal').value=goalDrafts.get(id)??'';session=null;folder=null;follow=true;follower.resume();sync();try{const loaded=await api.agentStatus(id);if(getState()?.id===id){session=loaded;if(!startingContexts.has(id))startingContexts.set(id,loaded?.startingNode||null);folder=loaded?.projectFolder||null;const value=await contextInput.load(id,{goalDraft:goalDrafts.get(id),savedGoal:loaded?.goal||'',projectFolder:loaded?.projectFolder||null});if(getState()?.id!==id)return;if(value!==undefined){folder=contextInput.projectFolder;goalDrafts.set(id,value);const current=contextInput.items().map(i=>i.id).sort(),approved=(session?.context?.items||[]).map(i=>i.id).sort();if(session&&(value!==session.goal||folder!==(session.projectFolder||null)||JSON.stringify(current)!==JSON.stringify(approved)))session=null;}sync();}}catch(error){fail(error);}};
  const load=id=>(loadPromise=loadState(id));
  const openFromFeature=async({investigationId,nodeId})=>{
    if(getState()?.id!==investigationId)return;
    if(loadedId!==investigationId)await load(investigationId);else await loadPromise;
    if(getState()?.id!==investigationId)return;
    const record=graphView.records.find(r=>r.id===nodeId);if(!record){notify('This starting feature is no longer available.');return;}
    const next={nodeId:record.id,name:record.row.name,title:record.title},at=startingContexts.get(investigationId);
    if(at?.nodeId!==nodeId){if(at||session||$('agent-goal').value.trim()||contextLocked())requestedContext=next;else startingContexts.set(investigationId,next);}
    sync();showPanel(true);
  };
  return {openFromFeature,returnToActive,setFollowing(value){follow=!!value;if(follow){follower.resume();focus();}else follower.pause();sync();},get activeNodeId(){return session?.status==='running'?session.currentNode:null;},get running(){return session?.status==='running';},activity:text=>{if(session?.status==='running'){graphView.runPhase=text;graphView.runProgress=text;document.querySelectorAll('.growing-node.running .node-run-phase').forEach(n=>{n.textContent=text;n.title=text;});}},refresh:()=>{if(getState()?.id!==loadedId)load(getState()?.id);else sync();},browsing,load};
}


