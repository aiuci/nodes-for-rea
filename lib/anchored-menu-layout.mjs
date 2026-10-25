// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const hit=(a,b)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
export function anchoredMenuRect(anchor,size,bounds,obstacles=[],submenu=false){
  const width=Math.min(size.width,bounds.width),height=Math.min(size.height,bounds.height),gap=6;
  const choices=submenu?[[anchor.x+anchor.width+gap,anchor.y], [anchor.x-width-gap,anchor.y]]:
    [[anchor.x,anchor.y-height-gap],[anchor.x+anchor.width-width,anchor.y-height-gap],[anchor.x,anchor.y+anchor.height+gap],[anchor.x+anchor.width-width,anchor.y+anchor.height+gap]];
  return choices.map(([x,y],index)=>{
    const r={x:clamp(x,bounds.x,bounds.x+bounds.width-width),y:clamp(y,bounds.y,bounds.y+bounds.height-height),width,height};
    return {...r,score:obstacles.reduce((n,o)=>n+hit(r,o)*10,0)+Math.hypot(r.x-x,r.y-y)+index};
  }).sort((a,b)=>a.score-b.score)[0];
}
