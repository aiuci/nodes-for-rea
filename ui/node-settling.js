// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {themeMotion} from './theme-motion.js';
// Finite interaction feedback on a decorative shell. Text, hit targets,
// saved coordinates and wire endpoints never move during the settle.
export function cancelNodeSettling(view){for(const animation of view.nodeSettles||[])animation.cancel();view.nodeSettles?.clear();}
export function settleNode(view,element,{delay=0}={}){
  if(!element?.isConnected||themeMotion().scale===0)return;
  for(const shell of element.querySelectorAll('.node-settle-shell')){for(const animation of shell.getAnimations())animation.cancel();shell.remove();}
  const shell=document.createElement('span');shell.className='node-settle-shell';shell.dataset.nodeId=element.dataset.nodeId;shell.setAttribute('aria-hidden','true');element.append(shell);
  const motion=themeMotion();
  const animation=shell.animate([{transform:`translateY(${2*motion.lift}px) scale(.996)`,opacity:0},{transform:`translateY(${-motion.lift}px) scale(${1+.008*motion.lift})`,opacity:.65,offset:.45},{transform:'translateY(.35px) scale(1.002)',opacity:.3,offset:.72},{transform:'none',opacity:0}],{duration:motion.settle,delay,fill:'backwards',easing:motion.easing});
  animation.id='rea-node-settle';view.nodeSettles??=new Set();view.nodeSettles.add(animation);animation.finished.catch(()=>{}).finally(()=>{view.nodeSettles.delete(animation);shell.remove();});
}
export function settleAppearingNodes(view,previous){
  if(!previous.size)return; // Opening saved work is quiet; growth owns its staged reveal.
  const pending=new Set((view.ws.growth||[]).filter(r=>view.growthPending?.has(r.nodeId)).flatMap(r=>[r.nodeId,...(r.addedIds||[])]));
  const viewport=document.getElementById('workspace-canvas').getBoundingClientRect();let budget=8;
  for(const card of document.querySelectorAll('#map-nodes > .growing-node')){
    if(previous.has(card.dataset.nodeId)||pending.has(card.dataset.nodeId))continue;const box=card.getBoundingClientRect();
    if(box.right<viewport.left||box.left>viewport.right||box.bottom<viewport.top||box.top>viewport.bottom)continue;
    settleNode(view,card);if(--budget===0)break;
  }
}
