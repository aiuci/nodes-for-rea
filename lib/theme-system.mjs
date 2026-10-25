// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {sampleLoopingJeremysSpectrum} from './jeremys-spectrum.mjs';
import {normalizeNavigation} from './outline-navigation.mjs';

export const THEME_SCHEMA_VERSION=1;
export const DEFAULT_THEME_ID='reference'; // Pearl
export const MOTION_PROFILES=Object.freeze({
  silk:{scale:1.12,travel:420,landing:540,settle:320,activity:3400,easing:'cubic-bezier(.22,.68,.25,1)',lift:1,glow:.2},
  precise:{scale:.72,travel:240,landing:280,settle:180,activity:2200,easing:'cubic-bezier(.2,.8,.2,1)',lift:.35,glow:.08},
  buoyant:{scale:1,travel:340,landing:470,settle:300,activity:2700,easing:'cubic-bezier(.18,.85,.3,1)',lift:1.5,glow:.28},
  still:{scale:0,travel:0,landing:0,settle:0,activity:0,easing:'linear',lift:0,glow:0}
});
const make=(id,name,colors,wire,background,motion,radius,elevation='soft',mode='light',font='system')=>({version:1,id,name,mode,colors,wire:{curvature:motion==='silk'?'flowing':motion==='precise'?'taut':'balanced',...wire},background,motion,radius,elevation,font,weight:id==='apple'?600:550,icons:id==='apple'?'ink':id==='dark'?'outlined':'tonal',atmosphereStrength:id==='sunburst'?.8:id==='aurora'?.85:id==='velvet'?.5:.65,texture:id==='velvet'?'grain':'none'});
const colors=(canvas,surface,ink,muted,accent,line,lightA,lightB,lightC)=>({canvas,surface,ink,muted,accent,line,lightA,lightB,lightC});
export const BUILTIN_THEMES=Object.freeze([
 make('reference','Pearl',colors('#f8f9fc','#ffffff','#25263e','#5c6077','#55527e','#dcdde9','#e8e3f0','#efdaeb','#dcebf7'),{colors:['#4c43af','#8550d4','#b63caa','#d53480'],width:2.7,opacity:1,gradientSpan:.26},'pearl','silk',15),
 make('dark','Deep Dark',colors('#0c1724','#122335','#eef3fc','#b3c3d6','#aea4df','#344b62','#183b54','#292a4a','#14283c'),{palette:'spectrum',colors:['#6bb8d5','#a28ed0','#d087b6'],width:1.9,opacity:.95},'night','precise',12,'crisp','dark'),
 {...make('apple','Apple',colors('#f5f6f8','#ffffff','#394655','#647180','#394655','#a8b2bf','#a8b2bf','#a8b2bf','#f5f6f8'),{colors:['#a8b2bf','#394655'],width:1.8,opacity:1,finish:'tonal'},'contour','precise',12,'crisp'),atmosphereStrength:.24},
 make('sunburst','Sunburst',colors('#f4ead6','#fffaf0','#4b2b13','#795638','#945823','#ccb58e','#e2bc78','#cf9679','#ede0b4'),{colors:['#d3261c','#eb570b','#e8ac00'],width:2.6,opacity:1,gradientSpan:.4},'wash','buoyant',18,'float'),
 make('opal','Opal',colors('#e3ece1','#f6f9f2','#183c2b','#45644e','#386447','#adbfaa','#9db99e','#ccdbc0','#9cbfb0'),{colors:['#3b7155','#577b4d','#7b8050','#4e8274','#4d6d53'],width:2.2,opacity:1,gradientSpan:.27},'pearl','silk',17),
 make('riviera','Riviera',colors('#e0ebf1','#f4f8fb','#103758','#3b617f','#346a8d','#adbfcd','#8ab5c9','#a1b1ce','#afd0ce'),{colors:['#337b96','#3c6f9f','#586ba6','#498e91'],width:2.4,opacity:1,gradientSpan:.25},'wash','buoyant',10,'crisp'),
 make('velvet','Velvet Dusk',colors('#281e25','#3c2c36','#fff1f5','#d4bfc9','#dab0bc','#806575','#624655','#805567','#96765e'),{colors:['#d5a7b5','#bf8fa6','#d9b493','#bc9db8'],width:2.4,opacity:1,gradientSpan:.3},'velvet','silk',16,'float','dark'),
 {...make('orbital','Orbital Luminescence',colors('#081321','#101f35','#eff6ff','#afbddb','#91c9ff','#39516e','#14395a','#382356','#421f4e'),{colors:['#4cc9ff','#918bff','#e886fa','#63e5dc'],width:1.95,opacity:1,gradientSpan:.3},'night','silk',14,'soft','dark'),effects:'orbital',atmosphereStrength:.72},
 make('aurora','Aurora Silk',colors('#201b30','#30283f','#f3eff7','#c6bfd5','#bca7d4','#665b79','#625077','#356568','#87667f'),{colors:['#b3a2d3','#86bdb1','#c2a0ca','#98b8d1','#d0adb9'],width:2.35,opacity:1,gradientSpan:.34},'pearl','silk',19,'soft','dark','rounded')
].map(t=>Object.freeze(t)));

