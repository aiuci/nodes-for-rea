// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {NODE_GAP} from './map-spacing.mjs';

const hits=(a,b,gap)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;

// Measured DOM rectangles are authoritative. Never relocate manual/kept anchors.
export function fitContentRectangles(positions,sizes,{locked=[],manual=false,gap=NODE_GAP}={}){
  const result={...positions},fixed=new Set(locked),occupied=[],moved=[],constrained=[];
  const ids=Object.keys(sizes);
  for(const id of ids)result[id]={...positions[id],width:sizes[id].width,height:sizes[id].height};
  for(const id of ids.filter(id=>manual||fixed.has(id))){
    if(occupied.some(p=>hits(result[id],p,0)))constrained.push(id);
    occupied.push(result[id]);
  }
  for(const id of ids.filter(id=>!manual&&!fixed.has(id))){
    const original=result[id];let next=original;
    // Monotone vertical repair terminates and preserves each layout's columns,
    // rings and deliberate anchors wherever the measured rectangles already fit.
    for(let i=0;i<=occupied.length;i++){
      const collisions=occupied.filter(p=>hits(next,p,gap));if(!collisions.length)break;
      next={...next,y:Math.max(...collisions.map(p=>p.y+p.height+gap))};
    }
    result[id]=next;occupied.push(next);if(next.y!==original.y)moved.push(id);
  }
  return {positions:result,moved,constrained};
}
