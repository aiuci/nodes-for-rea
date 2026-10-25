// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {segmentHits,growthPorts} from './result-growth.mjs';

export function connectionPorts(a,b,{layout,comparison=false}={}){
  if(layout==='river'&&!comparison){const forward=b.x+b.width/2>=a.x+a.width/2;return {vertical:false,start:{x:a.x+(forward?a.width:0),y:a.y+a.height/2},end:{x:b.x+(forward?0:b.width),y:b.y+b.height/2}};}
  if(comparison||['compact','radial','spiral','wisp','organic','shattered','exploded','constellation','river','orbit','honeycomb'].includes(layout))return growthPorts(a,b);
  if(layout==='vertical'||layout==='tree'){
    const down=b.y+b.height/2>=a.y+a.height/2;
    return {vertical:true,start:{x:a.x+a.width/2,y:a.y+(down?a.height:0)},end:{x:b.x+b.width/2,y:b.y+(down?0:b.height)}};
  }
  return {vertical:false,start:{x:a.x+a.width,y:a.y+a.height/2},end:{x:b.x,y:b.y+b.height/2}};
}

// Use bounded spatial intervals: fixed time steps skip cards on long links.
export function wireHitsNode(start,end,obstacles,{vertical=false,circuit=false,tension=.5}={}){
  const mid=vertical?(start.y+end.y)/2:(start.x+end.x)/2;
  if(circuit){const points=vertical?[start,{x:start.x,y:mid},{x:end.x,y:mid},end]:[start,{x:mid,y:start.y},{x:mid,y:end.y},end];return obstacles.some(r=>points.slice(1).some((p,i)=>segmentHits(points[i],p,r,6)));}
  const a=vertical?{x:start.x,y:start.y+(end.y-start.y)*tension}:{x:start.x+(end.x-start.x)*tension,y:start.y},b=vertical?{x:end.x,y:end.y-(end.y-start.y)*tension}:{x:end.x-(end.x-start.x)*tension,y:end.y};
  const minX=Math.min(start.x,end.x)-6,maxX=Math.max(start.x,end.x)+6,minY=Math.min(start.y,end.y)-6,maxY=Math.max(start.y,end.y)+6;
  const near=obstacles.filter(r=>r.x<maxX&&r.x+r.width>minX&&r.y<maxY&&r.y+r.height>minY);if(!near.length)return false;
  const steps=Math.max(24,Math.ceil((Math.hypot(a.x-start.x,a.y-start.y)+Math.hypot(b.x-a.x,b.y-a.y)+Math.hypot(end.x-b.x,end.y-b.y))/6));
  for(let i=1;i<steps;i++){const t=i/steps,s=1-t,x=s*s*s*start.x+3*s*s*t*a.x+3*s*t*t*b.x+t*t*t*end.x,y=s*s*s*start.y+3*s*s*t*a.y+3*s*t*t*b.y+t*t*t*end.y;if(near.some(r=>x>r.x-6&&x<r.x+r.width+6&&y>r.y-6&&y<r.y+r.height+6))return true;}
  return false;
}
