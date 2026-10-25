import test from 'node:test';
import assert from 'node:assert/strict';
import {providerSummaries} from '../ui/rea-providers.mjs';

test('provider display uses named nested availability status and reason',()=>{
  assert.deepEqual(providerSummaries([{name:'Ghidra',availability:{status:'available',reason:'Headless runtime ready.'}},{name:'Hopper',availability:{status:'unavailable',reason:'Not installed.'}}]),['Ghidra: available · Headless runtime ready.','Hopper: unavailable · Not installed.']);
});

test('provider display retains supported legacy shapes and skips tool inventories',()=>{
  assert.deepEqual(providerSummaries({browser:true,native:false,java:{id:'Java',available:true},tools:['inspect'],missing:null}),['browser: Available','native: Unavailable','Java: Available']);
  assert.deepEqual(providerSummaries(null),[]);
});
