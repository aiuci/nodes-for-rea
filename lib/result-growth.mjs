// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Presentation geometry only. Never change graph parents or existing anchors.
import {NODE_GAP,BRANCH_GAP} from './map-spacing.mjs';
const box=(x,y)=>({x,y,width:220,height:66});
export const boundsOf=rects=>({x:Math.min(...rects.map(r=>r.x)),y:Math.min(...rects.map(r=>r.y)),width:Math.max(...rects.map(r=>r.x+r.width))-Math.min(...rects.map(r=>r.x)),height:Math.max(...rects.map(r=>r.y+r.height))-Math.min(...rects.map(r=>r.y))});
export const intersects=(a,b,gap=NODE_GAP)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
export function growthPocket(map,id,positions,layout){
  const origin=positions[map.nodes.get(id)?.parent];if(!origin)return {};
  const levels=new Map(),queue=[[id,0]],seen=new Set(),owner=map.nodes.get(id)?.message?.id;
  if(owner)for(const node of map.nodes.values())if(node.type==='feature'&&node.message?.id===owner&&!positions[node.id])queue.push([node.id,1]);
  while(queue.length){const [key,depth]=queue.shift();if(seen.has(key)||positions[key]||!map.nodes.has(key))continue;seen.add(key);const level=levels.get(depth)||[];level.push(key);levels.set(depth,level);for(const child of map.children.get(key)||[])queue.push([child,depth+1]);}
  const relative={},core=positions[map.root]||origin,dx=origin.x-core.x,dy=origin.y-core.y,norm=Math.hypot(dx,dy)||1;
  const outward=['radial','spiral','wisp','organic','shattered','constellation','orbit','honeycomb'].includes(layout),u=layout==='vertical'?{x:0,y:1}:outward?{x:norm===1&&dx===0&&dy===0?1:dx/norm,y:dy/norm}:{x:1,y:0};
  let depthX=0;
  for(const [depth,ids]of levels){
    for(const [i,key]of ids.entries()){
      if(layout==='vertical')relative[key]=box((i-(ids.length-1)/2)*260,depth*180);
      else if(outward){const across=(i-(ids.length-1)/2)*280;relative[key]=box(u.x*depth*340-u.y*across,u.y*depth*340+u.x*across);}
      else if(layout==='compact')relative[key]=box(depthX+Math.floor(i/6)*260,((i%6)-(Math.min(6,ids.length)-1)/2)*100);
      else relative[key]=box(depth*320,(i-(ids.length-1)/2)*100);
    }
    depthX+=Math.ceil(ids.length/6)*260+80;
  }
  if(!relative[id])return {};
  const b=boundsOf(Object.values(relative)),occupied=Object.values(positions);
  const start={x:origin.x+u.x*440,y:origin.y+u.y*440},step=layout==='vertical'?280:180;
  // Whole-pocket collision checks keep the newly added tree together.
  for(let ring=0;ring<2000;ring++){
    const side=ring===0?0:(ring%2?1:-1)*Math.ceil(ring/2),forward=Math.floor(ring/20)*240;
    const at={x:start.x-u.y*side*step+u.x*forward,y:start.y+u.x*side*step+u.y*forward};
    const candidate={...b,x:b.x+at.x,y:b.y+at.y};
    if(occupied.some(p=>intersects(candidate,p,BRANCH_GAP)))continue;
    return Object.fromEntries(Object.entries(relative).map(([key,p])=>[key,{...p,x:p.x+at.x,y:p.y+at.y}]));
  }
  // Extremely dense maps still receive a separate pocket beyond their bounds.
  const old=boundsOf(occupied),at=layout==='vertical'?{x:old.x-b.x,y:old.y+old.height+180-b.y}:{x:old.x+old.width+240-b.x,y:old.y-b.y};
  return Object.fromEntries(Object.entries(relative).map(([key,p])=>[key,{...p,x:p.x+at.x,y:p.y+at.y}]));
}
const port=(r,side)=>side==='right'?{x:r.x+r.width,y:r.y+r.height/2}:side==='left'?{x:r.x,y:r.y+r.height/2}:side==='bottom'?{x:r.x+r.width/2,y:r.y+r.height}:{x:r.x+r.width/2,y:r.y};
const vector={right:{x:1,y:0},left:{x:-1,y:0},bottom:{x:0,y:1},top:{x:0,y:-1}},opposite={right:'left',left:'right',bottom:'top',top:'bottom'};
export function growthPorts(a,b){const dx=b.x+b.width/2-a.x-a.width/2,dy=b.y+b.height/2-a.y-a.height/2,vertical=Math.abs(dy)>Math.abs(dx),side=vertical?(dy>=0?'bottom':'top'):(dx>=0?'right':'left');return {vertical,start:port(a,side),end:port(b,opposite[side])};}
export function segmentHits(a,b,r,pad=10){
  if(a.x===b.x)return a.x>r.x-pad&&a.x<r.x+r.width+pad&&Math.max(a.y,b.y)>r.y-pad&&Math.min(a.y,b.y)<r.y+r.height+pad;
  return a.y>r.y-pad&&a.y<r.y+r.height+pad&&Math.max(a.x,b.x)>r.x-pad&&Math.min(a.x,b.x)<r.x+r.width+pad;
}
function pathThrough(points,circuit){
  const p=points.filter((v,i)=>!i||v.x!==points[i-1].x||v.y!==points[i-1].y);let d=`M${p[0].x} ${p[0].y}`;
  for(let i=1;i<p.length-1;i++){
    const a=p[i-1],b=p[i],c=p[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),r=circuit?0:Math.min(20,ab/2,bc/2);
    if(!r){d+=` L${b.x} ${b.y}`;continue;}
    const before={x:b.x+(a.x-b.x)*r/ab,y:b.y+(a.y-b.y)*r/ab},after={x:b.x+(c.x-b.x)*r/bc,y:b.y+(c.y-b.y)*r/bc};d+=` L${before.x} ${before.y} Q${b.x} ${b.y} ${after.x} ${after.y}`;
  }
  return d+` L${p.at(-1).x} ${p.at(-1).y}`;
}
// Route through nearby corridors first. The former implementation considered only
// lanes outside an entire obstacle slab, creating map-sized enclosing rectangles.
const compactPoints=points=>points.filter((p,i)=>!i||p.x!==points[i-1].x||p.y!==points[i-1].y).filter((p,i,all)=>!i||i===all.length-1||!((all[i-1].x===p.x&&p.x===all[i+1].x)||(all[i-1].y===p.y&&p.y===all[i+1].y)));
const routeLength=points=>points.slice(1).reduce((sum,p,i)=>sum+Math.abs(p.x-points[i].x)+Math.abs(p.y-points[i].y),0);
const routeHits=(points,obstacles,pad=12)=>obstacles.reduce((sum,r)=>sum+points.slice(1).filter((p,i)=>segmentHits(points[i],p,r,pad)).length,0);