const hex=/^#[0-9a-f]{6}$/i;
export const rgb=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
const toHex=channels=>'#'+channels.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
export function blend(a,b,t){const x=rgb(a),y=rgb(b);return toHex(x.map((v,i)=>v+(y[i]-v)*t));}
const luminance=color=>rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
export function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function readable(color,background,minimum=4.5){
 if(contrast(color,background)>=minimum)return color;
 const toward=contrast('#171927',background)>contrast('#ffffff',background)?'#171927':'#ffffff';
 for(let i=1;i<=24;i++){const candidate=blend(color,toward,i/24);if(contrast(candidate,background)>=minimum)return candidate;}
 return toward;
}
export function normalizeTheme(value,{custom=false}={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1)throw Error('Choose a version 1 Nodes theme.');
 const base=BUILTIN_THEMES[0],text=(v,f,max)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):f;
 const color=(v,f)=>typeof v==='string'&&hex.test(v)?v.toLowerCase():f;
 const numeric=(v,f,min,max)=>Number.isFinite(v)?Math.min(max,Math.max(min,v)):f;
 const c=Object.fromEntries(Object.keys(base.colors).map(k=>[k,color(value.colors?.[k],base.colors[k])]));
 c.ink=readable(c.ink,c.surface,7);c.muted=readable(c.muted,c.surface);c.accent=readable(c.accent,c.surface);
 const stops=Array.isArray(value.wire?.colors)?value.wire.colors.filter(v=>typeof v==='string'&&hex.test(v)).slice(0,8):[];
 return {version:1,effects:value.effects==='orbital'?'orbital':'none',id:custom?'custom-'+text(value.id,'theme',80).replace(/^custom-/,'').replace(/[^a-z0-9-]/gi,''):text(value.id,'reference',80),name:text(value.name,'My theme',48),navigation:normalizeNavigation(value.navigation,value),material:value.material==='chrome'?'chrome':'porcelain',mode:value.mode==='dark'?'dark':'light',colors:c,wire:{finish:['chrome','tonal'].includes(value.wire?.finish)?value.wire.finish:'silk',gradientSpan:numeric(value.wire?.gradientSpan,value.id==='dark'?.035:.16,.02,.4),palette:value.wire?.palette==='spectrum'?'spectrum':'custom',colors:stops.length>=2?stops:base.wire.colors.slice(),width:numeric(value.wire?.width,2.2,1.5,4),opacity:numeric(value.wire?.opacity,.98,.75,1),emphasis:numeric(value.wire?.emphasis,1.35,1,2),curvature:['flowing','balanced','taut'].includes(value.wire?.curvature)?value.wire.curvature:'balanced'},background:['pearl','silver','contour','wash','night','velvet','plain'].includes(value.background)?value.background:'pearl',atmosphereStrength:numeric(value.atmosphereStrength,.65,0,1),gradientAngle:numeric(value.gradientAngle,125,0,360),texture:['none','grain','grid'].includes(value.texture)?value.texture:'none',motion:Object.hasOwn(MOTION_PROFILES,value.motion)?value.motion:'silk',radius:numeric(value.radius,15,6,24),elevation:['soft','crisp','float'].includes(value.elevation)?value.elevation:'soft',font:value.font==='rounded'?'rounded':'system',weight:numeric(value.weight,550,400,700),icons:['tonal','ink','outlined'].includes(value.icons)?value.icons:'tonal'};
}
export function themeColor(phase,theme=BUILTIN_THEMES[0]){
 if(!Number.isFinite(phase))throw new RangeError('Theme phase must be finite.');
 let color;
 if(theme.wire.palette==='spectrum')color=sampleLoopingJeremysSpectrum(phase);
 else{const stops=theme.wire.colors,at=((phase%1)+1)%1*(stops.length*2-2),index=Math.floor(at),mirrored=i=>i<stops.length?i:stops.length*2-2-i;color=blend(stops[mirrored(index)],stops[mirrored(index+1)],at-index);}
 // Keep the user's phase, but make the resulting wire distinguishable from its canvas.
 if(color.startsWith('hsl')){const phaseHue=330-((phase%1+1)%1)*360;const sat=1,l=.6+Math.sin(Math.min(((phase%1+1)%1)/(290/360),1)*Math.PI)*.06;const f=n=>{const k=(n+phaseHue/30)%12;return l-sat*Math.min(l,1-l)*Math.max(-1,Math.min(k-3,9-k,1));};color=toHex([f(0),f(8),f(4)].map(v=>255*v));}
 const backgrounds=[theme.colors.canvas,...[theme.colors.lightA,theme.colors.lightB,theme.colors.lightC].map(c=>blend(theme.colors.canvas,c,theme.atmosphereStrength??.65))];
 const opacity=theme.wire.opacity??1,ok=c=>backgrounds.every(bg=>contrast(blend(bg,c,opacity),bg)>=3.2);
 if(ok(color))return color;
 const toward=contrast('#171927',theme.colors.canvas)>contrast('#ffffff',theme.colors.canvas)?'#171927':'#ffffff';
 // Darken toward black on light canvases so gold/coral retain their chroma.
 const end=toward==='#171927'?'#000000':toward;
 for(let i=1;i<=40;i++){const candidate=blend(color,end,i/40);if(ok(candidate))return candidate;}return end;
}
export function themeWireStops(fromPhase,toPhase,theme=BUILTIN_THEMES[0],{sourceColor,targetColor}={}){
 const span=theme.wire.gradientSpan??(theme.id==='dark'?.035:.16);
 const from=sourceColor||themeColor(fromPhase,theme),to=targetColor||themeColor(toPhase,theme);
 if(theme.wire.finish==='tonal')return [{offset:0,color:from},{offset:1,color:to}];
 if(theme.wire.finish==='chrome'){
  const reflect=color=>themeColor(0,{...theme,wire:{...theme.wire,palette:'custom',colors:[color,color]}});
  // One broad reflection, with room for each transition to breathe. The softer
  // contour carries continuity without a near-black stripe at crowded junctions.
  const steel=reflect('#8190a3');
  return [{offset:0,color:from},{offset:.25,color:steel},{offset:.52,color:blend(theme.colors.surface,theme.colors.lightA,.08)},{offset:.78,color:steel},{offset:1,color:to}];
 }
 // Sunburst keeps its contrast-safe node/sidebar endpoints, with luminous
 // pigment through the line itself. Applying the node contrast correction to
 // these interior golds turned them into brown against the warm atmosphere.
 const sunburst=theme.id==='sunburst'&&theme.wire.palette!=='spectrum';
 const pigment=phase=>{
  const stops=theme.wire.colors,at=((phase%1)+1)%1*(stops.length*2-2),index=Math.floor(at),mirror=i=>i<stops.length?i:stops.length*2-2-i;
  return blend(stops[mirror(index)],stops[mirror(index+1)],at-index);
 };
 const delta=((toPhase-fromPhase+.5)%1+1)%1-.5;
 const middle=fromPhase+delta*.5;
 // A forward color beat gives same-color parent/child links a visible silk turn.
 // Endpoints keep their node identity; route geometry and saved phases stay intact.
 let a=sunburst?pigment(middle+span*.12):themeColor(middle+span*.45,theme),b=sunburst?pigment(middle+span):themeColor(middle+span,theme);
 if(new Set([from,a,b,to]).size===1){a=readable(blend(from,theme.mode==='dark'?'#ffffff':'#000000',.2),theme.colors.canvas,3.2);}
 return [{offset:0,color:from},{offset:.32,color:a},{offset:.7,color:b},{offset:1,color:to}];
}
export function themeWireContour(theme=BUILTIN_THEMES[0]){
 return themeColor(0,{...theme,wire:{...theme.wire,palette:'custom',colors:['#8491a0','#8491a0']}});
}
export function themeVariables(theme){
 const t=normalizeTheme(theme),c=t.colors,dark=t.mode==='dark',motion=MOTION_PROFILES[t.motion];
 const angle=(t.gradientAngle-125)*Math.PI/180,anchor=(x,y)=>[Math.max(0,Math.min(100,50+x*Math.cos(angle)-y*Math.sin(angle))),Math.max(0,Math.min(100,50+x*Math.sin(angle)+y*Math.cos(angle)))],a=anchor(-42,-38),b=anchor(44,38),d=anchor(15,-40);
 const shadow=t.elevation==='crisp'?`0 2px 7px ${dark?'#00000030':'#29344d0d'}`:t.elevation==='float'?`0 12px 26px ${dark?'#00000045':'#29344d1f'}, 0 2px 5px #29344d0d`:`0 5px 17px ${dark?'#00000036':'#35355f12'}, 0 1px 3px #35355f08`;
 return {'--theme-light-one-x':`${a[0]}%`,'--theme-light-one-y':`${a[1]}%`,'--theme-light-two-x':`${b[0]}%`,'--theme-light-two-y':`${b[1]}%`,'--theme-light-three-x':`${d[0]}%`,'--theme-light-three-y':`${d[1]}%`,'--theme-warning':readable(dark?'#e6bb7a':'#8b5b17',c.surface),'--theme-danger':readable(dark?'#f0a6b8':'#aa3654',c.surface),'--theme-success':readable(dark?'#92d4b9':'#34765f',c.surface),'--theme-gradient-angle':`${t.gradientAngle}deg`,'--theme-atmosphere-strength':String(t.atmosphereStrength),'--theme-weight':String(t.weight),'--theme-emphasis':String(t.wire.emphasis),'--theme-icon-color':t.icons==='ink'?c.ink:'var(--topic)','--theme-icon-bg':t.icons==='outlined'?'transparent':blend(c.surface,c.lightA,.35),'--theme-icon-border':t.icons==='outlined'?'1px solid currentColor':'1px solid transparent','--canvas':c.canvas,'--surface':c.surface,'--surface-raised':blend(c.canvas,c.surface,.35),'--line':c.line,'--ink':c.ink,'--text':c.ink,'--muted':c.muted,'--subtle':c.muted,'--accent':c.accent,'--focus':c.accent,'--theme-a':c.lightA,'--theme-b':c.lightB,'--theme-c':c.lightC,'--theme-hover':blend(c.surface,c.lightA,.25),'--theme-selection':blend(c.surface,c.lightA,.4),'--theme-shadow':shadow,'--paper-shadow':shadow,'--paper-hover':blend(c.surface,c.lightA,.25),'--paper-selection':blend(c.surface,c.lightA,.4),'--theme-radius':`${t.radius}px`,'--theme-wire-width':`${t.wire.width}px`,'--theme-wire-opacity':String(t.wire.opacity),'--theme-wire-dots':`${Math.max(2.6,t.wire.width+.4)}px`,'--theme-motion-scale':String(motion.scale),'--theme-menu-time':`${Math.round(230*motion.scale)}ms`,'--theme-line-time':`${Math.round(300*motion.scale)}ms`,'--theme-activity-time':`${motion.activity||1}ms`,'--theme-ease':motion.easing,'--theme-glow':String(motion.glow),'--theme-font':t.font==='rounded'?'"Segoe UI Variable", "Segoe UI", system-ui, sans-serif':'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'};
}
export function parseThemeFile(text){if(typeof text!=='string'||text.length>64000)throw Error('Theme files must be smaller than 64 KB.');return normalizeTheme(JSON.parse(text),{custom:true});}

