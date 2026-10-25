import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {AgentContextStore,contextUrl,readContextUrl} from '../lib/agent-context.mjs';
import {AgentSessionStore,validateRoute} from '../lib/agent-guide.mjs';
import {providerImageInput} from '../lib/provider-images.mjs';
import {runJSON} from '../lib/providers.mjs';
const png=Buffer.from('89504e470d0a1a0a0000000000000000','hex');
async function setup(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-agent-context-')),directory=id=>path.join(root,id);await fs.mkdir(directory('owned'));const store={directory},contexts=new AgentContextStore(store,{normaliseImage:async data=>({data,width:2,height:2})});return {root,store,contexts};}

test('legacy what does not mask opening guidance, while explicit new goals and context survive',async()=>{
  const {root,contexts}=await setup(),legacy={version:1,goal:'what',items:[],projectFolder:root};
  await contexts.write('owned',legacy);
  const saved=await fs.readFile(path.join(contexts.root('owned'),'context.json'),'utf8');
  assert.equal(contexts.public(await contexts.read('owned')).goal,'');
  assert.equal(contexts.public(await contexts.read('owned')).projectFolder,root);
  assert.equal(await fs.readFile(path.join(contexts.root('owned'),'context.json'),'utf8'),saved,'Reading must not rewrite the saved original');
  const explicit=await contexts.update('owned','goal','what');
  assert.equal(explicit.goal,'what','A newly entered value is intentional');
  assert.equal(contexts.public(await contexts.read('owned')).goal,'what');
  assert.equal((await contexts.update('owned','goal','')).goal,'');
  assert.equal((await contexts.read('owned')).projectFolder,root);
  await contexts.write('owned',{...legacy,goal:'What makes this copy portable?'});
  assert.equal(contexts.public(await contexts.read('owned')).goal,'What makes this copy portable?','Real legacy questions are preserved');
});
test('source context is copied, bounded, removable and isolated from the normal investigation draft',async()=>{
  const {root,contexts}=await setup(),file=path.join(root,'notes.md');await fs.writeFile(file,'My product context. '.repeat(3000));let result=await contexts.update('owned','files',[file]);assert.equal(result.items.length,1);assert.equal(result.items[0].truncated,true);assert.equal(result.items[0].text,undefined);await fs.writeFile(file,'Changed outside');const captured=await contexts.plan('owned');assert.match(captured.text,/My product context/);assert.ok(!captured.text.includes('Changed outside'));await contexts.update('owned','goal','Typed and spoken goal');assert.equal((await contexts.read('owned')).goal,'Typed and spoken goal');await contexts.update('owned','remove',result.items[0].id);assert.equal((await contexts.plan('owned')).text,'');assert.equal(await fs.stat(path.join(root,'owned','investigation.json')).then(()=>true,()=>false),false);
});
test('unsupported and private files, excess attachments, and changed image snapshots fail clearly',async()=>{
  const {root,contexts}=await setup();const file=path.join(root,'passwords.txt');await fs.writeFile(file,'secret');await assert.rejects(contexts.update('owned','files',[file]),/private settings/);const image=path.join(root,'screen.png');await fs.writeFile(image,png);const item=(await contexts.update('owned','files',[image])).items[0];let plan=await contexts.plan('owned');assert.equal(plan.images.length,1);await fs.writeFile(plan.images[0].path,'different');await assert.rejects(contexts.plan('owned'),/changed/);await contexts.update('owned','remove',item.id);await contexts.update('owned','paste',[{name:'Clipboard.png',bytes:new Uint8Array(png)}]);assert.equal((await contexts.plan('owned')).images.length,1);await assert.rejects(contexts.update('owned','files',Array(11).fill(image)),/ten files/);
});
test('explicit local URLs are read as bounded text with no scripting or cross-origin redirects',async()=>{
  const hits=[];const server=http.createServer((req,res)=>{hits.push(req.url);if(req.url==='/redirect'){res.writeHead(302,{Location:'http://example.test/elsewhere'});res.end();return;}res.writeHead(200,{'Content-Type':'text/html'});res.end('<h1>Time of Fire</h1><p>Local project description for comparing useful time tracking workflows.</p><script>throw new Error("must not execute")</script>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;try{const page=await readContextUrl(url);assert.match(page.text,/Local project description/);assert.ok(!page.text.includes('throw new Error'));assert.match(page.limitation,/scripts/);await assert.rejects(readContextUrl(url+'/redirect'),/destination URL/);assert.deepEqual(hits,['/','/redirect']);assert.throws(()=>contextUrl('file:///tmp/app'));assert.throws(()=>contextUrl('https://user:pass@example.test'));}finally{await new Promise(resolve=>server.close(resolve));}
});
test('image adapters deliver pixels to Codex, Claude and compatible gateways instead of dropping them',async()=>{
  const {root}=await setup(),file=path.join(root,'screen.png');await fs.writeFile(file,png);const images=[{path:file,name:'Screen.png'}];const codex=await providerImageInput('codex','goal',images);assert.deepEqual(codex.args,['--image',file]);const claude=await providerImageInput('claude','goal',images),message=JSON.parse(claude.input);assert.equal(message.message.content[1].type,'image');assert.equal(message.message.content[1].source.data,png.toString('base64'));assert.deepEqual(claude.args,['--input-format','stream-json']);const gateway=await providerImageInput('openclaw','goal',images);assert.equal(gateway.content[1].type,'image_url');assert.match(gateway.content[1].image_url.url,/^data:image\/png;base64,/);assert.deepEqual(await providerImageInput('codex','plain'),{input:'plain',args:[],content:'plain'});
});
test('approved routes retain input snapshots, forward context to investigations, and reject changed context',async()=>{
  const {root,store,contexts}=await setup(),id='owned';const state={id,status:'saved',messages:[{id:'d',role:'assistant',features:[{name:'Tracking',investigate:'Inspect tracking',claimIndexes:[0]}],claims:[{evidenceId:'e1',text:'Recorded source'}]}],evidence:[{id:'e1',text:'Recorded source',evidenceStatus:'captured'}]};store.read=async()=>structuredClone(state);const file=path.join(root,'context.txt');await fs.writeFile(file,'My app has a timer.');await contexts.update(id,'files',[file]);let planned,received;
  const goal='Improve my app at http://localhost:3000';
  const guide=new AgentSessionStore(store,{contexts,planner:async(_config,state,goal,project)=>{planned=project;return validateRoute({steps:[{nodeId:'feature:tracking',action:'investigate',question:'Compare the saved mechanism',why:'Useful for the goal',evidenceIds:['e1']}]},state);},turn:async(state,question,options)=>{assert.ok(!question.includes('http://'));received=options.agentContext;state.messages.push({id:'new',role:'assistant'});return state;}});
  let session=await guide.propose(id,goal,null,{config:{}});assert.match(planned.text,/My app has a timer/);assert.equal(session.context.items.length,1);session=await guide.approve(id,session.route.map(s=>s.id));await guide.run(id);assert.match(received.text,/My app has a timer/);assert.ok(received.text.includes(goal));await contexts.update(id,'url','http://localhost:3000');await assert.rejects(guide.propose(id,goal,null,{config:{},replan:true}),/Context changed/);
});
test('Codex and Claude real process adapters receive image arguments or inline image blocks',async()=>{
  const {root}=await setup(),file=path.join(root,'screen.png'),command=path.join(root,'provider.mjs');await fs.writeFile(file,png);
  await fs.writeFile(command,`import fs from 'node:fs/promises';let input='';for await(const chunk of process.stdin)input+=chunk;const args=process.argv.slice(2),record=args[args.indexOf('--model')+1];await fs.writeFile(record,JSON.stringify({args,input}));const answer={answer:'ok'};console.log(JSON.stringify(args.includes('--print')?{structured_output:answer}:{type:'item.completed',item:{type:'agent_message',text:JSON.stringify(answer)}}));`);
  const schema={type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false},schemaPath=path.join(root,'schema.json');await fs.writeFile(schemaPath,JSON.stringify(schema));
  for(const provider of ['codex','claude']){const record=path.join(root,`${provider}.json`),result=await runJSON({provider,node:process.execPath,codex:command,claude:command,model:record},schema,'Describe the attached screenshot',schemaPath,{directory:root,images:[{path:file,name:'Screen.png'}]});assert.equal(result.answer,'ok');const captured=JSON.parse(await fs.readFile(record,'utf8'));if(provider==='codex'){assert.ok(captured.args.includes('--image'));assert.ok(captured.args.includes(file));}else assert.equal(JSON.parse(captured.input).message.content[1].source.data,png.toString('base64'));}
});
test('compatible gateway receives image bytes and the required output schema in one planning request',async()=>{
  const {root}=await setup(),file=path.join(root,'screen.png');await fs.writeFile(file,png);let body;const server=http.createServer(async(req,res)=>{let input='';for await(const chunk of req)input+=chunk;body=JSON.parse(input);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'{"answer":"ok"}'}}]}));});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const result=await runJSON({provider:'openclaw',gatewayUrl:`http://127.0.0.1:${server.address().port}/v1`},{type:'object',properties:{answer:{type:'string'}},required:['answer']},'Compare this image',null,{images:[{path:file,name:'Image.png'}]});assert.equal(result.answer,'ok');assert.match(body.messages[1].content[0].text,/Required JSON schema/);assert.equal(body.messages[1].content[1].image_url.url,'data:image/png;base64,'+png.toString('base64'));assert.deepEqual(body.tools,[]);}finally{await new Promise(resolve=>server.close(resolve));}
});
