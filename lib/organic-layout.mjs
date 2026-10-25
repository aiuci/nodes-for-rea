// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {primaryTree} from './cluster-arrangements.mjs';
import {intersects,growthPocket} from './result-growth.mjs';
const hash=text=>[...text].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,17),size=p=>({width:p?.width||220,height:p?.height||66}),center=p=>({x:p.x+p.width/2,y:p.y+p.height/2});
// Restore the former Radial's weighted branch order and retained-anchor growth.
// Fans are local to each junction, rather than constrained to global rings.
export function organicMap(map,saved={}, {preserve=true}={}){
  const tree=primaryTree(map),positions=preserve?structuredClone(saved):{},weights=new Map();if(!tree.root)return {positions,moved:[],constrained:[]};
  const weigh=id=>{const w=Math.max(1,(tree.children.get(id)||[]).reduce((sum,child)=>sum+weigh(child),0));weights.set(id,w);return w;};weigh(tree.root);
  const rootSize=size(saved[tree.root]);positions[tree.root]||={x:-rootSize.width/2,y:-rootSize.height/2,...rootSize};
  const place=(id,heading)=>{const parent=positions[id],at=center(parent),children=tree.children.get(id)||[],total=children.reduce((s,c)=>s+Math.sqrt(weights.get(c)),0)||1,fan=id===tree.root?Math.PI*2:Math.min(Math.PI*1.45,1.1+children.length*.17);let cursor=heading-fan/2;
    for(const child of children){const span=fan*Math.sqrt(weights.get(child))/total,angle=cursor+span/2+(id===tree.root?0:((hash(child)%31)-15)/180);cursor+=span;
      if(!positions[child]){const n=map.nodes.get(child);if(preserve&&Object.keys(saved).length>1&&['result','attempt','discovery'].includes(n.type))Object.assign(positions,growthPocket(map,child,positions,'organic'));
        if(!positions[child]){const d=size(saved[child]),base=Math.max(300,children.length*240/Math.max(1,fan)),distance=base+Math.min(160,Math.sqrt(weights.get(child))*25)+(hash(child)%80);let p;
          for(let i=0;i<600;i++){const side=i%2?1:-1,a=angle+side*Math.ceil(i/2)*.055,r=distance+Math.floor(i/20)*60;p={x:at.x+Math.cos(a)*r-d.width/2,y:at.y+Math.sin(a)*r-d.height/2,...d};if(!Object.values(positions).some(q=>intersects(p,q,40)))break;}positions[child]=p;}
      }
      const c=center(positions[child]);place(child,Math.atan2(c.y-at.y,c.x-at.x)+((hash(child)%21)-10)/100);
    }
  };place(tree.root,0);
  return {positions,moved:tree.order.filter(id=>!saved[id]||positions[id].x!==saved[id].x||positions[id].y!==saved[id].y),constrained:[]};
}

export function tidyOrganic(map,saved,{locked=[],collapsed=[]}={}){
  const original=organicMap(map,saved).positions,positions=structuredClone(original),fixed=new Set([map.root,...locked,...collapsed]),ids=[...map.nodes.keys()].sort((a,b)=>Number(fixed.has(b))-Number(fixed.has(a))),placed=[],moved=[],constrained=[];
  for(const id of ids){let p=positions[id];if(placed.some(q=>intersects(p,q,32))){if(fixed.has(id))constrained.push(id);else{const parent=positions[map.nodes.get(id)?.parent]||positions[map.root],a=center(parent),b=center(p),angle=Math.atan2(b.y-a.y,b.x-a.x),radius=Math.hypot(b.x-a.x,b.y-a.y),candidates=[];
      for(let ring=0;ring<35;ring++)for(let side=-8;side<=8;side++){const r=radius+ring*28,t=angle+side*.1,c={...p,x:a.x+Math.cos(t)*r-p.width/2,y:a.y+Math.sin(t)*r-p.height/2};if(!placed.some(q=>intersects(c,q,32)))candidates.push(c);}candidates.sort((x,y)=>Math.hypot(x.x-p.x,x.y-p.y)-Math.hypot(y.x-p.x,y.y-p.y));p=candidates[0]||{...p,y:Math.max(...placed.map(q=>q.y+q.height))+32};
    }}positions[id]=p;placed.push(p);if(p.x!==original[id].x||p.y!==original[id].y)moved.push(id);
  }
  return {positions,moved,constrained};
}
