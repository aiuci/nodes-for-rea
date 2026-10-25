import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {downloadSpeechAsset,WhisperRuntime,WHISPER_MODEL,runWhisper} from '../lib/whisper-runtime.mjs';
import {writeZip} from '../lib/document-zip.mjs';
import {GoalSpeech} from '../lib/goal-speech.mjs';
import {pcmWave} from '../ui/goal-audio.js';
const digest=b=>createHash('sha256').update(b).digest('hex');
async function root(t){const p=await fs.mkdtemp(path.join(os.tmpdir(),'rea-whisper-test-'));t.after(()=>fs.rm(p,{recursive:true,force:true}));return p;}
function runtimeOptions(directory){return {root:directory,platform:'win32',arch:'x64',download:async(asset,file)=>{if(asset===WHISPER_MODEL){const h=await fs.open(file,'w');await h.truncate(asset.bytes);await h.close();}else await fs.writeFile(file,writeZip(new Map(['whisper-cli.exe','whisper.dll','ggml.dll'].map(name=>['Release/'+name,Buffer.from('owned test fixture')]))));},run:async()=>{}};}
test('asset download checks exact bytes and checksum and reports real byte progress',async t=>{
 const dir=await root(t),body=Buffer.from('owned bytes'),asset={url:'https://example.test/owned',bytes:body.length,sha256:digest(body)},events=[];
 await downloadSpeechAsset(asset,path.join(dir,'good'),{request:async()=>new Response(body),onProgress:e=>events.push(e)});assert.equal((await fs.readFile(path.join(dir,'good'))).toString(),'owned bytes');assert.equal(events.at(-1).received,body.length);
 for(const [name,data]of [['wrong',Buffer.from('bad')],['same-size',Buffer.alloc(body.length)],['oversized',Buffer.alloc(body.length+1)]])await assert.rejects(downloadSpeechAsset(asset,path.join(dir,name),{request:async()=>new Response(data)}),/integrity|expected size/);
});
test('download reports denied app networking with the actual cause before creating an asset',async t=>{
 const dir=await root(t),file=path.join(dir,'blocked'),cause=Object.assign(new Error('connect EACCES owned.test:443'),{code:'EACCES'});
 await assert.rejects(downloadSpeechAsset({url:'https://example.test/owned'},file,{request:async()=>{throw new TypeError('fetch failed',{cause});}}),/download was blocked.*Windows denied network access.*EACCES/);
 assert.deepEqual(await fs.readdir(dir),[]);
});
test('install is staged, requires explicit setup, and preserves a working model if replacement fails',async t=>{
 const dir=await root(t),runtime=new WhisperRuntime(runtimeOptions(dir));assert.equal((await runtime.status()).canInstall,true);assert.equal((await runtime.install()).available,true);const original=await fs.readFile(path.join(runtime.directory,'installed.json'),'utf8');
 runtime.download=async()=>{throw Error('Controlled download failure');};await assert.rejects(runtime.install(),/Controlled download/);assert.equal((await runtime.status()).available,true);assert.equal(await fs.readFile(path.join(runtime.directory,'installed.json'),'utf8'),original);assert.ok((await fs.readdir(dir)).every(n=>!n.startsWith('.download-')));
 assert.equal((await new WhisperRuntime({root:dir,platform:'linux'}).status()).available,false);
});
test('cancelled setup removes partial assets and never marks dictation ready',async t=>{
 const dir=await root(t),controller=new AbortController(),runtime=new WhisperRuntime({...runtimeOptions(dir),download:async(asset,file,{signal})=>{await fs.writeFile(file,'partial');controller.abort();signal.throwIfAborted();}});
 await assert.rejects(runtime.install({signal:controller.signal}));assert.deepEqual(await fs.readdir(dir),[]);assert.equal((await runtime.status()).available,false);
});
test('cancellation terminates the actual local child process and rejects late output',async t=>{
 const dir=await root(t),script=path.join(dir,'controlled.cjs'),controller=new AbortController();await fs.writeFile(script,"process.stderr.write('whisper_print_progress_callback: progress = 10%\\n');setInterval(()=>{},1000);");
 await assert.rejects(runWhisper(process.execPath,[script],{signal:controller.signal,onProgress:e=>{assert.equal(e.percent,10);controller.abort();},timeout:5000}),/cancelled/);
});
test('silence never reaches the speech engine or becomes an invented transcript',async t=>{
 let calls=0;const dir=await root(t),speech=new GoalSpeech({tempRoot:dir,runtime:{status:async()=>({available:true}),transcribe:async()=>{calls++;return {text:'invented'};}}});
 await assert.rejects(speech.transcribe('silence',pcmWave([new Float32Array(16000)])),/No audible speech/);assert.equal(calls,0);assert.deepEqual(await fs.readdir(dir),[]);
});
test('local invocation uses the confirmed model, CPU and real engine progress; temporary outputs remain caller-owned',async t=>{
 const dir=await root(t),options=runtimeOptions(dir),runtime=new WhisperRuntime(options);await runtime.install();let invocation;runtime.run=async(executable,args,{onProgress})=>{invocation={executable,args};onProgress({phase:'transcribing',percent:75});await fs.writeFile(args.at(-1)+'.json',JSON.stringify({transcription:[{text:' Accurate words.'}]}));};const events=[],file=path.join(dir,'owned.wav');
 const result=await runtime.transcribe(file,{onProgress:e=>events.push(e)});assert.equal(result.text,'Accurate words.');assert.ok(invocation.args.includes('-ng'));assert.ok(invocation.args.includes(path.join(runtime.directory,WHISPER_MODEL.file)));assert.equal(events.at(-1).percent,75);assert.ok(!invocation.args.includes('--translate'));
});
