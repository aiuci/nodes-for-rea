import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraWireFactor,cameraWireCeiling,layoutWireStyle,overviewWireStyle} from '../lib/camera-wire-style.mjs';
test('camera stroke response is continuous, bounded and decreases from overview to detail',()=>{
 let last=cameraWireFactor(.025);
 for(let i=26;i<=2500;i++){const next=cameraWireFactor(i/1000);assert.ok(next<=last);assert.ok(next>=.45&&next<=1);assert.ok(Math.abs(next-last)<.003);last=next;}
 assert.ok(cameraWireFactor(.2)>cameraWireFactor(.5));assert.ok(cameraWireFactor(.5)>cameraWireFactor(1));
 assert.ok(1.9*cameraWireFactor(.2)>1.4&&1.9*cameraWireFactor(.2)<1.7);
 assert.ok(1.9*cameraWireFactor(1)>=.95&&1.9*cameraWireFactor(1)<1.2);
 assert.equal(cameraWireFactor(0),cameraWireFactor(.025));assert.equal(cameraWireFactor(100),cameraWireFactor(2.5));assert.equal(cameraWireFactor(NaN),cameraWireFactor(1));
});
test('distant overview keeps strands visible without overpowering tiny nodes',()=>{
 assert.ok(cameraWireCeiling(.025)>=1.15&&cameraWireCeiling(.025)<1.25);
 assert.ok(cameraWireCeiling(.1)>1.25&&cameraWireCeiling(.1)<1.4);
 assert.ok(cameraWireCeiling(.2)>1.5&&cameraWireCeiling(.2)<1.7);
 for(const base of [1.8,1.9,2.2,2.35,2.4,2.6,2.7]){
  for(const scale of [.5,1,2.5])assert.ok(base*cameraWireFactor(scale)<cameraWireCeiling(scale),'Medium/detail built-in widths must stay unchanged');
 }
 let previous=cameraWireCeiling(.025);
 for(let i=26;i<=2500;i++){const next=cameraWireCeiling(i/1000);assert.ok(next>=previous&&next<3);assert.ok(next-previous<.006);previous=next;}
 assert.equal(cameraWireCeiling(NaN),cameraWireCeiling(1));
 assert.equal(cameraWireCeiling(0),cameraWireCeiling(.025));
 assert.equal(cameraWireCeiling(100),cameraWireCeiling(2.5));
});

test('overview thinning is shared while Orbit keeps its distinct close-up response',()=>{
 for(const scale of [.025,.22,1,2.5]){
  assert.deepEqual(layoutWireStyle('orbit',scale),{factor:cameraWireFactor(scale),ceiling:Math.min(cameraWireCeiling(scale),overviewWireStyle(scale).ceiling)});
  for(const layout of ['horizontal','vertical','compact','radial','spiral','wisp','organic','shattered','exploded','bloom','constellation','river','honeycomb'])assert.deepEqual(layoutWireStyle(layout,scale),overviewWireStyle(scale));
 }
});

test('overview weight transitions continuously to original theme widths at readable zoom',()=>{
 let previous=overviewWireStyle(.025);for(let i=26;i<=1000;i++){const next=overviewWireStyle(i/1000);assert.ok(next.factor>=previous.factor&&next.ceiling>=previous.ceiling);assert.ok(next.factor-previous.factor<.003);previous=next;}
 for(const zoom of [.025,.1,.22]){const s=overviewWireStyle(zoom);assert.ok(s.ceiling<=1.05);for(const base of [1.8,1.9,2.2,2.7])assert.ok(Math.min(base*s.factor,s.ceiling)<base*.6);}
 for(const zoom of [.75,1,2.5])assert.deepEqual(overviewWireStyle(zoom),{factor:1,ceiling:3});
 assert.deepEqual(overviewWireStyle(NaN),{factor:1,ceiling:3});
});
