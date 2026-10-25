import test from 'node:test';
import assert from 'node:assert/strict';
import {fitContentRectangles} from '../lib/node-content-layout.mjs';

test('measured long titles get complete bounds and movable neighbours separate deterministically',()=>{
  const positions={core:{x:0,y:0,width:220,height:66},a:{x:300,y:0,width:220,height:66},b:{x:300,y:100,width:220,height:66},hidden:{x:44,y:99,width:220,height:66}};
  const sizes={core:{width:220,height:66},a:{width:220,height:240},b:{width:220,height:90}};
  const r=fitContentRectangles(positions,sizes,{locked:['core']});assert.equal(r.positions.a.height,240);assert.equal(r.positions.b.y,272);assert.deepEqual(r.positions.hidden,positions.hidden);assert.deepEqual(positions.a,{x:300,y:0,width:220,height:66});assert.deepEqual(fitContentRectangles(r.positions,sizes,{locked:['core']}).positions,r.positions);
});
test('manual and explicitly kept anchors retain XY, grow bounds and report unresolved overlaps',()=>{
  const positions={a:{x:0,y:0,width:220,height:66},b:{x:0,y:100,width:220,height:66}},sizes={a:{width:220,height:200},b:{width:220,height:66}};
  for(const options of [{manual:true},{locked:['a','b']}]){const r=fitContentRectangles(positions,sizes,options);assert.equal(r.positions.a.y,0);assert.equal(r.positions.b.y,100);assert.equal(r.positions.a.height,200);assert.deepEqual(r.constrained,['b']);}
});

test('tight but non-overlapping deliberate anchors do not get a false overlap warning',()=>{
  const positions={a:{x:0,y:0,width:220,height:66},b:{x:0,y:70,width:220,height:66}},sizes={a:{width:220,height:66},b:{width:220,height:66}};
  assert.deepEqual(fitContentRectangles(positions,sizes,{manual:true}).constrained,[]);
});
