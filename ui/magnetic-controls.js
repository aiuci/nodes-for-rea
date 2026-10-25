// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {CONTROL_MODULES,defaultControls,cleanControls,controlLeaves,detachControl,detachDock,snapControlGroup,redockControlGroup,redockAllControls,controlTreeSize,placeControlRect,controlRectsOverlap,nearestControlSnap,controlDropTarget,balancedControlColumns,controlPanelHeight} from '../lib/magnetic-controls.mjs';
const $=id=>document.getElementById(id),key='nodes-for-rea.magnetic-controls.v1',modules=new Map(),groups=new Map();
let state=defaultControls(),dock,preview,targetsOverlay,observer,drag=null,pending=null,rendering=false;
try{state=cleanControls(JSON.parse(localStorage.getItem(key)));}catch{}
const interactive=n=>n.closest('button,input,textarea,select,a,[role=button],[role=slider],[contenteditable=true]');
const moduleWidths={navigation:350,layouts:556,themes:380};
const treeWidth=tree=>typeof tree==='string'?moduleWidths[tree]:tree.axis==='x'?tree.children.reduce((n,t)=>n+treeWidth(t),0):Math.max(...tree.children.map(treeWidth));
const names={navigation:'Navigation',themes:'Themes',layouts:'Layouts'},contents={navigation:'canvas-navigation',themes:'theme-strip',layouts:'map-layout'};
const bounds=()=>$('workspace-canvas').getBoundingClientRect();
const save=()=>{try{localStorage.setItem(key,JSON.stringify(state));}catch{}document.dispatchEvent(new Event('nodes-controls-change'));};
export const readMagneticControls=()=>structuredClone(state);
export function restoreMagneticControls(value){state=cleanControls(value);save();render();}
export const presetFocus=()=>state.focus;
function paintFocus(){for(const button of document.querySelectorAll('[data-preset-focus]'))button.setAttribute('aria-pressed',String(button.dataset.presetFocus===state.focus));}
function installFocus(){
  if($('preset-focus')){paintFocus();return;}
  const panel=document.createElement('div');panel.id='preset-focus';panel.setAttribute('role','group');panel.setAttribute('aria-label','Focus');
  for(const [value,name]of [['map','Map focus'],['node','Node focus']]){const button=document.createElement('button');button.type='button';button.textContent=name;button.title=name;button.dataset.presetFocus=value;button.dataset.commandId='layout.focus-'+value;button.onclick=()=>{if(state.focus===value)return;state.focus=value;save();paintFocus();document.dispatchEvent(new CustomEvent('nodes-preset-focus'));};panel.append(button);}
  modules.get('layouts').insertBefore(panel,$('map-layout'));paintFocus();
}
export function resetMagneticControls(){state=defaultControls();save();render();}
export function redockMagneticControls(){state=redockAllControls(state);save();render();}
function point(rect){const b=bounds();return {x:rect.left-b.left,y:rect.top-b.top,width:rect.width,height:rect.height};}
function grip(label,which){
  const n=document.createElement('button');n.type='button';n.className='liquid-grip';n.title=label;n.setAttribute('aria-label',label);n.dataset.commandId=`controls.move.${which.module||which.group||'dock'}`;
  n.onpointerdown=e=>begin(e,which);n.onkeydown=e=>keys(e,which);return n;
}
function treeElement(tree){
  if(typeof tree==='string')return modules.get(tree);
  const n=document.createElement('div');n.className=`magnetic-split axis-${tree.axis}`;
  if(tree.axis!=='stack'){for(const child of tree.children){const element=treeElement(child);element.style.setProperty('--control-weight',treeWidth(child));element.style.setProperty('--control-basis',treeWidth(child)+'px');n.append(element);}return n;}
  const tabs=document.createElement('div');tabs.className='liquid-stack-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Stacked controls');
  const active=Math.min(tree.children.length-1,tree.active||0);n.append(tabs);
  tree.children.forEach((child,i)=>{
    const page=document.createElement('div');page.className='liquid-stack-page';page.hidden=i!==active;page.id='control-stack-'+controlLeaves(child).join('-');page.setAttribute('role','tabpanel');page.append(treeElement(child));
    const tab=document.createElement('button');tab.type='button';tab.textContent=controlLeaves(child).map(id=>names[id]).join(' + ');tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(i===active));tab.setAttribute('aria-controls',page.id);tab.tabIndex=i===active?0:-1;tab.dataset.commandId='controls.stack.'+controlLeaves(child).join('-');tab.title=tab.textContent;
    tab.onclick=()=>{tree.active=i;save();render();document.querySelector(`[data-command-id="${tab.dataset.commandId}"]`)?.focus();};
    tab.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tree.children.length-1:(i+(e.key==='ArrowRight'?1:-1)+tree.children.length)%tree.children.length;tree.active=next;save();render();document.querySelector(`[data-command-id="controls.stack.${controlLeaves(tree.children[next]).join('-')}"]`)?.focus();};
    tabs.append(tab);n.append(page);
  });return n;
}
function resizeEdges(node,g){
  for(const side of ['east','south','west','north','corner']){
    const edge=document.createElement('span');edge.className='liquid-resize '+side;edge.tabIndex=0;edge.setAttribute('role','separator');edge.setAttribute('aria-label',`Resize controls ${side}`);edge.setAttribute('aria-orientation',['east','west'].includes(side)?'vertical':'horizontal');edge.title='Resize controls';edge.dataset.commandId='controls.resize.'+side;
    edge.onpointerdown=e=>begin(e,{...(g?{group:g.id}:{dock:true}),resize:side});
    edge.onkeydown=e=>{if(!e.key.startsWith('Arrow'))return;e.preventDefault();e.stopPropagation();const r=node.getBoundingClientRect(),step=e.shiftKey?40:10;const size=g||(state.home||={width:r.width});size.width=Math.max(160,r.width+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0));size.height=resizeHeight(node,r.height+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0),!g);save();syncMagneticControls();};
    node.append(edge);
  }
}
function resizeHeight(node,wanted,home){const prior=node.style.height;node.style.height='auto';const natural=node.offsetHeight;node.style.height=prior;return controlPanelHeight(wanted,natural,home?innerHeight*.4:bounds().height-16,home?104:80);}
function flowColumns(node,widths){
  const room=node.clientWidth-40;const total=widths.reduce((a,b)=>a+b,0)+6*(widths.length-1);
  const columns=room>=total?widths.map((w,i)=>i===widths.indexOf(Math.max(...widths))?'minmax(0,1fr)':`${w}px`).join(' '):room>=620&&widths.length>1?'repeat(2,minmax(0,1fr))':'minmax(0,1fr)';
  node.style.gridTemplateColumns=columns;
  const children=[...node.children].filter(n=>n.matches('.magnetic-module,.magnetic-split'));for(const n of children){n.style.removeProperty('grid-column');n.style.removeProperty('grid-row');}
  if(room<total&&room>=620&&children.length===3&&children.some(n=>n.dataset.module==='layouts')&&children.some(n=>n.dataset.module==='themes')){let col=1;for(const n of children){n.style.gridColumn=n.dataset.module==='layouts'?'1 / -1':String(col++);n.style.gridRow=n.dataset.module==='layouts'?'2':'1';}}
}
function reflow(node){
  for(const row of node.querySelectorAll('.magnetic-split.axis-x'))flowColumns(row,[...row.children].map(n=>Number(n.style.getPropertyValue('--control-weight'))||300));
}
function render(){
  if(!dock||modules.size!==CONTROL_MODULES.length||rendering)return;rendering=true;try{
    document.dispatchEvent(new Event('magnetic-controls-will-move'));
    for(const node of modules.values())node.remove();dock.replaceChildren();for(const n of groups.values())n.remove();groups.clear();
    if(state.dock.length)resizeEdges(dock,null);
    for(const id of state.dock){const node=modules.get(id);node.dataset.placement='dock';node.style.removeProperty('--control-weight');node.style.removeProperty('--control-basis');dock.append(node);}
    
    if(!state.dock.length){const home=document.createElement('span');home.className='magnetic-home';home.textContent='Drag controls here to dock';dock.append(home);}
    for(const g of state.groups){const n=document.createElement('section');n.className='magnetic-group';n.dataset.group=g.id;n.setAttribute('aria-label','Floating canvas controls');
      n.tabIndex=0;n.title='Control group';n.onpointerdown=e=>{if(!e.target.closest('.magnetic-module')&&!interactive(e.target))begin(e,{group:g.id});};n.onkeydown=e=>{if(e.target===n)keys(e,{group:g.id});};
      if(controlLeaves(g.tree).length>1){const handle=grip('Move control group',{group:g.id});handle.classList.add('liquid-group-grip');n.append(handle);}
      const body=treeElement(g.tree);for(const id of controlLeaves(g.tree))modules.get(id).dataset.placement='floating';n.append(body);$('main').append(n);groups.set(g.id,n);
      resizeEdges(n,g);
    }
  }finally{rendering=false;}paintFocus();syncMagneticControls();
}
export function syncMagneticControls(){
  if(!dock||rendering)return;dock.style.width=state.home?.width?Math.min(state.home.width,dock.parentElement.clientWidth-12)+'px':'100%';dock.style.height='auto';flowColumns(dock,state.dock.map(id=>moduleWidths[id]));const home=$('workspace-redock-controls');if(home)home.hidden=!state.groups.length;const b=bounds();if(!b.width||!b.height)return;rendering=true;
  try{
    const occupied=[],viewport={width:b.width,height:b.height};
    const essential=[...document.querySelectorAll('#node-panel-frame:not([hidden]) .node-heading,#composer:not([hidden])')].filter(n=>n.getClientRects().length).map(n=>point(n.getBoundingClientRect()));
    const ordered=[...state.groups].sort((a,b)=>(a.id===drag?.group?1:0)-(b.id===drag?.group?1:0));
    for(const g of ordered){const node=groups.get(g.id);if(!node)continue;node.style.maxWidth=Math.max(80,b.width-16)+'px';node.style.maxHeight=Math.max(50,b.height-16)+'px';const natural=controlTreeSize(g.tree,Object.fromEntries(Object.entries(moduleWidths).map(([id,width])=>[id,{width,height:80}])));node.style.width=Math.min(g.width||natural.width+18,b.width-16)+'px';node.style.height=g.height?Math.min(g.height,b.height-16)+'px':'auto';reflow(node);
      const r=node.getBoundingClientRect(),desired={x:g.x,y:g.y};let placed=placeControlRect(desired,r,viewport,[...occupied,...essential]);
      if(occupied.some(o=>controlRectsOverlap(placed,o))){const height=Math.max(40,(b.height-16-state.groups.length*8)/state.groups.length);node.style.maxHeight=height+'px';placed=placeControlRect(desired,node.getBoundingClientRect(),viewport,occupied);}
      node.style.left=b.left+placed.x+'px';node.style.top=b.top+placed.y+'px';occupied.push(placed);
    }
    const presets=$('map-layout');if(presets){const width=presets.clientWidth-6,columns=balancedControlColumns(16,width,52);presets.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`;}
    const swatches=$('theme-strip')?.querySelector('.theme-strip-items');if(swatches&&swatches.children.length){const count=swatches.children.length,cell=swatches.firstElementChild.offsetWidth||34,capacity=Math.max(1,Math.floor((swatches.clientWidth-6)/(cell+4))),columns=Math.ceil(count/Math.ceil(count/capacity));swatches.style.display='grid';swatches.style.gridTemplateColumns=`repeat(${columns},${cell}px)`;}
    if(state.dock.length&&state.home?.height)dock.style.height=controlPanelHeight(state.home.height,dock.offsetHeight,innerHeight*.4)+'px';
    document.dispatchEvent(new Event('canvas-toolbar-moved'));
  }finally{rendering=false;}
}
function begin(event,which){if(event.button!==0)return;event.preventDefault();event.stopPropagation();document.dispatchEvent(new Event('magnetic-controls-will-move'));const el=which.dock?dock:which.module?modules.get(which.module):groups.get(which.group),r=el.getBoundingClientRect();drag={...which,startX:event.clientX,startY:event.clientY,origin:point(r),before:structuredClone(state),active:false};document.documentElement.setPointerCapture(event.pointerId);}
function keys(event,which){
  if(which.dock&&['Enter','ArrowUp'].includes(event.key)){event.preventDefault();const next=detachDock(state,{x:20,y:20});state=next.state;save();render();groups.get(next.groupId)?.focus();return;}
  if(event.key==='Enter'&&which.module){event.preventDefault();const g=state.groups.find(g=>controlLeaves(g.tree).includes(which.module));if(g){const only=controlLeaves(g.tree).length===1;if(only)state=redockControlGroup(state,g.id);else{const d=detachControl(state,which.module,{x:g.x+20,y:g.y+20});state=redockControlGroup(d.state,d.groupId);}}else state=detachControl(state,which.module,{x:20,y:20}).state;save();render();modules.get(which.module)?.focus();return;}
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();let id=which.group;if(which.module){const existing=state.groups.find(g=>controlLeaves(g.tree).includes(which.module));if(existing&&controlLeaves(existing.tree).length===1)id=existing.id;else{const d=detachControl(state,which.module,{x:20,y:20});state=d.state;id=d.groupId;render();}}const g=state.groups.find(g=>g.id===id);if(!g)return;const step=event.shiftKey?40:10;g.x+=event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0;g.y+=event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0;syncMagneticControls();save();}
function clearPreview(){pending=null;if(preview)preview.hidden=true;if(targetsOverlay)targetsOverlay.hidden=true;dock?.classList.remove('magnetic-drop-active');document.querySelectorAll('[data-magnetic-target]').forEach(n=>n.removeAttribute('data-magnetic-target'));}
function move(event){
  if(!drag)return;if(!drag.active&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<5)return;event.preventDefault();
  if(!drag.active){drag.active=true;if(drag.module||drag.dock&&!drag.resize){const result=drag.dock?detachDock(state,drag.origin):detachControl(state,drag.module,drag.origin);state=result.state;drag.group=result.groupId;render();}}
  if(drag.resize){const g=drag.dock?(state.home||={width:drag.origin.width}):state.groups.find(g=>g.id===drag.group);if(!g)return;const dx=event.clientX-drag.startX,dy=event.clientY-drag.startY,r=drag.origin,side=drag.resize;if(['west','east','corner'].includes(side))g.width=Math.max(160,r.width+(side==='west'?-dx:dx));if(['north','south','corner'].includes(side))g.height=resizeHeight(drag.dock?dock:groups.get(g.id),r.height+(side==='north'?-dy:dy),!!drag.dock);if(side==='west'&&!drag.dock)g.x=r.x+r.width-g.width;if(side==='north'&&!drag.dock)g.y=r.y+r.height-g.height;syncMagneticControls();return;}
  const g=state.groups.find(g=>g.id===drag.group);if(!g)return;g.x=drag.origin.x+event.clientX-drag.startX;g.y=drag.origin.y+event.clientY-drag.startY;syncMagneticControls();clearPreview();
  const rail=dock.getBoundingClientRect();if(event.clientY>=rail.top-24&&event.clientX>=rail.left&&event.clientX<=rail.right){pending={dock:true};dock.classList.add('magnetic-drop-active');return;}
  const moving=point(groups.get(g.id).getBoundingClientRect()),targets=[];
  for(const other of state.groups)if(other.id!==g.id)for(const module of controlLeaves(other.tree)){const node=modules.get(module);if(node.getClientRects().length)targets.push({...point(node.getBoundingClientRect()),module});}
  const b=bounds(),near=controlDropTarget({x:event.clientX-b.x,y:event.clientY-b.y},targets)||nearestControlSnap(moving,targets,32);if(!near)return;
  const model=snapControlGroup(state,g.id,near.module,near.side),joined=model.groups.find(row=>controlLeaves(row.tree).includes(near.module)),sizes=Object.fromEntries([...modules].map(([id,n])=>[id,{width:n.getBoundingClientRect().width||160,height:n.getBoundingClientRect().height||80}])),size=controlTreeSize(joined.tree,sizes);
  pending=near;modules.get(near.module).dataset.magneticTarget=near.side;const r=placeControlRect(joined,size,{width:b.width,height:b.height});Object.assign(preview.style,{left:b.left+r.x+'px',top:b.top+r.y+'px',width:r.width+'px',height:r.height+'px'});preview.hidden=false;
  const t=targets.find(t=>t.module===near.module);Object.assign(targetsOverlay.style,{left:Math.max(b.x,Math.min(b.right-96,b.x+t.x+t.width/2-48))+'px',top:Math.max(b.y,Math.min(b.bottom-96,b.y+t.y+t.height/2-48))+'px'});targetsOverlay.hidden=false;for(const n of targetsOverlay.children)n.dataset.active=String(n.dataset.side===near.side);
}
function finish(){if(!drag)return;if(drag.active){if(pending?.dock)state=redockControlGroup(state,drag.group);else if(pending?.module)state=snapControlGroup(state,drag.group,pending.module,pending.side);save();render();}drag=null;clearPreview();}
export function installMagneticControls(){
  const bar=$('canvas-navigation');if(!bar)return;
  if(!dock){dock=document.createElement('section');dock.id='canvas-control-dock';dock.setAttribute('aria-label','Canvas control dock');$('workspace-surface').after(dock);dock.onpointerdown=e=>{if(e.target===dock)begin(e,{dock:true});};preview=document.createElement('div');preview.id='magnetic-attachment-preview';preview.hidden=true;preview.setAttribute('aria-hidden','true');document.body.append(preview);
    targetsOverlay=document.createElement('div');targetsOverlay.id='magnetic-drop-targets';targetsOverlay.hidden=true;targetsOverlay.setAttribute('aria-hidden','true');for(const [side,label]of [['left','←'],['right','→'],['top','↑'],['bottom','↓'],['stack','Stack']]){const n=document.createElement('span');n.dataset.side=side;n.textContent=label;targetsOverlay.append(n);}document.body.append(targetsOverlay);
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',()=>{if(drag){state=drag.before;drag=null;render();clearPreview();}});window.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){e.preventDefault();e.stopImmediatePropagation();state=drag.before;drag=null;render();clearPreview();}},{capture:true});window.addEventListener('resize',syncMagneticControls);
    observer=new ResizeObserver(()=>{syncMagneticControls();document.dispatchEvent(new Event('canvas-toolbar-moved'));});observer.observe($('workspace-canvas'));observer.observe(dock);const panel=$('node-panel-frame');if(panel)observer.observe(panel);
  }
  if(CONTROL_MODULES.some(id=>!modules.has(id)&&!$(contents[id])))return;
  if($('workspace-fit')&&!bar.contains($('workspace-fit')))bar.append($('workspace-fit'));
  const available=new Map(CONTROL_MODULES.map(id=>[id,$(contents[id])]));
  for(const id of CONTROL_MODULES){if(modules.has(id)||!available.get(id))continue;const n=document.createElement('section');n.id=`control-module-${id}`;n.className='magnetic-module';n.dataset.module=id;n.setAttribute('aria-label',`${names[id]} controls`);n.tabIndex=0;n.title=names[id]+' controls';n.addEventListener('pointerdown',e=>{if(!interactive(e.target))begin(e,{module:id});},{capture:true});n.onkeydown=e=>{if(e.target===n)keys(e,{module:id});};const content=available.get(id);content.hidden=false;n.append(content);observer.observe(n);modules.set(id,n);}
  for(const [id,n]of modules)if(!n.querySelector(':scope>.liquid-grip'))n.prepend(grip(`Move ${names[id]}`,{module:id}));
  if(modules.size===CONTROL_MODULES.length){installFocus();$('canvas-control-cluster')?.remove();render();}
}
