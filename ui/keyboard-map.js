// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {bindingKeys,shortcutText} from '../lib/command-registry.mjs';
import {hideNodeTooltip,wireNodeTooltip} from './node-tooltip.js';
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
export function installKeyboardMap(view,registry){
  let dialog,query,content,status,returnFocus,context='Navigate';
  function render(){
    if(!dialog?.open)return;const term=query.value.trim().toLowerCase(),commands=registry.all().filter(c=>c.id!=='help.keyboard-map'&&(term?`${c.label} ${c.id} ${c.group} ${shortcutText(c)}`.toLowerCase().includes(term):c.bindings.length));
    content.replaceChildren();status.textContent=term?`${commands.length} matching commands`:`${context} commands highlighted. Close the map to try a shortcut.`;
    for(const group of ['Navigate','Explore','Arrange']){
      const list=commands.filter(c=>c.group===group);if(!list.length)continue;
      const section=el('section');section.className='keyboard-map-branch';section.dataset.context=String(group===context);section.append(el('h3',group));
      for(const c of list){
        const card=el(c.gesture?'div':'button');card.className='keyboard-map-command';card.dataset.commandId=c.id;
        if(!c.gesture){card.type='button';card.disabled=!c.enabled;card.onclick=()=>{dialog.close();registry.execute(c.id);};}
        const keys=el('span');keys.className='keyboard-map-keys';
        for(const key of c.bindings.length?bindingKeys(c.bindings[0]):[])keys.append(el('kbd',key));
        if(!c.bindings.length)keys.append(el('small','Toolbar'));
        card.append(keys,el('span',c.label));card.title=[c.label,shortcutText(c)].filter(Boolean).join(' · ');
        wireNodeTooltip(card,()=>[registry.get(c.id)?.label,shortcutText(registry.get(c.id))].filter(Boolean).join(' · '),'command');section.append(card);
      }
      content.append(section);
    }
    if(!commands.length)content.append(el('p','No matching commands.'));
  }
  function open(){
    if(dialog?.open){query.focus();return;}
    returnFocus=document.activeElement;context=view.ws?.reader?'Explore':returnFocus?.closest?.('#map-layout,.magnetic-module[data-module=layouts]')?'Arrange':view.keyboardContext||'Navigate';
    view.fitMenu?.close();view.radialMenu?.close(false,true);hideNodeTooltip();
    dialog=el('dialog');dialog.id='keyboard-command-map';dialog.className='workspace-dialog keyboard-command-map';dialog.setAttribute('aria-labelledby','keyboard-map-title');
    const heading=el('div');heading.className='keyboard-map-heading';const title=el('h2','Keyboard Map');title.id='keyboard-map-title';const close=el('button','Close');close.type='button';close.dataset.commandId='help.close-keyboard-map';close.title='Close Keyboard Map · Esc';close.onclick=()=>dialog.close();heading.append(title,close);
    const label=el('label','Find a command');label.htmlFor='keyboard-map-search';query=el('input');query.id='keyboard-map-search';query.type='search';query.placeholder='Try zoom, read, tidy…';query.oninput=render;
    status=el('p');status.className='keyboard-map-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');content=el('div');content.className='keyboard-map-branches';
    const hint=el('p','Press ? to return here. Search also finds actions without shortcuts.');hint.className='keyboard-map-hint';
    dialog.append(heading,label,query,status,content,hint);document.body.append(dialog);dialog.onclose=()=>{hideNodeTooltip();dialog.remove();(returnFocus?.isConnected?returnFocus:document.getElementById('workspace-canvas'))?.focus({preventScroll:true});};
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    dialog.showModal();render();query.focus();
  }
  registry.subscribe(render);
  return {open,get isOpen(){return !!dialog?.open;},close(){dialog?.close();}};
}
