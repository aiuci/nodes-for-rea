import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {providerPlan} from '../lib/agent-guide.mjs';

const step=(nodeId='feature:download')=>({nodeId,action:'investigate',question:'How does downloading work?',why:'Understand the saved download mechanism.',evidenceIds:['source']});
const state={title:'Downloader',messages:[{role:'assistant',features:[{name:'Download',claimIndexes:[0]},{name:'Convert',claimIndexes:[0]}],claims:[{evidenceId:'source',text:'Download and convert'}]}],evidence:[{id:'source',text:'Download and convert'}]};
async function fixture(t,answers){const root=await fs.mkdtemp(path.join(os.tmpdir(),'route-repair-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const cli=path.join(root,'fake-agent.mjs');await fs.writeFile(cli,`import fs from 'node:fs';let input='';for await(const chunk of process.stdin)input+=chunk;const calls=fs.existsSync('calls.json')?JSON.parse(fs.readFileSync('calls.json')):[];calls.push({input,schema:JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--output-schema')+1]))});fs.writeFileSync('calls.json',JSON.stringify(calls));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(${JSON.stringify(answers)}[Math.min(calls.length-1,${answers.length-1})])}}));console.log(JSON.stringify({type:'turn.completed'}));`);return {root,config:{codex:cli,node:process.execPath,provider:'codex'},calls:async()=>JSON.parse(await fs.readFile(path.join(root,'calls.json'),'utf8'))};}
test('provider corrects repeated saved node once, before route approval or execution',async t=>{
 const h=await fixture(t,[{steps:[step(),{...step(),action:'reveal'}]},{steps:[step(),step('feature:convert')]}]);
 const route=await providerPlan(h.config,state,'Build my downloader',{},h.root);
 assert.deepEqual(route.map(s=>s.nodeId),['feature:download','feature:convert']);assert.ok(route.every(s=>s.status==='pending'));
 const calls=await h.calls();assert.equal(calls.length,2);assert.match(calls[1].input,/each node.*once/i);assert.match(calls[1].input,/Build my downloader/);
 assert.deepEqual(calls[0].schema.properties.steps.items.properties.nodeId.enum,['feature:download','feature:convert']);
});
test('invented node is corrected with the same saved inventory, never accepted by guessing',async t=>{
 const h=await fixture(t,[{steps:[step('feature:imaginary')]},{steps:[step()]}]);assert.equal((await providerPlan(h.config,state,'Build my downloader',{},h.root))[0].nodeId,'feature:download');assert.equal((await h.calls()).length,2);
});
test('two invalid proposals stop with actionable route feedback and no unbounded retry',async t=>{
 const h=await fixture(t,[{steps:[step(),step()]}]);await assert.rejects(providerPlan(h.config,state,'Build my downloader',{},h.root),e=>e.code==='ROUTE_PLAN_INVALID'&&/goal.*kept/i.test(e.message));assert.equal((await h.calls()).length,2);
});
test('unsupported evidence is rejected without a reference repair or extra provider call',async t=>{
 const h=await fixture(t,[{steps:[{...step(),evidenceIds:['invented']}]}]);await assert.rejects(providerPlan(h.config,state,'Build my downloader',{},h.root),/outside/);assert.equal((await h.calls()).length,1);
});
