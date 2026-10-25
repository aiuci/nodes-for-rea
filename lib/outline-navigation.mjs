// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {SPECTRUM_BEAT} from './jeremys-spectrum.mjs';

// Navigation accents have a different job from the map's smoothly blended inks.
// Each retained Spectrum beat advances one accent; no clock or row index is used.
export const NAVIGATION_PROFILES=Object.freeze({
 reference:{mode:'separated',colors:['#4a3a9c','#197e88','#ab3675','#a4671c','#365bc0','#497738','#864aac','#b44641']},
 dark:{mode:'original',colors:[]},
 apple:{mode:'separated',colors:['#3c5f8a','#2c7c75','#89577c','#a26c32','#475363']},
 sunburst:{mode:'separated',colors:['#a66a09','#b32e67','#d15a22','#713c8e','#a48616','#a43736','#815225','#bb487e']},
 opal:{mode:'separated',colors:['#247a57','#a34c7d','#8c741f','#4567a7','#a65032','#528535','#805a9b','#267e86']},
 riviera:{mode:'separated',colors:['#007d98','#9e3c91','#3158be','#a36327','#24846b','#7b4ab5','#b23e62','#2d729f']},
 velvet:{mode:'separated',colors:['#c3a1ef','#79c6bc','#ef96bd','#d1b276','#9aafe9','#cf8e75','#b2ca8f','#e199dc']},
 orbital:{mode:'separated',colors:['#62cfff','#d99bff','#71e5ce','#ffabcf','#a3b6ff','#f6cf85','#94d8ff','#eda3f2']},
 aurora:{mode:'separated',colors:['#148467','#9450b8','#2c69b5','#bd447f','#7c7f26','#407dac','#a04759','#398b7a']}
});
const valid=color=>typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color);
const legacyAppleColors=['#394655','#85919e','#4b5969','#74818f'];
export const NAVIGATION_CONTRAST=4.5;
export function normalizeNavigation(value,theme){
 const wireColors=Array.isArray(theme.wire?.colors)?theme.wire.colors.filter(valid).slice(0,8):[];
 const customColors=wireColors.length>=2?wireColors:NAVIGATION_PROFILES.reference.colors;
 const tonal=theme.wire?.finish==='tonal',mix=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v+(rgb(b)[i]-v)*t).toString(16).padStart(2,'0')).join('');
 const factoryApple=theme.id==='apple'||/^custom-apple-(plain|contour)-/.test(theme.id||'');
 // Update only the known stock sidebar treatment on saved Minimal/Flow variants.
 // Authored navigation palettes and unrelated custom tonal themes stay explicit.
 if(factoryApple&&value?.mode==='tonal'&&Array.isArray(value.colors)&&JSON.stringify(value.colors.map(c=>String(c).toLowerCase()))===JSON.stringify(legacyAppleColors))value=null;
 const fallback=(factoryApple?NAVIGATION_PROFILES.apple:NAVIGATION_PROFILES[theme.id])||{mode:theme.wire?.palette==='spectrum'?'original':tonal?'tonal':'separated',colors:tonal?[customColors.at(-1),customColors[0],mix(customColors[0],customColors.at(-1),.75),mix(customColors[0],customColors.at(-1),.25)]:customColors};
 const colors=Array.isArray(value?.colors)?value.colors.filter(valid).slice(0,8).map(c=>c.toLowerCase()):[];
 return {mode:['original','separated','tonal'].includes(value?.mode)?value.mode:fallback.mode,colors:colors.length>=2?colors:[...fallback.colors]};
}
export function navigationBeat(phase){
 if(!Number.isFinite(phase))throw new RangeError('Navigation phase must be finite.');
 return Math.round((((phase%1)+1)%1)/SPECTRUM_BEAT);
}
const rgb=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
const luminance=color=>rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
export function navigationAccent(phase,profile,surface,original){
 if(profile.mode==='original')return original;
 const colors=profile.colors.length>=2?profile.colors:NAVIGATION_PROFILES.reference.colors,beat=navigationBeat(phase);
 // Rotate each palette lap by one accent. A short accent list must not return
 // to the same color on both sides of the full Spectrum's wraparound seam.
 const color=colors[(beat+(colors.length>2?Math.floor(beat/colors.length):0))%colors.length];
 if(contrast(color,surface)>=NAVIGATION_CONTRAST)return color;
 const target=contrast('#000000',surface)>contrast('#ffffff',surface)?0:255;
 for(let step=1;step<=32;step++){
  const candidate='#'+rgb(color).map(v=>Math.round(v+(target-v)*step/32).toString(16).padStart(2,'0')).join('');
  if(contrast(candidate,surface)>=NAVIGATION_CONTRAST)return candidate;
 }
 return target?'#ffffff':'#000000';
}
export const navigationMarker=(phase,profile)=>profile.mode==='tonal'||profile.colors.length===2?['dot','diamond','dash'][navigationBeat(phase)%3]:'dot';
