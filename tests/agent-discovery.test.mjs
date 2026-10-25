import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {AgentDiscovery,loginInstructions} from '../lib/agent-discovery.mjs';
import {ConnectionStore} from '../lib/connection.mjs';
import {runtimeConfig,runProcess} from '../lib/runtime.mjs';

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-agent-discovery-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const home=path.join(root,'home'),bundle=path.join(root,'portable'),env={PATH:'',APPDATA:path.join(home,'AppData/Roaming'),LOCALAPPDATA:path.join(home,'AppData/Local')};
  const calls=[],states=new Map();let clock=1000;
  const runner=async(command,args,options)=>{
    calls.push({command,args,options});assert.ok(options.timeout<=240000);assert.ok(options.maxOutput<=16384);
    const file=/\.[cm]?js$/i.test(args[0]||'')?args[0]:command,rest=file===command?args:args.slice(1),state=states.get(file)||{};
    if(options.signal?.aborted)throw new Error('canceled');
    assert.ok(rest.join(' ')==='--version'||rest.join(' ')==='login status'||rest.join(' ')==='auth status'||rest.join(' ')==='login'||rest.join(' ')==='login --device-auth'||rest.join(' ')==='auth login','Only local status/version or explicit login commands are allowed');
    if(state.fail)throw new Error('private-secret@example.com should never reach UI');
    if(rest[0]==='--version')return {stdout:state.version??'0.120.0',stderr:'',exitCode:0};
    if(rest.join(' ')==='login'||rest.join(' ')==='login --device-auth'||rest.join(' ')==='auth login'){if(state.loginFail)throw new Error('secret login details');for(const chunk of state.loginChunks||[])options.onOutput?.(chunk);state.auth='signed-in';return {stdout:'sensitive details',stderr:'',exitCode:0};}
    if(state.statusFail)throw new Error('sensitive status error');
    if(state.auth==='unsupported')return {stdout:'Usage: unsupported command secret@example.com',stderr:'',exitCode:0};
    if(state.auth==='malformed')return {stdout:'secret@example.com invalid JSON',stderr:'',exitCode:0};
    const signedIn=state.auth!=='signed-out',claude=rest[0]==='auth';
    return {stdout:claude?JSON.stringify({loggedIn:signedIn,authMethod:signedIn?'claude.ai':'none',email:'private@example.com'}):signedIn?'Logged in using ChatGPT secret@example.com':'Not logged in',stderr:'',exitCode:signedIn?0:1};
  };
  const options={home,portableRoot:bundle,env,platform:'win32',runner,now:()=>clock};
  const discovery=new AgentDiscovery(options),store=new ConnectionStore(path.join(root,'settings'),{}, {discovery});
  const file=async(relative,state={})=>{const target=path.isAbsolute(relative)?relative:path.join(home,relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,'fixture');states.set(target,state);return target;};
  return {root,home,bundle,env,calls,states,file,discovery,store,options,tick:()=>clock+=300001};
}

test('discovers known installations, sanitizes status, prefers signed-in installed agent and returns stable IDs',async t=>{
  const f=await fixture(t),claude=await f.file('.local/bin/claude.exe'),codex=await f.file(path.join(f.bundle,'engines/codex/bin/codex.exe'),{auth:'signed-out'});
  const result=await f.store.discover();assert.equal(result.agents.length,2);assert.equal(result.agents.find(x=>x.path===claude).authentication,'signed-in');assert.equal(result.agents.find(x=>x.path===codex).authentication,'signed-out');
  assert.equal(result.defaultId,result.agents.find(x=>x.path===claude).id);assert.equal(result.selectedId,null);assert.ok(!JSON.stringify(result).includes('private@'));assert.ok(!JSON.stringify(result).includes('secret@'));
  assert.deepEqual((await f.store.discover()).agents.map(x=>x.id),result.agents.map(x=>x.id));
  assert.ok(f.calls.every(call=>call.options.timeout<=4000));
});

test('saved explicit choice is preserved even when signed out or missing; discovery never writes settings',async t=>{
  const f=await fixture(t),chosen=await f.file('custom/codex.exe',{auth:'signed-out'});await f.file('.local/bin/claude.exe');
  await f.store.persist({version:1,provider:'codex',codexPath:chosen,configured:true,model:'previous-model'});const before=await fs.readFile(f.store.file,'utf8');
  let result=await f.store.discover();assert.equal(result.agents.find(x=>x.id===result.defaultId).path,chosen);assert.equal(result.defaultId,result.selectedId);assert.equal(await fs.readFile(f.store.file,'utf8'),before);
  await fs.unlink(chosen);result=await f.store.discover();assert.equal(result.agents.find(x=>x.id===result.selectedId).installation,'unavailable');
  await assert.rejects(f.store.connectDetected({candidateId:result.selectedId}),/changed|missing/);assert.equal(await fs.readFile(f.store.file,'utf8'),before);
});

