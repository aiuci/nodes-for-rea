// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {cleanOutlineWidth,displayedOutlineWidth,outlineLimits} from '../lib/outline-layout.mjs';
export function installOutlineLayout(view){
  const surface=document.getElementById('workspace-surface'),handle=document.createElement('div');handle.id='outline-resize';handle.hidden=true;handle.role='separator';handle.tabIndex=0;handle.setAttribute('aria-label','Outline width');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-controls','workspace-outline');handle.title='Drag left or right to resize Outline';surface.append(handle);let drag=null;
  function apply(){handle.hidden=!view.ws.outline||view.legacyMode;const width=displayedOutlineWidth(view.ws.outlineWidth,surface.clientWidth),limits=outlineLimits(surface.clientWidth);surface.style.setProperty('--outline-width',`${width}px`);handle.style.left=`${width-6}px`;handle.setAttribute('aria-valuenow',String(width));handle.setAttribute('aria-valuemin',String(Math.round(limits.min)));handle.setAttribute('aria-valuemax',String(Math.round(limits.max)));}
  function change(width){const {min,max}=outlineLimits(surface.clientWidth);view.ws.outlineWidth=cleanOutlineWidth(Math.max(min,Math.min(max,width)));apply();}
  handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();drag={x:event.clientX,width:displayedOutlineWidth(view.ws.outlineWidth,surface.clientWidth)};handle.setPointerCapture(event.pointerId);surface.classList.add('outline-resizing');};
  handle.onpointermove=event=>{if(!drag)return;event.preventDefault();event.stopPropagation();change(drag.width+event.clientX-drag.x);};
  handle.onpointerup=handle.onpointercancel=()=>{if(!drag)return;drag=null;surface.classList.remove('outline-resizing');view.persist();};
  handle.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const limits=outlineLimits(surface.clientWidth),now=displayedOutlineWidth(view.ws.outlineWidth,surface.clientWidth),step=event.shiftKey?60:20;change(event.key==='Home'?limits.min:event.key==='End'?limits.max:now+(event.key==='ArrowRight'?step:-step));view.persist();};
  return {apply};
}
