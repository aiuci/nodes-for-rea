import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyAiFailure,retryAfterMs,withAiRecovery,waitForRetry} from '../lib/ai-recovery.mjs';
test('429 alone does not prove quota; explicit quota codes override generic rate-limit type',()=>{
 assert.equal(classifyAiFailure(Error('exceeded retry limit, last status: 429 Too Many Requests')).category,'rate-limit');
 assert.equal(classifyAiFailure({status:429,error:{type:'rate_limit_error',details:{error_code:'enforced_spend_limit_reached'}}}).category,'quota');
 assert.equal(classifyAiFailure({error:{code:'insufficient_quota'}}).category,'quota');assert.equal(classifyAiFailure(Error('Target file missing')),null);
});

test('a forbidden network socket is distinct from a timeout or a file access error',()=>{
 assert.equal(classifyAiFailure({message:'Inspection timed out',providerError:{message:'socket denied (os error 10013)'}}).category,'network-blocked');
 assert.equal(classifyAiFailure(Error('connect EACCES 140.82.113.3:443')).category,'network-blocked');
 assert.equal(classifyAiFailure(Error('EACCES: permission denied, open evidence.txt')),null);
});
test('Retry-After supports seconds and HTTP dates, rejecting negatives and malformed values',()=>{
 assert.equal(retryAfterMs('12',1000),12000);assert.equal(retryAfterMs(new Date(12000).toUTCString(),1000),11000);assert.equal(retryAfterMs('-3'),null);assert.equal(retryAfterMs('nonsense'),null);assert.doesNotThrow(()=>classifyAiFailure({status:429,headers:{'Retry-After':'1e308'}}));
});
test('bounded same-request retry honors server minimum and resumes without repeating successful calls',async()=>{
 let calls=0,clock=1000;const waits=[],events=[];
 const result=await withAiRecovery(async()=>{if(++calls<3)throw {status:429,headers:{'retry-after':'5'}};return 'saved answer';},{safeToRetry:true,now:()=>clock,random:()=>0,wait:async ms=>{waits.push(ms);clock+=ms;},onRetry:async e=>events.push(e)});
 assert.equal(result,'saved answer');assert.equal(calls,3);assert.deepEqual(waits,[5000,5000]);assert.equal(events.length,2);
});
test('quota, unsafe gateway, excessive server delay and exhausted retries pause without blind replay',async()=>{
 for(const [error,options,expected]of [[{status:429,error:{code:'insufficient_quota'}},{safeToRetry:true},1],[{status:429},{safeToRetry:false},1],[{status:429,headers:{'retry-after':'500'}},{safeToRetry:true},1],[{status:429},{safeToRetry:true},3]]){
  let calls=0;await assert.rejects(()=>withAiRecovery(async()=>{calls++;throw error;},{random:()=>0,wait:async()=>{},...options}),e=>!!e.aiFailure&&e.message.includes('Investigation paused'));assert.equal(calls,expected);
 }
});
test('Stop cancels backoff before another request can run',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(()=>withAiRecovery(async()=>{calls++;throw {status:429};},{safeToRetry:true,signal:controller.signal,onRetry:async()=>controller.abort(),wait:waitForRetry}),/stopped|abort/i);assert.equal(calls,1);
});
