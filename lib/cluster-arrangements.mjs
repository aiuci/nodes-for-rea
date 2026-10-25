// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {boundsOf,intersects} from './result-growth.mjs';
const gap=40,branchGap=110,center=p=>({x:p.x+p.width/2,y:p.y+p.height/2}),size=p=>({width:Math.max(32,p?.width||220),height:Math.max(24,p?.height||66)});
export function primaryTree(map){const children=new Map(),order=[],seen=new Set(),root=map.nodes.has(map.root)?map.root:map.nodes.keys().next().value;const visit=id=>{if(seen.has(id)||!map.nodes.has(id))return false;seen.add(id);order.push(id);const list=[];for(const child of map.children.get(id)||[])if(visit(child))list.push(child);children.set(id,list);return true;};if(root){visit(root);for(const id of map.nodes.keys())if(!seen.has(id)){visit(id);children.get(root).push(id);}}return {root,children,order};}

// A local, upright tree cluster. Subtrees occupy contiguous lanes rather than
// sending every descendant down a narrowing ray from the global center.
export function treeCluster(tree,root,saved,angle=0,members=null){
  const u={x:Math.cos(angle),y:Math.sin(angle)},v={x:-u.y,y:u.x},spans=new Map(),along=new Map(),rects={},children=id=>(tree.children.get(id)||[]).filter(child=>!members||members.has(child));
  const measure=id=>{const d=size(saved[id]),own=d.width*Math.abs(v.x)+d.height*Math.abs(v.y);along.set(id,d.width*Math.abs(u.x)+d.height*Math.abs(u.y));const sub=children(id).map(measure),span=Math.max(own,sub.reduce((sum,n)=>sum+n,0)+Math.max(0,sub.length-1)*gap);spans.set(id,span);return span;};measure(root);
  const place=(id,x,start)=>{const d=size(saved[id]),y=start+spans.get(id)/2;rects[id]={x:u.x*x+v.x*y-d.width/2,y:u.y*x+v.y*y-d.height/2,...d};let cursor=start+(spans.get(id)-(children(id).reduce((s,c)=>s+spans.get(c),0)+Math.max(0,children(id).length-1)*gap))/2;for(const child of children(id)){place(child,x+(along.get(id)+along.get(child))/2+90,cursor);cursor+=spans.get(child)+gap;}};place(root,0,-spans.get(root)/2);
  return {positions:rects,bounds:boundsOf(Object.values(rects)),span:spans.get(root)};
}
const translate=(items,dx,dy)=>Object.fromEntries(Object.entries(items).map(([id,p])=>[id,{...p,x:p.x+dx,y:p.y+dy}]));
const changed=(saved,positions,ids)=>ids.filter(id=>!saved[id]||Math.abs(saved[id].x-positions[id].x)>.001||Math.abs(saved[id].y-positions[id].y)>.001);

export function clusteredRadial(map,saved={}){
  const tree=primaryTree(map);if(!tree.root)return {positions:{...saved},moved:[],constrained:[],sectors:[],radii:{}};
  const root=tree.root,d=size(saved[root]),positions={...saved,[root]:{x:-d.width/2,y:-d.height/2,...d}},occupied=[positions[root]],main=tree.children.get(root)||[],weights=new Map(),sectors=[];
  for(const id of main){const c=treeCluster(tree,id,saved);weights.set(id,Math.sqrt(Math.max(1,Object.keys(c.positions).length))*Math.sqrt(Math.max(1,c.span)));}
  const total=main.reduce((s,id)=>s+weights.get(id),0)||1;let cursor=-Math.PI/2;
  for(const id of main){const span=Math.PI*2*weights.get(id)/total,angle=main.length===1?0:cursor+span/2,c=treeCluster(tree,id,saved,angle);let distance=330,items;
    for(let i=0;i<500;i++){items=translate(c.positions,Math.cos(angle)*distance,Math.sin(angle)*distance);if(!Object.values(items).some(p=>occupied.some(q=>intersects(p,q,gap))))break;distance+=80;}
    Object.assign(positions,items);occupied.push(...Object.values(items));sectors.push({id,start:cursor,end:cursor+span,weight:weights.get(id),distance});cursor+=span;
  }
  return {positions,moved:changed(saved,positions,tree.order),constrained:[],sectors,radii:Object.fromEntries(tree.order.map(id=>{const p=center(positions[id]);return [id,Math.hypot(p.x,p.y)];}))};
}

export function islands(map,saved){const tree=primaryTree(map),owners=new Map(),groups=new Map(),boundary=id=>id===tree.root||['source','discovery','feature','result','attempt'].includes(map.nodes.get(id)?.type);for(const id of tree.order){const parent=map.nodes.get(id)?.parent,key=boundary(id)?id:owners.get(parent)||tree.root;owners.set(id,key);const group=groups.get(key)||new Set();group.add(id);groups.set(key,group);}return {tree,groups,owners};}
const hash=text=>[...text].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,17);

