// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {intersects} from './result-growth.mjs';
// Preserve the user's approved flowing composition. Only actual card overlap
// needs local repair; empty space inside a fan is not an occupied rectangle.
export function wispTidy(map,saved,{locked=[],collapsed=[]}={}){
  const positions=structuredClone(saved),fixed=new Set([map.root,...locked,...collapsed]),placed=[],moved=[],constrained=[];
  const ids=[...map.nodes.keys()].sort((a,b)=>Number(fixed.has(b))-Number(fixed.has(a)));
  for(const id of ids){const initial=positions[id]||{x:0,y:0,width:220,height:66};let p={...initial};if(fixed.has(id)){if(placed.some(q=>intersects(p,q,32)))constrained.push(id);}else{
    for(let tries=0;tries<500;tries++){const hits=placed.filter(q=>intersects(p,q,32));if(!hits.length)break;const candidates=hits.flatMap(q=>[{...p,x:q.x-p.width-32},{...p,x:q.x+q.width+32},{...p,y:q.y-p.height-32},{...p,y:q.y+q.height+32}]).filter(c=>!placed.some(q=>intersects(c,q,32)));if(candidates.length){candidates.sort((a,b)=>Math.hypot(a.x-initial.x,a.y-initial.y)-Math.hypot(b.x-initial.x,b.y-initial.y));p=candidates[0];break;}p={...p,y:Math.max(...placed.map(q=>q.y+q.height))+32};}
  }positions[id]=p;placed.push(p);if(p.x!==initial.x||p.y!==initial.y)moved.push(id);}
  return {positions,moved,constrained};
}
