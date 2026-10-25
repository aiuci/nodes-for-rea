// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {syncSelectedHeadline} from './selected-headline.js';
import {cleanPanelLayout,panelRectangle,availableMapArea} from '../lib/panel-layout.mjs';
import {existingRadial,presentRadial,wireRadialTrigger} from './radial-menu.js';
const $=id=>document.getElementById(id);
export function installPanelLayout(view){
  const canvas=$('workspace-canvas'),panel=$('node-workbench'),heading=panel.querySelector('.node-heading');
  const frame=document.createElement('div');frame.id='node-panel-frame';canvas.append(frame);frame.append(panel);
  const control=(id,text,label)=>{const button=document.createElement('button');button.type='button';button.id=id;button.textContent=text;button.title=label;button.setAttribute('aria-label',label);return button;};
  const move=control('panel-move','⠿','Move reading panel; drag or use arrow keys');heading.prepend(move);
  const dock=control('panel-dock','Bottom ↓','Move reading panel to bottom');
  const expand=control('panel-expand','Expand','Expand reading panel');
  // Retain existing action hooks without reserving header space for them.
  const source=document.createElement('div');source.hidden=true;source.append(expand,dock,$('reader-return'),$('node-close'));panel.append(source);
  const tools=control('panel-menu-trigger','⋯','Reading panel options');heading.append(tools);
  function openMenu(options={}){
    if(existingRadial(view,'panel:tools',{...options,representation:'panel'}))return;
    const menu=document.createElement('div');menu.className='node-context-menu';const title=document.createElement('strong');title.textContent='Reading panel';menu.append(title);
    const add=(label,action)=>{const button=control('',label,label);button.removeAttribute('id');button.onclick=()=>{view.radialMenu?.close(label==='Close menu',true);action();};menu.append(button);};
    if(preference().dock!=='bottom')add(preference().expandedFrom?'Restore size':'Expand panel',()=>expand.click());
    add(preference().dock==='bottom'?'Float panel':'Dock at bottom',()=>dock.click());
    if(view.ws.reader)add('Back to map',()=>$('reader-return').click());
    if(!panel.classList.contains('starter'))add('Close panel',()=>$('node-close').click());
    add('Close menu',()=>tools.focus({preventScroll:true}));
    presentRadial(view,'panel:tools',tools,menu,{...options,representation:'panel'});
  }
  wireRadialTrigger(view,'panel:tools',tools,{representation:'panel',openMenu});
  tools.onclick=()=>openMenu({pin:true,focus:true});
  const corner=control('panel-resize','↘','Resize reading panel; drag or use arrow keys');frame.append(corner);
  const edge=document.createElement('div');edge.id='panel-bottom-resize';edge.role='separator';edge.tabIndex=0;edge.title='Drag up or down to resize the bottom panel';edge.setAttribute('aria-label','Bottom reading panel height');edge.setAttribute('aria-orientation','horizontal');frame.append(edge);
  const sides=['east','west','south','north'].map(side=>{const handle=document.createElement('div');handle.id=`panel-resize-${side}`;handle.className=`panel-resize-edge edge-${side}`;handle.role='separator';handle.tabIndex=0;handle.setAttribute('aria-label',`Resize reading panel ${side} edge`);handle.setAttribute('aria-orientation',['east','west'].includes(side)?'vertical':'horizontal');handle.title='Drag to stretch the panel';frame.append(handle);return {side,handle};});
  let rect=null,drag=null;
  const viewport=()=>({width:canvas.clientWidth,height:canvas.clientHeight});
  const preference=()=>view.ws.panel=cleanPanelLayout(view.ws.panel);
  function apply(){
    frame.hidden=!view.nodeOpen||view.legacyMode;if(frame.hidden){if(view.radialMenu?.representation==='panel')view.radialMenu.close(false,true);return;}
    const pref=preference(),scroll=panel.scrollTop,v=viewport();
    const preliminary=panelRectangle(pref,v,{reader:!!view.ws.reader,starter:panel.classList.contains('starter')});
    frame.style.width=`${preliminary.width}px`;panel.style.height='auto';
    rect=panelRectangle(pref,v,{reader:!!view.ws.reader,starter:panel.classList.contains('starter'),naturalHeight:panel.scrollHeight});
    frame.dataset.dock=pref.dock;frame.style.left=`${rect.x}px`;frame.style.top=`${rect.y}px`;frame.style.width=`${rect.width}px`;frame.style.height=`${rect.height}px`;panel.style.height='100%';panel.scrollTop=scroll;
    dock.textContent=pref.dock==='bottom'?'Float ↗':'Bottom ↓';dock.title=pref.dock==='bottom'?'Float reading panel':'Move reading panel to bottom';dock.setAttribute('aria-label',dock.title);
    move.disabled=pref.dock==='bottom';move.title=pref.dock==='bottom'?'Float the panel to move it':'Move reading panel; drag or use arrow keys';move.setAttribute('aria-label',move.title);corner.hidden=pref.dock==='bottom';edge.hidden=pref.dock!=='bottom';
    expand.hidden=pref.dock==='bottom';expand.textContent=pref.expandedFrom?'Restore':'Expand';expand.setAttribute('aria-label',pref.expandedFrom?'Restore reading panel size':'Expand reading panel');for(const {handle}of sides)handle.hidden=pref.dock==='bottom';
    edge.setAttribute('aria-valuemin','120');edge.setAttribute('aria-valuemax',String(Math.max(120,v.height-80)));edge.setAttribute('aria-valuenow',String(Math.round(rect.height)));
  }
  function changed(){view.headlineLayoutDirty=true;apply();view.connectWorkbench();syncSelectedHeadline(view);}
  function finish(event){if(!drag)return;drag=null;frame.classList.remove('panel-dragging');event?.currentTarget?.releasePointerCapture?.(event.pointerId);view.persist();}
  function begin(event,kind){if(event.button!==0||!rect)return;event.preventDefault();event.stopPropagation();drag={kind,x:event.clientX,y:event.clientY,rect:{...rect}};event.currentTarget.setPointerCapture(event.pointerId);frame.classList.add('panel-dragging');}
  function update(event){if(!drag)return;event.preventDefault();event.stopPropagation();const dx=event.clientX-drag.x,dy=event.clientY-drag.y,pref=preference(),start=drag.rect;
    if(drag.kind==='bottom')pref.bottomHeight=start.height-dy;
    else if(drag.kind==='west'){const width=Math.max(Math.min(240,viewport().width-16),start.width-dx);pref.floating={...start,x:start.x+start.width-width,width};}
    else if(drag.kind==='north'){const height=Math.max(120,start.height-dy);pref.floating={...start,y:start.y+start.height-height,height};}
    else pref.floating={...start,...(drag.kind==='move'?{x:start.x+dx,y:start.y+dy}:drag.kind==='east'?{width:start.width+dx}:drag.kind==='south'?{height:start.height+dy}:{width:start.width+dx,height:start.height+dy})};
    view.ws.panel=cleanPanelLayout(pref);changed();
  }
  const gestures=(element,kind)=>{element.addEventListener('pointerdown',event=>begin(event,kind));element.addEventListener('pointermove',update);element.addEventListener('pointerup',finish);element.addEventListener('pointercancel',finish);};
  gestures(move,'move');gestures(corner,'size');gestures(edge,'bottom');
  for(const {side,handle}of sides){gestures(handle,side);handle.onkeydown=event=>keyboard(event,['east','west'].includes(side)?'width':'height');}
  // The whole heading is a drag affordance, except its other buttons.
  heading.addEventListener('pointerdown',event=>{if(event.target.closest('button')||preference().dock==='bottom')return;begin(event,'move');});heading.addEventListener('pointermove',update);heading.addEventListener('pointerup',finish);heading.addEventListener('pointercancel',finish);
  const keyboard=(event,kind)=>{if(!rect||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();const delta=event.shiftKey?40:10,dx=event.key==='ArrowRight'?delta:event.key==='ArrowLeft'?-delta:0,dy=event.key==='ArrowDown'?delta:event.key==='ArrowUp'?-delta:0,pref=preference();
    if(kind==='bottom')pref.bottomHeight=rect.height-dy;else pref.floating={...rect,...(kind==='move'?{x:rect.x+dx,y:rect.y+dy}:kind==='width'?{width:rect.width+dx}:kind==='height'?{height:rect.height+dy}:{width:rect.width+dx,height:rect.height+dy})};view.ws.panel=cleanPanelLayout(pref);changed();view.persist();};
  move.onkeydown=event=>keyboard(event,'move');corner.onkeydown=event=>keyboard(event,'size');edge.onkeydown=event=>keyboard(event,'bottom');
  dock.onclick=()=>{const pref=preference();if(pref.dock==='floating'&&rect&&!pref.floating)pref.floating={...rect};pref.dock=pref.dock==='bottom'?'floating':'bottom';changed();view.persist();};
  expand.onclick=()=>{if(!rect)return;const pref=preference();if(pref.expandedFrom){pref.floating={...pref.expandedFrom};delete pref.expandedFrom;}else{pref.expandedFrom={...rect};pref.floating={x:8,y:8,width:viewport().width-16,height:viewport().height-24};}changed();view.persist();};
  const observer=new ResizeObserver(()=>{if(view.ready&&!frame.hidden)view.connectWorkbench();});observer.observe(frame);
  return {apply,area:()=>availableMapArea(viewport(),view.nodeOpen&&!frame.hidden?rect:null,preference().dock),dock:()=>preference().dock};
}
