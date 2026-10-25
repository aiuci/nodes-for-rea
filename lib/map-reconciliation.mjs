// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {tidyMap} from './tidy-map.mjs';
import {boundsOf} from './result-growth.mjs';

// Presentation may omit process metadata, never a numerical subset of features.
export function featurePresentation(map,{processMap=false,growthRoots=[],hidden=[],collapsed=[]}={}){
  if(processMap)return map;
  const retained=new Set([...growthRoots,...hidden,...collapsed]),nodes=new Map([...map.nodes].filter(([,n])=>!['source','discovery'].includes(n.type)||retained.has(n.id))),edges=[],children=new Map();
  for(const [id,node]of nodes){let parent=node.parent;const seen=new Set();while(parent&&!nodes.has(parent)&&!seen.has(parent)){seen.add(parent);parent=map.nodes.get(parent)?.parent;}nodes.set(id,{...node,parent:parent||null});}
  for(const [id,node]of nodes)if(node.parent){const ids=children.get(node.parent)||[];ids.push(id);children.set(node.parent,ids);edges.push({from:node.parent,to:id,relation:'branches'});}
  for(const edge of map.edges)if(edge.relation==='compares'&&nodes.has(edge.from)&&nodes.has(edge.to))edges.push(edge);
  return {...map,nodes,edges,children};
}

// Call once after inclusion changes, before painting or moving the camera.
export function reconcileMap(map,layout,positions,{previous=[],locked=[],collapsed=[],growthRoots=[]}={}){
  const before=new Set(previous),added=[...map.nodes.keys()].filter(id=>!before.has(id));
  if(!added.length||layout==='manual'||layout==='bloom')return {positions,added,moved:[],constrained:[]};
  let result=tidyMap(map,layout,positions,{locked,collapsed,growthRoots});
  // Explicit shape Tidy may recompose kept nodes; automatic growth must not.
  const kept=locked.filter(id=>map.nodes.has(id)&&positions[id]);
  if(kept.some(id=>result.positions[id]?.x!==positions[id].x||result.positions[id]?.y!==positions[id].y)){
    const anchors={...result.positions};for(const id of kept)anchors[id]={...positions[id]};
    result=tidyMap(map,'manual',anchors,{locked:kept,collapsed,growthRoots});
  }
  return {...result,positions:{...positions,...result.positions},added,moved:[...map.nodes.keys()].filter(id=>positions[id]?.x!==result.positions[id]?.x||positions[id]?.y!==result.positions[id]?.y)};
}

export function frameMapNodes(positions,ids,area,{originId}={}){
  const points=[...new Set(ids)].map(id=>positions.get?positions.get(id):positions[id]).filter(Boolean);if(!points.length)return null;
  let b=boundsOf(points);const origin=originId&&(positions.get?positions.get(originId):positions[originId]);
  if(origin){const together=boundsOf([...points,origin]);if(Math.min((area.width-48)/together.width,(area.height-48)/together.height)>=.7)b=together;}
  const scale=Math.max(.025,Math.min(1,Math.max(32,area.width-48)/Math.max(1,b.width),Math.max(32,area.height-48)/Math.max(1,b.height)));
  return {scale,x:area.x+area.width/2-(b.x+b.width/2)*scale,y:area.y+area.height/2-(b.y+b.height/2)*scale};
}
