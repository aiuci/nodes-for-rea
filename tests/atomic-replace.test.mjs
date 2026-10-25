import test from 'node:test';
import assert from 'node:assert/strict';
import {atomicReplace} from '../lib/atomic-replace.mjs';
test('temporary Windows sharing failures retry the same atomic rename',async()=>{
  let calls=0;const waits=[];
  await atomicReplace('pending','committed',{rename:async(a,b)=>{assert.equal(a,'pending');assert.equal(b,'committed');if(++calls<3)throw Object.assign(Error('busy'),{code:'EPERM'});},wait:async ms=>waits.push(ms)});
  assert.equal(calls,3);assert.deepEqual(waits,[25,50]);
});
test('persistent failures stop after bounded retries; other errors fail immediately',async()=>{
  for(const code of ['EPERM','ENOENT']){let calls=0;const error=Object.assign(Error(code),{code});await assert.rejects(atomicReplace('pending','committed',{rename:async()=>{calls++;throw error;},wait:async()=>{}}),e=>e===error);assert.equal(calls,code==='EPERM'?5:1);}
});
