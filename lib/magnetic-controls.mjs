// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
export const CONTROL_MODULES=['navigation','layouts','themes'];
export const CONTROL_DOCK_MIN_HEIGHT=104;
export function controlPanelHeight(requested,natural,available,floor=CONTROL_DOCK_MIN_HEIGHT){const maximum=Math.max(40,available),minimum=Math.min(maximum,Math.max(floor,natural));return Math.min(maximum,Math.max(minimum,Number.isFinite(requested)?requested:minimum));}
export const controlLeaves=tree=>typeof tree==='string'?[tree]:tree?.children?.flatMap(controlLeaves)||[];
export const defaultControls=()=>({version:1,next:0,dock:[...CONTROL_MODULES],groups:[],focus:'map'});
export function cleanControls(raw){
  if(raw?.version!==1)return defaultControls();const seen=new Set();
  const leaf=id=>CONTROL_MODULES.includes(id)&&!seen.has(id)?(seen.add(id),id):null;
  const tree=(t,depth=0)=>{if(depth>5)return null;if(typeof t==='string')return leaf(t);if(!['x','y','stack'].includes(t?.axis)||!Array.isArray(t.children))return null;const children=t.children.slice(0,4).map(c=>tree(c,depth+1)).filter(Boolean);return children.length>1?{axis:t.axis,children,...(t.axis==='stack'?{active:Math.max(0,Math.min(children.length-1,Number.isInteger(t.active)?t.active:0))}:{})}:children[0]||null;};
  const dock=(Array.isArray(raw.dock)?raw.dock:[]).map(leaf).filter(Boolean),groups=[];
  for(const g of (Array.isArray(raw.groups)?raw.groups:[]).slice(0,4)){const t=tree(g.tree);if(t)groups.push({id:`g${groups.length}`,tree:t,x:Number.isFinite(g.x)?g.x:8,y:Number.isFinite(g.y)?g.y:8,...(Number.isFinite(g.width)?{width:Math.max(160,Math.min(3000,g.width))}:{}),...(Number.isFinite(g.height)?{height:Math.max(80,Math.min(2000,g.height))}:{})});}
  for(const id of CONTROL_MODULES)if(!seen.has(id))dock.push(id);
  const home=raw.home&&Number.isFinite(raw.home.width)?{width:Math.max(160,Math.min(3000,raw.home.width)),...(Number.isFinite(raw.home.height)?{height:Math.max(80,Math.min(800,raw.home.height))}:{})}:undefined;
  return {version:1,next:groups.length,dock,groups,focus:raw.focus==='node'?'node':'map',...(home?{home}:{})};
}
const copy=state=>structuredClone(state);
const without=(tree,id)=>{if(typeof tree==='string')return tree===id?null:tree;const children=tree.children.map(c=>without(c,id)).filter(Boolean);return children.length>1?{...tree,children,...(tree.axis==='stack'?{active:Math.min(tree.active||0,children.length-1)}:{})}:children[0]||null;};
export function detachControl(state,id,point={x:8,y:8}){
  const s=copy(state);s.dock=s.dock.filter(m=>m!==id);s.groups=s.groups.map(g=>({...g,tree:without(g.tree,id)})).filter(g=>g.tree);
  const group={id:`g${s.next++}`,tree:id,x:point.x,y:point.y};s.groups.push(group);return {state:s,groupId:group.id};
}
export function snapControlGroup(state,movingId,targetModule,side){
  if(!['left','right','top','bottom','stack'].includes(side))return state;const s=copy(state),moving=s.groups.find(g=>g.id===movingId),target=s.groups.find(g=>g.id!==movingId&&controlLeaves(g.tree).includes(targetModule));if(!moving||!target)return state;
  const replace=t=>typeof t==='string'?(t===targetModule?{axis:side==='stack'?'stack':['left','right'].includes(side)?'x':'y',children:['left','top'].includes(side)?[moving.tree,t]:[t,moving.tree],...(side==='stack'?{active:1}:{})}:t):{...t,children:t.children.map(replace)};
  target.tree=replace(target.tree);delete target.width;delete target.height;s.groups=s.groups.filter(g=>g.id!==movingId);return s;
}
export function detachDock(state,point={x:8,y:8}){
  const s=copy(state);const bottom=[...s.dock];if(!bottom.length)return {state:s,groupId:null};const tree=bottom.length===1?bottom[0]:{axis:'x',children:bottom},g={id:`g${s.next++}`,tree,x:point.x,y:point.y,...(Number.isFinite(point.width)?{width:point.width}:{})};s.dock=[];s.groups.push(g);return {state:s,groupId:g.id};
}
export function redockControlGroup(state,id){const s=copy(state),g=s.groups.find(g=>g.id===id);if(!g)return s;s.dock.push(...controlLeaves(g.tree));s.groups=s.groups.filter(g=>g.id!==id);return s;}
export function redockAllControls(state){return {...copy(state),dock:[...state.dock,...state.groups.flatMap(g=>controlLeaves(g.tree))],groups:[]};}
// Keep preset rows complete as their panel changes width: 16, 8, 4, 2 or 1.
export function balancedControlColumns(count,width,minWidth=54,gap=3){
  const capacity=Math.max(1,Math.floor((width+gap)/(minWidth+gap)));
  for(let columns=Math.min(count,capacity);columns>0;columns--)if(count%columns===0)return columns;
  return 1;
}
export function controlTreeSize(tree,sizes,gap=6){if(typeof tree==='string')return sizes[tree]||{width:100,height:50};const values=tree.children.map(t=>controlTreeSize(t,sizes,gap));if(tree.axis==='stack')return {width:Math.max(...values.map(s=>s.width)),height:Math.max(...values.map(s=>s.height))+30};return tree.axis==='x'?{width:values.reduce((n,s)=>n+s.width,0)+gap*(values.length-1),height:Math.max(...values.map(s=>s.height))}:{width:Math.max(...values.map(s=>s.width)),height:values.reduce((n,s)=>n+s.height,0)+gap*(values.length-1)};}
export function controlDropTarget(point,targets){
  const t=targets.filter(t=>point.x>=t.x-12&&point.x<=t.x+t.width+12&&point.y>=t.y-12&&point.y<=t.y+t.height+12).sort((a,b)=>a.width*a.height-b.width*b.height)[0];if(!t)return null;
  const x=(point.x-t.x)/t.width,y=(point.y-t.y)/t.height;
  const side=x>.28&&x<.72&&y>.28&&y<.72?'stack':Object.entries({left:x,right:1-x,top:y,bottom:1-y}).sort((a,b)=>a[1]-b[1])[0][0];
  return {module:t.module,side,target:t};
}
export const controlRectsOverlap=(a,b,gap=6)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
export function placeControlRect(desired,size,viewport,occupied=[]){
  const width=Math.min(size.width,Math.max(60,viewport.width-16)),height=Math.min(size.height,Math.max(40,viewport.height-16)),clamp=(x,y)=>({x:Math.max(8,Math.min(x,viewport.width-width-8)),y:Math.max(8,Math.min(y,viewport.height-height-8)),width,height});
  const xs=[desired.x,8,viewport.width-width-8],ys=[desired.y,8,viewport.height-height-8];for(const r of occupied){xs.push(r.x-width-8,r.x+r.width+8);ys.push(r.y-height-8,r.y+r.height+8);}
  const candidates=xs.flatMap(x=>ys.map(y=>clamp(x,y))),score=r=>occupied.reduce((n,o)=>n+(controlRectsOverlap(r,o)?1e8:0),0)+Math.hypot(r.x-desired.x,r.y-desired.y);
  return candidates.sort((a,b)=>score(a)-score(b))[0];
}
export function nearestControlSnap(moving,targets,threshold=28){
  const candidates=[];for(const t of targets)for(const side of ['left','right','top','bottom']){const x=side==='left'?t.x-moving.width-6:side==='right'?t.x+t.width+6:t.x,y=side==='top'?t.y-moving.height-6:side==='bottom'?t.y+t.height+6:t.y,distance=Math.hypot(moving.x-x,moving.y-y);if(distance<=threshold)candidates.push({module:t.module,side,distance,x,y});}return candidates.sort((a,b)=>a.distance-b.distance)[0]||null;
}
