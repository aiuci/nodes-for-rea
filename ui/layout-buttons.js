// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const NS='http://www.w3.org/2000/svg';
const arrangements=[
  {id:'horizontal',label:'Horizontal',description:'Wide, landscape arrangement; saved kept positions remain protected',nodes:[[6,15],[25,6],[25,15],[25,24],[42,6]],edges:[[0,1],[0,2],[0,3],[1,4]]},
  {id:'vertical',label:'Vertical',description:'Tall, portrait arrangement; saved kept positions remain protected',nodes:[[24,3],[17,14],[24,14],[31,14],[24,28]],edges:[[0,1],[0,2],[0,3],[2,4]]},
  {id:'compact',label:'Compact',nodes:[[24,3],[14,14],[34,14],[6,26],[20,26],[34,26],[45,26]],edges:[[0,1],[0,2],[1,3],[1,4],[2,5],[2,6]]},
  {id:'radial',label:'Radial',nodes:[[24,15],[6,5],[24,3],[42,5],[42,25],[6,25]],edges:[[0,1],[0,2],[0,3],[0,4],[0,5]]},
  {id:'spiral',label:'Spiral',nodes:[[24,15],[31,15],[33,7],[20,3],[9,12],[13,26],[40,25]],edges:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]]},
  {id:'wisp',label:'Wisp',nodes:[[7,16],[17,11],[18,24],[29,5],[30,16],[40,12],[43,25]],edges:[[0,1],[0,2],[1,3],[1,4],[4,5],[4,6]]},
  {id:'organic',label:'Organic',description:'Irregular flowing junctions with loose branch fans',nodes:[[23,16],[12,8],[7,4],[6,13],[35,9],[43,3],[44,12],[33,27]],edges:[[0,1],[1,2],[1,3],[0,4],[4,5],[4,6],[0,7]]},
  {id:'shattered',label:'Chaotic',description:'Deliberately scattered connected branch clusters',nodes:[[23,15],[7,4],[13,7],[40,4],[44,10],[7,27],[39,27]],edges:[[0,1],[1,2],[0,3],[3,4],[0,5],[0,6]]},
  {id:'exploded',label:'Exploded',description:'Known branch assemblies separated outward with aligned parts',nodes:[[4,15],[18,5],[18,25],[32,5],[32,25],[44,5],[44,25]],edges:[[0,1],[0,2],[1,3],[2,4],[3,5],[4,6]]},
  {id:'bloom',label:'Bloom',description:'Major branches form compact flower clusters; manual dragging remains available',nodes:[[24,15],[10,8],[3,3],[16,3],[4,15],[38,22],[31,28],[45,28],[45,15]],edges:[[0,1],[1,2],[1,3],[1,4],[0,5],[5,6],[5,7],[5,8]]},
  {id:'constellation',label:'Constellation',description:'Connected feature families arranged as separated star clusters',nodes:[[10,8],[5,3],[16,4],[33,23],[27,28],[42,24]],edges:[[0,1],[0,2],[0,3],[3,4],[3,5]]},
  {id:'river',label:'River',description:'A recorded investigation path with branching tributaries; no implied chronology',nodes:[[4,16],[17,12],[30,17],[44,13],[17,3],[30,27]],edges:[[0,1],[1,2],[2,3],[1,4],[2,5]]},
  {id:'orbit',label:'Orbit',description:'Concentric rings represent recorded hierarchy depth',nodes:[[24,15],[14,12],[32,8],[40,25],[7,25],[25,2]],edges:[[0,1],[0,2],[1,4],[2,3],[2,5]]},
  {id:'honeycomb',label:'Honeycomb',description:'Readable branch families packed into hexagonal neighborhoods',nodes:[[10,9],[10,20],[24,4],[24,15],[24,27],[38,9],[38,20]],edges:[[3,0],[0,1],[3,2],[3,4],[3,5],[5,6]]},
  {id:'tree',label:'Tree',description:'Packed hierarchical subtrees with clear parent-child levels',nodes:[[24,3],[11,15],[37,15],[4,27],[18,27],[32,27],[45,27]],edges:[[0,1],[0,2],[1,3],[1,4],[2,5],[2,6]]},
  {id:'grid',label:'Grid',description:'An orderly matrix for scanning every visible node',nodes:[[8,5],[24,5],[40,5],[8,16],[24,16],[40,16],[8,27],[24,27],[40,27]],edges:[[0,1],[1,2],[0,3],[1,4],[2,5],[3,6],[4,7],[5,8]]}
];
const element=(name,attrs)=>{const node=document.createElementNS(NS,name);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
function diagram(layout){
  const svg=element('svg',{viewBox:'0 0 48 31','aria-hidden':'true',focusable:'false'});
  for(const [from,to]of layout.edges){const a=layout.nodes[from],b=layout.nodes[to];svg.append(element('path',{d:`M${a[0]} ${a[1]} L${b[0]} ${b[1]}`}));}
  layout.nodes.forEach(([x,y],index)=>svg.append(element('rect',{x:x-3,y:y-2.2,width:6,height:4.4,rx:1.4,class:index===0?'layout-root':'layout-leaf'})));
  return svg;
}
export function installLayoutButtons(change){
  const picker=document.getElementById('map-layout');picker.replaceChildren();picker.hidden=false;
  for(const layout of arrangements){const button=document.createElement('button');button.type='button';button.className='layout-choice';button.dataset.mapLayout=layout.id;button.title=layout.description?`${layout.label}: ${layout.description}`:`Use ${layout.label.toLowerCase()} layout`;button.setAttribute('aria-description',layout.description||`${layout.label} arrangement`);button.setAttribute('aria-pressed','false');button.append(diagram(layout));const label=document.createElement('span');label.textContent=layout.label;button.append(label);button.addEventListener('click',()=>{change(layout.id);picker.querySelector(`[data-map-layout="${layout.id}"]`)?.focus({preventScroll:true});});picker.append(button);}
  picker.addEventListener('keydown',event=>{const buttons=[...picker.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(index<0)return;let next;if(event.key==='ArrowRight')next=(index+1)%buttons.length;else if(event.key==='ArrowLeft')next=(index+buttons.length-1)%buttons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else return;event.preventDefault();buttons[next].focus();});
}
export function syncLayoutButtons(layout){for(const button of document.querySelectorAll('#map-layout button'))button.setAttribute('aria-pressed',String(button.dataset.mapLayout===layout));}
