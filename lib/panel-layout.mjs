// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const bounded=(value,min,max,fallback)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
export function cleanPanelLayout(value){
  const input=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const f=input.floating;
  return {dock:input.dock==='bottom'?'bottom':'floating',bottomHeight:bounded(input.bottomHeight,120,4000,320),
    floating:f&&['x','y','width','height'].every(key=>Number.isFinite(f[key]))?{x:bounded(f.x,0,100000,0),y:bounded(f.y,0,100000,0),width:bounded(f.width,240,6000,350),height:bounded(f.height,120,4000,400)}:null,...(value?.expandedFrom&&['x','y','width','height'].every(key=>Number.isFinite(value.expandedFrom[key]))?{expandedFrom:cleanPanelLayout({floating:value.expandedFrom}).floating}:{})};
}
export function panelRectangle(preference,viewport,{reader=false,starter=false,naturalHeight=500}={}){
  const panel=cleanPanelLayout(preference),w=Math.max(32,viewport.width),h=Math.max(32,viewport.height);
  const maxW=Math.max(16,w-16),maxH=Math.max(16,h-24),minW=Math.min(240,maxW),minH=Math.min(120,maxH);
  if(panel.dock==='bottom'){const height=bounded(panel.bottomHeight,minH,Math.max(minH,h-80),320);return {x:8,y:h-height-8,width:maxW,height};}
  const desiredW=reader?Math.min(780,w*.7):starter?420:350;
  const width=bounded(panel.floating?.width,minW,maxW,Math.min(desiredW,maxW)),height=bounded(panel.floating?.height,minH,maxH,Math.min(Math.max(minH,naturalHeight),maxH));
  return {x:bounded(panel.floating?.x,8,Math.max(8,w-width-8),starter?(w-width)/2:Math.max(8,w-width-15)),y:bounded(panel.floating?.y,8,Math.max(8,h-height-8),Math.min(starter?h*.2:reader?16:24,Math.max(8,h-height-8))),width,height};
}
// Use the largest unoccluded rectangle for future Fit/reveal operations.
// Moving the panel never changes the map camera by itself.
export function availableMapArea(viewport,rect,dock='floating'){
  const w=viewport.width,h=viewport.height;if(!rect)return {x:0,y:0,width:w,height:h};
  if(dock==='bottom')return {x:0,y:0,width:w,height:Math.max(32,rect.y-12)};
  const candidates=[{x:0,y:0,width:Math.max(0,rect.x-16),height:h},{x:rect.x+rect.width+16,y:0,width:Math.max(0,w-rect.x-rect.width-16),height:h},{x:0,y:0,width:w,height:Math.max(0,rect.y-16)},{x:0,y:rect.y+rect.height+16,width:w,height:Math.max(0,h-rect.y-rect.height-16)}];
  return candidates.sort((a,b)=>b.width*b.height-a.width*a.height)[0];
}
