// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {createAgentFollow} from './agent-follow.js';
export const ACTIVE_NODE_SHORTCUT='Ctrl+Shift+F';
export function isShortcutContextBlocked(event){
  if(event.defaultPrevented||event.isComposing||event.keyCode===229)return true;
  const path=event.composedPath?.()||[event.target];
  return path.some(node=>node?.isContentEditable||node?.closest?.('input,textarea,select,[role="textbox"],dialog[open]'));
}
export function isActiveNodeShortcut(event){
  return !isShortcutContextBlocked(event)&&event.ctrlKey&&event.shiftKey&&!event.altKey&&!event.metaKey&&!event.getModifierState?.('AltGraph')&&event.key?.toLowerCase()==='f';
}
// Agent returns use its explicit Return control. Manual returns use the same
// successful-focus/retry controller, only for this user-requested return.
export function installActiveNodeReturn({view,getActive,returnToAgent,target=document,schedule=setInterval,unschedule=clearInterval}){
  const follower=createAgentFollow(view);let requested=null;
  const cancel=()=>{if(requested){requested=null;follower.pause();}};
  const tick=async()=>{
    if(!requested)return false;
    const active=getActive();
    if(active?.mode!=='manual'||active.investigationId!==requested.investigationId||active.nodeId!==requested.nodeId){cancel();return false;}
    const request=requested,done=await follower.update({status:'running',investigationId:active.investigationId,currentNode:active.nodeId},active.investigationId);
    if(done&&requested===request)requested=null;
    return done;
  };
  const returnToActive=()=>{
    const active=getActive();if(!active?.nodeId)return false;
    if(active.mode==='agent'){cancel();return returnToAgent();}
    requested={investigationId:active.investigationId,nodeId:active.nodeId};follower.resume();return tick();
  };
  const keydown=event=>{
    if(!isActiveNodeShortcut(event))return;
    // Consume even with no active run: never fall through to the canvas Fit key.
    event.preventDefault();event.stopImmediatePropagation();
    if(!event.repeat)returnToActive();
  };
  const interaction=event=>{if(event.isTrusted)cancel();};
  const roots=['workspace-canvas','workspace-outline','map-layout','workspace-navigation'].map(id=>target.getElementById?.(id)).filter(Boolean);
  const unregister=view.commands?.register({id:'explore.return-active',label:'Return to active investigation',group:'Explore',bindings:[{key:'f',ctrl:true,shift:true}],enabled:()=>!!getActive()?.nodeId,run:returnToActive});
  if(!unregister)target.addEventListener('keydown',keydown,{capture:true});
  for(const root of roots)for(const type of ['pointerdown','wheel','keydown'])root.addEventListener(type,interaction,{capture:true,passive:true});
  const timer=schedule(tick,450);
  const button=target.getElementById?.('agent-return');if(button){button.title=`Return to the active investigation node (${ACTIVE_NODE_SHORTCUT}). Resume following the agent.`;button.setAttribute('aria-keyshortcuts','Control+Shift+F');}
  const canvas=target.getElementById?.('workspace-canvas');canvas?.setAttribute('aria-keyshortcuts','Control+Shift+F');
  const dispose=()=>{unregister?.();unschedule(timer);cancel();target.removeEventListener('keydown',keydown,true);for(const root of roots)for(const type of ['pointerdown','wheel','keydown'])root.removeEventListener(type,interaction,true);};
  return {returnToActive,tick,cancelPending:cancel,dispose};
}
