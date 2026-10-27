// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {createAgentFollow} from './agent-follow.js';
import {themeMotion} from './theme-motion.js';

// One current target, one timer and one cancellable attempt. Redraws are not
// navigation requests. The injected clock makes the actual idle boundary testable.
export function createAgentIdleController({read,focus,cancel,now=()=>performance.now(),schedule=setTimeout,unschedule=clearTimeout,onChange=()=>{},idleMs=6000}){
  let key=null,timer=null,token=0,moving=false,settled=null,blocked=true,held=false,disposed=false,idleAt=now();
  const clear=()=>{if(timer!==null)unschedule(timer);timer=null;};
  const interrupt=()=>{clear();token++;if(moving)cancel();moving=false;};
  const notify=()=>onChange();
  const update=()=>{
    if(disposed)return;
    const previous=JSON.stringify([key,blocked,held,moving,settled]),changed=()=>{if(previous!==JSON.stringify([key,blocked,held,moving,settled]))notify();};
    const state=read(),next=state.key||null;
    if(next!==key){interrupt();key=next;settled=null;if(!next){held=false;idleAt=now();}}
    const stop=!key||!state.eligible||held;
    if(stop){if(!blocked||moving||timer!==null)interrupt();blocked=true;changed();return;}
    if(blocked){idleAt=now();blocked=false;}
    if(moving||settled===key||timer!==null){changed();return;}
    const delay=Math.max(0,idleMs-(now()-idleAt));
    timer=schedule(async()=>{
      timer=null;const current=read();
      if(disposed||held||current.key!==key||!current.eligible){update();return;}
      const attempt=++token,target=key;moving=true;notify();
      let success=false;
      try{success=await focus(current.nodeId);}catch{/* Focus remains retryable. */}
      if(attempt!==token||disposed)return;
      moving=false;if(success&&read().key===target)settled=target;
      // Missing/unframeable nodes may become available after the next draw.
      if(!success)idleAt=now()-idleMs+500;
      notify();update();
    },delay);
    changed();
  };
  return {update,browse(){interrupt();settled=null;idleAt=now();update();notify();},cancel(){interrupt();held=true;notify();},resume(){held=false;settled=null;idleAt=now();update();notify();},destroy(){disposed=true;interrupt();},get moving(){return moving;},get suspended(){return blocked||held||settled!==key;}};
}

