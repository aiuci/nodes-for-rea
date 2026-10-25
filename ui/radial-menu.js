// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {themeMotion} from './theme-motion.js';
import {themeColor,themeWireStops,themeWireContour,BUILTIN_THEMES} from '../lib/theme-system.mjs';
import {radialLayout,compactCanvasMenuLayout} from '../lib/radial-layout.mjs';
import {actionMenuIcon} from './action-menu-icons.js';
import {sampleLoopingJeremysSpectrum,SPECTRUM_BEAT} from '../lib/jeremys-spectrum.mjs';
const svg=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
const $=id=>document.getElementById(id);
export function wireRadialTrigger(view,id,trigger,{representation='map',openMenu}={}){
  trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');
  let hoverTimer,hoverSuppressed=false;
  const releaseHover=event=>{const r=trigger.getBoundingClientRect();if(!trigger.isConnected||event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom){hoverSuppressed=false;document.removeEventListener('pointermove',releaseHover);}};
  trigger.cancelRadialHover=()=>{clearTimeout(hoverTimer);hoverSuppressed=true;document.addEventListener('pointermove',releaseHover);};
  const open=options=>openMenu?openMenu({...options,representation}):id.startsWith('inventory:')&&representation==='map'?view.inventoryMenu(trigger,{...options,representation}):view.nodeMenu(id,trigger,{...options,representation});
  trigger.addEventListener('pointerenter',event=>{clearTimeout(hoverTimer);if(hoverSuppressed||event.pointerType==='touch'||view.radialMenu?.pinned)return;view.radialMenu?.cancelLeave();hoverTimer=setTimeout(()=>{if(trigger.isConnected&&!view.radialMenu?.pinned)open({pin:false,focus:false});},120);});
  trigger.addEventListener('pointerdown',()=>{hoverSuppressed=false;document.removeEventListener('pointermove',releaseHover);clearTimeout(hoverTimer);});
  trigger.addEventListener('pointerleave',event=>{clearTimeout(hoverTimer);releaseHover(event);view.radialMenu?.scheduleLeave();});
  trigger.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();clearTimeout(hoverTimer);open({pin:true,focus:true,last:event.key==='ArrowUp'});}});
}
export function existingRadial(view,id,options={}){
  if(view.radialMenu?.intent!==(options.intent||'primary')||view.radialMenu?.id!==id||view.radialMenu.representation!==(options.representation||'map'))return false;
  view.radialMenu.cancelLeave();
  if(options.pin!==false)view.radialMenu.pin();
  if(options.focus!==false)view.radialMenu.focus(options.last);
  return true;
}
export function presentRadial(view,id,initialAnchor,menu,options={}){
  view.radialMenu?.close(false,true);document.querySelectorAll('.radial-closing').forEach(n=>n.remove());
  let anchor=initialAnchor,leaveTimer,closed=false,pinned=options.pin!==false,observer,geometry;
  menu.classList.add('radial-action-menu');menu.setAttribute('role','menu');menu.dataset.nodeId=id;menu.dataset.intent=options.intent||'primary';menu.dataset.pinned=String(pinned);
  const heading=menu.querySelector('strong');heading.className='radial-menu-title';menu.setAttribute('aria-label',`Actions for ${heading.textContent}`);
  const items=[...menu.querySelectorAll('button')];items.forEach(n=>{n.setAttribute('role','menuitem');n.tabIndex=-1;});
  const close=items.at(-1),actions=items.slice(0,-1);if(options.compact)close.hidden=true;actions.forEach(n=>{
    n.classList.add('radial-menu-item');
    const provided=n.querySelector(':scope > .radial-menu-icon');provided?.remove();
    const copy=document.createElement('span');copy.className='radial-menu-copy';
    if(n.firstChild?.nodeType===Node.TEXT_NODE){const label=document.createElement('span');label.textContent=n.firstChild.textContent;n.firstChild.replaceWith(label);}
    copy.append(...n.childNodes);copy.querySelector('span')?.classList.add('radial-menu-label');
    n.append(provided||actionMenuIcon(n.dataset.actionId,n.getAttribute('aria-label')||copy.textContent),copy);
  });close.classList.add('radial-menu-hub');close.setAttribute('aria-label',close.textContent==='Close'?'Close menu':close.textContent);close.textContent='×';close.title='Close tools';heading.remove();
  const surface=document.createElement('div');surface.className='radial-menu-surface';surface.append(...actions);menu.append(surface,close);
  const wires=svg('svg',{class:'radial-menu-wires','aria-hidden':'true'}),defs=svg('defs');wires.append(defs);
  const spokes=actions.map((n,i)=>{const color=themeColor(i*SPECTRUM_BEAT,window.NodesTheme?.current||BUILTIN_THEMES[0]),key=`radial-${Math.random().toString(36).slice(2)}`,gradient=svg('linearGradient',{id:key,gradientUnits:'userSpaceOnUse'});
    for(const stop of themeWireStops(i*SPECTRUM_BEAT,i*SPECTRUM_BEAT,window.NodesTheme?.current||BUILTIN_THEMES[0],{sourceColor:'#788594',targetColor:color}))gradient.append(svg('stop',{offset:`${stop.offset*100}%`,'stop-color':stop.color,'stop-opacity':String(window.NodesTheme?.current?.wire.finish==='chrome'?1:.55+stop.offset*.2)}));defs.append(gradient);
    const line=svg('path',{fill:'none',stroke:`url(#${key})`,'stroke-width':'1.15',pathLength:'1'});line.style.setProperty('--reveal-delay',`${i*12*themeMotion().scale}ms`);const contour=window.NodesTheme?.current?.wire.finish==='chrome'?svg('path',{fill:'none',stroke:themeWireContour(window.NodesTheme.current),'stroke-width':'2.5',pathLength:'1'}):null;if(contour){contour.style.setProperty('--reveal-delay',`${i*12*themeMotion().scale}ms`);wires.append(contour);}wires.append(line);n.style.setProperty('--action-color',color);n.dataset.actionColor=color;n.classList.toggle('primary',n.dataset.emphasis==='primary');return {line,gradient,contour};
  });
  const bridge=document.createElement('div');bridge.className='radial-menu-bridge';bridge.setAttribute('aria-hidden','true');document.body.append(wires,bridge,menu);
  let origin,owner;
  function drawLines(){if(!geometry||!origin)return;spokes.forEach(({line,gradient,contour},i)=>{const p=geometry.slots[i],right=geometry.direction===1,end={x:geometry.x+p.x+(right?0:p.width),y:geometry.y+p.y+p.height/2-menu.scrollTop},dx=end.x-origin.x;
    let d=`M${origin.x} ${origin.y} C${origin.x+dx*.42} ${origin.y},${end.x-dx*.35} ${end.y},${end.x} ${end.y}`;
    if(geometry.symmetric){
      end.x=geometry.x+p.x+p.width/2;end.y=geometry.y+p.y+(p.port==='bottom'?p.height:0);
      const lane=p.port==='bottom'?owner.y-14:owner.y+owner.height+14,side=origin.x>=owner.x+owner.width/2?1:-1;
      d=`M${origin.x} ${origin.y} C${origin.x+18*side} ${origin.y},${origin.x+18*side} ${lane},${origin.x} ${lane} S${end.x} ${lane},${end.x} ${end.y}`;
    }else if(!right&&owner&&origin.x>=owner.x+owner.width-2){const lane=end.y<owner.y?owner.y-14:owner.y+owner.height+14;d=`M${origin.x} ${origin.y} C${origin.x+18} ${origin.y},${origin.x+18} ${lane},${origin.x} ${lane} S${end.x+24} ${lane},${end.x} ${end.y}`;}
    if(contour)contour.setAttribute('d',d);line.setAttribute('d',d);line.style.visibility=end.y<geometry.y||end.y>geometry.y+geometry.height?'hidden':'visible';if(contour)contour.style.visibility=line.style.visibility;for(const [k,v]of Object.entries({x1:origin.x,y1:origin.y,x2:end.x,y2:end.y}))gradient.setAttribute(k,v);
  });}
  function cancelLeave(){clearTimeout(leaveTimer);}
  function scheduleLeave(){cancelLeave();if(!pinned)leaveTimer=setTimeout(()=>dismiss(false),420);}
  function mark(){anchor.setAttribute('aria-expanded','true');anchor.closest('.outline-row')?.classList.add('menu-open');anchor.closest('.growing-node')?.classList.add('menu-open');}
  function position(){
    if(closed)return;
    if(options.sync?.()===false){dismiss(false,true);return;}
    const next=options.compact?(anchor.isConnected?anchor:null):options.intent==='secondary'&&anchor.isConnected?anchor:(options.representation==='toolbar'?(anchor.isConnected?anchor:null):options.representation==='panel'?(anchor.isConnected&&!$('node-panel-frame')?.hidden?anchor:null):options.representation==='outline'?(anchor.isConnected?anchor:[...document.querySelectorAll('.outline-node')].find(n=>n.dataset.nodeId===id)):[...document.querySelectorAll('.growing-node')].find(n=>n.dataset.nodeId===id)?.querySelector('.node-menu-trigger'));
    if(!next){dismiss(false,true);return;}
    if(next!==anchor){anchor=next;mark();}
    const r=anchor.getBoundingClientRect(),frame=$('node-panel-frame'),b=frame&&!frame.hidden?frame.getBoundingClientRect():null;
    const reader=b?{x:b.x,y:b.y,width:b.width,height:b.height}:null;origin=options.at||{x:r.x+r.width/2,y:r.y+r.height/2};
    const card=anchor.closest('.growing-node')||anchor.closest('.outline-row'),c=card?.getBoundingClientRect();owner=c?{x:c.x,y:c.y,width:c.width,height:c.height}:null;
    const canvas=options.compact||['toolbar','map'].includes(options.representation||'map')?$('workspace-canvas').getBoundingClientRect():null,layoutBounds=canvas?{x:canvas.x,y:canvas.y,width:canvas.width,height:canvas.height}:null;
    const obstacles=options.compact?[]:[...document.querySelectorAll('.magnetic-group, .growing-node')].filter(n=>n!==card).map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}).filter(r=>r.width&&r.height);
    const viewport={width:innerWidth,height:innerHeight},coarse=matchMedia('(pointer: coarse)').matches;
    const minimumHeight=options.compact?44:coarse?58:54;
    const layoutFor=options.compact?compactCanvasMenuLayout:radialLayout;
    const centerOnNode=id==='core'&&actions.length===4&&(options.intent||'primary')==='primary'&&(options.representation||'map')==='map';
    let layout=layoutFor(actions.length,origin,viewport,{reader,node:owner,itemHeight:minimumHeight,bounds:layoutBounds,obstacles,fan:options.representation==='toolbar',centerOnNode});
    actions.forEach(n=>{n.style.width=`${layout.slots[0]?.width||188}px`;n.style.height='auto';});
    const itemHeights=actions.map(n=>Math.max(minimumHeight,n.offsetHeight)),itemHeight=Math.max(minimumHeight,...itemHeights);
    layout=layoutFor(actions.length,origin,viewport,{reader,node:owner,itemHeight,itemHeights,bounds:layoutBounds,obstacles,fan:options.representation==='toolbar',centerOnNode});geometry=layout;
    Object.assign(menu.style,{left:`${layout.x}px`,top:`${layout.y}px`,width:`${layout.width}px`,height:`${layout.height}px`});surface.style.height=`${layout.contentHeight}px`;menu.dataset.scroll=String(layout.scroll);menu.dataset.symmetric=String(!!layout.symmetric);
    actions.forEach((n,i)=>{const p=layout.slots[i];n.classList.add('radial-menu-item');Object.assign(n.style,{left:`${p.x}px`,top:`${p.y}px`,width:`${p.width}px`,height:`${p.height}px`});n.style.setProperty('--from-x',`${origin.x-layout.x-p.x-p.width/2}px`);n.style.setProperty('--from-y',`${origin.y-layout.y-p.y-p.height/2}px`);n.style.setProperty('--reveal-delay',`${i*12*themeMotion().scale}ms`);});
    Object.assign(close.style,{position:'fixed',left:`${Math.max(10,Math.min(innerWidth-36,origin.x-13))}px`,top:`${Math.max(64,Math.min(innerHeight-36,origin.y-(layout.symmetric?13:46)))}px`,width:'26px'});
    const cx=layout.x+(layout.direction===1?24:layout.width-24),cy=Math.max(layout.y+20,Math.min(layout.y+layout.height-20,origin.y)),dx=cx-origin.x,dy=cy-origin.y,len=Math.max(1,Math.hypot(dx,dy)),px=-dy/len*22,py=dx/len*22;
    bridge.style.clipPath=`polygon(${origin.x+dx/len*22+px}px ${origin.y+dy/len*22+py}px,${cx+px}px ${cy+py}px,${cx-px}px ${cy-py}px,${origin.x+dx/len*22-px}px ${origin.y+dy/len*22-py}px)`;
    if(layout.symmetric){
      // Separate hover corridors follow the two hemispheres; the node in the
      // middle stays clickable instead of sitting under an invisible panel.
      const polygons=[];
      for(const p of layout.slots){const lane=p.port==='bottom'?owner.y-14:owner.y+owner.height+14,ex=layout.x+p.x+p.width/2,ey=layout.y+p.y+(p.port==='bottom'?p.height:0),points=[origin,{x:origin.x,y:lane},{x:ex,y:lane},{x:ex,y:ey}];
        for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),nx=-(b.y-a.y)/length*12,ny=(b.x-a.x)/length*12;polygons.push(`M${a.x+nx} ${a.y+ny} L${b.x+nx} ${b.y+ny} L${b.x-nx} ${b.y-ny} L${a.x-nx} ${a.y-ny} Z`);}
      }
      bridge.style.clipPath=`path("${polygons.join(' ')}")`;
    }
    drawLines();
  }
  // Help occupies its own measured row; it never overlays a neighboring action.
  let helpOwner=null;
  function showHelp(next){if(helpOwner===next)return;helpOwner=next;for(const n of actions){const help=n.querySelector('.action-menu-help');if(help)help.hidden=n!==next;}position();}
  for(const n of actions){n.addEventListener('pointerenter',()=>showHelp(n));n.addEventListener('focus',()=>showHelp(n));}
  menu.addEventListener('pointerleave',()=>showHelp(actions.includes(document.activeElement)?document.activeElement:null));
  menu.addEventListener('focusout',event=>{if(!menu.contains(event.relatedTarget))showHelp(null);});
  const enabled=()=>items.filter(n=>!n.disabled&&!n.hidden);
  function focus(last=false){const list=enabled(),n=last?list.at(-1):list[0];items.forEach(b=>b.tabIndex=b===n?0:-1);n?.focus({preventScroll:true});}
  function pin(){pinned=true;menu.dataset.pinned='true';bridge.style.pointerEvents='none';cancelLeave();}
  function dismiss(restore=true,immediate=false){
    if(closed)return;closed=true;if(restore)anchor.cancelRadialHover?.();cancelLeave();observer?.disconnect();window.removeEventListener('resize',position);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);
    anchor.setAttribute('aria-expanded','false');anchor.closest('.outline-row')?.classList.remove('menu-open');anchor.closest('.growing-node')?.classList.remove('menu-open');bridge.remove();wires.remove();
    menu.classList.remove('node-context-menu');menu.classList.add('radial-closing');menu.inert=true;menu.setAttribute('aria-hidden','true');if(immediate||options.compact&&matchMedia('(prefers-reduced-motion: reduce)').matches)menu.remove();else setTimeout(()=>menu.remove(),Math.max(180,180*themeMotion().scale));
    if(view.radialMenu===controller)view.radialMenu=null;if(restore&&anchor.isConnected)anchor.focus({preventScroll:true});
  }
  const outside=event=>{if(!menu.contains(event.target)&&!anchor.contains(event.target)&&event.target!==bridge)dismiss(false);};
  const escape=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss(true);}};
  menu.addEventListener('scroll',drawLines);menu.addEventListener('pointerenter',cancelLeave);menu.addEventListener('pointerleave',scheduleLeave);bridge.addEventListener('pointerenter',cancelLeave);bridge.addEventListener('pointerleave',scheduleLeave);bridge.addEventListener('pointerdown',pin);
  menu.addEventListener('pointerdown',pin);menu.addEventListener('focusin',cancelLeave);
  menu.addEventListener('focusout',event=>{if(!menu.contains(event.relatedTarget)&&event.relatedTarget!==anchor){if(options.compact)dismiss(false);else if(!pinned)scheduleLeave();}});
  menu.addEventListener('keydown',event=>{
    const list=enabled(),at=list.indexOf(document.activeElement);let next;
    if(['ArrowDown','ArrowRight'].includes(event.key))next=list[(at+1)%list.length];
    if(['ArrowUp','ArrowLeft'].includes(event.key))next=list[(at-1+list.length)%list.length];
    if(event.key==='Home')next=list[0];if(event.key==='End')next=list.at(-1);
    if(event.key==='Tab'){event.preventDefault();if(event.shiftKey&&at<=0||!event.shiftKey&&at===list.length-1){dismiss(true);return;}next=list[at+(event.shiftKey?-1:1)];}
    if(next){event.preventDefault();pin();items.forEach(n=>n.tabIndex=n===next?0:-1);next.focus();}
  });
  const controller={id,intent:options.intent||'primary',representation:options.representation||'map',close:dismiss,pin,focus,scheduleLeave,cancelLeave,sync:position,get pinned(){return pinned;},get rect(){return geometry;}};
  view.radialMenu=controller;if(pinned)bridge.style.pointerEvents='none';mark();position();
  window.addEventListener('resize',position);document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  observer=new ResizeObserver(position);const frame=$('node-panel-frame');if(frame)observer.observe(frame);if(options.compact)observer.observe(anchor);
  if(options.focus!==false)focus(options.last);view.connectWorkbench();return controller;
}
export function wireContextActions(view,id,element,representation='map'){
  let timer,point,longPress=false;
  const open=(at,focus=true)=>view.nodeMenu(id,element.querySelector('.outline-node,.growing-node-open')||element,{pin:true,focus,representation,at,intent:'secondary'});
  element.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();open({x:event.clientX||element.getBoundingClientRect().x+20,y:event.clientY||element.getBoundingClientRect().y+20});});
  element.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.key==='Apps'||event.shiftKey&&event.key==='F10'){event.preventDefault();event.stopPropagation();open();}});
  element.addEventListener('pointerdown',event=>{if(event.pointerType!=='touch')return;point={x:event.clientX,y:event.clientY};longPress=false;timer=setTimeout(()=>{longPress=true;open(point);},500);});
  element.addEventListener('pointermove',event=>{if(point&&Math.hypot(event.clientX-point.x,event.clientY-point.y)>8)clearTimeout(timer);});
  const finish=event=>{clearTimeout(timer);point=null;if(longPress)event.preventDefault();};element.addEventListener('pointerup',finish);element.addEventListener('pointercancel',finish);
  element.addEventListener('click',event=>{if(longPress){event.preventDefault();event.stopImmediatePropagation();longPress=false;}},true);
}
