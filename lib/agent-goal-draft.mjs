// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// The user rejected this old opening value. Unmarked legacy drafts/route
// fallbacks must not hide guidance; newly entered text has a draft version.
export function restoredAgentGoal(goal,version){
  return version===undefined&&typeof goal==='string'&&goal.trim().toLowerCase()==='what'?'':goal;
}
