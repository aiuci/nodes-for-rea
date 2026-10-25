// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// One Settings disclosure owns document and application actions.
export function installWorkspaceMenu(){
  for(const menu of document.querySelectorAll('header nav > details')){
    const summary=menu.querySelector(':scope > summary');
    const sync=()=>summary.setAttribute('aria-expanded',String(menu.open));
    const close=(focus=false)=>{menu.open=false;menu.querySelectorAll('details').forEach(n=>n.open=false);sync();if(focus)summary.focus();};
    menu.addEventListener('toggle',()=>{sync();if(menu.open)for(const other of document.querySelectorAll('header nav > details'))if(other!==menu)other.open=false;});
    menu.addEventListener('click',event=>{const button=event.target.closest('button');if(button)close(button.id==='workspace-menu-close');});
    document.addEventListener('pointerdown',event=>{if(menu.open&&!menu.contains(event.target))close();},{capture:true});
    document.addEventListener('focusin',event=>{if(menu.open&&!menu.contains(event.target))close();});
    document.addEventListener('keydown',event=>{if(menu.open&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}},{capture:true});
    sync();
  }
}
