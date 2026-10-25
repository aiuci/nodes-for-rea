// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {presentRadial} from './radial-menu.js';
import {hideNodeTooltip} from './node-tooltip.js';
import {shortcutText} from '../lib/command-registry.mjs';
const $=id=>document.getElementById(id);
const paths={tidy:'M4 3v18M8 4h10v4H8ZM8 10h7v4H8ZM8 16h12v4H8Z',fit:'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M8 8h8v8H8Z',agent:'M12 3v4M9 3h6M5 8h14v12H5ZM8 12h1M15 12h1M9 16h6',undo:'M9 5 3 11l6 6M3 11h11a6 6 0 0 1 6 6',redo:'m15 5 6 6-6 6M21 11H10a6 6 0 0 0-6 6',outline:'M3 4h18v16H3ZM9 4v16M12 8h6M12 12h6M12 16h4'};
function icon(name){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [key,value]of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))s.setAttribute(key,value);const p=document.createElementNS(s.namespaceURI,'path');p.setAttribute('d',paths[name]);s.append(p);return s;}

// Shares the existing menu owner and command handlers, never node selection.
export function installCanvasTidyMenu(view,canvas){
  function open(at){
    if(view.legacyMode||view.ws.list)return;
    hideNodeTooltip();view.radialMenu?.close(false,true);
    const menu=document.createElement('div');menu.id='canvas-context-menu';menu.className='node-context-menu canvas-node-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','Map actions');
    const command=(id,label,name,help,unavailable)=>({id,label,name,help,enabled:()=>!!view.commands.get(id)?.enabled,run:()=>view.commands.execute(id),unavailable});
    const actions=[
      command('arrange.tidy','Tidy map','tidy','Arrange the map using the current layout. Undo can restore the previous arrangement.','Close the report reader to tidy the map.'),
      command('navigate.fit-all','Fit whole map','fit','Frame the whole map without moving its nodes.','Unlock the view to fit the whole map.'),
      command('explore.agent-control','Agent Control','agent','Open Agent Control. Your goal and starting context are preserved; opening starts no investigation.','Agent Control is unavailable.'),
      command('edit.undo','Undo','undo','Undo the last supported workspace edit. This does not undo investigation work.','No workspace edit is available to undo, or the map is busy.'),
      command('edit.redo','Redo','redo','Redo the last undone workspace edit.','No workspace edit is available to redo, or the map is busy.'),
      {id:'outline',label:()=>view.ws.outline?'Hide Outline':'Show Outline',name:'outline',help:'Show or hide the existing branch Outline without changing node selection.',enabled:()=>!!$('workspace-list-toggle')&&!$('workspace-list-toggle').disabled,run:()=>$('workspace-list-toggle').click(),unavailable:'Outline is unavailable.'}
    ];
    const heading=document.createElement('strong');heading.textContent='Map';menu.append(heading);
    const items=actions.map((action,index)=>{
      const b=document.createElement('button');b.type='button';b.dataset.canvasAction=action.id;
      const graphic=icon(action.name);graphic.classList.add('radial-menu-icon');
      const label=document.createElement('span');label.textContent=typeof action.label==='function'?action.label():action.label;
      const shortcut=shortcutText(view.commands.get(action.id));
      if(shortcut){const hint=document.createElement('kbd');hint.className='canvas-action-shortcut';hint.textContent=shortcut;hint.setAttribute('aria-hidden','true');label.append(hint);}
      const help=document.createElement('span');help.className='action-menu-help';help.id='canvas-action-help-'+index;help.hidden=true;help.textContent=action.help;b.setAttribute('aria-describedby',help.id);
      b.append(graphic,label,help);b.onclick=()=>{if(!action.enabled()){b.focus({preventScroll:true});return;}view.radialMenu?.close(false);action.run();};menu.append(b);return b;
    });
    const close=document.createElement('button');close.type='button';close.textContent='Close menu';close.onclick=()=>view.radialMenu?.close(true);menu.append(close);
    function refresh(){
      if(view.legacyMode||view.ws.list)return false;
      items.forEach((b,i)=>{const a=actions[i],enabled=a.enabled(),label=typeof a.label==='function'?a.label():a.label;b.setAttribute('aria-disabled',String(!enabled));b.setAttribute('aria-label',label);const text=b.querySelector('.radial-menu-label');if(text?.firstChild&&text.firstChild.nodeValue!==label)text.firstChild.nodeValue=label;const hint=b.querySelector('.canvas-action-shortcut');if(hint)hint.textContent=shortcutText(view.commands.get(a.id));const help=b.querySelector('.action-menu-help');help.textContent=enabled?a.help:a.unavailable;});
    }
    presentRadial(view,'canvas',canvas,menu,{representation:'map',intent:'secondary',compact:true,pin:true,focus:true,at,sync:refresh});
  }
  canvas.addEventListener('contextmenu',event=>{
    if(event.target.closest('.growing-node,.outline-row,#node-panel-frame,#workspace-list,#workspace-outline,.node-context-menu,.magnetic-module,#canvas-minimap,button,input,textarea,select,a,[contenteditable]'))return;
    event.preventDefault();event.stopPropagation();open({x:event.clientX,y:event.clientY});
  });
  canvas.addEventListener('keydown',event=>{
    if(event.target!==canvas||!(event.key==='ContextMenu'||event.key==='Apps'||event.shiftKey&&event.key==='F10'))return;
    event.preventDefault();event.stopPropagation();const area=view.mapArea(),r=canvas.getBoundingClientRect();open({x:r.x+area.x+area.width/2,y:r.y+area.y+area.height/2});
  });
  canvas.addEventListener('pointerdown',()=>{if(view.radialMenu?.id==='canvas')view.radialMenu.close(false);});
  canvas.addEventListener('wheel',()=>{if(view.radialMenu?.id==='canvas')view.radialMenu.close(false);},{capture:true});
}
