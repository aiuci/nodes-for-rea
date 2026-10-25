// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// One shared zoom calculation. CSS applies this to the existing SVG strokes.
// Overview retains presence; medium/detail views settle into fine threads.
export function cameraWireFactor(scale=1){
 const zoom=Number.isFinite(scale)?Math.min(2.5,Math.max(.025,scale)):1;
 return .45+.55/(1+(zoom/.3)**1.4);
}
// At extreme overview, constant-width strands can outweigh the tiny nodes and
// merge into heavy bundles. Cap that presence without fading the path colors.
export function cameraWireCeiling(scale=1){
 const zoom=Number.isFinite(scale)?Math.min(2.5,Math.max(.025,scale)):1;
 return 1.15+1.85/(1+(.45/zoom)**1.5);
}

// Distant maps need a lighter screen-space stroke as nodes become small.
// Restore each theme's normal weight continuously by 75% zoom.
export function overviewWireStyle(scale=1){
 const zoom=Number.isFinite(scale)?scale:1,t=Math.max(0,Math.min(1,(zoom-.08)/.67)),ease=t*t*(3-2*t);
 return {factor:.38+.62*ease,ceiling:.72+2.28*ease};
}
export function layoutWireStyle(layout,scale=1){
 const overview=overviewWireStyle(scale);
 return layout==='orbit'?{factor:cameraWireFactor(scale),ceiling:Math.min(cameraWireCeiling(scale),overview.ceiling)}:overview;
}
