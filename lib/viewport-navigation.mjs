// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
export const clampZoom=value=>Math.max(.025,Math.min(2.5,value));
export function boundsCamera(bounds,area,{maxScale=1,padding=24}={}){
  if(!bounds||![bounds.minX,bounds.minY,bounds.maxX,bounds.maxY,area.x,area.y,area.width,area.height].every(Number.isFinite))return null;
  const width=Math.max(1,bounds.maxX-bounds.minX),height=Math.max(1,bounds.maxY-bounds.minY);
  const scale=clampZoom(Math.min(maxScale,Math.max(1,area.width-padding*2)/width,Math.max(1,area.height-padding*2)/height));
  return {x:area.x+area.width/2-(bounds.minX+width/2)*scale,y:area.y+area.height/2-(bounds.minY+height/2)*scale,scale};
}
export function zoomCamera(camera,scale,anchor){
  if(!Number.isFinite(scale))return null;
  scale=clampZoom(scale);return {scale,x:anchor.x-(anchor.x-camera.x)*scale/camera.scale,y:anchor.y-(anchor.y-camera.y)*scale/camera.scale};
}
