// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Reuse the existing execution ring and finite result feedback. No graph
// observer, animation loop, timers, dispatch or investigation state is needed.
let installed=false;
export function installOrbitalTheme(){
  if(installed)return;
  installed=true;
  const sync=()=>{document.documentElement.dataset.orbitalPaused=String(document.hidden);};
  document.addEventListener('visibilitychange',sync);
  sync();
}