const attentionSelector='#agent-panel,#node-panel-frame,#node-workbench';
const editable='input,textarea,select,[contenteditable="true"],[role="textbox"]';
const voice='[data-dictation-state="installing"],[data-dictation-state="preparing"],[data-dictation-state="listening"],[data-dictation-state="transcribing"],#agent-mic[data-state="installing"],#agent-mic[data-state="preparing"],#agent-mic[data-state="listening"],#agent-mic[data-state="transcribing"]';
const visible=node=>!!node&&!node.closest('[hidden],dialog:not([open])')&&node.getClientRects().length>0;
export function installAgentIdleReturn({view,getSession,getInvestigationId,onStateChange=()=>{},target=document,host=window,idleMs=6000,duration=4000}){
  const media=host.matchMedia('(prefers-reduced-motion: reduce)'),latches=new Set(),removers=[],panels=new Map();
  let composing=false,pointer=false,destroyed=false,windowFocused=target.hasFocus(),lastScope=getInvestigationId(),lastReader=view.ws?.reader?.nodeId,lastActive=null,explicitToken=0,explicitMotion=false;
  const follower=createAgentFollow(view,{preserveSelection:true,growth:false,focusOptions:{idleReturn:true,duration}});
  const session=()=>{const s=getSession();return s?.status==='running'&&s.investigationId===getInvestigationId()?s:null;};
  const activeKey=()=>{const s=session();return s?.currentNode?`${s.investigationId}:${s.currentNode}`:null;};
  const blocked=()=>{
    for(const area of [...latches])if(!visible(target.querySelector(area)))latches.delete(area);
    return !!(latches.size||composing||pointer||target.hidden||!windowFocused||!target.hasFocus()||media.matches||themeMotion().scale===0||view.cameraLocked||view.navigation?.autoFollow===false||view.legacyMode||view.ws?.list||visible(target.activeElement?.closest?.(editable))||target.querySelector('dialog[open],.node-context-menu,.radial-action-menu,.panel-dragging,.outline-resizing')||[...target.querySelectorAll(voice)].some(visible));
  };
  const controller=createAgentIdleController({read:()=>({key:activeKey(),nodeId:session()?.currentNode,eligible:!explicitMotion&&!blocked()}),focus:()=>follower.update(session(),getInvestigationId()),cancel:()=>follower.reset(),onChange:onStateChange,idleMs});
  const listen=(node,type,handler,options)=>{node?.addEventListener(type,handler,options);removers.push(()=>node?.removeEventListener(type,handler,options));};
  const update=()=>{const scope=getInvestigationId();if(scope!==lastScope){lastScope=scope;latches.clear();panels.clear();composing=false;pointer=false;lastReader=null;follower.reset();}const active=activeKey();if(active!==lastActive){lastActive=active;explicitToken++;explicitMotion=false;follower.reset();}if(session())view.growthRun=null;for(const area of ['#agent-panel','#node-panel-frame']){const open=visible(target.querySelector(area));if(open&&!panels.get(area))latches.add(area);panels.set(area,open);}const reader=view.ws?.reader?.nodeId;if(reader&&reader!==lastReader)latches.add('#node-panel-frame');lastReader=reader;if(explicitMotion&&blocked()){explicitToken++;explicitMotion=false;view.cancelFocusMotion();}controller.update();};
  const browse=()=>{explicitToken++;explicitMotion=false;latches.clear();follower.reset();view.growthRun=null;controller.browse();};
  const attention=event=>{const area=event.target?.closest?.(attentionSelector);if(area){latches.add(area.id==='agent-panel'?'#agent-panel':'#node-panel-frame');controller.update();}};
  const mapGesture=event=>{
    if(!event.isTrusted||event.isComposing||event.target?.closest?.(attentionSelector+',dialog,.node-context-menu,.radial-action-menu,'+editable))return;
    if(event.type==='keydown'&&!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','=','0','f','F','Home','End','PageUp','PageDown','Enter',' '].includes(event.key))return;
    if(event.type==='pointerdown')pointer=true;
    browse();
  };
  for(const id of ['workspace-canvas','workspace-outline','outline-resize','map-layout','workspace-navigation','canvas-navigation','canvas-minimap'])for(const type of ['pointerdown','wheel','keydown'])listen(target.getElementById(id),type,mapGesture,{capture:true,passive:true});
  for(const type of ['focusin','pointerdown','wheel','scroll','keydown','selectstart'])listen(target,type,attention,{capture:true,passive:true});
  listen(target,'compositionstart',event=>{composing=true;attention(event);update();},true);
  listen(target,'compositionend',()=>{composing=false;update();},true);
  for(const type of ['pointerup','pointercancel'])listen(target,type,()=>{if(pointer){pointer=false;controller.browse();}},true);
  listen(target,'rea-dictation-start',()=>{latches.add('#agent-panel');update();});
  for(const type of ['visibilitychange','nodes-navigation-change'])listen(target,type,update);
  for(const type of ['blur','focus','resize'])listen(host,type,()=>{if(type==='blur'){windowFocused=false;pointer=false;if(session())view.cancelFocusMotion();}else if(type==='focus')windowFocused=true;update();});
  listen(media,'change',update);
  // Guard changes (including a hover menu or dictation preparing before a key)
  // cancel on the mutation turn, rather than waiting for the idle timer.
  const observer=new MutationObserver(update);observer.observe(target.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','open','class','data-state','data-dictation-state']});
  view.navigation?.setTemporaryBrowsing(()=>!!session());
  const poll=host.setInterval(update,150);
  const destroy=()=>{if(destroyed)return;destroyed=true;explicitToken++;explicitMotion=false;controller.destroy();follower.pause();observer.disconnect();host.clearInterval(poll);for(const remove of removers)remove();view.navigation?.setTemporaryBrowsing(null);};
  listen(host,'pagehide',destroy,{once:true});update();
  return {update,browse,cancel(){explicitToken++;explicitMotion=false;controller.cancel();follower.reset();view.growthRun=null;},resume(){follower.resume();controller.resume();},destroy,get suspended(){return controller.suspended;},get moving(){return controller.moving||explicitMotion;},async returnToActive(){
    if(!session()?.currentNode||target.hidden||!target.hasFocus()||view.cameraLocked)return false;
    update();latches.clear();composing=false;view.navigation?.setAutoFollow(true,false);follower.reset();explicitMotion=true;controller.update();
    // Explicit Return keeps the established short/static camera behavior.
    const s=session(),request=++explicitToken;
    try{return await view.focusExecutionNode(s.currentNode,{idleReturn:true,duration:media.matches?0:280});}
    finally{if(request===explicitToken)explicitMotion=false;controller.update();}
  }};
}
