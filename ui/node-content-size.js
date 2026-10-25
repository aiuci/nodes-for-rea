// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {fitContentRectangles} from '../lib/node-content-layout.mjs';

// Run before wires/scene framing, and again when a live phase changes height.
export function sizeNodeContent(view){
  const cards=[...document.querySelectorAll('#map-nodes>.growing-node')],sizes={};
  // Batch metadata writes, then all DOM measurements, then style writes. An
  // outline write between each node's reads forced O(nodes) style flushes.
  const measured=cards.map(card=>{
    const id=card.dataset.nodeId,open=card.querySelector('.growing-node-open'),progress=card.querySelector('.node-run-status');
    const status=open.querySelector('small');open.dataset.moveHint??=open.getAttribute('aria-description')||'';
    open.setAttribute('aria-description',[open.dataset.nodeStatus,status&&status.textContent!==open.dataset.nodeStatus?status.textContent:'',open.dataset.moveHint].filter(Boolean).join('. '));
    return {card,id,open,progress};
  });
  for(const row of measured){
    const {card,id,open,progress}=row,width=view.ws.mapPositions[id].width;
    sizes[id]={width,height:Math.max(66,Math.ceil(Math.max(24,open.offsetHeight)+(progress?progress.offsetHeight+4:0)+18))};
    row.outline=getComputedStyle(card).borderTopColor;
  }
  for(const {card,outline}of measured)card.style.setProperty('--node-outline',outline);
  const locked=[view.map.root,...(view.ws.placedNodes?.[view.ws.layout]||[]),...(view.ws.reader?Object.keys(sizes):[])];
  const result=fitContentRectangles(view.ws.mapPositions,sizes,{locked,manual:view.ws.layout==='manual'});
  let changed=false;
  for(const card of cards){
    const id=card.dataset.nodeId,p=result.positions[id],old=view.ws.mapPositions[id];
    changed||=p.height!==old.height||p.x!==old.x||p.y!==old.y;
    card.style.height=`${p.height}px`;card.style.left=`${p.x}px`;card.style.top=`${p.y}px`;
    view.points.set(id,p);
  }
  view.ws.mapPositions=result.positions;view.ws.layouts[view.ws.layout].positions=result.positions;
  const values=[...view.points.values()];view.sceneBounds={minX:Math.min(0,...values.map(p=>p.x)),minY:Math.min(0,...values.map(p=>p.y)),maxX:Math.max(250,...values.map(p=>p.x+p.width)),maxY:Math.max(150,...values.map(p=>p.y+p.height))};
  if(view.ws.layout==='orbit'){
    const root=view.points.get(view.map.root);
    if(root){const x=root.x+root.width/2,y=root.y+root.height/2,r=Math.max(150,...values.map(p=>Math.hypot(p.x+p.width/2-x,p.y+p.height/2-y)))+30;view.sceneBounds={minX:Math.min(view.sceneBounds.minX,x-r),minY:Math.min(view.sceneBounds.minY,y-r),maxX:Math.max(view.sceneBounds.maxX,x+r),maxY:Math.max(view.sceneBounds.maxY,y+r)};}
  }
  let notice=document.getElementById('node-content-spacing');
  if(result.constrained.length){
    if(!notice){notice=document.createElement('span');notice.id='node-content-spacing';notice.setAttribute('role','status');document.getElementById('workspace-navigation').append(notice);}
    notice.textContent='Kept positions limit title spacing. Move overlapping nodes or allow tidying.';
  }else notice?.remove();
  return changed;
}

export function observeNodeContent(view,update){
  view.nodeContentObserver?.disconnect();
  view.nodeContentObserver=new ResizeObserver(()=>{
    if(sizeNodeContent(view)){update();view.connectWorkbench();view.persist();}
  });
  for(const label of document.querySelectorAll('#map-nodes .node-label,#map-nodes .node-run-status'))view.nodeContentObserver.observe(label);
}
