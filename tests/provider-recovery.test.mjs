import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {runJSON} from '../lib/providers.mjs';
import {runtimeConfig} from '../lib/runtime.mjs';
const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
async function fixture(t,code){const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-provider-429-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:50}));const cli=path.join(root,'cli.mjs'),schemaPath=path.join(root,'schema.json');await fs.writeFile(cli,code);await fs.writeFile(schemaPath,JSON.stringify(schema));return {root,cli,schemaPath};}
test('actual Codex JSONL subprocess retries exact input after 429 and disables layered built-in retries',async t=>{
 const {root,cli,schemaPath}=await fixture(t,`import fs from 'node:fs';import assert from 'node:assert/strict';const args=process.argv.slice(2);assert.ok(!args.some(arg=>arg.startsWith('model_providers.openai.')));assert.ok(args.includes('--ignore-user-config'));assert.ok(args.includes('--ephemeral'));assert.ok(args.includes('--skip-git-repo-check'));assert.ok(args.includes('features.shell_tool=false'));assert.ok(args.includes('features.multi_agent=false'));let input='';for await(const chunk of process.stdin)input+=chunk;const calls=fs.existsSync('calls.json')?JSON.parse(fs.readFileSync('calls.json')):[];calls.push(input);fs.writeFileSync('calls.json',JSON.stringify(calls));if(calls.length===1){console.log(JSON.stringify({type:'turn.failed',error:{message:'HTTP 429: Too Many Requests'}}));process.exitCode=1;}else{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{"ok":true}'}}));console.log(JSON.stringify({type:'turn.completed'}));}`);
 let modelAttempts=0;const events=[];assert.equal((await runJSON({...runtimeConfig({codexPath:cli}),onApplicationModelAttempt:async()=>{modelAttempts++;},onAiRecovery:async e=>events.push(e)},schema,'exact original input',schemaPath,{directory:root})).ok,true);
 assert.equal(events.length,1);assert.equal(modelAttempts,2);assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'calls.json'))),['exact original input','exact original input']);
});
test('provider-managed exhausted retries pause immediately with concise message and no raw backend content',async t=>{
 const {root,cli,schemaPath}=await fixture(t,`console.log(JSON.stringify({type:'turn.failed',error:{message:'exceeded retry limit, last status: 429 Too Many Requests; SECRET_DIAGNOSTICS'}}));process.exitCode=1;`);
 await assert.rejects(runJSON(runtimeConfig({codexPath:cli}),schema,'x',schemaPath,{directory:root}),e=>e.aiFailure?.attempts===1&&e.aiFailure.upstreamRetriesExhausted&&!e.message.includes('SECRET_DIAGNOSTICS'));
});

test('Codex socket permission denial pauses promptly instead of hiding behind the process timeout',async t=>{
 const {root,cli,schemaPath}=await fixture(t,`import fs from 'node:fs';fs.appendFileSync('calls.txt','call\\n');process.stdin.resume();console.log(JSON.stringify({type:'error',message:'Reconnecting... 2/5 (stream disconnected before completion: An attempt was made to access a socket in a way forbidden by its access permissions. (os error 10013))'}));setInterval(()=>{},1000);`);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2000);t.after(()=>clearTimeout(timer));
 await assert.rejects(runJSON(runtimeConfig({codexPath:cli}),schema,'saved original question',schemaPath,{directory:root,signal:controller.signal}),e=>e.aiFailure?.category==='network-blocked'&&e.aiFailure.attempts===1&&/Windows.*network/i.test(e.message));
 assert.equal(await fs.readFile(path.join(root,'calls.txt'),'utf8'),'call\n');
});

test('a transient Codex reconnect followed by a valid answer still succeeds',async t=>{
 const {root,cli,schemaPath}=await fixture(t,`process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'error',message:'Reconnecting... 2/5 (stream disconnected before completion: connection reset)'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{"ok":true}'}}));console.log(JSON.stringify({type:'turn.completed'}));});`);
 assert.equal((await runJSON(runtimeConfig({codexPath:cli}),schema,'x',schemaPath,{directory:root})).ok,true);
});
test('Claude structured spend-limit error is quota, not a transient retry',async t=>{
 const {root,cli,schemaPath}=await fixture(t,`process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({is_error:true,result:'HTTP 429',error:{type:'rate_limit_error',details:{error_code:'enforced_spend_limit_reached'}}})));`);
 await assert.rejects(runJSON(runtimeConfig({provider:'claude',claudePath:cli}),schema,'x',schemaPath,{directory:root}),e=>e.aiFailure?.category==='quota'&&e.aiFailure.attempts===1);
});
test('gateway Retry-After is retained and full-agent POST is never automatically replayed',async t=>{
 let calls=0;const server=http.createServer((req,res)=>{calls++;req.resume();res.writeHead(429,{'Retry-After':'120','Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Too many requests',type:'rate_limit_error'}}));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 await assert.rejects(runJSON({provider:'openclaw',gatewayUrl:`http://127.0.0.1:${server.address().port}`},schema,'x','',{directory:os.tmpdir()}),e=>e.aiFailure?.safeToRetry===false&&e.aiFailure.category==='rate-limit'&&Date.parse(e.aiFailure.retryAt)>Date.now()+110000);assert.equal(calls,1);
});
