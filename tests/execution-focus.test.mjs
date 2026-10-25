import test from 'node:test';
import assert from 'node:assert/strict';
import {executionFocusCamera} from '../lib/execution-focus.mjs';

test('execution focus centers a distant node at twice normal size within the available map area',()=>{
  const node={x:-1800,y:2400,width:220,height:66},area={x:24,y:30,width:800,height:500};
  const target=executionFocusCamera(node,area,.2);
  assert.equal(target.scale,2);
  assert.equal(target.x+(node.x+node.width/2)*target.scale,area.x+area.width/2);
  assert.equal(target.y+(node.y+node.height/2)*target.scale,area.y+area.height/2);
});
test('execution focus reserves room for the activity controls in a constrained viewport',()=>{
  const node={x:50,y:400,width:220,height:66},area={x:0,y:0,width:320,height:250},target=executionFocusCamera(node,area);
  const left=target.x+node.x*target.scale,top=target.y+node.y*target.scale;
  assert.ok(target.scale>=1&&target.scale<2);
  assert.ok(left>=24&&left+(node.width+22)*target.scale<=area.width-24);
  assert.ok(top>=28&&top+(node.height+16)*target.scale<=area.height-28);
});
test('execution focus retains a closer camera while respecting existing zoom limits',()=>{
  const node={x:0,y:0,width:220,height:66},area={x:0,y:0,width:1800,height:1200};
  assert.equal(executionFocusCamera(node,area,2.3).scale,2.3);
  assert.equal(executionFocusCamera(node,area,4).scale,2.5);
});
test('a reader leaving insufficient map space does not cause an unreadable automatic zoom',()=>{
  const node={x:0,y:0,width:220,height:66};
  assert.equal(executionFocusCamera(node,{x:0,y:0,width:100,height:80}),null);
  assert.equal(executionFocusCamera(null,{x:0,y:0,width:800,height:600}),null);
});
