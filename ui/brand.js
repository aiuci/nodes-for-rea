// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {brandMarkSvg,brandPalette} from '../lib/brand-mark.mjs';
let revision=0;
export function applyBrand(theme,{syncDesktop=false}={}){
 const mark=document.querySelector('.brand-mark');if(!mark)return;
 const svg=brandMarkSvg(theme),url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg),token=++revision;
 mark.src=url;mark.dataset.theme=theme.id;
 document.documentElement.style.setProperty('--brand-accent',brandPalette(theme).core);
 const image=new Image();image.onload=async()=>{
  if(token!==revision)return;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  canvas.getContext('2d').drawImage(image,0,0,256,256);
  try{await window.investigation.setBrandIcon(canvas.toDataURL('image/png'),syncDesktop);if(token===revision)mark.dataset.nativeTheme=theme.id;}
  catch{if(token===revision)mark.dataset.nativeTheme='unavailable';}
 };image.src=url;
}
