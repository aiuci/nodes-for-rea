import test from 'node:test';
import assert from 'node:assert/strict';
import {radialLayout} from '../lib/radial-layout.mjs';
test('Toolbar flywheel spreads secondary actions into separate bounded nodes at screen edges',()=>{
 for(const width of [346,556,1456])for(const count of [8,9,10])for(const x of [22,width-22])for(const y of [130,760]){
  const result=radialLayout(count,{x,y},{width:width+44,height:1000},{fan:true,bounds:{x:22,y:123,width,height:700}}),slots=result.slots.map(p=>({...p,x:p.x+result.x,y:p.y+result.y}));
  assert.ok(new Set(slots.map(p=>p.x)).size>1);
  for(const [i,a]of slots.entries()){assert.ok(a.x>=22&&a.x+a.width<=width+22&&a.y>=123&&a.y+a.height<=823);for(const b of slots.slice(i+1))assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);}
 }
});
