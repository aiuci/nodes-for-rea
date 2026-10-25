// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// A display projection only: saved nodes, relationships and their content stay intact.
export function accordionLayout(graph,base,{positions:stored=new Map()}={}){
  const paths=new Map(),location=new Map();
  function locate(data){
    if(location.has(data.id))return location.get(data.id);
    const parent=graph.nodes.get(data.parent),previous=['recommendation','result'].includes(parent?.type)?locate(parent):null;
    const result={anchor:previous?.anchor||data.parent||graph.root,depth:(previous?.depth||0)+1};location.set(data.id,result);return result;
  }
  for(const data of graph.nodes.values())if(['recommendation','result'].includes(data.type)){
    const at=locate(data);if(!paths.has(at.anchor))paths.set(at.anchor,{anchor:at.anchor,nodes:[],depth:0});const branch=paths.get(at.anchor);branch.nodes.push(data);branch.depth=Math.max(branch.depth,at.depth);
  }
  const positions=new Map(base.positions),histories=new Map(),groups=new Map(),groupForNode=new Map(),compacted=new Map();
  const root=base.positions.get(graph.root),startX=(root?.x||0)+(root?.width||260)+100;
  for(const branch of paths.values()){
    const bucket=Math.floor((branch.depth-1)/3);if(!bucket)continue;
    const visible=branch.nodes.filter(data=>base.positions.has(data.id));if(!visible.length)continue;
    const anchor=graph.nodes.get(branch.anchor),label=anchor?.title||'Exploration',historyId=`history:${branch.anchor}`,branchGroups=new Map();
    for(const data of branch.nodes){
      const {depth}=location.get(data.id),index=Math.floor((depth-1)/3);if(index>=bucket)continue;
      const id=`${historyId}:${index}`;if(!branchGroups.has(index))branchGroups.set(index,{id,historyId,anchor:branch.anchor,label,start:index*3+1,end:index*3+3,nodes:[]});branchGroups.get(index).nodes.push(data);groupForNode.set(data.id,id);positions.delete(data.id);
    }
    if(!branchGroups.size)continue;
    const ordered=[...branchGroups.values()].sort((a,b)=>a.start-b.start);for(const group of ordered)groups.set(group.id,group);
    const points=visible.map(data=>base.positions.get(data.id)),top=Math.min(...points.map(point=>point.y)),height=42+Math.min(3,ordered.length)*72;
    const place=(id,point,revision)=>{const saved=stored.get(id),value={...point,...(saved?.revision===revision?{x:saved.x,y:saved.y}:{})};positions.set(id,value);compacted.set(id,revision);return value;};
    const historyPoint=place(historyId,{x:startX,y:top,width:240,height},'history');histories.set(historyId,{id:historyId,label,groups:ordered});
    for(const data of visible){const at=location.get(data.id);if(at.depth<=bucket*3)continue;const point=base.positions.get(data.id);place(data.id,{...point,x:historyPoint.x+320+((at.depth-1)%3)*380},bucket);}
  }
  // Collapse each internal connection into its history block. External connections
  // still lead to the same continuation; preview connections retain original IDs.
  const representative=id=>groupForNode.has(id)?groups.get(groupForNode.get(id)).historyId:id,keys=new Set(),edges=[];
  for(const edge of graph.edges){const from=representative(edge.from),to=representative(edge.to),key=`${from}\0${to}`;if(from===to||keys.has(key)||!positions.has(from)||!positions.has(to))continue;keys.add(key);edges.push({...edge,from,to});}
  const actual=[...positions.values()].filter(point=>point.width),bounds={minX:Math.min(...actual.map(point=>point.x)),minY:Math.min(...actual.map(point=>point.y)),maxX:Math.max(...actual.map(point=>point.x+point.width)),maxY:Math.max(...actual.map(point=>point.y+point.height))};
  return {...base,positions,histories,groups,groupForNode,compacted,location,edges,bounds,width:bounds.maxX-bounds.minX,height:bounds.maxY-bounds.minY};
}
