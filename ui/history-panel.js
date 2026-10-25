// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
export function installHistoryDismissal(){
  const panel=document.getElementById('history-panel'),toggle=document.getElementById('history'),close=document.getElementById('close-history');
  const heading=panel.querySelector('h2');heading.id='history-title';panel.setAttribute('role','dialog');panel.setAttribute('aria-labelledby',heading.id);
  const summary=document.createElement('p');summary.id='history-summary';summary.className='history-summary';summary.setAttribute('role','status');panel.querySelector('#history-bulk-actions').before(summary);
  const dismiss=(focus=false)=>{panel.hidden=true;toggle.setAttribute('aria-expanded','false');if(focus)toggle.focus();};
  toggle.setAttribute('aria-controls','history-panel');
  close.onclick=()=>dismiss(true);
  document.addEventListener('pointerdown',event=>{if(!panel.hidden&&!panel.contains(event.target)&&!toggle.contains(event.target))dismiss();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();event.stopPropagation();dismiss(true);}},{capture:true});
  return dismiss;
}
