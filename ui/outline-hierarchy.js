// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// A single decorative layer follows actual visible parent/child relationships.
// Measure only after tree/reflow changes, never on scrolling or camera movement.
import {outlinePresentation} from './outline-appearance.js';
const svg=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
export function refreshOutlineHierarchy(view){
  const body=document.querySelector('#workspace-outline .outline-tree'),layer=body?.querySelector('.outline-hierarchy');
  if(!layer||!body.offsetWidth)return;
  const presentation=outlinePresentation(view),color=id=>presentation.color(id);body.dataset.outlineTreatment=presentation.mode;
  const rows=[...body.querySelectorAll('.outline-row')],levels=Math.max(1,...rows.map(row=>Number(row.dataset.outlineDepth)));
  const step=`${Math.min(14,Math.max(3,(body.clientWidth-180)/levels))}px`;
  if(body.style.getPropertyValue('--outline-step')!==step)body.style.setProperty('--outline-step',step);
  const bounds=body.getBoundingClientRect(),nodes=new Map(),stack=[],children=new Map();
  for(const row of rows){
    row.style.setProperty('--outline-topic',color(row.dataset.nodeId));
    const slot=row.querySelector('.outline-branch-slot').getBoundingClientRect(),depth=Number(row.dataset.outlineDepth),id=row.dataset.nodeId;
    const point={id,x:slot.left-bounds.left+slot.width/2,y:slot.top-bounds.top+slot.height/2};
    nodes.set(id,point);stack.length=depth;
    const parent=stack.at(-1);if(parent){if(!children.has(parent))children.set(parent,[]);children.get(parent).push(point);}
    stack.push(id);
  }
  layer.setAttribute('width',String(body.clientWidth));layer.setAttribute('height',String(body.offsetHeight));
  const defs=svg('defs'),content=document.createDocumentFragment();content.append(defs);let index=0;
  for(const [parentId,list]of children){
    const parent=nodes.get(parentId),bend=child=>Math.max(0,Math.min(5,(child.x-parent.x)/2)),last=list.at(-1),end=last.y-bend(last),id=`outline-trunk-${++index}`,gradient=svg('linearGradient',{id,gradientUnits:'userSpaceOnUse',x1:parent.x,y1:parent.y+10,x2:parent.x,y2:end});
    gradient.append(svg('stop',{offset:0,'stop-color':color(parentId)}));
    for(const child of list)gradient.append(svg('stop',{offset:Math.max(0,Math.min(1,(child.y-bend(child)-parent.y-10)/(end-parent.y-10))),'stop-color':color(child.id)}));
    defs.append(gradient);
    content.append(svg('path',{class:'outline-trunk',d:`M ${parent.x} ${parent.y+10} V ${end}`,stroke:`url(#${id})`}));
    for(const child of list){
      // Small rounded elbows keep branch membership readable through wrapped rows.
      const r=bend(child);
      content.append(svg('path',{class:'outline-branch','data-parent':parentId,'data-child':child.id,d:`M ${parent.x} ${child.y-r} Q ${parent.x} ${child.y} ${parent.x+r} ${child.y} H ${child.x}`,stroke:color(child.id)}));
    }
  }
  for(const point of nodes.values())if(!children.has(point.id)){
    const marker=presentation.marker(point.id);
    if(marker==='diamond')content.append(svg('path',{class:'outline-marker',d:`M ${point.x} ${point.y-2.4} l 2.4 2.4 -2.4 2.4 -2.4 -2.4 Z`,fill:color(point.id)}));
    else if(marker==='dash')content.append(svg('rect',{x:point.x-1.5,y:point.y-3,width:3,height:6,rx:.8,fill:color(point.id)}));
    else content.append(svg('circle',{cx:point.x,cy:point.y,r:1.8,fill:color(point.id)}));
  }
  layer.replaceChildren(content);
}
export function installOutlineHierarchy(view,body){
  view.outlineHierarchyObserver?.disconnect();cancelAnimationFrame(view.outlineHierarchyFrame);
  const layer=svg('svg',{class:'outline-hierarchy','aria-hidden':'true',focusable:'false'});body.prepend(layer);
  const schedule=()=>{cancelAnimationFrame(view.outlineHierarchyFrame);view.outlineHierarchyFrame=requestAnimationFrame(()=>refreshOutlineHierarchy(view));};
  view.outlineHierarchyObserver=new ResizeObserver(schedule);view.outlineHierarchyObserver.observe(body);schedule();
}
