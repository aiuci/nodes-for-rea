// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
if(window.investigation?.centeredWindowCaption){
  document.documentElement.classList.add('centered-window-caption');
  const theme=dark=>{document.documentElement.dataset.windowCaptionTheme=dark?'dark':'light';};
  theme(window.investigation.windowCaptionDark);
  window.investigation.onWindowCaptionTheme(theme);
  document.getElementById('window-caption').hidden=false;
  const overlay=navigator.windowControlsOverlay;
  const sync=()=>{
    const rect=overlay?.getTitlebarAreaRect();
    if(!rect?.height)return;
    document.documentElement.style.setProperty('--window-caption-height',`${rect.height}px`);
    document.documentElement.style.setProperty('--window-caption-controls',`${Math.max(rect.x,innerWidth-rect.x-rect.width)}px`);
  };
  overlay?.addEventListener('geometrychange',sync);
  window.addEventListener('resize',sync);
  sync();
}
