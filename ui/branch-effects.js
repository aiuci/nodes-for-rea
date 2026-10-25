// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {themeMotion} from './theme-motion.js';
// Finite reveal feedback only: one sampled path, at most seven decorative
// elements, compositor transform/opacity, no timer loop or particle engine.
const reduced=()=>themeMotion().scale===0;
export function cancelBranchEffects(view){for(const [animation,element]of view.branchEffects||[]){animation.cancel();element.remove();}view.branchEffects?.clear();}
function animate(view,element,frames,options){
  view.branchEffects??=new Map();if(view.branchEffects.size>=7){element.remove();return;}
  const animation=element.animate(frames,{fill:'backwards',iterations:1,...options});animation.id='rea-growth-feedback';view.branchEffects.set(animation,element);
  animation.finished.catch(()=>{}).finally(()=>{view.branchEffects.delete(animation);element.remove();});
}
export function travelBranchLight(view,wire,{quiet=false}={}){
  cancelBranchEffects(view);if(reduced()||document.hidden||view.ws.wiresVisible===false||!wire?.isConnected)return;
  const length=wire.getTotalLength();if(!Number.isFinite(length)||length<1)return;
  const radius=2/Math.max(.025,view.camera.scale||1),dot=document.createElement('span');dot.className='branch-travel-light';dot.setAttribute('aria-hidden','true');dot.style.setProperty('--topic',view.color(wire.dataset.to));dot.style.width=dot.style.height=`${radius*2}px`;document.getElementById('map-scene').append(dot);
  const frames=Array.from({length:33},(_,i)=>{const p=wire.getPointAtLength(length*i/32);return {offset:i/32,transform:`translate3d(${p.x-radius}px,${p.y-radius}px,0)`,opacity:i===0||i===32?0:quiet ? .35 : .8};});
  animate(view,dot,frames,{duration:themeMotion().travel,easing:'linear'});
}
export function landBranchGlow(view,node,{delay=0,primary=false,quiet=false}={}){
  if(reduced()||document.hidden||!node?.isConnected||view.branchEffects?.size>=7)return;
  const shell=document.createElement('span');shell.className='branch-landing-glow';shell.setAttribute('aria-hidden','true');node.append(shell);
  const motion=themeMotion(),peak=(quiet ? .2 : primary ? .42 : .24)*motion.glow/.25,scale=quiet?1:1+(primary?.09:.045)*motion.lift;
  animate(view,shell,[{opacity:0,transform:'scale(1)'},{opacity:peak,transform:'scale(1.01)',offset:.2},{opacity:0,transform:`scale(${scale})`}],{duration:quiet?220*motion.scale:motion.landing,delay:delay+80*motion.scale,easing:motion.easing});
}
