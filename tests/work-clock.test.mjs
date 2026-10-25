import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkClock} from '../ui/work-clock.js';
test('shared investigation/planning clock starts immediately, rejects duplicate timers, freezes and resets',()=>{
  let time=1000,tick,scheduled=0,cleared=0;const element={textContent:''};
  const clock=createWorkClock(element,{now:()=>time,schedule:fn=>{tick=fn;return scheduled++;},unschedule:()=>cleared++});
  clock.start();assert.equal(element.textContent,'0s');assert.equal(clock.running,true);clock.start();assert.equal(scheduled,1);
  time=3300;tick();assert.equal(element.textContent,'2s');clock.stop();assert.equal(clock.running,false);assert.equal(cleared,1);clock.stop();assert.equal(cleared,1);
  time=9000;assert.equal(element.textContent,'2s');clock.start();assert.equal(element.textContent,'0s');assert.equal(scheduled,2);clock.clear();assert.equal(clock.running,false);assert.equal(element.textContent,'');assert.equal(clock.startedAt,null);
});
