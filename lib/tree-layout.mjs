// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {primaryTree} from './cluster-arrangements.mjs';
import {boundsOf,segmentHits} from './result-growth.mjs';

const GAP=48,ROW_GAP=100,DEPTH_GAP=110,TRUNK=40;
const size=p=>({width:p?.width||220,height:p?.height||66});

// Old leaf-wide coordinates survive layout switching. Upgrade only the clearly
// flattened legacy case; protected placements and an explicit Undo stay saved.
export function needsTreeUpgrade(workspace){
  if(workspace.layout!=='tree'||workspace.treeVersion===1||workspace.placedNodes?.tree?.length)return false;
  const points=Object.values(workspace.mapPositions||{});if(points.length<8)return false;
  const box=boundsOf(points);return box.width>3000&&box.width>box.height*8;
}

// Keep small fans familiar; wrap broad families as whole subtrees rather than
// allocating one global leaf row. Every child remains below its actual parent.
export function compactTree(tree,saved={}){
  const build=id=>{
    const d=size(saved[id]),children=(tree.children.get(id)||[]).map(build);
    if(!children.length)return {positions:{[id]:{x:0,y:0,...d}},width:d.width,height:d.height};
    const total=children.reduce((sum,c)=>sum+c.width,0)+GAP*(children.length-1);
    const area=children.reduce((sum,c)=>sum+(c.width+GAP)*(c.height+ROW_GAP),0);
    const limit=children.length<=6&&total<=1600?total:Math.max(...children.map(c=>c.width),Math.sqrt(area*1.7));
    const rows=[];let row={children:[],width:0,height:0};
    for(const child of children){
      if(row.children.length&&row.width+GAP+child.width>limit){rows.push(row);row={children:[],width:0,height:0};}
      if(row.children.length)row.width+=GAP;row.children.push(child);row.width+=child.width;row.height=Math.max(row.height,child.height);
    }rows.push(row);
    // Wrapped families reserve a clear left trunk inside their own envelope.
    const gutter=rows.length>1?TRUNK+GAP:0,band=Math.max(...rows.map(r=>r.width)),width=Math.max(d.width,gutter+band);
    const positions={[id]:{x:(width-d.width)/2,y:0,...d}};let y=d.height+DEPTH_GAP;
    for(const r of rows){let x=(width-gutter-band)/2+gutter+(band-r.width)/2;
      for(const child of r.children){for(const [key,p]of Object.entries(child.positions))positions[key]={...p,x:p.x+x,y:p.y+y};x+=child.width+GAP;}
      y+=r.height+ROW_GAP;
    }
    return {positions,width,height:y-ROW_GAP};
  };
  if(!tree.root)return {positions:{}};
  const block=build(tree.root),root=block.positions[tree.root],dx=root.x+root.width/2,dy=root.height/2;
  return {positions:Object.fromEntries(Object.entries(block.positions).map(([id,p])=>[id,{...p,x:p.x-dx,y:p.y-dy}]))};
}

// Broad families share one clear side trunk with a branch rail above each row.
// Reserve those routes only when they miss cards, so manual edits can fall back
// to the renderer's existing obstacle routing instead of drawing through nodes.
export function treeHierarchyRoutes(map,positions){
  const tree=primaryTree(map),boxes=new Map(),routes=new Map();
  for(const id of [...tree.order].reverse()){
    const p=positions.get(id);if(!p)continue;
    boxes.set(id,boundsOf([p,...(tree.children.get(id)||[]).map(c=>boxes.get(c)).filter(Boolean)]));
  }
  for(const id of tree.order){
    const a=positions.get(id),children=(tree.children.get(id)||[]).filter(c=>positions.has(c));if(!a||new Set(children.map(c=>Math.round(positions.get(c).y))).size<2)continue;
    const band=boundsOf(children.map(c=>boxes.get(c))),lane=band.x-TRUNK,first=Math.min(...children.map(c=>positions.get(c).y))-DEPTH_GAP/2;
    for(const child of children){const b=positions.get(child),start={x:a.x+a.width/2,y:a.y+a.height},end={x:b.x+b.width/2,y:b.y},rail=b.y-DEPTH_GAP/2;
      const points=[start,{x:start.x,y:first},{x:lane,y:first},{x:lane,y:rail},{x:end.x,y:rail},end];
      if([...positions].some(([key,p])=>key!==id&&key!==child&&points.slice(1).some((q,i)=>segmentHits(points[i],q,p,6))))continue;
      routes.set(`${id}\0${child}`,{start,end,points,d:points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')});
    }
  }
  return routes;
}
