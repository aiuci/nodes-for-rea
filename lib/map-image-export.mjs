// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {normalizeTheme,themeAtmosphereSvg} from './theme-system.mjs';
export const MAX_IMAGE_SIDE=16384,MAX_IMAGE_PIXELS=64_000_000;
export const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
export function imageDimensions(width,height,longEdge=8192){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('The map has no exportable dimensions.');
  const requested=Number(longEdge);if(![4096,8192,16384].includes(requested))throw Error('Choose a supported image resolution.');
  const scale=Math.min(requested/Math.max(width,height),MAX_IMAGE_SIDE/Math.max(width,height),Math.sqrt(MAX_IMAGE_PIXELS/(width*height)));
  return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}
export function imageFilename(title,format){return `${String(title||'Investigation').replace(/[<>:"/\\|?*\u0000-\u001f]/g,' ').trim().slice(0,80)||'Investigation'}-map.${format==='png'?'png':'svg'}`;}
export function mapImageSvg({bounds,nodesMarkup,guidesMarkup='',wiresMarkup='',title,layout,count,credit='Jeremy Opio - Gorgeous.systems',measure,theme='dark',appearance}){
  const resolved=appearance?normalizeTheme(appearance):null;
  const palette=resolved?{...resolved.colors,credit:resolved.colors.muted}:theme==='light'?{canvas:'#f5f5f7',ink:'#1d1d1f',muted:'#686d76',line:'#d4d7de',credit:'#50545d'}:{canvas:'#0c141a',ink:'#edf3fb',muted:'#9eafc4',line:'#334354',credit:'#bac9dc'};
  const padding=72,header=100,footer=76,width=Math.max(640,bounds.width+padding*2),height=bounds.height+padding*2+header+footer;
  const fit=(text,size,max)=>{text=String(text);if(!measure)return text;while(text.length&&measure(text+'…',size)>max)text=text.slice(0,-1);return text;};
  const label=measure&&measure(String(title),26)>width-2*padding?fit(title,26,width-2*padding)+'…':title;
  const attribution=String(credit).trim().slice(0,180),creditLabel=measure&&measure(attribution,13)>width-2*padding-170?fit(attribution,13,width-2*padding-170)+'…':attribution;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="export-title export-description"><title id="export-title">${xml(title)}</title><desc id="export-description">${xml(`${layout} map · ${count} visible nodes. Existing visible arrangement, including folded branches as shown. Nodes for REA. ${attribution}`)}</desc><rect width="100%" height="100%" fill="${palette.canvas}"/>${resolved?themeAtmosphereSvg(resolved):''}<g font-family="Segoe UI, Arial, sans-serif"><text x="${padding}" y="57" fill="${palette.ink}" font-size="26" font-weight="600">${xml(label)}</text><text x="${padding}" y="84" fill="${palette.muted}" font-size="13">${xml(`${layout} · ${count} nodes`)}</text><g transform="translate(${(width-bounds.width)/2-bounds.x} ${padding+header-bounds.y})">${guidesMarkup}${wiresMarkup}${nodesMarkup}</g><path d="M${padding} ${height-footer} H${width-padding}" stroke="${palette.line}"/><text x="${padding}" y="${height-35}" fill="${palette.credit}" font-size="15" font-weight="600">Nodes for REA</text><text x="${width-padding}" y="${height-35}" fill="${palette.muted}" font-size="13" text-anchor="end">${xml(creditLabel)}</text></g></svg>`;
  return {svg,width,height,background:palette.canvas};
}
export function validateImagePayload(payload){
  if(!payload||!['svg','png'].includes(payload.format))throw Error('Choose SVG or PNG.');
  const {format}=payload;
  if(format==='svg'){
    if(typeof payload.data!=='string'||new TextEncoder().encode(payload.data).length>20*1024*1024||!/^<svg\s/.test(payload.data)||!payload.data.endsWith('</svg>')||/<(?:script|foreignObject|image|iframe)\b|<[^>]*\s(?:on\w+|(?:xlink:)?href|src)\s*=/i.test(payload.data))throw Error('Invalid map SVG.');
    return payload.data;
  }
  const data=payload.data;if(!(data instanceof Uint8Array)||data.length<33||data.length>128*1024*1024||[137,80,78,71,13,10,26,10].some((v,i)=>data[i]!==v)||[73,72,68,82].some((v,i)=>data[i+12]!==v))throw Error('Invalid map PNG.');
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength),width=view.getUint32(16),height=view.getUint32(20);
  if(!width||!height||width>MAX_IMAGE_SIDE||height>MAX_IMAGE_SIDE||width*height>MAX_IMAGE_PIXELS)throw Error('The PNG exceeds the supported image size.');
  return data;
}
