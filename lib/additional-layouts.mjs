// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {primaryTree,treeCluster} from './cluster-arrangements.mjs';
import {boundsOf,intersects} from './result-growth.mjs';
import {compactTree} from './tree-layout.mjs';
import {composeRiver} from './river-layout.mjs';
export const ADDITIONAL_LAYOUTS=['constellation','river','orbit','honeycomb','tree','grid'];
const size=p=>({width:p?.width||220,height:p?.height||66}),center=p=>({x:p.x+p.width/2,y:p.y+p.height/2});
const shift=(positions,x,y)=>Object.fromEntries(Object.entries(positions).map(([id,p])=>[id,{...p,x:p.x+x,y:p.y+y}]));
const result=(saved,positions,ids,extra={})=>({positions:{...saved,...positions},moved:ids.filter(id=>!saved[id]||saved[id].x!==positions[id]?.x||saved[id].y!==positions[id]?.y),constrained:[],...extra});
// Families follow the recorded hierarchy. Nested features/results stay with
// their first feature ancestor; source-only/history branches remain separate.
export function layoutFamilies(map){
  const tree=primaryTree(map),groups=new Map(),owners=new Map(),featureOwners=new Map();
  for(const id of tree.order){const node=map.nodes.get(id),parent=node.parent,feature=featureOwners.get(parent)||(node.type==='feature'?id:null);if(feature)featureOwners.set(id,feature);
    const owner=id===tree.root?id:feature||(['source','discovery','result','attempt'].includes(node.type)?id:owners.get(parent)||tree.root);owners.set(id,owner);if(!groups.has(owner))groups.set(owner,new Set());groups.get(owner).add(id);
  }return {tree,groups,owners};
}
function starCluster(tree,root,members,saved){
  const positions={},levels=new Map(),queue=[[root,0]],seen=new Set();
  while(queue.length){const [id,depth]=queue.shift();if(seen.has(id)||!members.has(id))continue;seen.add(id);const row=levels.get(depth)||[];row.push(id);levels.set(depth,row);for(const child of tree.children.get(id)||[])queue.push([child,depth+1]);}
  const d=size(saved[root]);positions[root]={x:-d.width/2,y:-d.height/2,...d};let previous=Math.hypot(d.width,d.height)/2;
  for(const [depth,ids]of levels){if(!depth)continue;const diameter=Math.max(...ids.map(id=>{const d=size(saved[id]);return Math.hypot(d.width,d.height);}))+36;let radius=Math.max(previous+diameter,ids.length>1?diameter/(2*Math.sin(Math.PI/ids.length)):diameter);
    const ring={};ids.forEach((id,i)=>{const angle=i*Math.PI*2/ids.length-Math.PI/2,dimensions=size(saved[id]);ring[id]={x:Math.cos(angle)*radius-dimensions.width/2,y:Math.sin(angle)*radius-dimensions.height/2,...dimensions};});Object.assign(positions,ring);previous=radius;
  }
  return {positions,bounds:boundsOf(Object.values(positions))};
}
export function constellationMap(map,saved={}){
  const {tree,groups}=layoutFamilies(map);if(!tree.root)return result(saved,{},[]);const positions={},occupied=[];let index=0;
  for(const [id,members]of groups){const cluster=starCluster(tree,id,members,saved),b=cluster.bounds;let items;
    if(!index)items=cluster.positions;else for(let attempt=0;attempt<4000;attempt++){const theta=index*2.399963+attempt*.24,r=420+Math.sqrt(index+attempt)*210;items=shift(cluster.positions,Math.cos(theta)*r,Math.sin(theta)*r);const box=boundsOf(Object.values(items));if(!occupied.some(other=>intersects(box,other,95)))break;if(attempt===3999)items=shift(cluster.positions,Math.max(...occupied.map(p=>p.x+p.width))+100-b.x,-b.y);}
    Object.assign(positions,items);occupied.push(boundsOf(Object.values(items)));index++;
  }return result(saved,positions,tree.order);
}
export function riverMap(map,saved={}){
  const {positions,spine,order}=composeRiver(map,saved);return result(saved,positions,order,{spine});
}
export function orbitMap(map,saved={}){
  const tree=primaryTree(map);if(!tree.root)return result(saved,{},[]);
  const levels=new Map(),depths=new Map([[tree.root,0]]),positions={},radii={},angles=new Map(),weights=new Map(),d=size(saved[tree.root]);positions[tree.root]={x:-d.width/2,y:-d.height/2,...d};
  // Give each recorded subtree a contiguous angular lane. Resetting equal
  // angles independently on every ring was scrambling parents and children.
  const weigh=id=>{const children=tree.children.get(id)||[];const weight=Math.max(1,children.reduce((sum,child)=>sum+weigh(child),0));weights.set(id,weight);return weight;};weigh(tree.root);
  const assign=(id,start,end,depth)=>{depths.set(id,depth);angles.set(id,(start+end)/2);if(depth){const row=levels.get(depth)||[];row.push(id);levels.set(depth,row);}let cursor=start;const children=tree.children.get(id)||[],total=children.reduce((sum,child)=>sum+weights.get(child),0)||1;for(const child of children){const span=(end-start)*weights.get(child)/total;assign(child,cursor,cursor+span,depth+1);cursor+=span;}};assign(tree.root,-Math.PI/2,Math.PI*1.5,0);
  let previous=0,previousDiameter=Math.hypot(d.width,d.height);
  for(const [depth,ids]of [...levels].sort(([a],[b])=>a-b)){
    const diameter=Math.max(...ids.map(id=>{const s=size(saved[id]);return Math.hypot(s.width,s.height);})),sorted=ids.map(id=>angles.get(id)).sort((a,b)=>a-b);
    const separation=ids.length>1?Math.min(...sorted.map((angle,i)=>(i===sorted.length-1?sorted[0]+Math.PI*2:sorted[i+1])-angle)):Math.PI;
    const radius=Math.max(300,previous+(previousDiameter+diameter)/2+100,(diameter+40)/(2*Math.sin(separation/2)));radii[depth]=radius;
    for(const id of ids){const angle=angles.get(id),s=size(saved[id]);positions[id]={x:Math.cos(angle)*radius-s.width/2,y:Math.sin(angle)*radius-s.height/2,...s};}previous=radius;previousDiameter=diameter;
  }return result(saved,positions,tree.order,{radii,depths,angles});
}
// Curved hierarchy links leave each orbit outward and enter the next inward.
// Ring guides are presentation only; no additional relationships are created.
export function orbitHierarchyRoute(a,b,root){
  const c=center(root),ac=center(a),bc=center(b),ar=Math.hypot(ac.x-c.x,ac.y-c.y),br=Math.hypot(bc.x-c.x,bc.y-c.y),aa=ar<1?Math.atan2(bc.y-c.y,bc.x-c.x):Math.atan2(ac.y-c.y,ac.x-c.x),ba=Math.atan2(bc.y-c.y,bc.x-c.x);
  const edge=(p,angle)=>{const v={x:Math.cos(angle),y:Math.sin(angle)},at=center(p),distance=Math.min(Math.abs(v.x)>1e-6?p.width/2/Math.abs(v.x):Infinity,Math.abs(v.y)>1e-6?p.height/2/Math.abs(v.y):Infinity);return {x:at.x+v.x*distance,y:at.y+v.y*distance};};
  const start=edge(a,aa),end=edge(b,ba+Math.PI),middle=(ar+br)/2,p={x:c.x+Math.cos(aa)*middle,y:c.y+Math.sin(aa)*middle},q={x:c.x+Math.cos(ba)*middle,y:c.y+Math.sin(ba)*middle};
  return {start,end,points:[start,p,q,end],d:`M${start.x} ${start.y} C${p.x} ${p.y},${q.x} ${q.y},${end.x} ${end.y}`};
}
export function hexVertices(x,y,r){return Array.from({length:6},(_,i)=>({x:x+Math.cos(-Math.PI/2+i*Math.PI/3)*r,y:y+Math.sin(-Math.PI/2+i*Math.PI/3)*r}));}
function hexBlock(members,saved){
  const ids=[...members],w=Math.max(...ids.map(id=>size(saved[id]).width)),h=Math.max(...ids.map(id=>size(saved[id]).height));
  for(let radius=Math.max(w*.7,h+70);;radius+=24){const slots=[],rows=Math.floor((radius-h/2-36)/(h+24));
    for(let row=-rows;row<=rows;row++){const y=row*(h+24),edge=Math.abs(y)+h/2+28,half=edge<=radius/2?Math.sqrt(3)*radius/2:Math.sqrt(3)*(radius-edge),count=Math.floor((half-w/2-28)/(w+24));for(let col=-count;col<=count;col++)slots.push({x:col*(w+24),y});}
    if(slots.length<ids.length)continue;slots.sort((a,b)=>Math.hypot(a.x,a.y)-Math.hypot(b.x,b.y)||a.y-b.y||a.x-b.x);
    return {radius,positions:Object.fromEntries(ids.map((id,i)=>{const s=size(saved[id]),p=slots[i];return [id,{x:p.x-s.width/2,y:p.y-s.height/2,...s}];}))};
  }
}
const hexOverlaps=(a,b)=>![0,Math.PI/3,Math.PI*2/3].some(angle=>Math.abs((a.x-b.x)*Math.cos(angle)+(a.y-b.y)*Math.sin(angle))>=Math.sqrt(3)/2*(a.radius+b.radius)+24);
export function honeycombMap(map,saved={}){
  const {tree,groups}=layoutFamilies(map);if(!tree.root)return result(saved,{},[]);const blocks=[...groups].map(([id,members])=>({id,...hexBlock(members,saved)})),base=Math.min(...blocks.map(b=>b.radius))+16,limit=Math.ceil(Math.sqrt(blocks.length)*4+Math.max(...blocks.map(b=>b.radius))/base*3),candidates=[];
  for(let q=-limit;q<=limit;q++)for(let r=-limit;r<=limit;r++)candidates.push({x:Math.sqrt(3)*base*(q+r/2),y:1.5*base*r});candidates.sort((a,b)=>Math.hypot(a.x,a.y)-Math.hypot(b.x,b.y)||a.y-b.y||a.x-b.x);
  const positions={},cells=[];for(const block of blocks){let at=candidates.find(p=>!cells.some(c=>hexOverlaps({...p,radius:block.radius},c)));if(!at)at={x:Math.max(0,...cells.map(c=>c.x+c.radius))+block.radius+50,y:0};Object.assign(positions,shift(block.positions,at.x,at.y));cells.push({id:block.id,...at,radius:block.radius});}
  return result(saved,positions,tree.order,{cells});
}
export function treeMap(map,saved={}){
 const tree=primaryTree(map);if(!tree.root)return result(saved,{},[]);const layout=compactTree(tree,saved);return result(saved,layout.positions,tree.order);
}
export function gridMap(map,saved={}){
 const tree=primaryTree(map);if(!tree.root)return result(saved,{},[]);const dimensions=tree.order.map(id=>size(saved[id])),width=Math.max(...dimensions.map(d=>d.width)),height=Math.max(...dimensions.map(d=>d.height)),columns=Math.max(1,Math.ceil(Math.sqrt(tree.order.length*(height+48)/(width+48)*1.6))),positions={};
 tree.order.forEach((id,i)=>{const d=size(saved[id]);positions[id]={x:(i%columns)*(width+48),y:Math.floor(i/columns)*(height+48),...d};});return result(saved,positions,tree.order);
}
export const additionalLayout=(map,layout,saved={})=>({constellation:constellationMap,river:riverMap,orbit:orbitMap,honeycomb:honeycombMap,tree:treeMap,grid:gridMap}[layout])(map,saved);
