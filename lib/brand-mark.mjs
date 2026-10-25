// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {normalizeTheme, readable, blend} from './theme-system.mjs';

// The supplied Coregis network mark, expressed in square vector coordinates.
// The hub and surrounding ring share the exact (256,256) axis in every size.
export function brandPalette(theme){
 const t=normalizeTheme(theme),background=t.colors.surface;
 const colors=t.wire.colors.map(color=>readable(color,background,3));
 return {background,rim:readable(t.colors.line,background,3),core:readable(t.colors.accent,background,4.5),nodes:[colors[0],colors[Math.floor(colors.length/2)],colors.at(-1)],wire:readable(blend(t.colors.accent,t.colors.ink,.3),background,4.5)};
}
export function brandMarkSvg(theme){
 const p=brandPalette(theme);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><circle cx="256" cy="256" r="249" fill="${p.background}" stroke="${p.rim}" stroke-width="6"/><g transform="translate(-29 28)"><g fill="none" stroke="${p.wire}" stroke-width="18"><path d="M122 168 A169 169 0 0 1 325 64 M425 135 A169 169 0 0 1 435 308 M342 387 A169 169 0 0 1 123 287"/><path d="M158 228 H285 L382 90 M285 228 L396 358"/></g><path d="M335 157 L382 90" stroke="${p.nodes[1]}" stroke-width="18"/><path d="M337 289 L396 358" stroke="${p.nodes[2]}" stroke-width="18"/><circle cx="285" cy="228" r="42" fill="${p.core}"/><circle cx="117" cy="228" r="42" fill="${p.nodes[0]}"/><circle cx="382" cy="90" r="46" fill="${p.nodes[1]}"/><circle cx="396" cy="358" r="46" fill="${p.nodes[2]}"/></g></svg>`;
}
