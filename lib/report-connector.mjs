// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function rounded(points,radius=18){
  const p=points.filter((point,i)=>!i||point.x!==points[i-1].x||point.y!==points[i-1].y);
  let d=`M${p[0].x} ${p[0].y}`;
  for(let i=1;i<p.length-1;i++){
    const a=p[i-1],b=p[i],c=p[i+1],ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),r=Math.min(radius,ab/2,bc/2);
    const before={x:b.x+(a.x-b.x)*r/ab,y:b.y+(a.y-b.y)*r/ab},after={x:b.x+(c.x-b.x)*r/bc,y:b.y+(c.y-b.y)*r/bc};
    d+=` L${before.x} ${before.y} Q${b.x} ${b.y} ${after.x} ${after.y}`;
  }
  return d+` L${p.at(-1).x} ${p.at(-1).y}`;
}
export function reportConnector(node,reader,{pill,dock='floating',clearance=28}={}){
  const start={x:node.x+Math.max(node.width/2,node.width-22),y:node.y+node.height};
  const lane=Math.max(start.y,pill?pill.y+pill.height:start.y)+clearance;
  const right=reader.x>=node.x+node.width,left=reader.x+reader.width<=node.x;
  let end,points;
  if(dock==='bottom'&&reader.y>start.y+8){
    end={x:clamp(start.x,reader.x+24,reader.x+reader.width-24),y:reader.y};
    const y=Math.min(lane,reader.y-8);points=[start,{x:start.x,y},{x:end.x,y},end];
  }else if(right||left){
    end={x:right?reader.x:reader.x+reader.width,y:clamp(lane,reader.y+24,reader.y+reader.height-24)};
    const x=right?end.x-20:end.x+20;points=[start,{x:start.x,y:lane},{x,y:lane},{x,y:end.y},end];
  }else{
    const above=reader.y+reader.height<=node.y;
    end={x:clamp(start.x,reader.x+24,reader.x+reader.width-24),y:above?reader.y+reader.height:reader.y};
    const x=Math.max(node.x+node.width,pill?pill.x+pill.width:0,reader.x+reader.width)+clearance;
    const y=above?end.y+clearance:end.y-clearance;
    points=[start,{x:start.x,y:lane},{x,y:lane},{x,y},{x:end.x,y},end];
  }
  return {d:rounded(points),start,end,lane,points};
}