// A bounded orthogonal visibility grid is used only when simple local lanes
// cannot clear the cards. Direction state gives turns a small readable penalty.
function corridorPath(start,end,obstacles,margin){
  const region={x:Math.min(start.x,end.x)-margin,y:Math.min(start.y,end.y)-margin,width:Math.abs(end.x-start.x)+2*margin,height:Math.abs(end.y-start.y)+2*margin};
  const near=obstacles.filter(r=>intersects(r,region,28));
  const xs=[...new Set([start.x,end.x,...near.flatMap(r=>[r.x-16,r.x+r.width+16])])].sort((a,b)=>a-b),ys=[...new Set([start.y,end.y,...near.flatMap(r=>[r.y-16,r.y+r.height+16])])].sort((a,b)=>a-b);
  if(xs.length*ys.length>90000)return null;
  const width=xs.length,count=width*ys.length,at=(x,y)=>y*width+x,point=i=>({x:xs[i%width],y:ys[Math.floor(i/width)]}),source=at(xs.indexOf(start.x),ys.indexOf(start.y)),target=at(xs.indexOf(end.x),ys.indexOf(end.y));
  const dist=new Float64Array(count*2).fill(Infinity),prev=new Int32Array(count*2).fill(-1),edges=new Map(),heap=[];
  const push=item=>{heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].score<=item.score)break;heap[i]=heap[p];i=p;}heap[i]=item;};
  const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].score<heap[c].score)c++;if(heap[c].score>=last.score)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
  for(let d=0;d<2;d++){dist[source*2+d]=0;push({key:source*2+d,cost:0,score:Math.abs(start.x-end.x)+Math.abs(start.y-end.y)});}
  while(heap.length){
    const current=pop();if(current.cost!==dist[current.key])continue;const node=Math.floor(current.key/2),direction=current.key%2,p=point(node);
    if(node===target){const result=[];for(let key=current.key;key>=0;key=prev[key])result.push(point(Math.floor(key/2)));return compactPoints(result.reverse());}
    const x=node%width,y=Math.floor(node/width);
    for(const [nx,ny,d]of [[x-1,y,0],[x+1,y,0],[x,y-1,1],[x,y+1,1]]){
      if(nx<0||nx>=width||ny<0||ny>=ys.length)continue;const next=at(nx,ny),q=point(next),edge=node<next?`${node}:${next}`:`${next}:${node}`;
      if(!edges.has(edge))edges.set(edge,obstacles.some(r=>segmentHits(p,q,r,12)));if(edges.get(edge))continue;
      const key=next*2+d,cost=current.cost+Math.abs(q.x-p.x)+Math.abs(q.y-p.y)+(direction===d?0:24);
      if(cost>=dist[key])continue;dist[key]=cost;prev[key]=current.key;push({key,cost,score:cost+Math.abs(q.x-end.x)+Math.abs(q.y-end.y)});
    }
  }
  return null;
}
export function growthRoute(a,b,obstacles=[],{vertical=false,circuit=false}={}){
  const preferred=vertical?(b.y+b.height/2>=a.y+a.height/2?'bottom':'top'):(b.x+b.width/2>=a.x+a.width/2?'right':'left'),sides=[preferred,...Object.keys(vector).filter(side=>side!==preferred)],fallback=[];
  for(const [rank,side]of sides.entries()){
    const v=vector[side],horizontal=!!v.x,start=port(a,side),end=port(b,opposite[side]),exit={x:start.x+v.x*16,y:start.y+v.y*16},enter={x:end.x-v.x*16,y:end.y-v.y*16};
    const innerObstacles=[a,b,...obstacles],near=obstacles.filter(r=>intersects(r,{x:Math.min(exit.x,enter.x)-160,y:Math.min(exit.y,enter.y)-160,width:Math.abs(enter.x-exit.x)+320,height:Math.abs(enter.y-exit.y)+320},28));
    const axis=horizontal?'y':'x',size=horizontal?'height':'width',lanes=[(exit[axis]+enter[axis])/2,exit[axis],enter[axis],...near.flatMap(r=>[r[axis]-16,r[axis]+r[size]+16])];
    const mids=horizontal?[[exit,{x:(exit.x+enter.x)/2,y:exit.y},{x:(exit.x+enter.x)/2,y:enter.y},enter]]:[[exit,{x:exit.x,y:(exit.y+enter.y)/2},{x:enter.x,y:(exit.y+enter.y)/2},enter]];
    for(const lane of new Set(lanes))mids.push(horizontal?[exit,{x:exit.x,y:lane},{x:enter.x,y:lane},enter]:[exit,{x:lane,y:exit.y},{x:lane,y:enter.y},enter]);
    const stubs=routeHits([start,exit],obstacles,6)+routeHits([enter,end],obstacles,6);
    let best;
    for(const inner of mids){const points=compactPoints([start,...inner,end]),hits=stubs+routeHits(inner,innerObstacles),length=routeLength(points),candidate={points,hits,length,cost:hits*1e8+rank*400+length};fallback.push(candidate);if(!hits&&(!best||length<best.length))best=candidate;}
    const direct=Math.abs(exit.x-enter.x)+Math.abs(exit.y-enter.y);
    if(!stubs&&(!best||best.length>direct*1.6+160))for(const margin of [160,640,2560]){
      const inner=corridorPath(exit,enter,innerObstacles,margin);if(!inner)continue;
      const points=compactPoints([start,...inner,end]),length=routeLength(points),candidate={points,hits:0,length,cost:rank*400+length};if(!best||length<best.length)best=candidate;break;
    }
    // Keep the layout-facing ports whenever a clear route exists. Alternative
    // sides are recovery for manually obstructed attachments, not a shortcut.
    if(best)return {...best,d:pathThrough(best.points,circuit),start,end};
  }
  fallback.sort((a,b)=>a.cost-b.cost);const route=fallback[0];return {...route,d:pathThrough(route.points,circuit),start:route.points[0],end:route.points.at(-1)};
}
