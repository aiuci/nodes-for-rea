// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {primaryTree} from './cluster-arrangements.mjs';
import {intersects} from './result-growth.mjs';
const TAU=Math.PI*2,gap=40,size=p=>({width:Math.max(32,p?.width||220),height:Math.max(24,p?.height||66)}),center=p=>({x:p.x+p.width/2,y:p.y+p.height/2});
const changed=(saved,positions,ids)=>ids.filter(id=>!saved[id]||Math.abs(saved[id].x-positions[id].x)>.001||Math.abs(saved[id].y-positions[id].y)>.001);

// Circle: real concentric depth rings, not ever-narrower leaf rays. If a ring
// is crowded, redistribute its angles inside the main sectors, then enlarge
// that ring only as needed. Upright rectangles are the collision authority.
export function circularMap(map,saved={}){
  const tree=primaryTree(map);if(!tree.root)return {positions:{...saved},moved:[],constrained:[],sectors:[],radii:{}};
  const weights=new Map(),angles=new Map(),levels=new Map(),sectors=[],mainFor=new Map(),dim=Object.fromEntries(tree.order.map(id=>[id,size(saved[id])]));
  const measure=id=>{const children=tree.children.get(id)||[],w=Math.max(Math.hypot(dim[id].width,dim[id].height)+gap,children.reduce((s,c)=>s+measure(c),0));weights.set(id,w);return w;};measure(tree.root);
  const assign=(id,start,end,depth,main)=>{angles.set(id,(start+end)/2);mainFor.set(id,main);const level=levels.get(depth)||[];level.push(id);levels.set(depth,level);let cursor=start;const kids=tree.children.get(id)||[],total=kids.reduce((s,c)=>s+weights.get(c),0)||1;for(const child of kids){const span=(end-start)*weights.get(child)/total;if(id===tree.root)sectors.push({id:child,start:cursor,end:cursor+span,weight:weights.get(child)});assign(child,cursor,cursor+span,depth+1,id===tree.root?child:main);cursor+=span;}};assign(tree.root,-Math.PI/2,TAU-Math.PI/2,0,null);
  const d=dim[tree.root],positions={...saved,[tree.root]:{x:-d.width/2,y:-d.height/2,...d}},placed=[positions[tree.root]],radii={[tree.root]:0};let prior=0;
  for(const [depth,ids]of levels){if(!depth)continue;let radius=prior+280,items;
    for(let attempt=0;attempt<500;attempt++){
      items={};let fits=true;
      for(const sector of sectors){
        const list=ids.filter(id=>mainFor.get(id)===sector.id),packed=[];let previous=sector.start;
        for(const id of list){const s=dim[id],half=(Math.hypot(s.width,s.height)+gap+16)/(2*radius),parent=map.nodes.get(id)?.parent,siblings=(tree.children.get(parent)||[]).filter(c=>list.includes(c)),step=(Math.hypot(s.width,s.height)+gap+16)/radius,parentAngle=depth===1?(sector.start+sector.end)/2:angles.get(parent),wanted=parentAngle+(siblings.indexOf(id)-(siblings.length-1)/2)*step,theta=Math.max(wanted,previous+half);packed.push({id,theta,half,wanted});previous=theta+half;}
        if(packed.length){const lower=sector.start-packed[0].theta+packed[0].half,upper=sector.end-packed.at(-1).theta-packed.at(-1).half;if(lower>upper){fits=false;break;}const preferred=packed.reduce((sum,p)=>sum+p.wanted-p.theta,0)/packed.length,shift=Math.max(lower,Math.min(upper,preferred));for(const item of packed){const s=dim[item.id],theta=item.theta+shift,p={x:Math.cos(theta)*radius-s.width/2,y:Math.sin(theta)*radius-s.height/2,...s};if([...placed,...Object.values(items)].some(q=>intersects(p,q,gap))){fits=false;break;}items[item.id]=p;}}
        if(!fits)break;
      }
      if(fits)break;radius+=Math.max(30,radius*.035);
    }
    Object.assign(positions,items);placed.push(...Object.values(items));for(const id of ids){radii[id]=radius;angles.set(id,Math.atan2(items[id].y+items[id].height/2,items[id].x+items[id].width/2));const sector=sectors.find(s=>s.id===mainFor.get(id));angles.set(id,angles.get(id)+TAU*Math.round(((sector.start+sector.end)/2-angles.get(id))/TAU));}prior=radius;
  }
  return {positions,moved:changed(saved,positions,tree.order),constrained:[],sectors,radii};
}

