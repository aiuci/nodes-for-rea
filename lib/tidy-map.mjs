// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {orientPositions} from './adaptive-layout.mjs';
import {bloomMap} from './bloom-layout.mjs';
import {layoutMap} from './map-layouts.mjs';
import {boundsOf,intersects} from './result-growth.mjs';
import {NODE_GAP,BRANCH_GAP} from './map-spacing.mjs';
import {radialTidy} from './radial-tidy.mjs';
import {shatteredMap,explodedMap} from './cluster-arrangements.mjs';
import {spiralMap} from './shape-arrangements.mjs';
import {wispTidy} from './wisp-tidy.mjs';
import {tidyOrganic} from './organic-layout.mjs';
import {ADDITIONAL_LAYOUTS,additionalLayout} from './additional-layouts.mjs';

// Shared with incoming result pockets: quiet spacing around a whole investigation.
const moved=(a,b)=>a.x!==b.x||a.y!==b.y;
const center=p=>({x:p.x+p.width/2,y:p.y+p.height/2});

// A bounded deterministic search, with a spatial index rather than all-pairs scans.
class Occupancy {
  cells=new Map();large=[];
  keys(r){const keys=[];for(let x=Math.floor((r.x-BRANCH_GAP)/512);x<=Math.floor((r.x+r.width+BRANCH_GAP)/512);x++)for(let y=Math.floor((r.y-BRANCH_GAP)/512);y<=Math.floor((r.y+r.height+BRANCH_GAP)/512);y++){if(keys.length>1024)return null;keys.push(`${x}:${y}`);}return keys;}
  add(r){const keys=this.keys(r);if(!keys){this.large.push(r);return;}for(const key of keys){const cell=this.cells.get(key)||[];cell.push(r);this.cells.set(key,cell);}}
  hits(r,gap){const keys=this.keys(r),items=keys?[...this.large,...new Set(keys.flatMap(k=>this.cells.get(k)||[]))]:[...this.large,...new Set([...this.cells.values()].flat())];return items.filter(p=>intersects(r,p,gap));}
}

function nearestSpace(box,target,occupied,{gap,layout,origin,minX=-Infinity,minY=-Infinity,minRadius=0,radiusOffset={x:0,y:0}}){
  const queue=[],seen=new Set(),clamp=p=>({...box,x:Math.max(minX,p.x),y:Math.max(minY,p.y)});
  const score=p=>{
    const dx=p.x-target.x,dy=p.y-target.y;
    let cost=dx*dx+dy*dy;
    // Sideways lanes before another forward column in directed layouts.
    if(layout==='horizontal'||layout==='compact')cost+=dx*dx*.8;
    if(layout==='vertical')cost+=dy*dy*.8;
    if(layout==='radial'&&origin){const a=center(box),b=center(p),o=center(origin),cross=(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);cost+=cross*cross/Math.max(1,(a.x-o.x)**2+(a.y-o.y)**2)*.4;}
    return cost;
  };
  const add=p=>{p=clamp(p);if(minRadius&&origin){const a=center(p),o=center(origin);if(Math.hypot(a.x+radiusOffset.x-o.x,a.y+radiusOffset.y-o.y)<minRadius-.01)return;}const key=`${p.x}:${p.y}`;if(!seen.has(key)&&seen.size<512){seen.add(key);queue.push({p,cost:score(p)});}};
  add(target);add(box);
  for(let tries=0;queue.length&&tries<512;tries++){
    queue.sort((a,b)=>a.cost-b.cost||a.p.y-b.p.y||a.p.x-b.p.x);const {p}=queue.shift(),hits=occupied.hits(p,gap);
    if(!hits.length)return p;
    for(const hit of hits.slice(0,16)){add({x:p.x,y:hit.y-p.height-gap});add({x:p.x,y:hit.y+hit.height+gap});add({x:hit.x-p.width-gap,y:p.y});add({x:hit.x+hit.width+gap,y:p.y});}
  }
  // Guaranteed free outer lane, still respecting forward direction.
  const all=[...occupied.large,...new Set([...occupied.cells.values()].flat())];
  return clamp(layout==='vertical'?{x:Math.max(box.x,...all.map(p=>p.x+p.width))+gap,y:target.y}:{x:target.x,y:Math.max(box.y,...all.map(p=>p.y+p.height),origin?origin.y+origin.height+minRadius:0)+gap});
}

