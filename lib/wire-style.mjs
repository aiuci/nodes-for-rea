// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
export const WIRE_STYLES=['spline','linear','straight'];
export function cleanWireStyle(value,circuit=false){return WIRE_STYLES.includes(value)?value:circuit?'straight':'spline';}
export function linearWirePoints(start,end,{vertical=false,points}={}){
  if(points?.length>1)return points;
  const axis=vertical?'y':'x',delta=end[axis]-start[axis],stub=Math.sign(delta)*Math.min(16,Math.abs(delta)/3);
  return [start,{...start,[axis]:start[axis]+stub},{...end,[axis]:end[axis]-stub},end];
}
// Chamfer only inside a small corner envelope. Keep every routing waypoint;
// a style change must not shortcut an obstacle or the report's action pill.
export function linearWirePath(start,end,options={}){
  const p=linearWirePoints(start,end,options).filter((v,i,all)=>!i||v.x!==all[i-1].x||v.y!==all[i-1].y);
  let d=`M${p[0].x} ${p[0].y}`;
  for(let i=1;i<p.length-1;i++){
    const a=p[i-1],b=p[i],c=p[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),r=Math.min(8,ab/3,bc/3);
    d+=` L${b.x+(a.x-b.x)*r/ab} ${b.y+(a.y-b.y)*r/ab} L${b.x+(c.x-b.x)*r/bc} ${b.y+(c.y-b.y)*r/bc}`;
  }
  return d+` L${p.at(-1).x} ${p.at(-1).y}`;
}
export function linearWireHitsNode(start,end,obstacles,options={}){
  const p=linearWirePoints(start,end,options);
  return p.slice(1).some((b,i)=>obstacles.some(r=>{
    const a=p[i],dx=b.x-a.x,dy=b.y-a.y;let lo=0,hi=1;
    for(const [origin,delta,min,max]of [[a.x,dx,r.x-10,r.x+r.width+10],[a.y,dy,r.y-10,r.y+r.height+10]]){
      if(!delta){if(origin<min||origin>max)return false;continue;}
      const u=(min-origin)/delta,v=(max-origin)/delta;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>hi)return false;
    }
    return true;
  }));
}
