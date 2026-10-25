import test from 'node:test';
import assert from 'node:assert/strict';
import {compactCanvasMenuLayout} from '../lib/radial-layout.mjs';
test('connected canvas actions stay local, ordered and bounded at every edge',()=>{
 const viewport={width:1400,height:900},bounds={x:20,y:120,width:1360,height:650};
 for(const anchor of [{x:21,y:121},{x:1379,y:121},{x:21,y:769},{x:1379,y:769},{x:700,y:400}]){
  const original=structuredClone({anchor,bounds}),g=compactCanvasMenuLayout(6,anchor,viewport,{bounds});
  assert.ok(g.x>=bounds.x&&g.y>=bounds.y);assert.ok(g.x+g.width<=bounds.x+bounds.width&&g.y+g.height<=bounds.y+bounds.height);assert.equal(g.slots.length,6);assert.ok(g.width<=262);
  for(let i=1;i<6;i++)assert.ok(g.slots[i].y>=g.slots[i-1].y+g.slots[i-1].height);
  const connectionX=g.direction===1?g.x+g.slots[0].x:g.x+g.slots[0].x+g.slots[0].width;assert.ok(Math.abs(connectionX-anchor.x)<=284,'Connections remain local rather than crossing the canvas');assert.deepEqual({anchor,bounds},original);
 }
});
test('collapsed/narrow canvas falls back to visible viewport instead of clipping tools',()=>{
 const g=compactCanvasMenuLayout(6,{x:380,y:510},{width:390,height:844},{bounds:{x:10,y:500,width:370,height:0}});
 assert.ok(g.x>=8&&g.y>=8&&g.x+g.width<=382&&g.y+g.height<=836);assert.equal(g.scroll,false);
});
test('short screens retain all actions and expanded help in scrollable content',()=>{
 const heights=[112,44,44,44,44,44],g=compactCanvasMenuLayout(6,{x:400,y:200},{width:900,height:420},{bounds:{x:10,y:100,width:880,height:200},itemHeights:heights});
 assert.equal(g.scroll,true);assert.ok(g.contentHeight>g.height);assert.equal(g.slots[0].height,112);assert.equal(g.slots.at(-1).height,44);assert.ok(g.y+g.height<=300);
});
