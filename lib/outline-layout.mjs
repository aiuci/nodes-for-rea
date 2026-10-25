// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
export const cleanOutlineWidth=value=>Number.isFinite(value)?Math.round(Math.max(160,Math.min(900,value))):245;
export function outlineLimits(surfaceWidth){const min=Math.min(160,Math.max(80,surfaceWidth*.45)),max=Math.max(min,Math.min(900,surfaceWidth-200));return {min,max};}
export function displayedOutlineWidth(preference,surfaceWidth){const {min,max}=outlineLimits(surfaceWidth);return Math.round(Math.max(min,Math.min(max,cleanOutlineWidth(preference))));}
