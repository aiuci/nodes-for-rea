// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {anchoredMenuRect} from '../lib/anchored-menu-layout.mjs';
import {shortcutText} from '../lib/command-registry.mjs';
import {hideNodeTooltip,wireNodeTooltip} from './node-tooltip.js';
const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
export function createAnchoredMenu(anchor,{registry,entries,onOpen=()=>{}}){
  const levels=[];let hoverTimer,restoring=false;
  anchor.setAttribute('aria-haspopup','menu');anchor.setAttribute('aria-expanded','false');
  const bounds=()=>{const c=document.getElementById('workspace-canvas').getBoundingClientRect();return {x:Math.max(8,c.x),y:Math.max(8,c.y),width:Math.max(120,Math.min(innerWidth-8,c.right)-Math.max(8,c.x)),height:Math.max(80,Math.min(innerHeight-8,c.bottom)-Math.max(8,c.y))};};
  const buttons=level=>[...level.node.querySelectorAll(':scope>button')].filter(b=>!b.disabled);
  function restoreFocus(node){restoring=true;node?.focus({preventScroll:true});restoring=false;}
  function trim(depth){clearTimeout(hoverTimer);while(levels.length>depth){const level=levels.pop();level.trigger?.setAttribute('aria-expanded','false');level.node.remove();}if(levels.length)levels.at(-1).node.hidden=false;}
  function close(restore=false){trim(0);anchor.setAttribute('aria-expanded','false');hideNodeTooltip();if(restore)anchor.focus({preventScroll:true});}
  function position(){
    if(!anchor.isConnected){close();return;}
    const b=bounds(),obstacles=[...document.querySelectorAll('.magnetic-group,#node-panel-frame:not([hidden]),#composer:not([hidden])')].filter(n=>n.getClientRects().length).map(rect);
    levels.forEach((level,i)=>{
      level.node.hidden=false;level.node.style.maxHeight=b.height+'px';level.node.style.maxWidth=b.width+'px';
      const parent=levels[i-1],size={width:level.node.offsetWidth,height:level.node.scrollHeight},compact=!!parent&&b.width<parent.node.offsetWidth+size.width+6;
      const target=compact?anchor:level.trigger||anchor,r=anchoredMenuRect(rect(target),size,b,[...obstacles,...(parent&&!compact?[rect(parent.node)]:[])],!!parent&&!compact);
      Object.assign(level.node.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',maxHeight:r.height+'px'});
      if(parent&&compact)parent.node.hidden=true;
    });
  }
  function openLevel(items,trigger,depth,focus=false,last=false){
    trim(depth);const node=document.createElement('div');node.className='anchored-command-menu';node.id=depth?'fit-submenu-'+depth:'fit-command-menu';node.setAttribute('role','menu');node.setAttribute('aria-label',depth?trigger.textContent.trim():'Fit and navigation');
    const level={node,trigger};levels.push(level);document.body.append(node);trigger?.setAttribute('aria-expanded','true');trigger?.setAttribute('aria-controls',node.id);
    if(depth){const back=document.createElement('button');back.type='button';back.textContent='‹ Back';back.className='command-menu-back';back.setAttribute('role','menuitem');back.dataset.commandId='menu.back';back.title='Back · ←';back.onclick=()=>{trim(depth);restoreFocus(trigger);};node.append(back);}
    for(const item of items){
      const c=item.children?item:registry.get(item.id);if(!c||item.visible&&!item.visible())continue;
      const button=document.createElement('button');button.type='button';button.dataset.commandId=c.id;button.setAttribute('role',c.checked===undefined?'menuitem':'menuitemcheckbox');button.disabled=c.enabled===false;button.tabIndex=-1;
      const name=document.createElement('span');name.textContent=c.label;button.append(name);
      const shortcut=shortcutText(c);if(shortcut){const key=document.createElement('kbd');key.textContent=shortcut;button.append(key);}
      if(c.checked!==undefined)button.setAttribute('aria-checked',String(c.checked));
      button.title=[c.label,shortcut].filter(Boolean).join(' · ');wireNodeTooltip(button,()=>[registry.get(c.id)?.label||c.label,shortcutText(registry.get(c.id)||c)].filter(Boolean).join(' · '),'command');
      if(item.children){
        button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');const arrow=document.createElement('span');arrow.textContent='›';arrow.setAttribute('aria-hidden','true');button.append(arrow);
        const reveal=(focus=false)=>openLevel(item.children,button,depth+1,focus);
        button.onclick=()=>reveal(true);button.onpointerenter=()=>{clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>reveal(),140);};button.onfocus=()=>{if(!restoring)reveal();};button.onpointerleave=()=>clearTimeout(hoverTimer);
        button.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();reveal(true);}});
      }else{
        button.onclick=()=>{close();registry.execute(c.id);};
        button.onpointerenter=()=>trim(depth+1);button.onfocus=()=>trim(depth+1);
      }
      node.append(button);
    }
    node.addEventListener('keydown',e=>{
      const list=buttons(level),at=list.indexOf(document.activeElement);let next;
      if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();next=e.key==='Home'?list[0]:e.key==='End'?list.at(-1):list[(at+(e.key==='ArrowDown'?1:-1)+list.length)%list.length];next?.focus();}
      if(e.key==='ArrowLeft'&&depth){e.preventDefault();e.stopPropagation();trim(depth);restoreFocus(trigger);}
      if(e.key==='Tab'){close();}
    });
    position();if(focus)(last?buttons(level).at(-1):buttons(level)[0])?.focus();
  }
  function open(last=false){if(levels.length)return;hideNodeTooltip();onOpen();anchor.setAttribute('aria-expanded','true');openLevel(entries(),null,0,true,last);}
  anchor.onclick=()=>levels.length?close(true):open();
  anchor.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open(e.key==='ArrowUp');}});
  window.addEventListener('resize',position);document.addEventListener('canvas-toolbar-moved',()=>{if(levels.length)position();});
  document.addEventListener('magnetic-controls-will-move',()=>close());
  window.addEventListener('pointerdown',e=>{if(levels.length&&!anchor.contains(e.target)&&!levels.some(l=>l.node.contains(e.target)))close();},{capture:true});
  document.addEventListener('focusin',e=>{if(levels.length&&!anchor.contains(e.target)&&!levels.some(l=>l.node.contains(e.target)))close();});
  return {open,close,get isOpen(){return !!levels.length;},escape(){if(levels.length>1){const last=levels.at(-1);trim(levels.length-1);restoreFocus(last.trigger);}else close(true);},position};
}
