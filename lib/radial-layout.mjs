// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function menuRegions(viewport,reader,top=64,bounds=null){
  const all=bounds?{x:bounds.x+8,y:bounds.y+8,width:Math.max(60,bounds.width-16),height:Math.max(60,bounds.height-16)}:{x:10,y:Math.min(top,viewport.height*.15),width:viewport.width-20,height:viewport.height-Math.min(top,viewport.height*.15)-10};
  if(!reader)return {all,regions:[all]};
  return {all,regions:[
    {x:all.x,y:all.y,width:reader.x-all.x-12,height:all.height},
    {x:reader.x+reader.width+12,y:all.y,width:all.x+all.width-reader.x-reader.width-12,height:all.height},
    {x:all.x,y:all.y,width:all.width,height:reader.y-all.y-12},
    {x:all.x,y:reader.y+reader.height+12,width:all.width,height:all.y+all.height-reader.y-reader.height-12}
  ].filter(r=>r.width>0&&r.height>0)};
}
// Main/Dev cascading stack: ordered tools emerge beside their node.
// Keep the newer viewport/reader bounds and toolbar-only fan behavior.
export function radialLayout(count,anchor,viewport,{reader,node,itemHeight=36,itemHeights=null,bounds=null,obstacles=[],fan=false,centerOnNode=false}={}){
  if(fan)return flywheelLayout(count,anchor,viewport,{reader,node,itemHeight,bounds,obstacles});
  const {all,regions}=menuRegions(viewport,reader,64,bounds),width=Math.min(312,all.width),gap=8,pad=8;
  const centered=centerOnNode&&count===4&&node,centerY=centered?node.y+node.height/2:anchor.y;
  const measured=Array.from({length:count},(_,i)=>itemHeights?.[i]||itemHeight),heights=centered?measured.map(()=>Math.max(...measured)):measured;
  const contentHeight=pad*2+heights.reduce((sum,h)=>sum+h,0)+Math.max(0,count-1)*gap,height=Math.min(contentHeight,all.height),candidates=[];
  const intersection=(a,b)=>b?Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)):0;
  for(const region of [...regions.filter(r=>r.width>=width&&r.height>=Math.min(all.height,160)),all]){
    for(const direction of [1,-1]){
      const wantedX=direction===1?Math.max(anchor.x+22,node?node.x+node.width+12:0):Math.min(anchor.x-width-22,node?node.x-width-12:Infinity);
      for(const wantedY of [centerY-height/2,node?node.y-height-12:centerY-height/2,node?node.y+node.height+12:centerY-height/2]){
        const rect={x:clamp(wantedX,region.x,region.x+region.width-width),y:clamp(wantedY,region.y,region.y+region.height-Math.min(height,region.height)),width,height:Math.min(height,region.height)};
        const distance=Math.hypot(rect.x-wantedX,rect.y-(centerY-height/2));
        const score=intersection(rect,node)*50+intersection(rect,reader)*8+distance+(direction===1?0:16)+(contentHeight-rect.height)*2;
        candidates.push({...rect,direction,region,score});
      }
    }
  }
  const best=candidates.sort((a,b)=>a.score-b.score)[0],itemWidth=width-pad*2;
  let rowY=pad;
  const slots=heights.map(h=>{const slot={x:pad,y:rowY,width:itemWidth,height:h};rowY+=h+gap;return slot;});
  return {...best,contentHeight,slots,hub:{x:anchor.x-best.x,y:anchor.y-best.y,width:26},scroll:contentHeight>best.height};
}

// The toolbar has more secondary commands than a node. Spread the same connected
// actions around a wheel, with a compact two-wing fan for a narrow canvas.
function flywheelLayout(count,anchor,viewport,{reader,node,itemHeight,bounds,obstacles}){
  const {all,regions}=menuRegions(viewport,reader,64,bounds),width=Math.min(656,all.width),itemWidth=Math.min(count>8?140:164,(width-32)/2),pad=8;
  const ring=width>=550,rows=Math.ceil(count/2),ry=Math.max(132,itemHeight*3.3),height=Math.min(all.height,ring?ry*2+itemHeight+16:rows*(itemHeight+12)+24),slots=[];
  for(let i=0;i<count;i++){
    if(ring){const a=-Math.PI/2+i*Math.PI*2/count;slots.push({x:width/2+Math.cos(a)*(width-itemWidth-16)/2-itemWidth/2,y:height/2+Math.sin(a)*(height-itemHeight-16)/2-itemHeight/2,width:itemWidth,height:itemHeight});}
    else{const row=Math.floor(i/2),wing=i%2,sway=8*Math.sin((row+1)/(rows+1)*Math.PI);slots.push({x:wing?width-itemWidth-pad-sway:pad+sway,y:pad+row*(itemHeight+12)+(wing?8:0),width:itemWidth,height:itemHeight});}
  }
  const hit=(a,b)=>b?Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)):0,candidates=[];
  for(const region of [...regions.filter(r=>r.width>=width&&r.height>=height),all])for(const [dx,dy]of [[-width/2,-height-36],[24,-height/2],[-width-24,-height/2],[-width/2,36]]){
    const x=clamp(anchor.x+dx,region.x,region.x+region.width-width),y=clamp(anchor.y+dy,region.y,region.y+region.height-height),rect={x,y,width,height};
    const score=slots.reduce((sum,p)=>{const r={...p,x:p.x+x,y:p.y+y};return sum+hit(r,reader)*8+hit(r,node)*50+obstacles.reduce((v,o)=>v+hit(r,o)*40,0);},0)+Math.hypot(x+width/2-anchor.x,y+height/2-anchor.y);
    candidates.push({...rect,score});
  }
  const best=candidates.sort((a,b)=>a.score-b.score)[0];return {...best,direction:best.x+width/2>=anchor.x?1:-1,slots,contentHeight:Math.max(height,...slots.map(p=>p.y+p.height+pad)),hub:{x:anchor.x-best.x,y:anchor.y-best.y,width:26},scroll:slots.some(p=>p.y+p.height>height)};
}

// Canvas tools are a local connected stack, not graph nodes or a toolbar wheel.
export function compactCanvasMenuLayout(count,anchor,viewport,{bounds,itemHeight=44,itemHeights=null}={}){
  const useCanvas=bounds?.width>=220&&bounds?.height>=180;
  const left=useCanvas?Math.max(8,bounds.x+8):8,top=useCanvas?Math.max(8,bounds.y+8):8;
  const right=useCanvas?Math.min(viewport.width-8,bounds.x+bounds.width-8):viewport.width-8,bottom=useCanvas?Math.min(viewport.height-8,bounds.y+bounds.height-8):viewport.height-8;
  const width=Math.min(262,Math.max(1,right-left)),pad=6,gap=6,heights=Array.from({length:count},(_,i)=>itemHeights?.[i]||itemHeight);
  const contentHeight=pad*2+heights.reduce((sum,h)=>sum+h,0)+Math.max(0,count-1)*gap,height=Math.min(contentHeight,Math.max(1,bottom-top));
  const direction=right-anchor.x-22>=width||anchor.x-left<right-anchor.x?1:-1;
  const x=clamp(direction===1?anchor.x+22:anchor.x-width-22,left,Math.max(left,right-width)),y=clamp(anchor.y-height/2,top,Math.max(top,bottom-height));
  let rowY=pad;const slots=heights.map(h=>{const p={x:pad,y:rowY,width:width-pad*2,height:h};rowY+=h+gap;return p;});
  return {x,y,width,height,direction,slots,contentHeight,scroll:contentHeight>height};
}
