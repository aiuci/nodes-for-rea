// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {MOTION_PROFILES} from '../lib/theme-system.mjs';
export function themeMotion(){return matchMedia('(prefers-reduced-motion: reduce)').matches?MOTION_PROFILES.still:MOTION_PROFILES[window.NodesTheme?.current?.motion]||MOTION_PROFILES.silk;}
