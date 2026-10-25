import test from 'node:test';
import assert from 'node:assert/strict';
import {ADDITIONAL_LAYOUTS} from '../lib/additional-layouts.mjs';
import {tidyMap} from '../lib/tidy-map.mjs';
import {layoutMap,switchLayout} from '../lib/map-layouts.mjs';
import {cleanWorkspace,LAYOUTS} from '../lib/workspace.mjs';
import {intersects} from '../lib/result-growth.mjs';
import {wireHitsNode} from '../lib/map-routing.mjs';

const box=(x,y)=>({x,y,width:220,height:66});
function fixture(){const entries=[['core',null],['a','core'],['b','core'],['c','a'],['d','a'],['result','b'],['finding','result'],['direction','result']];const nodes=new Map(entries.map(([id,parent])=>[id,{id,parent,type:id==='result'?'result':'feature',...(id==='result'||id==='finding'||id==='direction'?{message:{id:'turn'}}:{})}])),children=new Map();for(const [id,parent]of entries)if(parent)children.set(parent,[...(children.get(parent)||[]),id]);return {root:'core',nodes,children,edges:entries.filter(([,p])=>p).map(([to,from])=>({from,to}))};}
function collisionFree(positions,ids=Object.keys(positions)){for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)assert.equal(intersects(positions[ids[i]],positions[ids[j]],20),false,`${ids[i]} overlaps ${ids[j]}`);}
for(const layout of LAYOUTS.filter(layout=>!['radial','spiral','shattered','exploded',...ADDITIONAL_LAYOUTS].includes(layout)))test(`${layout}: repair overlaps, keep anchors, deterministic repeat and preserve the graph`,()=>{
  const map=fixture(),before=structuredClone(map),saved=Object.fromEntries([...map.nodes.keys()].map(id=>[id,box(0,0)]));saved.a=box(500,240);
  const result=tidyMap(map,layout,saved,{locked:['a']});assert.ok(result.moved.length);assert.deepEqual(result.positions.core,saved.core);assert.deepEqual(result.positions.a,saved.a);collisionFree(result.positions);assert.deepEqual(map,before);assert.deepEqual(saved.b,box(0,0));
  const again=tidyMap(map,layout,result.positions,{locked:['a']});assert.deepEqual(again.positions,result.positions);assert.deepEqual(again.moved,[]);
  if(layout==='horizontal'||layout==='compact')for(const n of map.nodes.values())if(n.parent&&n.id!=='a')assert.ok(result.positions[n.id].x>=result.positions[n.parent].x+220);
  if(layout==='vertical')for(const n of map.nodes.values())if(n.parent&&n.id!=='a')assert.ok(result.positions[n.id].y>=result.positions[n.parent].y+66);
});
for(const layout of LAYOUTS.filter(layout=>!['radial','spiral','wisp','organic','shattered','exploded','bloom',...ADDITIONAL_LAYOUTS].includes(layout)))test(`${layout}: investigation pocket travels together and retains its internal arrangement`,()=>{
  const map=fixture(),saved=layoutMap(map,layout);Object.assign(saved,{core:box(-600,-500),a:box(-600,-200),b:box(200,200),c:box(-300,-200),d:box(-300,0),result:box(200,200),finding:box(520,100),direction:box(520,300)});
  const result=tidyMap(map,layout,saved,{growthRoots:['result'],locked:['a','b','c','d']});assert.ok(result.moved.includes('result'));collisionFree(result.positions);
  for(const id of ['finding','direction']){assert.equal(result.positions[id].x-result.positions.result.x,saved[id].x-saved.result.x);assert.equal(result.positions[id].y-result.positions.result.y,saved[id].y-saved.result.y);}
});
test('manual moves only overlapping unkept nodes; distant deliberate-looking positions remain unchanged',()=>{
  const map=fixture(),saved=layoutMap(map,'manual');saved.d=box(8000,-3000);const result=tidyMap(map,'manual',saved);assert.deepEqual(result.positions,saved);assert.deepEqual(result.moved,[]);
});
test('collapsed and omitted anchors remain exact, and incompatible kept positions are reported',()=>{
  const map=fixture(),saved=layoutMap(map);saved.a=box(0,0);saved.b=box(0,0);saved.omitted=box(4000,4000);map.nodes.delete('d');const result=tidyMap(map,'horizontal',saved,{locked:['a','b'],collapsed:['c']});
  for(const id of ['a','b','c','d','omitted'])assert.deepEqual(result.positions[id],saved[id]);assert.ok(result.constrained.length);assert.ok(result.moved.length);
});
test('an unlocked overlapping child is repaired within a kept investigation pocket',()=>{
  const map=fixture(),saved=layoutMap(map);saved.finding={...saved.result};const result=tidyMap(map,'compact',saved,{growthRoots:['result'],locked:['result']});assert.deepEqual(result.positions.result,saved.result);assert.notDeepEqual(result.positions.finding,saved.finding);assert.equal(intersects(result.positions.finding,result.positions.result,20),false);
});

