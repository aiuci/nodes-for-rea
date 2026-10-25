import test from 'node:test';
import assert from 'node:assert/strict';
import {growthRoute,segmentHits} from '../lib/result-growth.mjs';
import {wireHitsNode,connectionPorts} from '../lib/map-routing.mjs';
const box=(x,y,width=220,height=66)=>({x,y,width,height});
const clear=(r,obstacles)=>{assert.equal(r.hits,0);for(const b of obstacles)for(let i=1;i<r.points.length;i++)assert.equal(segmentHits(r.points[i-1],r.points[i],b,6),false);};
test('a nearby open corridor wins over remote extremes in the same obstacle band',()=>{
  const a=box(0,200),b=box(700,300),wall=box(350,180,100,160),far=[box(300,-10000),box(400,10000)];
  for(const circuit of [false,true]){const r=growthRoute(a,b,[wall,...far],{circuit});clear(r,[wall,...far]);assert.ok(r.length<1000);assert.ok(r.points.every(p=>p.y>100&&p.y<440));}
});
test('vertical local routes retain bottom-to-top attachments and clear an intervening rectangle',()=>{
  const a=box(0,0),b=box(300,420),obstacles=[box(80,160)];
  const r=growthRoute(a,b,obstacles,{vertical:true});clear(r,obstacles);assert.deepEqual(r.start,{x:110,y:66});assert.deepEqual(r.end,{x:410,y:420});assert.ok(r.length<1000);
});
test('a multi-bend corridor routes between interleaved obstacles without enclosing the whole map',()=>{
  const a=box(0,0,80,60),b=box(700,0,80,60),obstacles=[box(180,-400,90,460),box(380,0,90,460),box(580,-400,70,460)];
  const r=growthRoute(a,b,obstacles);clear(r,obstacles);assert.ok(r.points.some(p=>p.y>60)&&r.points.some(p=>p.y<0));assert.ok(r.length<1700);
});
test('changed node or obstacle geometry yields fresh routes and all directions terminate',()=>{
  const a=box(0,0),b=box(700,100),old=growthRoute(a,b,[box(350,0)]),moved=growthRoute(a,box(800,450),[box(350,0)]);assert.notEqual(old.d,moved.d);
  for(const [x,y,vertical]of [[-800,0,false],[800,0,false],[0,-800,true],[0,800,true]])clear(growthRoute(a,box(x,y),[],{vertical}),[]);
});
test('long smooth links detect small cards between the old fixed sample steps',()=>{
  assert.equal(wireHitsNode({x:0,y:0},{x:20000,y:0},[box(1110,-20,30,40)]),true);
});
test('layout ports honor Vertical flow, reversed manual placement, Compact locality and comparison direction',()=>{
  const a=box(0,0),below=box(20,400),above=box(20,-400),right=box(500,30);
  assert.deepEqual(connectionPorts(a,below,{layout:'vertical'}),{vertical:true,start:{x:110,y:66},end:{x:130,y:400}});
  assert.deepEqual(connectionPorts(a,below,{layout:'tree'}),{vertical:true,start:{x:110,y:66},end:{x:130,y:400}});
  assert.deepEqual(connectionPorts(a,above,{layout:'vertical'}),{vertical:true,start:{x:110,y:0},end:{x:130,y:-334}});
  assert.equal(connectionPorts(a,below,{layout:'compact'}).vertical,true);
  assert.equal(connectionPorts(a,right,{layout:'compact'}).vertical,false);
  assert.equal(connectionPorts(a,below,{layout:'horizontal',comparison:true}).vertical,true);
});
