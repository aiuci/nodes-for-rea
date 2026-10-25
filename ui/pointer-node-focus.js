// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {executionFocusCamera} from '../lib/execution-focus.mjs';
import {isShortcutContextBlocked} from './active-node-return.js';
export function isPointerNodeShortcut(event){
  return !isShortcutContextBlocked(event)&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&!event.metaKey&&!event.getModifierState?.('AltGraph')&&event.key?.toLowerCase()==='z';
}
const inside=(point,rect)=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=rect.left&&point.x<rect.right&&point.y>=rect.top&&point.y<rect.bottom;
const intersection=(a,b)=>({left:Math.max(a.left,b.left),right:Math.min(a.right,b.right),top:Math.max(a.top,b.top),bottom:Math.min(a.bottom,b.bottom)});
// All arguments are in viewport/client coordinates, already transformed by the DOM.
export function nearestVisibleNode(point,nodes,canvas){
  if(!inside(point,canvas))return null;
  let nearest=null,distance=Infinity,centerDistance=Infinity;
  for(const node of nodes){
    if(node.visible===false)continue;const r=intersection(node.rect,canvas);if(r.right<=r.left||r.bottom<=r.top)continue;
    const dx=Math.max(r.left-point.x,0,point.x-r.right),dy=Math.max(r.top-point.y,0,point.y-r.bottom),d=dx*dx+dy*dy;
    const c=(point.x-(r.left+r.right)/2)**2+(point.y-(r.top+r.bottom)/2)**2;
    if(d<distance||d===distance&&c<centerDistance){nearest=node.id;distance=d;centerDistance=c;}
  }
  return nearest;
}
export function installPointerNodeFocus({view,onBrowse=()=>{},target=document,host=window,enqueue=queueMicrotask}){
  const canvas=target.getElementById('workspace-canvas');let pointer=null;
  const excluded=element=>element?.closest?.('#node-panel-frame,#node-workbench,.node-context-menu,.workspace-dialog,#workspace-list');
  const canvasPoint=(point)=>{const element=target.elementFromPoint(point.x,point.y);return canvas.contains(element)&&!excluded(element);};
  const clear=()=>{pointer=null;};
  const track=event=>{
    const point={x:event.clientX,y:event.clientY,buttons:event.buttons||0,context:view.state?.id};
    pointer=canvas.contains(event.target)&&!excluded(event.target)&&inside(point,canvas.getBoundingClientRect())?point:null;
  };
  const cards=box=>[...canvas.querySelectorAll('#map-nodes > .growing-node')].flatMap(card=>{
    const id=card.dataset.nodeId||card.dataset.featureId;if(!view.map?.nodes.has(id)||card.hidden||card.inert)return [];
    const style=host.getComputedStyle(card),rect=card.getBoundingClientRect();if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||!rect.width||!rect.height)return [];
    const r=intersection(rect,box);if(r.right<=r.left||r.bottom<=r.top)return [];
    const cx=(r.left+r.right)/2,cy=(r.top+r.bottom)/2;
    const visible=[[cx,cy],[r.left+2,cy],[r.right-2,cy],[cx,r.top+2],[cx,r.bottom-2]].some(([x,y])=>target.elementFromPoint(x,y)?.closest?.('.growing-node')===card);
    return visible?[{id,rect}]:[];
  });
  const nearest=()=>{
    if(!pointer||pointer.buttons||pointer.context!==view.state?.id||view.legacyMode||!canvasPoint(pointer))return null;
    const box=canvas.getBoundingClientRect(),nodes=cards(box),hovered=target.elementFromPoint(pointer.x,pointer.y)?.closest?.('.growing-node'),hit=hovered?.dataset.nodeId||hovered?.dataset.featureId;
    return nodes.some(node=>node.id===hit)?hit:nearestVisibleNode(pointer,nodes,box);
  };
  const focusNearest=async()=>{
    const id=nearest();if(!id)return false;
    onBrowse();view.cancelFocusMotion();view.radialMenu?.close(false,true);view.ws.reader=null;view.ws.inspected=id==='core'?'':id;
    view.draw();view.actions.inspected?.(view.selectedRecord(),true);view.persist();
    const camera=executionFocusCamera(view.points.get(id),view.mapArea(),view.camera.scale);
    return camera?view.animateCamera(camera):false;
  };
  const keydown=event=>{if(!isPointerNodeShortcut(event))return;event.preventDefault();if(event.repeat||!nearest()){event.stopImmediatePropagation();return;}enqueue(()=>{focusNearest();});};
  const visibility=()=>{if(target.hidden)clear();};
  for(const type of ['pointermove','pointerdown','pointerup'])target.addEventListener(type,track,{capture:true,passive:true});
  const unregister=view.commands?.register({id:'explore.pointer-node',label:'Zoom to pointer node',group:'Explore',bindings:[{key:'z'}],enabled:()=>!!nearest(),run:()=>enqueue(()=>focusNearest())});
  if(!unregister)target.addEventListener('keydown',keydown,{capture:true});canvas.addEventListener('pointerleave',clear);host.addEventListener('blur',clear);host.addEventListener('resize',clear);target.addEventListener('visibilitychange',visibility);
  const help='Z: zoom to the visible node nearest the pointer. F: fit map. Ctrl+Shift+F: return to active investigation.';
  const zoom=target.getElementById('workspace-zoom');if(zoom&&!view.commands)zoom.title=help;
  canvas.setAttribute('aria-keyshortcuts',[canvas.getAttribute('aria-keyshortcuts'),'Z'].filter(Boolean).join(' '));canvas.setAttribute('aria-description',help);
  const dispose=()=>{unregister?.();clear();for(const type of ['pointermove','pointerdown','pointerup'])target.removeEventListener(type,track,true);target.removeEventListener('keydown',keydown,true);canvas.removeEventListener('pointerleave',clear);host.removeEventListener('blur',clear);host.removeEventListener('resize',clear);target.removeEventListener('visibilitychange',visibility);};
  return {focusNearest,nearest,dispose};
}