test('repairing kept pockets does not introduce overlaps with another pocket’s kept nodes',()=>{
  const map=fixture();map.nodes.set('other',{id:'other',parent:'core',type:'result',message:{id:'other-turn'}});map.nodes.set('kept',{id:'kept',parent:'other',type:'finding',message:{id:'other-turn'}});map.children.set('other',['kept']);map.children.get('core').push('other');
  const saved={core:box(-600,-600),a:box(-600,-300),b:box(-600,0),c:box(-300,-300),d:box(-300,0),result:box(0,0),finding:box(0,0),direction:box(0,0),other:box(0,300),kept:box(252,0)};
  const result=tidyMap(map,'manual',saved,{locked:['result','other','kept']});
  for(const id of ['result','other','kept'])assert.deepEqual(result.positions[id],saved[id]);
  collisionFree(result.positions);
});
test('per-layout deliberate placement survives sanitizing, layout switches and undo state',()=>{
  const map=fixture(),saved=layoutMap(map),ws=cleanWorkspace({placedNodes:{horizontal:['a','a',null],manual:['b'],unknown:['core']},mapPositions:saved,arrangeUndo:{layout:'horizontal',positions:saved,camera:{x:3,y:4,scale:.6}}});
  assert.deepEqual(ws.placedNodes.horizontal,['a']);assert.equal(ws.placedNodes.unknown,undefined);const next=switchLayout(switchLayout(ws,map,'manual'),map,'horizontal');assert.deepEqual(next.placedNodes,ws.placedNodes);assert.deepEqual(next.arrangeUndo,ws.arrangeUndo);
});
test('empty maps and malformed relationship cycles terminate without deleting saved anchors',()=>{
  const empty={root:'core',nodes:new Map(),children:new Map()};assert.deepEqual(tidyMap(empty,'manual',{omitted:box(2,3)}).positions,{omitted:box(2,3)});const map=fixture();map.nodes.get('a').parent='c';map.children.get('c')?.push('a');assert.doesNotThrow(()=>tidyMap(map,'manual',layoutMap(map)));
});
test('wire obstruction detection handles smooth and circuit routes in both directions',()=>{
  for(const vertical of [false,true])for(const circuit of [false,true]){const start={x:0,y:0},end=vertical?{x:0,y:700}:{x:700,y:0},obstacle=vertical?box(-110,300):box(300,-33);assert.equal(wireHitsNode(start,end,[obstacle],{vertical,circuit}),true);assert.equal(wireHitsNode(start,end,[box(1200,1200)],{vertical,circuit}),false);}
});
test('compact closes large unused forward space without moving kept nodes',()=>{
  const map=fixture(),saved=layoutMap(map,'compact');saved.a=box(10000,10000);const result=tidyMap(map,'compact',saved);assert.ok(result.positions.a.x<saved.a.x);assert.ok(result.positions.a.y<saved.a.y);assert.deepEqual(tidyMap(map,'compact',saved,{locked:['a']}).positions.a,saved.a);
});
test('older results stay grouped even when their saves predate result-growth metadata',()=>{
  const map=fixture(),saved=layoutMap(map,'horizontal');saved.b={...saved.result};assert.deepEqual(tidyMap(map,'horizontal',saved),tidyMap(map,'horizontal',saved,{growthRoots:['result']}));
});
