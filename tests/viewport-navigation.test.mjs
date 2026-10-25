import test from 'node:test';
import assert from 'node:assert/strict';
import {boundsCamera,zoomCamera} from '../lib/viewport-navigation.mjs';
test('fit uses unobstructed viewport offsets and includes all bounds without moving nodes',()=>{
 const b={minX:-200,minY:80,maxX:1000,maxY:500},area={x:140,y:30,width:600,height:400},before=structuredClone(b),c=boundsCamera(b,area);
 assert.ok(c.x+b.minX*c.scale>=area.x+23);assert.ok(c.x+b.maxX*c.scale<=area.x+area.width-23);assert.equal(c.y+(b.minY+b.maxY)/2*c.scale,area.y+area.height/2);assert.deepEqual(b,before);
 assert.equal(boundsCamera({minX:NaN},area),null);
});
test('zoom keeps the world point under its anchor, bounds levels and rejects invalid input',()=>{
 const c={x:-100,y:50,scale:.5},a={x:300,y:150},z=zoomCamera(c,1,a);
 assert.equal((a.x-c.x)/c.scale,(a.x-z.x)/z.scale);assert.equal((a.y-c.y)/c.scale,(a.y-z.y)/z.scale);
 assert.equal(zoomCamera(c,20,a).scale,2.5);assert.equal(zoomCamera(c,.001,a).scale,.025);assert.equal(zoomCamera(c,NaN,a),null);
});
