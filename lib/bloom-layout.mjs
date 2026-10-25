// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {primaryTree} from './cluster-arrangements.mjs';
import {boundsOf,intersects,growthPocket} from './result-growth.mjs';

const GAP=30,TAU=Math.PI*2;
const dimensions=p=>({width:p?.width||220,height:p?.height||66});
const center=p=>({x:p.x+p.width/2,y:p.y+p.height/2});
const shift=(points,x,y)=>Object.fromEntries(Object.entries(points).map(([id,p])=>[id,{...p,x:p.x+x,y:p.y+y}]));
// Each recorded major branch owns one compact flower. Its hub stays at the
// center; descendants fill staggered elliptical petals, rather than global
// depth rings or disconnected feature-family constellations.
function petalSlot(at,d,occupied,start=0){
  let index=0;
  for(let ring=1;ring<=160;ring++){
    const count=8+(ring-1)*4;
    for(let slot=0;slot<count;slot++,index++){
      if(index<start)continue;
      const angle=-Math.PI/2+(slot+(ring%2===0?.5:0))*TAU/count;
      const p={x:at.x+Math.cos(angle)*(d.width+GAP)*(ring+.5)-d.width/2,y:at.y+Math.sin(angle)*(d.height+GAP)*(ring+.85)-d.height/2,...d};
      if(!occupied.some(q=>intersects(p,q,GAP)))return p;
    }
  }
  return {x:at.x-d.width/2,y:Math.max(at.y,...occupied.map(p=>p.y+p.height))+GAP,...d};
}
export function bloomMap(map,saved={}, {preserve=true,locked=[]}={}){
  const tree=primaryTree(map),ids=tree.order;
  if(!tree.root)return {positions:{...saved},moved:[],constrained:[],flowers:[]};
  if(preserve&&ids.every(id=>saved[id]))return {positions:{...saved},moved:[],constrained:[],flowers:[]};
  // New investigation results retain the existing whole-pocket arrival rule.
  // Ordinary feature growth fills free petals; neither operation moves anchors.
  const anchors={...saved};
  if(preserve&&Object.keys(saved).length>1)for(const id of ids){const n=map.nodes.get(id);if(!anchors[id]&&['result','attempt','discovery'].includes(n.type)&&anchors[n.parent])Object.assign(anchors,growthPocket(map,id,anchors,'bloom'));}
  const root=tree.root,owners=new Map([[root,root]]),groups=new Map(),parents=new Map();
  for(const [parent,children]of tree.children)for(const id of children)parents.set(id,parent);
  for(const id of ids){if(id===root)continue;const parent=parents.get(id),owner=parent===root||!owners.has(parent)?id:owners.get(parent);owners.set(id,owner);if(!groups.has(owner))groups.set(owner,[]);groups.get(owner).push(id);}
  const rootSize=dimensions(saved[root]),origin=saved[root]?center(saved[root]):{x:0,y:0},target={[root]:{x:origin.x-rootSize.width/2,y:origin.y-rootSize.height/2,...rootSize}},flowers=[],occupied=[target[root]];
  // Place whole flowers on outward stations. Bounds, not only hub distances,
  // reserve space, so wide labels cannot overlap neighboring flower clusters.
  for(const [index,[hub,members]]of [...groups].entries()){
    const d=dimensions(saved[hub]),local={[hub]:{x:-d.width/2,y:-d.height/2,...d}},localUsed=[local[hub]];
    for(const id of members){if(id===hub)continue;const p=petalSlot({x:0,y:0},dimensions(saved[id]),localUsed);local[id]=p;localUsed.push(p);}
    const box=boundsOf(localUsed),belt=Math.floor(index/8),count=Math.min(8,groups.size-belt*8),angle=-Math.PI/2+(index%8)*TAU/count;
    let placed,outer;
    for(let step=0;step<240;step++){
      const rx=rootSize.width/2+box.width/2+90+belt*(box.width+90)+step*55,ry=rootSize.height/2+box.height/2+90+belt*(box.height+90)+step*35;
      const x=origin.x+Math.cos(angle)*rx,y=origin.y+Math.sin(angle)*ry;
      placed=shift(local,x,y);outer=boundsOf(Object.values(placed));
      if(!occupied.some(q=>intersects(outer,q,70)))break;
      if(step===239){const dx=Math.max(...occupied.map(q=>q.x+q.width))+90-outer.x;placed=shift(placed,dx,0);outer={...outer,x:outer.x+dx};}
    }
    Object.assign(target,placed);occupied.push(outer);flowers.push({hub,members:[...members],bounds:outer});
  }
  const fixed=new Set(preserve?ids.filter(id=>anchors[id]):[root,...locked.filter(id=>saved[id])]),positions={...anchors},taken=[],constrained=[];
  for(const id of ids)if(fixed.has(id)){positions[id]={...(anchors[id]||target[id])};if(taken.some(q=>intersects(positions[id],q,GAP)))constrained.push(id);taken.push(positions[id]);}
  for(const id of ids){if(fixed.has(id))continue;let p=target[id];if(taken.some(q=>intersects(p,q,GAP))){const hub=owners.get(id)||root,at=center(positions[hub]||target[hub]||target[root]);p=petalSlot(at,dimensions(saved[id]),taken);}positions[id]=p;taken.push(p);}
  return {positions,moved:ids.filter(id=>!saved[id]||saved[id].x!==positions[id].x||saved[id].y!==positions[id].y),constrained,flowers};
}
