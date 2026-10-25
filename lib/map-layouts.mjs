// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {LAYOUTS,cleanWorkspace,cleanPositions} from './workspace.mjs';
import {packMap} from './adaptive-layout.mjs';
import {growthPocket} from './result-growth.mjs';
import {clusteredRadial,shatteredMap,explodedMap} from './cluster-arrangements.mjs';
import {circularMap,spiralMap} from './shape-arrangements.mjs';
import {bloomMap} from './bloom-layout.mjs';
import {organicMap} from './organic-layout.mjs';
import {ADDITIONAL_LAYOUTS,additionalLayout} from './additional-layouts.mjs';

const WIDTH=220,HEIGHT=66,GAP=32;
const rectangle=(x,y)=>({x,y,width:WIDTH,height:HEIGHT});
const collision=(p,q)=>p.x<q.x+q.width+GAP&&p.x+p.width+GAP>q.x&&p.y<q.y+q.height+GAP&&p.y+p.height+GAP>q.y;

// Standard tree/outline arrangements over the same saved graph. Layout is a
// presentation: it never filters records or changes investigation relationships.
export function layoutMap(map,layout='horizontal',savedPositions={}) {
  if(layout&&typeof layout==='object')({layout='horizontal',positions:savedPositions={}}=layout);
  if(!LAYOUTS.includes(layout))layout='horizontal';
  const positions={},saved=cleanPositions(savedPositions),depths=new Map(),order=[],seen=new Set();
  if(!Object.keys(saved).length&&['horizontal','vertical'].includes(layout))return packMap(map,layout);
  if(layout==='bloom')return bloomMap(map,saved).positions;
  if(layout==='organic')return organicMap(map,saved).positions;
  if(!Object.keys(saved).length&&ADDITIONAL_LAYOUTS.includes(layout))return additionalLayout(map,layout).positions;
  if(!Object.keys(saved).length&&['radial','spiral','wisp','shattered','exploded'].includes(layout))return ({radial:circularMap,spiral:spiralMap,wisp:clusteredRadial,shattered:shatteredMap,exploded:explodedMap}[layout])(map).positions;
  const visit=(id,depth)=>{if(seen.has(id)||!map.nodes.has(id))return;seen.add(id);depths.set(id,depth);order.push(id);for(const child of map.children.get(id)||[])visit(child,depth+1);};
  visit(map.root,0);for(const id of map.nodes.keys())if(!seen.has(id))visit(id,1);
  // Existing anchors stay fixed as new knowledge arrives or visibility changes.
  for(const id of order)if(saved[id])positions[id]=rectangle(saved[id].x,saved[id].y);
  if(Object.keys(saved).length>1)for(const id of order){const n=map.nodes.get(id);if(!positions[id]&&['result','attempt','discovery'].includes(n.type)&&positions[n.parent])Object.assign(positions,growthPocket(map,id,positions,layout));}
  const candidates={};
  if(layout==='radial'||layout==='spiral') {
    const weights=new Map();
    const weigh=id=>{if(weights.has(id))return weights.get(id);const children=(map.children.get(id)||[]).filter(child=>depths.get(child)===depths.get(id)+1);const n=Math.max(1,children.reduce((sum,child)=>sum+weigh(child),0));weights.set(id,n);return n;};
    weigh(map.root);
    const rings=new Map();for(const id of order){const depth=depths.get(id);rings.set(depth,(rings.get(depth)||0)+1);}
    const radius=[0];for(let depth=1;depth<=Math.max(0,...depths.values());depth++)radius[depth]=Math.max(radius[depth-1]+320,(rings.get(depth)||1)*(WIDTH+GAP)/(Math.PI*2));
    const place=(id,start,end)=>{const depth=depths.get(id),angle=(start+end)/2-Math.PI/2+(layout==='spiral'?depth*.42:0),r=radius[depth]||0;candidates[id]=rectangle(Math.cos(angle)*r,Math.sin(angle)*r);let cursor=start;const children=(map.children.get(id)||[]).filter(child=>depths.get(child)===depth+1),total=children.reduce((sum,child)=>sum+weigh(child),0)||1;for(const child of children){const span=(end-start)*weigh(child)/total;place(child,cursor,cursor+span);cursor+=span;}};
    place(map.root,0,Math.PI*2);
  } else {
    let leaf=0;
    const axis=id=>{const children=(map.children.get(id)||[]).filter(child=>depths.get(child)===depths.get(id)+1);const indexes=children.map(axis);const position=indexes.length?(indexes[0]+indexes.at(-1))/2:leaf++;const depth=depths.get(id);
      candidates[id]=layout==='vertical'?rectangle(position*(WIDTH+56),depth*(HEIGHT+104)):layout==='compact'?rectangle(depth*(WIDTH+68),position*(HEIGHT+24)):rectangle(depth*(WIDTH+88),position*(HEIGHT+42));return position;};
    axis(map.root);
  }
  for(const [index,id]of order.entries()) {
    if(positions[id])continue;
    let p=candidates[id]||rectangle(0,index*(HEIGHT+GAP));
    // Preserve the chosen depth axis while allocating a free slot. This also
    // accommodates manually moved anchors and later appends in every layout.
    while(Object.values(positions).some(q=>collision(p,q)))p=layout==='vertical'?{...p,x:p.x+WIDTH+GAP}:{...p,y:p.y+HEIGHT+GAP};
    positions[id]=p;
  }
  return positions;
}

export function switchLayout(workspace,map,nextLayout) {
  const result=cleanWorkspace(workspace);
  if(!LAYOUTS.includes(nextLayout))return result;
  result.layouts[result.layout]={positions:cleanPositions(result.mapPositions),camera:result.mapCamera};
  const next=result.layouts[nextLayout];
  const initial=next?.positions||(nextLayout==='manual'?result.mapPositions:{});
  result.layout=nextLayout;
  result.mapPositions={...cleanPositions(initial),...layoutMap(map,nextLayout,initial)};
  result.mapCamera=next?.camera||null;
  result.layouts[nextLayout]={positions:result.mapPositions,camera:result.mapCamera};
  return result;
}
