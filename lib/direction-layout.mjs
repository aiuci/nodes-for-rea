// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
export function directionLayout(graph,expanded,{positions:stored=new Map()}={}){
  const discovery=graph.discovery,rows=discovery?.features||[],height=222+rows.length*48;
  if(stored.get(graph.root)?.width!==1000)stored.clear();
  if(!stored.has(graph.root))stored.set(graph.root,{x:40,y:40,width:1000,height});
  const root=stored.get(graph.root);Object.assign(root,{width:1000,height});
  const positions=new Map([[graph.root,root]]),children=new Map();
  for(const data of graph.nodes.values())if(data.parent){const list=children.get(data.parent)||[];list.push(data.id);children.set(data.parent,list);}
  for(const [index,row]of rows.entries()){
    const id=`feature:${row.name.trim().toLowerCase()}`,point={x:root.x+966,y:root.y+168+32+index*48+24-66,width:0,height:0};stored.set(id,point);positions.set(id,point);
  }
  const queue=[...positions.keys()].filter(id=>expanded.has(id));
  while(queue.length){
    const parentId=queue.shift(),parent=positions.get(parentId);if(!parent)continue;
    for(const id of children.get(parentId)||[]){
      const data=graph.nodes.get(id);if(data.type==='feature')continue;
      if(!stored.has(id)){
        const point={x:parent.width?parent.x+parent.width+100:root.x+root.width+100,y:parent.y+66-86,width:280,height:172};
        const overlaps=other=>other.width&&point.x<other.x+other.width+20&&point.x+point.width+20>other.x&&point.y<other.y+other.height+20&&point.y+point.height+20>other.y;
        while([...stored.values()].some(overlaps))point.y+=196;
        stored.set(id,point);
      }
      positions.set(id,stored.get(id));if(expanded.has(id))queue.push(id);
    }
  }
  const actual=[...positions.values()].filter(point=>point.width),minX=Math.min(...actual.map(point=>point.x)),minY=Math.min(...actual.map(point=>point.y)),maxX=Math.max(...actual.map(point=>point.x+point.width)),maxY=Math.max(...actual.map(point=>point.y+point.height));
  return {positions,children,bounds:{minX,minY,maxX,maxY},width:maxX-minX,height:maxY-minY};
}
