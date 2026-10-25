// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const samples=new WeakMap();
const overlaps=(a,b,gap=0)=>a.left<b.right+gap&&a.right>b.left-gap&&a.top<b.bottom+gap&&a.bottom>b.top-gap;
function wireCrosses(path,box,matrix){
  if(!matrix)return false;
  let cached=samples.get(path);
  if(!cached){cached={bounds:path.getBBox()};samples.set(path,cached);}
  const b=cached.bounds,left=b.x*matrix.a+matrix.e,top=b.y*matrix.d+matrix.f;
  if(!overlaps({left,top,right:left+b.width*matrix.a,bottom:top+b.height*matrix.d},box,7))return false;
  if(!cached.points){const length=path.getTotalLength(),count=Math.max(1,Math.min(4096,Math.ceil(length/4)));cached.points=Array.from({length:count+1},(_,i)=>path.getPointAtLength(length*i/count));cached.step=length/count;}
  const points=cached.points;
  let prior;
  for(const point of points){const at={x:point.x*matrix.a+matrix.e,y:point.y*matrix.d+matrix.f};if(prior&&overlaps({left:Math.min(at.x,prior.x),right:Math.max(at.x,prior.x),top:Math.min(at.y,prior.y),bottom:Math.max(at.y,prior.y)},box,7+cached.step*matrix.a/2))return true;prior=at;}
  return false;
}
// One transient, screen-space text label. No graph/state writes or camera changes.
export function syncSelectedHeadline(view){
  let label=view.selectedHeadline;
  if(!label){
    label=document.createElement('div');label.id='selected-node-headline';label.setAttribute('aria-hidden','true');document.getElementById('workspace-canvas').append(label);view.selectedHeadline=label;
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog[open]')){view.headlineDismissed=true;label.classList.remove('visible');} });
    view.headlineResize=new ResizeObserver(()=>{view.headlineLayoutDirty=true;syncSelectedHeadline(view);});view.headlineResize.observe(document.getElementById('workspace-canvas'));view.headlineResize.observe(document.getElementById('node-panel-frame'));if(document.getElementById('canvas-control-cluster'))view.headlineResize.observe(document.getElementById('canvas-control-cluster'));document.addEventListener('canvas-toolbar-moved',()=>{view.headlineLayoutDirty=true;syncSelectedHeadline(view);});
  }
  const id=view.headlineRequest,item=view.displayMap?.nodes.get(id),selected=view.ws.inspected||'core';
  if(!item||selected!==id||view.headlineDismissed||!view.nodeOpen||view.legacyMode){label.classList.remove('visible');return;}
  const owner=view.points.get(id);
  if(!owner){label.classList.remove('visible');return;}
  const text=item.title.length>240?item.title.slice(0,237).trimEnd()+'…':item.title;
  if(label.dataset.owner!==id||label.textContent!==text){label.classList.remove('visible');label.dataset.owner=id;label.textContent=text;}
  const {x,y,scale}=view.camera;
  if(!view.headlineLayout||view.headlineLayoutDirty){
    const canvas=document.getElementById('workspace-canvas').getBoundingClientRect(),controls=[];
    for(const selector of ['#node-panel-frame','#canvas-control-dock','.magnetic-group','#canvas-navigation','#canvas-minimap','#theme-strip']){for(const el of document.querySelectorAll(selector))if(el.getClientRects().length)controls.push(el.getBoundingClientRect());}
    view.headlineLayout={canvas,controls};view.headlineLayoutDirty=false;
  }
  const {canvas,controls}=view.headlineLayout;
  const screen=p=>({left:canvas.left+x+p.x*scale,top:canvas.top+y+p.y*scale,right:canvas.left+x+(p.x+p.width)*scale,bottom:canvas.top+y+(p.y+p.height)*scale,width:p.width*scale});
  const anchor=screen(owner),obstacles=[...controls,...[...view.points].filter(([key])=>key!==id).map(([,p])=>screen(p))];
  const measurementKey=text+'|'+canvas.width;
  if(view.headlineMeasurementKey!==measurementKey){
    view.headlineSizes=[320,260,200].map(width=>{label.style.width=`${Math.min(width,canvas.width-24)}px`;return {width:label.offsetWidth,height:label.offsetHeight};});view.headlineMeasurementKey=measurementKey;
  }
  const wires=[...document.querySelectorAll('#map-wires path')],matrix={a:scale,d:scale,e:canvas.left+x,f:canvas.top+y};
  let safe=false;
  for(const {width,height} of view.headlineSizes){
    const left=anchor.left+anchor.width/2-width/2,top=anchor.top-height-12;
    const box={left,right:left+width,top,bottom:top+height};
    if(box.left<canvas.left+12||box.right>canvas.right-12||box.top<canvas.top+12||box.bottom>canvas.bottom-12)continue;
    if(obstacles.some(r=>overlaps(r,box,8))||wires.some(p=>wireCrosses(p,box,matrix)))continue;
    label.style.width=`${width}px`;label.style.left=`${left-canvas.left}px`;label.style.top=`${top-canvas.top}px`;safe=true;break;
  }
  if(safe&&!label.classList.contains('visible')){void label.offsetWidth;label.classList.add('visible');}
  else if(!safe)label.classList.remove('visible');
}
