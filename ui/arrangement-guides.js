// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {explodedGroups,explodedPlate} from '../lib/cluster-arrangements.mjs';
import {boundsOf} from '../lib/result-growth.mjs';
import {layoutFamilies,honeycombMap,hexVertices} from '../lib/additional-layouts.mjs';
const ns='http://www.w3.org/2000/svg',element=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
export function drawArrangementGuides(view){
  let guides=document.getElementById('map-arrangement-guides');if(!guides){guides=element('svg',{id:'map-arrangement-guides','aria-hidden':'true'});document.getElementById('map-wires').before(guides);}guides.replaceChildren();guides.hidden=!['exploded','orbit','honeycomb'].includes(view.ws.layout);if(guides.hidden)return;
  if(view.ws.layout==='orbit'){
    const {tree}=layoutFamilies(view.shownMap()),root=view.points.get(tree.root);if(!root)return;const x=root.x+root.width/2,y=root.y+root.height/2,depths=new Map([[tree.root,0]]),rings=new Map();
    for(const id of tree.order){if(id===tree.root)continue;const depth=(depths.get(view.map.nodes.get(id)?.parent)||0)+1,p=view.points.get(id);depths.set(id,depth);if(!p)continue;const row=rings.get(depth)||[];row.push(Math.hypot(p.x+p.width/2-x,p.y+p.height/2-y));rings.set(depth,row);}
    guides.append(element('circle',{cx:x,cy:y,r:150,fill:'#aebac8','fill-opacity':'.025',stroke:'#aebac8','stroke-opacity':'.4','stroke-width':1.2,'data-orbit-core':'true'}));
    for(const [depth,values]of rings){values.sort((a,b)=>a-b);guides.append(element('circle',{cx:x,cy:y,r:values[Math.floor(values.length/2)],fill:'none',stroke:'#9aafc8','stroke-opacity':'.55','stroke-width':1.4,'data-orbit-depth':depth}));}return;
  }
  if(view.ws.layout==='honeycomb'){
    const map=view.shownMap(),{groups}=layoutFamilies(map),cells=honeycombMap(map,view.ws.mapPositions).cells;
    for(const cell of cells){const root=view.points.get(cell.id);if(!root)continue;const x=root.x+root.width/2,y=root.y+root.height/2;let radius=cell.radius;
      for(const id of groups.get(cell.id)||[]){const p=view.points.get(id);if(!p)continue;for(const a of [0,Math.PI/3,Math.PI*2/3])for(const px of [p.x,p.x+p.width])for(const py of [p.y,p.y+p.height])radius=Math.max(radius,(Math.abs((px-x)*Math.cos(a)+(py-y)*Math.sin(a))+24)/(Math.sqrt(3)/2));}
      const vertices=hexVertices(x,y,radius),d=vertices.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')+' Z';guides.append(element('path',{d,fill:view.color(cell.id),'fill-opacity':'.018',stroke:view.color(cell.id),'stroke-opacity':'.3','stroke-width':1.2,'data-family-id':cell.id}));}return;
  }
  // Decorative assembly plates only: they introduce no graph relationships.
  const {tree,groups}=explodedGroups(view.shownMap());
  for(const [id,members]of groups){
    const rects=[...members].map(key=>view.points.get(key)).filter(Boolean);if(!rects.length)continue;
    const b=boundsOf(rects),color=view.color(id);
    if(id===tree.root){const p=view.points.get(id);if(p){const x=p.x+p.width/2,y=p.y+p.height/2;guides.append(element('path',{d:`M${x-185} ${y} L${x} ${y-70} L${x+185} ${y} L${x} ${y+70} Z`,fill:color,'fill-opacity':'.025',stroke:color,'stroke-opacity':'.22','stroke-dasharray':'3 6'}));}continue;}
    const {x,y,w,h,tilt}=explodedPlate(b),outline=`M${x} ${y} L${x+w} ${y+tilt} L${x+w} ${y+h+tilt} L${x} ${y+h} Z`;
    const plate=element('g',{'data-assembly-id':id});
    plate.append(element('path',{d:outline,transform:'translate(14,-14)',fill:'none',stroke:color,'stroke-opacity':'.13','stroke-dasharray':'3 5','stroke-width':'1'}));
    plate.append(element('path',{d:outline,fill:'#101924','fill-opacity':'.62',stroke:color,'stroke-opacity':'.48','stroke-width':'1'}));
    plate.append(element('path',{d:`M${x} ${y} L${x+w} ${y+tilt} L${x+w} ${y+tilt+38} L${x} ${y+38} Z`,fill:color,'fill-opacity':'.055',stroke:'none'}));
    const title=String(view.map.nodes.get(id)?.title||'Branch'),label=element('text',{x:x+16,y:y+25,transform:`rotate(${Math.atan2(tilt,w)*180/Math.PI} ${x+16} ${y+25})`,fill:color,'fill-opacity':'.92','font-size':'15','font-family':'inherit','font-weight':'600'}),max=Math.max(12,Math.floor((w-32)/8));label.textContent=title.length>max?title.slice(0,max-1)+'…':title;const tooltip=element('title',{});tooltip.textContent=title;label.append(tooltip);plate.append(label);guides.append(plate);
  }
}

export function syncOrbitGuideStroke(view){
 if(view.ws.layout!=='orbit')return;const guides=document.getElementById('map-arrangement-guides');if(!guides)return;const style=getComputedStyle(guides),core=parseFloat(style.getPropertyValue('--orbit-guide-core-width'))||1.2,depth=parseFloat(style.getPropertyValue('--orbit-guide-ring-width'))||1.4,scale=Math.max(.025,view.camera.scale||1);for(const ring of guides.querySelectorAll('circle'))ring.setAttribute('stroke-width',String((ring.hasAttribute('data-orbit-core')?core:depth)/scale));
}