export const SPIRAL_PITCH=80;
export function isSpiralPoint(p,core){const c=center(p),o=center(core),r=Math.hypot(c.x-o.x,c.y-o.y),angle=r/SPIRAL_PITCH-Math.PI/2;return r<1||Math.hypot(c.x-o.x-Math.cos(angle)*r,c.y-o.y-Math.sin(angle)*r)<1;}
// Spiral: contiguous primary-tree traversal on an actual Archimedean spiral.
// Adjacent turns and neighbors use rectangle spacing, not a fixed item count.
export function spiralMap(map,saved={}){
  const tree=primaryTree(map),positions={...saved},occupied=[];let theta=0,previous;
  for(const id of tree.order){const d=size(saved[id]);if(previous){const needed=(Math.hypot(d.width,d.height)+Math.hypot(previous.width,previous.height))/2+gap;theta+=needed/Math.max(SPIRAL_PITCH,Math.hypot(SPIRAL_PITCH,theta*SPIRAL_PITCH));}let p;
    for(let tries=0;tries<1500;tries++){const r=theta*SPIRAL_PITCH,a=theta-Math.PI/2;p={x:Math.cos(a)*r-d.width/2,y:Math.sin(a)*r-d.height/2,...d};if(!occupied.some(q=>intersects(p,q,gap)))break;theta+=.05;}
    positions[id]=p;occupied.push(p);previous=d;
  }
  return {positions,moved:changed(saved,positions,tree.order),constrained:[]};
}

export function spiralHierarchyRoute(a,b,core,{circuit=false}={}){
  const o=center(core),ac=center(a),bc=center(b),ra=Math.hypot(ac.x-o.x,ac.y-o.y),rb=Math.hypot(bc.x-o.x,bc.y-o.y),unwrap=(angle,near)=>angle+TAU*Math.round((near-angle)/TAU),ta=unwrap(Math.atan2(ac.y-o.y,ac.x-o.x),ra/SPIRAL_PITCH-Math.PI/2),tb=unwrap(Math.atan2(bc.y-o.y,bc.x-o.x),rb/SPIRAL_PITCH-Math.PI/2),count=Math.max(1,Math.ceil(Math.abs(tb-ta)/.1));
  const channel=Array.from({length:count+1},(_,i)=>{const t=i/count,angle=ta+(tb-ta)*t,r=ra+(rb-ra)*t+150;return {x:o.x+Math.cos(angle)*r,y:o.y+Math.sin(angle)*r};});
  const boundary=(rect,target)=>{const c=center(rect),dx=target.x-c.x,dy=target.y-c.y,t=1/Math.max(Math.abs(dx)/(rect.width/2),Math.abs(dy)/(rect.height/2),.000001);return {x:c.x+dx*t,y:c.y+dy*t};},start=boundary(a,channel[0]),end=boundary(b,channel.at(-1)),points=[start,...channel,end];let d=`M${start.x} ${start.y}`;
  for(let i=1;i<points.length;i++){const p=points[i],before=points[i-1];if(circuit)d+=` H${p.x} V${p.y}`;else{const prev=points[i-2]||before,next=points[i+1]||p;d+=` C${before.x+(p.x-prev.x)/6} ${before.y+(p.y-prev.y)/6},${p.x-(next.x-before.x)/6} ${p.y-(next.y-before.y)/6},${p.x} ${p.y}`;}}
  return {start,end,d,points};
}
