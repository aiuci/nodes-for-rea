// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Shelf-pack whole subtrees, keeping their order and the selected flow direction.
// This is an explicit arrangement operation; zoom and analysis never invoke it.
export function packMap(map,layout,{width=1200,height=700}={}) {
  if(!['horizontal','vertical','compact'].includes(layout))return null;
  const vertical=layout==='vertical',W=220,H=66;
  const primary=vertical?H:W,cross=vertical?W:H;
  const along=vertical?128:132,between=vertical?128:30;
  const children=new Map(),roots=[],seen=new Set();
  const visit=id=>{if(seen.has(id)||!map.nodes.has(id))return false;seen.add(id);const list=[];children.set(id,list);for(const child of map.children.get(id)||[])if(visit(child))list.push(child);return true;};
  if(visit(map.root))roots.push(map.root);
  for(const id of map.nodes.keys())if(visit(id))roots.push(id);
  if(!seen.size)return {};
  const w=Math.max(220,Number.isFinite(width)?width:1200),h=Math.max(160,Number.isFinite(height)?height:700);
  const count=seen.size,ideal=Math.sqrt(count*(W+100)*(H+30)*(vertical?w/h:h/w));
  const limits=[1,2,3,4,5,6,8,10,12,16,24,32,48,64,96].map(n=>n*(cross+between)-between);
  limits.push(ideal,ideal*.7,ideal*1.4);
  let best,bestScore=-Infinity,bestOriented=false;
  for(const limit of limits){
    const blocks=new Map();
    const measure=id=>{
      const branches=children.get(id).map(measure),columns=[];
      let column={items:[],a:0,b:0};
      for(const block of branches){
        if(column.items.length&&column.b+between+block.b>limit){columns.push(column);column={items:[],a:0,b:0};}
        const offset=column.items.length?column.b+between:0;
        column.items.push({block,offset});column.b=offset+block.b;column.a=Math.max(column.a,block.a);
      }
      if(column.items.length)columns.push(column);
      const b=Math.max(cross,...columns.map(c=>c.b)),placements=[];
      let cursor=primary+along;
      for(const col of columns){for(const item of col.items)placements.push({id:item.block.id,p:cursor,c:item.offset+(b-col.b)/2});cursor+=col.a+along;}
      const block={id,a:columns.length?cursor-along:primary,b,placements};blocks.set(id,block);return block;
    };
    const forest=roots.map(measure),a=Math.max(...forest.map(b=>b.a)),b=forest.reduce((sum,block)=>sum+block.b,0)+between*(forest.length-1);
    const bw=vertical?b:a,bh=vertical?a:b,scale=Math.min(w/(bw+120),h/(bh+32));
    // The label describes the visible composition, not only parent flow.
    // Fit may choose density within that orientation, never its opposite.
    const oriented=layout==='compact'||(vertical?bh>=bw*1.15:bw>=bh*1.15);
    const score=scale-1e-9*bw*bh;
    if(best&&(bestOriented&&!oriented||bestOriented===oriented&&score<=bestScore))continue;
    const points={};
    const place=(id,p,c)=>{const block=blocks.get(id),mid=c+(block.b-cross)/2;points[id]={x:vertical?mid:p,y:vertical?p:mid,width:W,height:H};for(const child of block.placements)place(child.id,p+child.p,c+child.c);};
    let offset=0;for(const root of roots){place(root,0,offset);offset+=blocks.get(root).b+between;}
    best=points;bestScore=score;bestOriented=oriented;
  }
  return best;
}

// Saved coordinates are not migrated on load. Explicit preset/Tidy actions may
// repair a stretched composition while keeping a reversible original snapshot.
export function matchesOrientation(points,layout){
  if(!['horizontal','vertical'].includes(layout))return true;
  const values=Object.values(points);if(values.length<2)return true;
  const width=Math.max(...values.map(p=>p.x+p.width))-Math.min(...values.map(p=>p.x));
  const height=Math.max(...values.map(p=>p.y+p.height))-Math.min(...values.map(p=>p.y));
  return layout==='horizontal'?width>=height:height>=width;
}
export function orientPositions(map,layout,saved,options={}){
  const visible=Object.fromEntries([...map.nodes.keys()].filter(id=>saved[id]).map(id=>[id,saved[id]]));
  if(matchesOrientation(visible,layout))return {positions:saved,changed:false,constrained:false};
  const protectedIds=[...(options.locked||[]),...(options.collapsed||[])].filter(id=>id!==map.root&&map.nodes.has(id));
  if(protectedIds.length)return {positions:saved,changed:false,constrained:true};
  const packed=packMap(map,layout,options);if(!packed)return {positions:saved,changed:false,constrained:false};
  const from=saved[map.root],to=packed[map.root],dx=options.preserveRoot!==false&&from&&to?from.x-to.x:0,dy=options.preserveRoot!==false&&from&&to?from.y-to.y:0;
  const positions={...saved};for(const [id,p]of Object.entries(packed))positions[id]={...p,x:p.x+dx,y:p.y+dy};
  return {positions,changed:true,constrained:false};
}
