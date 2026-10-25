import test from 'node:test';
import assert from 'node:assert/strict';
import {isPointerNodeShortcut,nearestVisibleNode} from '../ui/pointer-node-focus.js';
const canvas={left:100,top:50,right:1100,bottom:650},rect=(left,top,right,bottom)=>({left,top,right,bottom});
test('Z is unmodified and uses the same typing/dialog/composition guards; F and Ctrl+Shift+F do not collide',()=>{
  const event={key:'z',target:{}};assert.equal(isPointerNodeShortcut(event),true);
  for(const extra of [{key:'f'},{key:'F',ctrlKey:true,shiftKey:true},{ctrlKey:true},{shiftKey:true},{altKey:true},{metaKey:true},{isComposing:true},{keyCode:229},{defaultPrevented:true},{getModifierState:()=>true},{target:{isContentEditable:true}},{target:{closest:()=>({})}}])assert.equal(isPointerNodeShortcut({...event,...extra}),false);
});
test('nearest choice uses transformed viewport geometry under pan and zoom, not world coordinates or selection',()=>{
  const camera={x:250,y:-80,scale:2},screen=(x,y,w,h)=>rect(canvas.left+camera.x+x*camera.scale,canvas.top+camera.y+y*camera.scale,canvas.left+camera.x+(x+w)*camera.scale,canvas.top+camera.y+(y+h)*camera.scale);
  const nodes=[{id:'a',rect:screen(100,60,100,40)},{id:'b',rect:screen(300,60,100,40)}];assert.equal(nearestVisibleNode({x:580,y:130},nodes,canvas),'a');assert.equal(nearestVisibleNode({x:1000,y:130},nodes,canvas),'b');
});
test('only visible intersecting nodes qualify; a pointer inside a large node wins over a nearby center',()=>{
  const nodes=[{id:'wide',rect:rect(200,100,700,200)},{id:'small',rect:rect(710,110,740,150)},{id:'hidden',visible:false,rect:rect(650,110,720,160)},{id:'offscreen',rect:rect(1200,0,1300,50)}];assert.equal(nearestVisibleNode({x:690,y:130},nodes,canvas),'wide');assert.equal(nearestVisibleNode({x:735,y:180},nodes,canvas),'small');
});
test('outside, unknown or nonfinite pointer and no visible nodes are safe no-ops',()=>{
  const nodes=[{id:'a',rect:rect(200,100,300,200)}];for(const point of [null,{x:99,y:100},{x:1100,y:100},{x:200,y:651},{x:NaN,y:100}])assert.equal(nearestVisibleNode(point,nodes,canvas),null);assert.equal(nearestVisibleNode({x:200,y:100},[],canvas),null);assert.equal(nearestVisibleNode({x:200,y:100},[{id:'x',rect:rect(0,0,40,40)}],canvas),null);
});
