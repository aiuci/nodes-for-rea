// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {installCanvasTidyMenu} from './canvas-tidy-menu.js';
import {installWorkspaceCommands} from './workspace-commands.js';
import {resetMagneticControls,redockMagneticControls} from './magnetic-controls.js';
import {installBottomToolbars,syncBottomToolbars} from './bottom-toolbars.js';
import {boundsCamera,zoomCamera} from '../lib/viewport-navigation.mjs';
import {wireNodeTooltip,hideNodeTooltip} from './node-tooltip.js';
const $=id=>document.getElementById(id),make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
const paths={out:'M5 12h14',in:'M5 12h14M12 5v14',all:'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M8 8h8v8H8Z',selection:'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M9 9h6v6H9Z',follow:'M12 2v4M12 18v4M2 12h4M18 12h4M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12',more:'M5 12h.01M12 12h.01M19 12h.01'};
Object.assign(paths,{previous:'M19 12H5M11 6l-6 6 6 6',area:'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M8 8h8v8H8Z',auto:'M20 8a8 8 0 1 0 0 8M20 3v5h-5M10 8l5 4-5 4Z',lock:'M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4',minimap:'m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16M15 5v16',reset:'M4 9a8 8 0 1 1 1 9M4 3v6h6',keyboard:'M3 5h18v14H3ZM6 9h1M10 9h1M14 9h1M18 9h0M6 13h1M10 13h1M14 13h4M7 16h10',tidy:'M4 3v18M8 4h10v4H8ZM8 10h7v4H8ZM8 16h12v4H8Z',hidden:'M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Zm7 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0',expand:'M12 3v18M3 12h18M5 7V3h4M15 3h4v4M19 17v4h-4M9 21H5v-4'});
function paintIcon(b,label,path){b.classList.add('direct-tool');b.setAttribute('aria-label',label);b.replaceChildren();const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');const p=document.createElementNS(s.namespaceURI,'path');p.setAttribute('d',path);s.append(p);b.append(s);wireNodeTooltip(b,()=>label,'type');return b;}
function iconButton(id,label,path){const b=make('button');b.type='button';b.id=id;return paintIcon(b,label,path);}
export function installCanvasNavigation(view){
  const canvas=$('workspace-canvas'),bar=make('div');bar.id='canvas-navigation';bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Map navigation');
  const replace=(id,label,path)=>{const old=$(id),b=iconButton(id,label,path);old.replaceWith(b);return b;};
  const out=replace('workspace-zoom-out','Zoom out',paths.out),inside=replace('workspace-zoom-in','Zoom in',paths.in),all=replace('workspace-camera-fit','Fit all',paths.all);
  const zoom=make('button');zoom.type='button';zoom.id='workspace-zoom';zoom.setAttribute('aria-label','Zoom level');zoom.setAttribute('aria-haspopup','dialog');$('workspace-zoom').replaceWith(zoom);wireNodeTooltip(zoom,()=> 'Zoom level — choose a percentage or reset to 100%.','type');
  const selected=iconButton('workspace-fit-selection','Fit selection',paths.selection),active=iconButton('workspace-follow-active','Follow active node',paths.follow);
  const home=iconButton('workspace-redock-controls','Redock controls','M4 5h16v14H4ZM4 14h16M9 9l3 3 3-3M12 3v9');home.onclick=redockMagneticControls;home.hidden=true;bar.append(out,zoom,inside,all,selected,active);$('main').append(bar);installBottomToolbars();
  const history=[],prefs={autoFollow:true,minimap:false};try{Object.assign(prefs,JSON.parse(localStorage.getItem('nodes-camera-options')||'{}'));}catch{}
  let callbacks={},scope='',restoring=false,geometry='',drag=null,areaMode=false,cameraArea,temporaryBrowsing=()=>false;
  const savePrefs=()=>{try{localStorage.setItem('nodes-camera-options',JSON.stringify(prefs));}catch{}document.dispatchEvent(new Event('nodes-navigation-change'));};
  const remember=()=>{if(restoring||!view.state)return;const key=view.state.id+':'+view.ws.layout;if(scope!==key){scope=key;history.length=0;}const c={...view.camera};if(JSON.stringify(history.at(-1))!==JSON.stringify(c))history.push(c);if(history.length>20)history.shift();};
  const setFollow=(value,notify=true)=>{value=!!value;if(!value)view.growthRun=null;if(prefs.autoFollow===value)return;prefs.autoFollow=value;savePrefs();if(notify)callbacks.onFollow?.(value);sync();};
  const manual=()=>{view.cancelFocusMotion();if(temporaryBrowsing()){view.growthRun=null;callbacks.onManual?.();return;}const changed=prefs.autoFollow;setFollow(false);if(changed)callbacks.onManual?.();};
  const go=async(target,{previous=false}={})=>{if(!target)return false;manual();if(previous)restoring=true;try{return await view.animateCamera(target);}finally{restoring=false;sync();}};
  const action=(id,text,path,fn)=>{const b=iconButton(id,text,path);b.onclick=fn;bar.append(b);return b;};
  const previous=action('workspace-previous-view','Previous view',paths.previous,()=>{const c=history.pop();if(c)go(c,{previous:true});});
  const areaButton=action('workspace-zoom-area','Zoom to area',paths.area,()=>{manual();areaMode=true;areaButton.setAttribute('aria-pressed','true');canvas.classList.add('zoom-area-mode');canvas.focus();view.actions.notify?.('Drag a rectangle around an area. Escape cancels.');});
  const reset=action('workspace-reset-zoom','Reset zoom to 100%',paths.reset,()=>go(zoomCamera(view.camera,1,center())));
  function toggle(id,text,path,onChange){const b=iconButton(id,text,path);b.checked=false;b.setAttribute('aria-pressed','false');b.onchange=()=>onChange(b.checked);b.onclick=()=>{b.checked=!b.checked;b.dispatchEvent(new Event('change'));};bar.append(b);return b;}
  const auto=toggle('workspace-auto-follow','Auto follow',paths.auto,value=>setFollow(value));
  const lock=toggle('workspace-lock-view','Lock view',paths.lock,value=>{view.cameraLocked=value;view.cancelFocusMotion();if(value)setFollow(false);sync();document.dispatchEvent(new Event('nodes-navigation-change'));});
  const miniToggle=toggle('workspace-minimap','Minimap',paths.minimap,value=>{prefs.minimap=value;savePrefs();geometry='';draw();});
  const resetControls=action('workspace-reset-controls','Reset controls','M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',resetMagneticControls);
  bar.append(home,paintIcon($('workspace-fit'),'Tidy map',paths.tidy),paintIcon($('workspace-hidden'),'Show hidden branches',paths.hidden),paintIcon($('workspace-expand'),'Expand all branches',paths.expand));
  const help=action('workspace-keyboard-map','Keyboard Map',paths.keyboard,()=>view.keyboardMap.open());
  const zoomTools=make('div');zoomTools.id='navigation-zoom-controls';zoomTools.setAttribute('role','group');zoomTools.setAttribute('aria-label','Zoom controls');zoomTools.append(out,zoom,inside);
  const viewportTools=make('div');viewportTools.id='navigation-viewport-controls';viewportTools.setAttribute('role','group');viewportTools.setAttribute('aria-label','View and arrangement actions');
  viewportTools.append(all,selected,areaButton,active,lock,$('workspace-fit'));
  const utilityTools=make('div');utilityTools.id='navigation-utility-controls';utilityTools.setAttribute('role','group');utilityTools.setAttribute('aria-label','Map options and recovery');
  utilityTools.append(miniToggle,previous,reset,auto,help,resetControls,home,$('workspace-hidden'),$('workspace-expand'));
  bar.append(zoomTools,viewportTools,utilityTools); // Two paired six-icon rows; zoom stays separate at left.
  const minimap=make('div');minimap.id='canvas-minimap';minimap.hidden=true;const mini=document.createElementNS('http://www.w3.org/2000/svg','svg');mini.setAttribute('role','button');mini.setAttribute('tabindex','0');mini.setAttribute('aria-label','Minimap. Click to center the view; arrow keys pan.');minimap.append(mini);canvas.append(minimap);let miniBounds;
  for(const surface of [bar,minimap])surface.addEventListener('pointerdown',event=>event.stopPropagation());
  document.addEventListener('magnetic-controls-will-move',hideNodeTooltip);
  const box=make('div');box.id='canvas-zoom-box';box.hidden=true;canvas.append(box);
  const center=()=>{const a=view.mapArea();return {x:a.x+a.width/2,y:a.y+a.height/2};};
  out.onclick=()=>go(zoomCamera(view.camera,view.camera.scale/1.2,center()));inside.onclick=()=>go(zoomCamera(view.camera,view.camera.scale*1.2,center()));
  all.onclick=()=>go(boundsCamera(view.sceneBounds,view.mapArea()));
  selected.onclick=()=>{const p=view.points.get(view.ws.inspected||'core');if(p)go(boundsCamera({minX:p.x,minY:p.y,maxX:p.x+p.width,maxY:p.y+p.height},view.mapArea()));};
  active.onclick=()=>{const id=callbacks.getActive?.()?.nodeId;if(!id)return;manual();view.focusExecutionNode(id);};
  zoom.onclick=()=>{
    hideNodeTooltip();const dialog=make('dialog');dialog.className='workspace-dialog camera-zoom-dialog';const title=make('h2','Zoom level');title.id='camera-zoom-title';dialog.setAttribute('aria-labelledby',title.id);const label=make('label','Zoom percentage'),input=make('input');input.type='number';input.min='2.5';input.max='250';input.step='any';input.value=String(Math.round(view.camera.scale*100));label.append(input);const form=make('form');form.append(title,label);
    const choices=make('div');for(const value of [25,50,100,150,200]){const b=make('button',value+'%');b.type='button';b.onclick=()=>{dialog.close();go(zoomCamera(view.camera,value/100,center()));};choices.append(b);}form.append(choices);
    const apply=make('button','Apply');apply.type='submit';const close=make('button','Cancel');close.type='button';close.onclick=()=>dialog.close();form.append(apply,close);form.onsubmit=e=>{e.preventDefault();if(!input.reportValidity()||!input.value)return;dialog.close();go(zoomCamera(view.camera,Number(input.value)/100,center()));};dialog.append(form);document.body.append(dialog);dialog.onclose=()=>{dialog.remove();zoom.focus();};dialog.showModal();input.focus();input.select();
  };
  const start=e=>{
    if(e.button===2)return; // Opening a context menu preserves follow mode and view history.
    if(e.target.closest('#canvas-navigation,#canvas-navigation-options,#canvas-minimap'))return;
    if(view.cameraLocked){if(!e.target.closest('button,input,textarea,select,#node-panel-frame')){e.preventDefault();e.stopImmediatePropagation();}return;}
    if(!areaMode){if(!e.target.closest('.growing-node,button,input,textarea,#node-panel-frame')){remember();manual();}return;}
    if(e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();const r=canvas.getBoundingClientRect();drag={x:e.clientX-r.left,y:e.clientY-r.top,id:e.pointerId};canvas.setPointerCapture(e.pointerId);box.hidden=false;
  };
  const endArea=()=>{if(areaMode)view.actions.notify?.('');areaMode=false;areaButton.setAttribute('aria-pressed','false');drag=null;box.hidden=true;canvas.classList.remove('zoom-area-mode');};
  canvas.addEventListener('pointerdown',start,{capture:true});canvas.addEventListener('pointermove',e=>{if(!drag)return;e.preventDefault();e.stopImmediatePropagation();const r=canvas.getBoundingClientRect();Object.assign(box.style,{left:Math.min(drag.x,e.clientX-r.left)+'px',top:Math.min(drag.y,e.clientY-r.top)+'px',width:Math.abs(e.clientX-r.left-drag.x)+'px',height:Math.abs(e.clientY-r.top-drag.y)+'px'});},{capture:true});
  canvas.addEventListener('pointerup',e=>{if(!drag)return;e.preventDefault();e.stopImmediatePropagation();const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,d=drag,c=view.camera;endArea();if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(Math.abs(x-d.x)<8||Math.abs(y-d.y)<8)return;go(boundsCamera({minX:(Math.min(x,d.x)-c.x)/c.scale,minY:(Math.min(y,d.y)-c.y)/c.scale,maxX:(Math.max(x,d.x)-c.x)/c.scale,maxY:(Math.max(y,d.y)-c.y)/c.scale},view.mapArea(),{maxScale:2.5}));},{capture:true});
  canvas.addEventListener('pointercancel',endArea,{capture:true});
  let lastWheel=0;canvas.addEventListener('wheel',e=>{if(e.target.closest('#canvas-navigation-options,#canvas-navigation,#canvas-minimap')){e.stopImmediatePropagation();return;}if(view.cameraLocked){e.preventDefault();e.stopImmediatePropagation();return;}if(performance.now()-lastWheel>250)remember();lastWheel=performance.now();manual();},{capture:true,passive:false});
  mini.onclick=e=>{if(!miniBounds||view.cameraLocked)return;const r=mini.getBoundingClientRect(),matrix=mini.getScreenCTM();if(!matrix)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()),a=center();go({...view.camera,x:a.x-p.x*view.camera.scale,y:a.y-p.y*view.camera.scale});};
  mini.onkeydown=e=>{const axis={ArrowLeft:[1,0],ArrowRight:[-1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[e.key];if(!axis||view.cameraLocked)return;e.preventDefault();const a=view.mapArea();go({...view.camera,x:view.camera.x+axis[0]*a.width/4,y:view.camera.y+axis[1]*a.height/4});};
  function sync(){
    const key=view.state?.id+':'+view.ws.layout;if(scope&&scope!==key){history.length=0;scope=key;endArea();}
    bar.hidden=view.legacyMode;zoom.textContent=Math.round(view.camera.scale*100)+'%';auto.checked=!!prefs.autoFollow;lock.checked=!!view.cameraLocked;miniToggle.checked=!!prefs.minimap;previous.disabled=!history.length;active.disabled=!callbacks.getActive?.()?.nodeId;selected.disabled=!view.points.has(view.ws.inspected||'core');
    for(const button of [auto,lock,miniToggle])button.setAttribute('aria-pressed',String(button.checked));
    areaButton.setAttribute('aria-pressed',String(areaMode));
    minimap.hidden=!prefs.minimap||view.legacyMode;canvas.classList.toggle('camera-locked',!!view.cameraLocked);
    cameraArea=view.mapArea();syncBottomToolbars();
    paintCamera();
  }
  // Camera frames update only the existing zoom label and one optional viewport
  // rectangle. Node geometry, controls and toolbar layout update on draw/status.
  function paintCamera(){
    if(!prefs.minimap)return;const a=cameraArea,rect=mini.querySelector('[data-viewport]');if(a&&rect){rect.setAttribute('x',(a.x-view.camera.x)/view.camera.scale);rect.setAttribute('y',(a.y-view.camera.y)/view.camera.scale);rect.setAttribute('width',a.width/view.camera.scale);rect.setAttribute('height',a.height/view.camera.scale);}
  }
  function draw(){
    sync();if(!prefs.minimap)return;const signature=JSON.stringify([...view.points]);if(signature===geometry)return;geometry=signature;mini.replaceChildren();miniBounds=view.sceneBounds;if(!miniBounds)return;const b=miniBounds;mini.setAttribute('viewBox',`${b.minX-20} ${b.minY-20} ${b.maxX-b.minX+40} ${b.maxY-b.minY+40}`);
    for(const [id,p]of view.points){const r=document.createElementNS(mini.namespaceURI,'rect');for(const [k,v]of Object.entries(p))if(['x','y','width','height'].includes(k))r.setAttribute(k,v);r.setAttribute('fill',view.color(id));r.setAttribute('opacity','.75');mini.append(r);}const r=document.createElementNS(mini.namespaceURI,'rect');r.dataset.viewport='true';r.setAttribute('fill','none');r.setAttribute('stroke','currentColor');r.setAttribute('stroke-width','1.5');r.setAttribute('vector-effect','non-scaling-stroke');mini.append(r);sync();
  }
  installWorkspaceCommands(view,{buttons:{out,inside,zoom,all,selected,active,home,previous,areaButton,reset,resetControls,help},toggles:[['navigate.auto-follow','Auto follow',auto],['navigate.lock','Lock view',lock],['navigate.minimap','Minimap',miniToggle]],resetControls:resetMagneticControls});
  installCanvasTidyMenu(view,canvas);
  return {cancelArea(){if(!areaMode)return false;endArea();areaButton.setAttribute('aria-pressed','false');return true;},sync,draw,camera:paintCamera,remember,setAutoFollow:setFollow,setTemporaryBrowsing(predicate){temporaryBrowsing=typeof predicate==='function'?predicate:()=>false;},get autoFollow(){return prefs.autoFollow&&!view.cameraLocked;},bind(value){callbacks=value;sync();},manual,snapshot:()=>({...prefs,locked:!!view.cameraLocked}),restore(value){if(!value)return;Object.assign(prefs,{autoFollow:!!value.autoFollow,minimap:!!value.minimap});view.cameraLocked=!!value.locked;savePrefs();geometry='';draw();}};
}
