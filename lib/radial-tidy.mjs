// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {circularMap} from './shape-arrangements.mjs';
export const radialTidy=circularMap;
const center=p=>({x:p.x+p.width/2,y:p.y+p.height/2});
export function radialHierarchyRoute(a,b,core,{circuit=false,direction}={}){
  const ac=center(a),bc=center(b),o=center(core),u=direction||{x:bc.x-o.x,y:bc.y-o.y},vertical=Math.abs(u.y)>Math.abs(u.x),positive=vertical?u.y>=0:u.x>=0;
  const start=vertical?{x:ac.x,y:a.y+(positive?a.height:0)}:{x:a.x+(positive?a.width:0),y:ac.y},end=vertical?{x:bc.x,y:b.y+(positive?0:b.height)}:{x:b.x+(positive?0:b.width),y:bc.y},mid=vertical?(start.y+end.y)/2:(start.x+end.x)/2;
  const d=circuit?(vertical?`M${start.x} ${start.y} V${mid} H${end.x} V${end.y}`:`M${start.x} ${start.y} H${mid} V${end.y} H${end.x}`):(vertical?`M${start.x} ${start.y} C${start.x} ${mid},${end.x} ${mid},${end.x} ${end.y}`:`M${start.x} ${start.y} C${mid} ${start.y},${mid} ${end.y},${end.x} ${end.y}`);
  return {start,end,d,vertical};
}
export function circularHierarchyRoute(a,b,core,{circuit=false}={}){
  const o=center(core),ac=center(a),bc=center(b),ra=Math.hypot(ac.x-o.x,ac.y-o.y),rb=Math.hypot(bc.x-o.x,bc.y-o.y),theta=ra<1?Math.atan2(bc.y-o.y,bc.x-o.x):Math.atan2(ac.y-o.y,ac.x-o.x),raw=Math.atan2(bc.y-o.y,bc.x-o.x),angle=raw+Math.PI*2*Math.round((theta-raw)/(Math.PI*2)),r=Math.max(1,Math.min(ra+Math.hypot(a.width,a.height)/2+18,rb-Math.hypot(b.width,b.height)/2-18)),pa={x:o.x+Math.cos(theta)*r,y:o.y+Math.sin(theta)*r},pb={x:o.x+Math.cos(angle)*r,y:o.y+Math.sin(angle)*r};
  const boundary=(rect,target)=>{const c=center(rect),dx=target.x-c.x,dy=target.y-c.y,t=1/Math.max(Math.abs(dx)/(rect.width/2),Math.abs(dy)/(rect.height/2),.000001);return {x:c.x+dx*t,y:c.y+dy*t};},start=boundary(a,pa),end=boundary(b,pb);
  if(circuit)return radialHierarchyRoute(a,b,core,{circuit:true});
  const count=Math.max(1,Math.ceil(Math.abs(angle-theta)/.1)),points=[start,...Array.from({length:count+1},(_,i)=>({x:o.x+Math.cos(theta+(angle-theta)*i/count)*r,y:o.y+Math.sin(theta+(angle-theta)*i/count)*r})),end];
  return {start,end,points,d:`M${start.x} ${start.y} L${pa.x} ${pa.y} A${r} ${r} 0 0 ${angle>=theta?1:0} ${pb.x} ${pb.y} L${end.x} ${end.y}`};
}
