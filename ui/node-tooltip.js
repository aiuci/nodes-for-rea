// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
let popup,owner,timer;
const wired=new WeakSet();
export function hideNodeTooltip(){clearTimeout(timer);if(popup)popup.hidden=true;owner?.removeAttribute('aria-describedby');owner=null;}
function surface(){
  if(popup)return popup;
  popup=document.createElement('div');popup.id='node-label-tooltip';popup.className='node-label-tooltip';popup.setAttribute('role','tooltip');popup.hidden=true;document.body.append(popup);
  popup.onpointerenter=()=>clearTimeout(timer);popup.onpointerleave=()=>{if(document.activeElement!==owner)hideNodeTooltip();};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&owner){hideNodeTooltip();event.stopPropagation();}},{capture:true});
  document.addEventListener('pointerdown',event=>{if(owner&&!owner.contains(event.target)&&!popup.contains(event.target))hideNodeTooltip();},{capture:true});
  window.addEventListener('resize',hideNodeTooltip);document.getElementById('workspace-canvas')?.addEventListener('wheel',hideNodeTooltip,{passive:true});
  return popup;
}
export function wireNodeTooltip(trigger,content,kind){
  if(wired.has(trigger))return;wired.add(trigger);
  const show=()=>{
    const text=(trigger.commandHoverContent||content)();if(!text){hideNodeTooltip();return;}
    const tip=surface();hideNodeTooltip();owner=trigger;tip.textContent=text;tip.dataset.kind=kind;tip.dataset.passive=String(!!trigger.closest('#canvas-navigation'));tip.hidden=false;trigger.setAttribute('aria-describedby',tip.id);
    const box=trigger.getBoundingClientRect(),dock=trigger.closest('#canvas-navigation')?.closest('#canvas-control-dock,.magnetic-group')?.getBoundingClientRect(),vertical=dock||box;tip.style.maxWidth=`${Math.min(420,innerWidth-24)}px`;
    tip.style.left=`${Math.max(12,Math.min(box.left,innerWidth-tip.offsetWidth-12))}px`;
    tip.style.top=`${Math.max(12,Math.min(innerHeight-tip.offsetHeight-12,vertical.top>=tip.offsetHeight+12?vertical.top-tip.offsetHeight-7:vertical.bottom+7))}px`;
  };
  trigger.addEventListener('pointerenter',show);trigger.addEventListener('focus',show);
  trigger.addEventListener('pointerleave',()=>{if(document.activeElement!==trigger)timer=setTimeout(hideNodeTooltip,100);});
  trigger.addEventListener('blur',hideNodeTooltip);
}
