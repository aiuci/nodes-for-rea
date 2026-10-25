import test from 'node:test';
import assert from 'node:assert/strict';
import {packMap} from '../lib/adaptive-layout.mjs';
import {layoutMap} from '../lib/map-layouts.mjs';
import {cleanWorkspace} from '../lib/workspace.mjs';

function tree(){const nodes=new Map([['root',{id:'root'}]]),children=new Map();const add=(id,parent)=>{nodes.set(id,{id,parent});children.set(parent,[...(children.get(parent)||[]),id]);};for(let i=0;i<6;i++){add('feature'+i,'root');if(i<3){add('result'+i,'feature'+i);for(let j=0;j<6;j++)add(`finding${i}-${j}`,'result'+i);add('next'+i,'result'+i);}}return {root:'root',nodes,children};}
const bounds=points=>{const p=Object.values(points);return {width:Math.max(...p.map(n=>n.x+n.width))-Math.min(...p.map(n=>n.x)),height:Math.max(...p.map(n=>n.y+n.height))-Math.min(...p.map(n=>n.y))};};
const fit=(points,w,h)=>{const b=bounds(points);return Math.min(w/b.width,h/b.height);};
test('packing keeps all identities, topology, direction and disjoint subtrees without degrading fresh preset density',()=>{
  const map=tree(),before=structuredClone(map);
  for(const layout of ['horizontal','vertical','compact']){
    const points=packMap(map,layout,{width:1250,height:650}),entries=Object.entries(points);
    assert.deepEqual(new Set(Object.keys(points)),new Set(map.nodes.keys()));
    for(const [id,p]of entries){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));const parent=map.nodes.get(id).parent;if(parent)assert.ok(layout==='vertical'?p.y>points[parent].y:p.x>points[parent].x);}
    for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){const a=entries[i][1],b=entries[j][1];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,entries[i][0]+' overlaps '+entries[j][0]);}
    const old=fit(layoutMap(map,layout),1250,650),next=fit(points,1250,650);assert.ok(next>=old*.95,`${layout}: ${old} -> ${next}`);
  }
  assert.deepEqual(map,before);
});
test('packing responds to viewport proportions and is deterministic; protected layouts stay untouched',()=>{
  const map=tree(),wide=packMap(map,'horizontal',{width:1500,height:500}),tall=packMap(map,'horizontal',{width:700,height:1000});
  assert.notDeepEqual(wide,tall);assert.deepEqual(wide,packMap(map,'horizontal',{width:1500,height:500}));assert.equal(packMap(map,'manual',{}),null);assert.equal(packMap(map,'radial',{}),null);
});
test('empty, disconnected, cyclic and invalid-size inputs stay finite and reachable',()=>{
  assert.deepEqual(packMap({root:'root',nodes:new Map(),children:new Map()},'horizontal',{}),{});
  const map=tree();map.nodes.set('orphan',{id:'orphan'});map.children.set('next0',['root']);const points=packMap(map,'vertical',{width:NaN,height:Infinity});assert.equal(Object.keys(points).length,map.nodes.size);for(const p of Object.values(points))assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
});
test('undo state keeps omitted anchors and camera through normalization without trusting unsafe keys',()=>{
  const prior={layout:'vertical',positions:{visible:{x:12,y:34},hidden:{x:4400,y:-500}},camera:{x:42,y:19,scale:.2}};
  const saved=cleanWorkspace({arrangeUndo:prior,layout:'horizontal'});assert.equal(saved.arrangeUndo.positions.hidden.x,4400);assert.deepEqual(saved.arrangeUndo.camera,prior.camera);assert.deepEqual(cleanWorkspace(saved).arrangeUndo,saved.arrangeUndo);assert.equal(cleanWorkspace({arrangeUndo:{layout:'unknown'}}).arrangeUndo,null);
});