// A small, representative material sample: canvas, lighting and connection color.
// Avoid a white center that makes otherwise different palettes look identical.
export function themeSwatchBackground(theme){
 const t=normalizeTheme(theme),c=t.colors,wire=t.wire.colors;
 // Broad tonal shading: show the palette as satin pigment, without a bright
 // hotspot or a pale-to-neon split. Custom themes use the same actual colors.
 const pigment=blend(wire[Math.floor(wire.length/2)],c.lightA,.32);
 const body=blend(pigment,c.surface,t.mode==='dark'?.2:.12);
 const light=blend(body,c.surface,.46),shade=blend(body,t.mode==='dark'?c.canvas:c.ink,.16);
 return `linear-gradient(145deg,${light} 0%,${body} 55%,${shade} 100%)`;
}

// Same bounded theme data, expressed as vector atmosphere for map artwork.
export function themeAtmosphereSvg(theme){
 const t=normalizeTheme(theme),c=t.colors;
 if(t.background==='plain')return '';
 if(t.background==='contour')return `<svg data-theme-edge-contours="true" width="100%" height="100%" viewBox="0 0 1200 1200" preserveAspectRatio="none" opacity="${t.atmosphereStrength}"><path d="M-80 -50 C120 170 120 350 -80 570 M1280 620 C1100 780 1100 1020 1280 1250" fill="none" stroke="${c.lightA}" stroke-width="1.5"/></svg>`;
 const defs=`<defs><radialGradient id="theme-light-a"><stop stop-color="${c.lightA}"/><stop offset="1" stop-color="${c.lightA}" stop-opacity="0"/></radialGradient><radialGradient id="theme-light-b"><stop stop-color="${c.lightB}"/><stop offset="1" stop-color="${c.lightB}" stop-opacity="0"/></radialGradient><linearGradient id="theme-silver"><stop stop-color="${c.lightA}" stop-opacity="0"/><stop offset=".5" stop-color="${c.lightC}" stop-opacity=".65"/><stop offset=".8" stop-color="#ffffff" stop-opacity=".85"/><stop offset="1" stop-color="${c.lightA}" stop-opacity="0"/></linearGradient></defs>`;
 const silver='<path d="M-200 -150 C100 900 900 1200 1200 1300 L1100 1400 C400 900 -100 500 -200 -150Z" fill="url(#theme-silver)"/><path d="M250 -200 C450 300 1050 500 1300 150 L1300 300 C800 650 400 100 250 -200Z" fill="url(#theme-silver)"/>';
 const light='<ellipse cx="70" cy="120" rx="850" ry="850" fill="url(#theme-light-a)"/><ellipse cx="1000" cy="950" rx="900" ry="850" fill="url(#theme-light-b)"/>';
 const texture=t.texture==='grid'?`<defs><pattern id="theme-texture" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="${c.ink}" stroke-width="1"/></pattern></defs><rect width="100%" height="100%" fill="url(#theme-texture)" opacity=".035"/>`:t.texture==='grain'?`<defs><pattern id="theme-texture" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="${c.ink}"/></pattern></defs><rect width="100%" height="100%" fill="url(#theme-texture)" opacity=".035"/>`:'';
 return `${defs}<svg width="100%" height="100%" viewBox="0 0 1200 1200" preserveAspectRatio="none" opacity="${t.atmosphereStrength}"><g transform="rotate(${t.gradientAngle-125} 600 600)">${t.background==='silver'?silver:light}</g></svg>${texture}`;
}

// Shared reflective stops for live CSS and exported vector node surfaces.
export function themeSurfaceStops(theme){
 const c=theme.colors;
 return [{offset:0,color:blend(c.surface,c.lightA,.12)},{offset:.38,color:blend(c.surface,c.lightC,.28)},{offset:.49,color:c.surface},{offset:.52,color:blend(c.surface,c.lightC,.65)},{offset:1,color:blend(c.surface,c.lightA,.08)}];
}
