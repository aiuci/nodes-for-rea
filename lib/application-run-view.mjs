// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Browser-safe projection; filesystem admission remains host-owned.
export function remainingApplicationTurns(run){return run?Math.max(0,run.limits.turns-run.used.turns)+(run.activeTurn?.status==='active'&&['reads','models','operations'].every(unit=>run.used[unit]<run.limits[unit])?1:0):0;}