// Shattered: scatter whole connected islands, never individual findings.
export function shatteredMap(map,saved={}){
  const {tree,groups}=islands(map,saved);if(!tree.root)return {positions:{...saved},moved:[],constrained:[]};const positions={...saved},occupied=[];let index=0;
  for(const [id,members]of groups){const c=treeCluster(tree,id,saved,0,members),seed=hash(id),angle=index*2.399963+(seed%70)/100;let radius=index?650+Math.sqrt(index)*480+(seed%220):0,items;
    for(let i=0;i<600;i++){const theta=angle+i*.23;items=translate(c.positions,Math.cos(theta)*radius,Math.sin(theta)*radius);const b=boundsOf(Object.values(items));if(!occupied.some(p=>intersects(b,p,branchGap)))break;radius+=100;}
    Object.assign(positions,items);occupied.push(boundsOf(Object.values(items)));index++;
  }
  return {positions,moved:changed(saved,positions,tree.order),constrained:[]};
}

// An assembly owns its feature family or saved result. Leaf features stay in
// their existing parent family rather than becoming empty one-node plates.
export function explodedGroups(map){
  const tree=primaryTree(map),owners=new Map(),groups=new Map();
  for(const id of tree.order){const node=map.nodes.get(id),parent=map.nodes.get(node.parent),boundary=id===tree.root||['result','attempt'].includes(node.type)||(node.type==='feature'&&parent?.type!=='feature');const owner=boundary?id:owners.get(node.parent)||tree.root;owners.set(id,owner);if(!groups.has(owner))groups.set(owner,new Set());groups.get(owner).add(id);}
  return {tree,groups,owners};
}
// Perspective plates are decorative; their full envelope is used for spacing.
export function explodedPlate(b){
  const x=b.x-30,w=b.width+60,tilt=b.x+b.width/2<0?Math.min(75,w*.14):-Math.min(75,w*.14),y=b.y-70-Math.max(0,tilt),h=b.height+110+Math.abs(tilt);
  return {x,y,w,h,tilt,bounds:{x:x-14,y:y+Math.min(0,tilt)-14,width:w+28,height:h+Math.abs(tilt)+28}};
}
// Exploded opens recorded assemblies around a centered subject. Plate sizes
// and clearance come from real rectangles; links never determine new parents.
export function explodedMap(map,saved={}){
  const {tree,groups,owners}=explodedGroups(map);if(!tree.root)return {positions:{...saved},moved:[],constrained:[],assemblies:[]};
  const blocks=new Map();
  for(const [id,members]of groups){
    const d=size(saved[id]),local={[id]:{x:-d.width/2,y:-d.height/2,...d}},rest=[...members].filter(key=>key!==id),rows=Math.min(6,Math.max(1,rest.length));
    const rowHeight=Math.max(d.height,...rest.map(key=>size(saved[key]).height))+44;
    let x=d.width/2+105;
    for(let column=0;column<Math.ceil(rest.length/rows);column++){
      const keys=rest.slice(column*rows,(column+1)*rows),width=Math.max(...keys.map(key=>size(saved[key]).width));
      keys.forEach((key,row)=>{const dimensions=size(saved[key]);local[key]={x,y:(row-(keys.length-1)/2)*rowHeight-dimensions.height/2,...dimensions};});x+=width+75;
    }
    const deep=[...members].some(key=>key!==id&&map.nodes.get(key)?.parent!==id);blocks.set(id,deep?treeCluster(tree,id,saved,0,members):{positions:local,bounds:boundsOf(Object.values(local))});
  }
  const rootBlock=blocks.get(tree.root),positions={...saved,...rootBlock.positions},assemblies=[{id:tree.root,bounds:rootBlock.bounds}],occupied=[{x:rootBlock.bounds.x-75,y:rootBlock.bounds.y-75,width:rootBlock.bounds.width+150,height:rootBlock.bounds.height+150}];
  const parts=[...blocks.keys()].filter(id=>id!==tree.root);
  // Six familiar outward stations: upper left/right, middle left/right,
  // lower left/right. Further assemblies occupy another belt, not a pipeline.
  const stations=parts.length===1?[0]:parts.length===2?[Math.PI,0]:parts.length===3?[-2.35,0,2.35]:parts.length===4?[-2.35,-.79,2.35,.79]:[-2.35,-.79,Math.PI,0,2.35,.79];
  for(const [index,id]of parts.entries()){
    const c=blocks.get(id),b=c.bounds,angle=stations[index%stations.length],belt=Math.floor(index/stations.length);let items,placed;
    for(let attempt=0;attempt<2000;attempt++){
      const extra=belt*360+attempt*80,rx=360+b.width/2+extra,ry=190+b.height/2+extra;
      const x=Math.cos(angle)*rx,y=Math.sin(angle)*ry;
      items=translate(c.positions,x-b.x-b.width/2,y-b.y-b.height/2);placed=boundsOf(Object.values(items));
      if(!occupied.some(other=>intersects(explodedPlate(placed).bounds,other,100)))break;
    }
    Object.assign(positions,items);occupied.push(explodedPlate(placed).bounds);assemblies.push({id,parent:owners.get(map.nodes.get(id)?.parent)||tree.root,angle,bounds:placed});
  }
  return {positions,moved:changed(saved,positions,tree.order),constrained:[],assemblies};
}