test('known npm shell wrappers resolve to JavaScript targets and PATH skips relative entries',async t=>{
  const f=await fixture(t),npm=path.join(f.root,'npm'),entry=await f.file(path.join(npm,'node_modules/@anthropic-ai/claude-code/cli.js'));
  await f.file(path.join(npm,'claude.cmd'));f.env.PATH=['relative',npm].join(path.delimiter);
  await f.store.persist({provider:'claude',claudePath:path.join(npm,'claude.cmd')});const result=await f.store.discover();
  assert.equal(result.agents.length,1);assert.equal(result.agents[0].path,entry);assert.equal(result.agents[0].source,'saved');assert.ok(f.calls.every(call=>!call.command.endsWith('.cmd')));
});

test('unsupported auth status, malformed JSON and version failures remain unknown without leaking output',async t=>{
  const f=await fixture(t);await f.file('.local/bin/claude.exe',{auth:'malformed'});await f.file('AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js',{auth:'unsupported'});
  let result=await f.store.discover();assert.ok(result.agents.every(x=>x.authentication==='unknown'));assert.ok(!JSON.stringify(result).includes('secret@example.com'));
  await assert.rejects(f.store.connectDetected({candidateId:result.agents[0].id}),/could not be confirmed/);await assert.rejects(fs.access(f.store.file));
  f.states.get(result.agents[0].path).fail=true;result=await f.store.discover();assert.equal(result.agents[0].installation,'unavailable');assert.ok(!JSON.stringify(result).includes('private-secret'));
});

test('connect rechecks sign-in, commits atomically without inference, and preserves model only for same provider',async t=>{
  const f=await fixture(t),claude=await f.file('.local/bin/claude.exe'),codex=await f.file('AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js');
  await f.store.persist({provider:'codex',codexPath:codex,model:'codex-model',configured:true,gatewayUrl:'http://127.0.0.1:18789/v1',tokenEncrypted:'old-encrypted-token'});
  let result=await f.store.discover(),candidate=result.agents.find(x=>x.path===codex),connected=await f.store.connectDetected({candidateId:candidate.id,path:'attacker.exe'});
  assert.equal(connected.settings.model,'codex-model');assert.equal(connected.settings.verification,'local-auth');assert.equal(connected.settings.modelAccess,'unknown');assert.equal(connected.settings.configured,true);assert.match(connected.message,/selected using its existing sign-in/);assert.match(connected.message,/No AI request was made/);assert.doesNotMatch(connected.message,/connected using|connection failed/i);
  result=await f.store.discover();candidate=result.agents.find(x=>x.path===claude);connected=await f.store.connectDetected({candidateId:candidate.id});
  assert.equal(connected.settings.model,'');assert.equal(connected.settings.claudePath,claude);assert.equal(connected.settings.provider,'claude');assert.equal((await f.store.read()).tokenEncrypted,'old-encrypted-token');
  assert.ok(!(await fs.readdir(f.store.root)).some(x=>x.endsWith('.tmp')));assert.ok(f.calls.every(x=>!x.args.includes('exec')&&!x.args.includes('--print')));
});

test('signed-out recheck and forged, expired, changed or missing selections preserve the previous connection',async t=>{
  const f=await fixture(t),file=await f.file('.local/bin/claude.exe');await f.store.persist({provider:'openclaw',configured:true,gatewayUrl:'http://127.0.0.1:18789/v1'});
  const before=await fs.readFile(f.store.file,'utf8');let result=await f.store.discover(),id=result.agents[0].id;
  await assert.rejects(f.store.connectDetected({candidateId:'../../injected.exe'}),/expired/);
  f.states.get(file).auth='signed-out';await assert.rejects(f.store.connectDetected({candidateId:id}),/Sign in/);
  f.states.get(file).auth='signed-in';f.tick();await assert.rejects(f.store.connectDetected({candidateId:id}),/expired/);
  result=await f.store.discover();id=result.agents[0].id;await fs.writeFile(file,'changed file content');await assert.rejects(f.store.connectDetected({candidateId:id}),/changed/);
  assert.equal(await fs.readFile(f.store.file,'utf8'),before);
});

test('explicit detected login uses official command, sanitizes failures, and cancellation does not save',async t=>{
  const f=await fixture(t),file=await f.file('.local/bin/claude.exe',{auth:'signed-out'}),result=await f.store.discover(),id=result.agents[0].id;
  await f.store.loginDetected({candidateId:id});assert.ok(f.calls.some(x=>x.args.join(' ')==='auth login'));assert.equal((await f.store.discover()).agents[0].authentication,'signed-in');
  f.states.get(file).loginFail=true;await assert.rejects(f.store.loginDetected({candidateId:id}),error=>/Sign-in did not finish/.test(error.message)&&!error.message.includes('secret'));
  const controller=new AbortController();controller.abort();await assert.rejects(f.store.connectDetected({candidateId:id},controller.signal),/canceled/);await assert.rejects(f.store.discover(controller.signal),/canceled/);await assert.rejects(fs.access(f.store.file));
});

