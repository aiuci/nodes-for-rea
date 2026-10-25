// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {createCommandRegistry,shortcutText} from '../lib/command-registry.mjs';
import {installKeyboardMap} from './keyboard-map.js';
import {wireNodeTooltip,hideNodeTooltip} from './node-tooltip.js';
const $=id=>document.getElementById(id);
export function installWorkspaceCommands(view,{buttons,toggles,resetControls}){
  const registry=createCommandRegistry();view.commands=registry;
  const map=installKeyboardMap(view,registry);view.keyboardMap=map;
  const hint=(node,id)=>{if(!node)return;node.dataset.commandId=id;const paint=()=>{const c=registry.get(id);if(!c)return;node.commandHoverContent=()=>{const c=registry.get(id);return node.closest('#workspace-canvas-controls')?shortcutText(c):[c?.label,['horizontal','vertical'].includes(node.dataset.mapLayout)?node.getAttribute('aria-description'):'',shortcutText(c)].filter(Boolean).join(' · ');};node.title=node.closest('#canvas-navigation')?'':node.commandHoverContent();wireNodeTooltip(node,node.commandHoverContent,'command');};paint();};
  function button(id,label,group,node,bindings=[]){
    registry.register({id,label,group,bindings,enabled:()=>!!node&&!node.disabled&&!node.hidden&&(!['navigate.zoom-in','navigate.zoom-out','navigate.fit-all','navigate.fit-selection','navigate.follow-active','navigate.previous','navigate.area','navigate.reset-zoom'].includes(id)||!view.cameraLocked),run:()=>node.click()});hint(node,id);
  }
  const key=(key,extra={})=>[{key,...extra}];
  button('navigate.zoom-in','Zoom in','Navigate',buttons.inside,[{key:'+',shift:'any'},{key:'='}]);
  button('navigate.zoom-out','Zoom out','Navigate',buttons.out,key('-'));
  button('navigate.zoom-level','Zoom level','Navigate',buttons.zoom,key('%',{shift:'any'}));
  button('navigate.fit-all','Fit all','Navigate',buttons.all,key('f'));
  button('navigate.fit-selection','Fit selection','Navigate',buttons.selected,key('f',{shift:true}));
  button('navigate.follow-active','Follow active node','Navigate',buttons.active,key('a'));
  button('navigate.previous','Previous view','Navigate',buttons.previous,key('v'));
  button('navigate.area','Zoom to area','Navigate',buttons.areaButton,key('b'));
  button('navigate.reset-zoom','Reset zoom to 100%','Navigate',buttons.reset,key('0'));
  button('arrange.tidy','Tidy map','Arrange',$('workspace-fit'),key('t'));
  registry.register({id:'explore.agent-control',label:'Agent Control',group:'Explore',bindings:key('g'),enabled:()=>!!$('agent-open')&&!$('agent-open').disabled,run:()=>{if($('agent-panel')?.hidden)$('agent-open').click();else $('agent-goal')?.focus({preventScroll:true});}});
  const canEdit=()=>!view.busy&&!view.fileBusy&&!view.preparingNode;
  registry.register({id:'edit.undo',label:'Undo','group':'Arrange',bindings:[{key:'z',ctrl:true},{key:'z',meta:true}],enabled:()=>canEdit()&&!!view.workspaceUndo?.canUndo,run:()=>view.workspaceUndo.undo()});
  registry.register({id:'edit.redo',label:'Redo','group':'Arrange',bindings:[{key:'z',ctrl:true,shift:true},{key:'y',ctrl:true},{key:'z',meta:true,shift:true}],enabled:()=>canEdit()&&!!view.workspaceUndo?.canRedo,run:()=>view.workspaceUndo.redo()});
  button('arrange.redock','Redock all controls','Arrange',buttons.home,key('d',{shift:true}));
  button('arrange.reset-controls','Reset controls','Arrange',buttons.resetControls,key('c',{shift:true}));
  const toggleBindings={'navigate.auto-follow':key('a',{shift:true}),'navigate.lock':key('l'),'navigate.minimap':key('m')};
  for(const [id,label,input]of toggles){registry.register({id,label,group:'Navigate',bindings:toggleBindings[id],checked:()=>input.checked,run:()=>input.click()});hint(input,id);}
  registry.register({id:'help.keyboard-map',label:'Keyboard Map',group:'Explore',bindings:key('?',{shift:'any'}),run:map.open});
  hint(buttons.help,'help.keyboard-map');
  registry.register({id:'explore.read-selection',label:'Read selected node',group:'Explore',bindings:key('r'),enabled:()=>!!view.ws?.inspected&&view.points.has(view.ws.inspected),run:()=>{const card=[...document.querySelectorAll('.growing-node')].find(n=>n.dataset.nodeId===view.ws.inspected);card?.querySelector('.growing-node-open')?.click();}});
  registry.register({id:'explore.return-reading',label:'Return from reading','group':'Explore',bindings:key('r',{shift:true}),enabled:()=>!!view.ws?.reader,run:()=>view.closeReader()});
  registry.register({id:'navigate.pan',label:'Pan canvas',group:'Navigate',bindings:key(' '),gesture:true,when:e=>e.target===$('workspace-canvas'),enabled:()=>!view.cameraLocked,run:()=>{view.spacePanning=true;$('workspace-canvas').classList.add('space-panning');}});
  const releasePan=()=>{view.spacePanning=false;$('workspace-canvas').classList.remove('space-panning');};
  window.addEventListener('keyup',e=>{if(e.key===' ')releasePan();});window.addEventListener('blur',releasePan);
  let pan;
  const canvas=$('workspace-canvas');
  canvas.addEventListener('pointerdown',e=>{if(!view.spacePanning||view.cameraLocked||e.button!==0||e.target.closest('#node-panel-frame,input,textarea,select'))return;e.preventDefault();e.stopImmediatePropagation();view.cancelFocusMotion();view.navigation?.remember();view.navigation?.manual();pan={x:e.clientX,y:e.clientY,camera:{...view.camera}};canvas.setPointerCapture(e.pointerId);},{capture:true});
  canvas.addEventListener('pointermove',e=>{if(!pan)return;e.preventDefault();e.stopImmediatePropagation();view.camera.x=pan.camera.x+e.clientX-pan.x;view.camera.y=pan.camera.y+e.clientY-pan.y;view.applyCamera();},{capture:true});
  for(const type of ['pointerup','pointercancel'])canvas.addEventListener(type,e=>{if(!pan)return;pan=null;e.preventDefault();e.stopImmediatePropagation();view.saveCamera();view.persist();},{capture:true});
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(map.isOpen){e.preventDefault();e.stopImmediatePropagation();map.close();return;}
      if(document.querySelector('dialog[open]'))return;
      if(view.fitMenu?.isOpen){e.preventDefault();e.stopImmediatePropagation();view.fitMenu.escape();return;}
      if(view.radialMenu){e.preventDefault();e.stopImmediatePropagation();view.radialMenu.close(true);return;}
      if(view.navigation?.cancelArea?.()){e.preventDefault();e.stopImmediatePropagation();return;}
      releasePan();return;
    }
    if(e.defaultPrevented||e.isComposing||e.keyCode===229||e.getModifierState?.('AltGraph')||view.legacyMode||document.querySelector('dialog[open]')||view.fitMenu?.isOpen||view.radialMenu)return;
    if(e.target?.isContentEditable||e.target?.closest?.('input,textarea,select,[role=textbox],[contenteditable=true]'))return;
    const editShortcut=(e.ctrlKey||e.metaKey)&&!e.altKey&&['z','y'].includes(e.key.toLowerCase());
    if(!editShortcut&&!e.target?.closest?.('#workspace,#main,.magnetic-group,#canvas-control-dock,#workspace-canvas-controls')&&e.target!==document.body)return;
    registry.dispatch(e);
  },{capture:true});
  document.addEventListener('focusin',e=>{if(e.target.closest?.('#keyboard-command-map,.anchored-command-menu'))return;view.keyboardContext=e.target.closest?.('#map-layout,.magnetic-module[data-module=layouts]')?'Arrange':e.target.closest?.('#node-panel-frame,#workspace-outline')?'Explore':'Navigate';});
  function widgets(){
    const items=[
      ...[...document.querySelectorAll('#map-layout [data-map-layout]')].map(n=>[n,`layout.${n.dataset.mapLayout}`,n.textContent.trim(),'Arrange']),
      ...[...document.querySelectorAll('#theme-strip [data-appearance]')].map(n=>[n,`theme.${n.dataset.appearance}`,n.getAttribute('aria-label')||n.title,'Explore']),
      ...[...document.querySelectorAll('[data-preset-focus]')].map(n=>[n,`layout.focus-${n.dataset.presetFocus}`,n.textContent.trim(),'Arrange']),
      ...['workspace-dots','workspace-wires','workspace-wire-spline','workspace-wire-linear','workspace-wire-straight','workspace-hidden','workspace-expand'].map(id=>[$(id),`canvas.${id.replace('workspace-','')}`,$(id)?.getAttribute('aria-label')||$(id)?.textContent.trim(),'Arrange'])
    ];
    const bindings={'canvas.hidden':key('h',{shift:true}),'canvas.expand':key('e',{shift:true})};
    for(const [node,id,label,group]of items){if(!node)continue;if(!registry.get(id))registry.register({id,label,group,bindings:bindings[id]||[],enabled:()=>{const n=document.querySelector(`[data-command-id="${id}"]`);return !!n&&!n.disabled&&!n.hidden;},run:()=>document.querySelector(`[data-command-id="${id}"]`)?.click()});hint(node,id);}
  }
  let scheduled=false;const observer=new MutationObserver(()=>{if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;widgets();});}});
  observer.observe($('canvas-control-dock'),{subtree:true,childList:true});document.addEventListener('canvas-toolbar-moved',widgets);registry.subscribe(()=>{for(const n of document.querySelectorAll('[data-command-id]'))hint(n,n.dataset.commandId);});
  queueMicrotask(widgets);
  return registry;
}
