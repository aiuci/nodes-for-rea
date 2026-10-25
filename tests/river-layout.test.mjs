import test from 'node:test';
import assert from 'node:assert/strict';
import {riverMap} from '../lib/additional-layouts.mjs';
import {boundsOf,intersects} from '../lib/result-growth.mjs';
import {connectionPorts} from '../lib/map-routing.mjs';
import {riverSpine} from '../lib/river-layout.mjs';
import {cleanWorkspace} from '../lib/workspace.mjs';

function inventory(){
 const nodes=new Map(),children=new Map(),add=(id,parent,type)=>{nodes.set(id,{id,parent,type});if(parent)children.set(parent,[...(children.get(parent)||[]),id]);};add('core',null,'root');
 for(let i=0;i<19;i++){const f=`feature${i}`;add(f,'core','feature');if(i<7){add(`${f}:result`,f,'result');for(let j=0;j<6;j++)add(`${f}:finding${j}`,`${f}:result`,'finding');}}
 return {root:'core',nodes,children};
}
test('River flows downstream with a readable horizontal spine and compact disjoint tributaries',()=>{
 const map=inventory(),original=structuredClone(map),r=riverMap(map),box=boundsOf(Object.values(r.positions));
 for(const [id,node]of map.nodes){if(!node.parent)continue;const a=r.positions[node.parent],b=r.positions[id];assert.ok(b.x>=a.x+a.width+30,`${node.parent} -> ${id} flows upstream or sideways`);assert.deepEqual(connectionPorts(a,b,{layout:'river'}),{vertical:false,start:{x:a.x+a.width,y:a.y+a.height/2},end:{x:b.x,y:b.y+b.height/2}});}
 assert.ok(box.width>box.height*1.2,JSON.stringify(box));assert.ok(box.width<9000&&box.height<3500,JSON.stringify(box));
 const entries=Object.entries(r.positions);for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)assert.equal(intersects(entries[i][1],entries[j][1],20),false,`${entries[i][0]} overlaps ${entries[j][0]}`);
 assert.equal(entries.length,map.nodes.size);assert.deepEqual(map,original);assert.deepEqual(riverMap(map).positions,r.positions);for(let i=1;i<r.spine.length;i++)assert.equal(map.nodes.get(r.spine[i]).parent,r.spine[i-1]);
 assert.deepEqual(riverSpine(map),r.spine);assert.equal(cleanWorkspace({riverVersion:1}).riverVersion,1);
});
test('River accommodates variable card sizes and empty or single-node maps',()=>{
 const map=inventory(),saved=Object.fromEntries([...map.nodes.keys()].map((id,i)=>[id,{width:160+i%4*60,height:50+i%3*25}])),r=riverMap(map,saved);
 for(const [id,node]of map.nodes){assert.equal(r.positions[id].width,saved[id].width);assert.equal(r.positions[id].height,saved[id].height);if(node.parent)assert.ok(r.positions[id].x>=r.positions[node.parent].x+saved[node.parent].width+30);}
 const p=Object.values(r.positions);for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++)assert.equal(intersects(p[i],p[j],20),false);
 assert.deepEqual(riverMap({root:'core',nodes:new Map(),children:new Map()}).positions,{});
 assert.deepEqual(riverMap({root:'core',nodes:new Map([['core',{id:'core',type:'root'}]]),children:new Map()}).spine,['core']);
});