test('discovery inspects only bounded known Store package locations',async t=>{
  const f=await fixture(t);f.env.ProgramFiles=path.join(f.root,'Program Files');const target=await f.file(path.join(f.env.ProgramFiles,'WindowsApps/OpenAI.Codex_1.0_x64/app/resources/codex.exe'));
  await f.file(path.join(f.env.ProgramFiles,'WindowsApps/Unrelated_1.0_x64/app/resources/codex.exe'));
  const result=await f.store.discover();assert.deepEqual(result.agents.map(x=>x.path),[target]);assert.equal(result.agents[0].source,'desktop');
});

test('local-auth selection overrides environment fallback; advanced selections retain prior precedence',()=>{
  const previous=process.env.INVESTIGATOR_CODEX;process.env.INVESTIGATOR_CODEX='environment.exe';
  try{assert.equal(runtimeConfig({codexPath:'chosen.exe',verification:'local-auth'}).codex,'chosen.exe');assert.equal(runtimeConfig({codexPath:'chosen.exe'}).codex,'environment.exe');}finally{if(previous===undefined)delete process.env.INVESTIGATOR_CODEX;else process.env.INVESTIGATOR_CODEX=previous;}
});

test('bounded process status accepts signed-out exit without exposing it as a process failure',async()=>{
  const result=await runProcess(process.execPath,['-e',"process.stdout.write('not logged in');process.exitCode=1"],{timeout:3000,maxOutput:100,acceptedExitCodes:[0,1]});assert.equal(result.exitCode,1);
  await assert.rejects(runProcess(process.execPath,['-e',"process.stdout.write('x'.repeat(500))"],{timeout:3000,maxOutput:100}),/capture limit/);
});

test('real bounded child transport discovers and connects a fixture CLI without a generation command',async t=>{
  const f=await fixture(t),entry=await f.file('AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js');
  await fs.writeFile(entry,"const args=process.argv.slice(2).join(' ');if(args==='--version')console.log('codex-cli 0.120.0');else if(args==='login status'){console.error('Logged in using ChatGPT');process.exitCode=0;}else{console.error('Unexpected generation or login call');process.exitCode=8;}");
  const store=new ConnectionStore(path.join(f.root,'real-transport-settings'),{}, {...f.options,runner:runProcess,env:{SystemRoot:process.env.SystemRoot,...f.env}});
  const result=await store.discover();assert.equal(result.agents.length,1);assert.equal(result.agents[0].authentication,'signed-in');
  const connected=await store.connectDetected({candidateId:result.defaultId});assert.equal(connected.settings.configured,true);assert.equal(connected.settings.modelAccess,'unknown');
});

test('Codex device login streams only allowlisted public instructions and never saves them',async t=>{
  const f=await fixture(t);await f.file('AppData/Roaming/npm/node_modules/@openai/codex/bin/codex.js',{auth:'signed-out',loginChunks:['token: secret-oauth-token\nhttps://auth.openai.com/codex/','device\nEnter this one-time code:\n','ABCD-EFGH\nprivate@example.com']});
  const result=await f.store.discover(),events=[];await f.store.loginDetected({candidateId:result.defaultId,deviceAuth:true},undefined,event=>events.push(event));
  assert.ok(f.calls.some(x=>x.args.slice(-2).join(' ')==='login --device-auth'));assert.equal(events[0].type,'waiting-device');
  assert.deepEqual(events.at(-1),{type:'device-auth',url:'https://auth.openai.com/codex/device',code:'ABCD-EFGH'});assert.ok(!JSON.stringify(events).includes('secret-oauth-token'));assert.ok(!JSON.stringify(events).includes('private@'));await assert.rejects(fs.access(f.store.file));
});

test('login parser rejects token-bearing URLs, unlabelled codes and all Claude OAuth URLs',()=>{
  const events=[],parse=loginInstructions('codex',x=>events.push(x),{deviceAuth:true});
  parse('https://auth.openai.com/codex/device?token=secret\nEnter one-time code: ABCD-EFGH');assert.equal(events.length,0);
  const isolated=loginInstructions('codex',x=>events.push(x),{deviceAuth:true});isolated('https://auth.openai.com/codex/device\nABCD-EFGH');assert.deepEqual(events,[{type:'device-auth',url:'https://auth.openai.com/codex/device'}]);
  loginInstructions('claude',x=>events.push(x),{deviceAuth:true})('https://claude.ai/oauth/authorize?token=secret');assert.equal(events.length,1);
});
