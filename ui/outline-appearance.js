// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {BUILTIN_THEMES} from '../lib/theme-system.mjs';
import {normalizeNavigation,navigationAccent,navigationMarker} from '../lib/outline-navigation.mjs';
export function outlinePresentation(view){
 const theme=window.NodesTheme?.current||BUILTIN_THEMES[0],profile=theme.navigation||normalizeNavigation(null,theme),cache=new Map();
 return {mode:profile.mode,color(id){if(!cache.has(id))cache.set(id,id==='core'?view.color(id):navigationAccent(view.ws.spectrum[id]??0,profile,theme.colors.surface,view.color(id)));return cache.get(id);},marker:id=>navigationMarker(view.ws.spectrum[id]??0,profile)};
}
