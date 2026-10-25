// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {primaryTree} from './cluster-arrangements.mjs';
import {compactTree} from './tree-layout.mjs';
import {boundsOf} from './result-growth.mjs';
const size=p=>({width:p?.width||220,height:p?.height||66});

// Swap the layout axes, not the rendered cards: descendants flow to the right
// while broad tributaries wrap inside their own bounded, upright envelope.
function tributary(tree,root,dimensions){
 const composed=compactTree({...tree,root},dimensions).positions;
 const positions=Object.fromEntries(Object.entries(composed).map(([id,p])=>[id,{x:p.y,y:p.x,width:p.height,height:p.width}]));
 return {positions,bounds:boundsOf(Object.values(positions))};
}

function pathFor(tree,map){
 if(!tree.root)return [];
 const scores=new Map();
 const score=id=>{const children=tree.children.get(id)||[],own=['result','attempt'].includes(map.nodes.get(id)?.type)?1000:1,value=own+Math.max(0,...children.map(score));scores.set(id,value);return value;};score(tree.root);
 const spine=[];for(let id=tree.root;id;){spine.push(id);id=[...(tree.children.get(id)||[])].sort((a,b)=>scores.get(b)-scores.get(a))[0];}
 return spine;
}
export const riverSpine=map=>pathFor(primaryTree(map),map);

export function composeRiver(map,saved={}){
 const tree=primaryTree(map);if(!tree.root)return {positions:{},spine:[],order:[]};
 const spine=pathFor(tree,map);
 const dimensions=Object.fromEntries(tree.order.map(id=>{const d=size(saved[id]);return [id,{width:d.height,height:d.width}];}));
 const positions={};let x=0;
 spine.forEach((id,i)=>{const d=size(saved[id]);positions[id]={x,y:Math.sin(i*.8)*60-d.height/2,...d};x+=d.width+270;});
 const blocks=[];
 for(const [i,id]of spine.entries())for(const child of tree.children.get(id)||[])if(child!==spine[i+1])blocks.push({parent:id,...tributary(tree,child,dimensions)});
 const area=blocks.reduce((sum,b)=>sum+(b.bounds.width+80)*(b.bounds.height+60),0);
 const height=Math.max(320,...blocks.map(b=>b.bounds.height),Math.min(650,Math.sqrt(area/5)));
 const stream=boundsOf(Object.values(positions)),banks=[{x:0,used:0,width:0},{x:0,used:0,width:0}];
 blocks.forEach((block,i)=>{
  const bank=banks[i%2],b=block.bounds,parent=positions[block.parent],minX=parent.x+parent.width+160;
  if(bank.x<minX||bank.used&&bank.used+b.height>height){bank.x=Math.max(minX,bank.x+bank.width+80);bank.used=0;bank.width=0;}
  const y=i%2?stream.y+stream.height+130+bank.used:stream.y-130-bank.used-b.height;
  for(const [id,p]of Object.entries(block.positions))positions[id]={...p,x:p.x+bank.x-b.x,y:p.y+y-b.y};
  bank.used+=b.height+60;bank.width=Math.max(bank.width,b.width);
 });
 return {positions,spine,order:tree.order};
}