export function tidyMap(map,layout,saved,{locked=[],collapsed=[],growthRoots=[]}={}){
  if(layout==='bloom')return bloomMap(map,saved,{preserve:false,locked:[...locked,...collapsed]});
  if(ADDITIONAL_LAYOUTS.includes(layout))return additionalLayout(map,layout,saved);
  if(layout==='radial')return radialTidy(map,saved);
  if(layout==='spiral')return spiralMap(map,saved);
  if(layout==='wisp')return wispTidy(map,{...saved,...layoutMap(map,layout,saved)},{locked,collapsed});
  if(layout==='organic')return tidyOrganic(map,saved,{locked,collapsed});
  if(layout==='shattered')return shatteredMap(map,saved);
  if(layout==='exploded')return explodedMap(map,saved);
  const visible=new Set(map.nodes.keys()),original=layoutMap(map,layout,saved),positions={...saved,...original};
  const fixed=new Set([...locked,...collapsed,map.root||'core']),growth=new Set([...growthRoots,...[...map.nodes.values()].filter(n=>['result','attempt'].includes(n.type)).map(n=>n.id)]),owners=new Map(),units=new Map(),order=[],seen=new Set();
  // Follow relationships, not current screen coordinates; cycles remain bounded.
  const visit=id=>{if(seen.has(id)||!visible.has(id))return;seen.add(id);order.push(id);for(const child of map.children.get(id)||[])visit(child);};
  visit(map.root||'core');for(const id of visible)visit(id);
  for(const id of growth){const owner=map.nodes.get(id)?.message?.id;if(owner)owners.set(owner,id);}
  for(const id of order){let at=map.nodes.get(id),group=owners.get(at?.message?.id),walk=new Set();while(!group&&at&&!walk.has(at.id)){walk.add(at.id);if(growth.has(at.id)){group=at.id;break;}at=map.nodes.get(at.parent);}const key=group&&visible.has(group)?group:id,list=units.get(key)||[];list.push(id);units.set(key,list);}
  // Kept pockets cannot later translate as a whole. Repair their movable
  // children against all kept pocket anchors, not just their own siblings.
  const keptRepair=new Occupancy();
  for(const [key,ids]of units)if(ids.some(id=>fixed.has(id)))for(const id of ids)if(id===key||fixed.has(id)||ids.some(child=>collapsed.includes(child)))keptRepair.add(positions[id]);
  for(const [id,p]of Object.entries(positions))if(!visible.has(id))keptRepair.add(p);
  // Usually a pocket already has sound internal spacing. Repair a local overlap
  // without throwing away its recognizable shape or moving its kept nodes.
  for(const [key,ids]of units)if(ids.length>1&&!ids.some(id=>collapsed.includes(id))){
    const kept=ids.some(id=>fixed.has(id)),local=kept?keptRepair:new Occupancy(),anchors=new Set([key,...ids.filter(id=>fixed.has(id))]);
    if(!kept)for(const id of ids)if(anchors.has(id))local.add(positions[id]);
    for(const id of ids)if(!anchors.has(id)){const p=positions[id],parent=positions[map.nodes.get(id)?.parent],blocked=local.hits(p,NODE_GAP).length;const minX=blocked&&parent&&['horizontal','compact'].includes(layout)?parent.x+parent.width+NODE_GAP:-Infinity,minY=blocked&&parent&&layout==='vertical'?parent.y+parent.height+NODE_GAP:-Infinity;positions[id]=nearestSpace(p,p,local,{gap:NODE_GAP,layout,origin:positions[key],minX,minY});local.add(positions[id]);}
  }
  // Deliberately positioned nodes and folded branches are hard constraints.
  // Hidden/collapsed descendants retain their exact saved anchors too.
  const occupancy=new Occupancy(),keptOccupancy=new Occupancy(),fixedUnits=new Set(),warnings=[];
  for(const [id,p]of Object.entries(positions))if(!visible.has(id))occupancy.add(p);
  for(const [key,ids]of units)if(ids.some(id=>fixed.has(id))){fixedUnits.add(key);const box=boundsOf(ids.map(id=>positions[id]));if(keptOccupancy.hits(box,NODE_GAP).length)warnings.push(key);for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)if(intersects(positions[ids[i]],positions[ids[j]],NODE_GAP))warnings.push(key);occupancy.add(box);keptOccupancy.add(box);}
  const core=positions[map.root||'core'];
  for(const [key,ids]of units){
    if(fixedUnits.has(key))continue;
    const pocket=ids.length>1||growth.has(key),box=boundsOf(ids.map(id=>positions[id])),parent=positions[map.nodes.get(key)?.parent],target={...box};
    let minX=-Infinity,minY=-Infinity,minRadius=0,radiusOffset={x:0,y:0};
    if(parent&&pocket&&(layout==='horizontal'||layout==='compact')){minX=parent.x+parent.width+BRANCH_GAP-(positions[key].x-box.x);target.x=Math.max(minX,target.x);}
    if(parent&&pocket&&layout==='vertical'){minY=parent.y+parent.height+BRANCH_GAP-(positions[key].y-box.y);target.y=Math.max(minY,target.y);}
    if(parent&&pocket&&layout==='radial'&&core){const a=center(positions[key]),o=center(core),p=center(parent),b=center(box),radius=Math.hypot(a.x-o.x,a.y-o.y);minRadius=Math.hypot(p.x-o.x,p.y-o.y)+340;radiusOffset={x:a.x-b.x,y:a.y-b.y};if(radius<minRadius-.01){target.x+=(radius?(a.x-o.x)/radius:1)*(minRadius-radius);target.y+=(radius?(a.y-o.y)/radius:0)*(minRadius-radius);}}
    if(parent&&!pocket&&layout!=='manual'){
      if(layout==='horizontal'||layout==='compact'){
        minX=parent.x+parent.width+(layout==='compact'?64:96);target.x=Math.max(minX,Math.min(box.x,minX+400));
        // Excessive empty space is compressed only on explicit Tidy.
        if(Math.abs(box.y-parent.y)>1400)target.y=parent.y+Math.sign(box.y-parent.y)*700;
      }else if(layout==='vertical'){
        minY=parent.y+parent.height+96;target.y=Math.max(minY,Math.min(box.y,minY+400));
        if(Math.abs(box.x-parent.x)>1800)target.x=parent.x+Math.sign(box.x-parent.x)*900;
      }else if(layout==='radial'&&core){
        const a=center(box),o=center(core),p=center(parent),radius=Math.hypot(a.x-o.x,a.y-o.y),inner=Math.hypot(p.x-o.x,p.y-o.y)+340,r=Math.max(inner,Math.min(radius,inner+500)),dx=(a.x-o.x)/(radius||1),dy=(a.y-o.y)/(radius||1);
        minRadius=inner;if(Math.abs(r-radius)>.01){target.x=o.x+(radius?dx:1)*r-box.width/2;target.y=o.y+dy*r-box.height/2;}
      }
    }
    const p=nearestSpace(box,target,occupancy,{gap:pocket?BRANCH_GAP:NODE_GAP,layout,origin:core,minX,minY,minRadius,radiusOffset});
    const dx=Math.abs(p.x-box.x)<.01?0:p.x-box.x,dy=Math.abs(p.y-box.y)<.01?0:p.y-box.y;
    for(const id of ids)positions[id]={...positions[id],x:positions[id].x+dx,y:positions[id].y+dy};
    // Reserve the entire pocket, so unrelated branches cannot thread into it.
    occupancy.add(p);
  }
  const oriented=orientPositions(map,layout,positions,{locked,collapsed});
  if(oriented.constrained)warnings.push(...[...locked,...collapsed].filter(id=>visible.has(id)));
  return {positions:oriented.positions,moved:order.filter(id=>moved(original[id],oriented.positions[id])),constrained:[...new Set(warnings)]};
}
