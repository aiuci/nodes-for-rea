import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {GoalSpeech,GoalMicrophoneGate,validateWave} from '../lib/goal-speech.mjs';
import {GoalVoiceController,appendGoalTranscript} from '../ui/goal-voice-core.js';
import {pcmWave,goalAudio} from '../ui/goal-audio.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const wave=()=>pcmWave([Float32Array.from({length:1600},(_,i)=>Math.sin(i/8)*.2)]);
function harness(overrides={}){
  let draft='Typed goal',context='one',opened=0,released=0,prepared=0,cancelled=0,transcribed=0;const events=[];
  const recording={finish:()=>{released++;return wave();},cancel:()=>{released++;}};
  const api={goalVoicePrepare:async()=>{prepared++;},goalVoiceTranscribe:async()=>{transcribed++;return {text:'spoken idea'};},goalVoiceCancel:async()=>{cancelled++;},...overrides.api};
  const capture={supported:()=>true,open:async()=>{opened++;return recording;},...overrides.capture};
  const controller=new GoalVoiceController({api,capture,readDraft:()=>draft,writeDraft:v=>draft=v,getContext:()=>context,render:v=>events.push(v),setTimer:()=>1,clearTimer:()=>{},...overrides.controller});
  return {controller,events,api,capture,recording,get draft(){return draft;},set draft(v){draft=v;},set context(v){context=v;},get counts(){return {opened,released,prepared,cancelled,transcribed};}};
}
test('success releases audio before transcription, appends to current edits, and can be repeated',async()=>{
  const waiting=deferred(),h=harness({api:{goalVoiceTranscribe:async()=>{assert.ok(h.counts.released);return waiting.promise;}}});
  await h.controller.start();assert.equal(h.controller.state,'listening');const stop=h.controller.stop();await Promise.resolve();h.draft='Changed while transcribing';waiting.resolve({text:'spoken idea'});await stop;
  assert.equal(h.draft,'Changed while transcribing spoken idea');assert.equal(h.controller.state,'idle');await h.controller.start();assert.equal(h.counts.opened,2);h.controller.cancel();assert.ok(h.counts.released>=2);
});
test('unsupported capture never requests permission',async()=>{const h=harness({capture:{supported:()=>false}});await h.controller.start();assert.equal(h.controller.state,'error');assert.equal(h.counts.prepared,0);assert.equal(h.draft,'Typed goal');});
test('no provider never opens audio',async()=>{const h=harness({api:{goalVoicePrepare:async()=>{throw Error('No offline speech provider is ready.');}}});await h.controller.start();assert.equal(h.counts.opened,0);assert.match(h.events.at(-1).message,/No offline/);});
test('permission denied leaves draft intact and supports retry',async()=>{const h=harness({capture:{open:async()=>{throw Object.assign(Error('denied'),{name:'NotAllowedError'});}}});await h.controller.start();assert.match(h.events.at(-1).message,/permission was denied/);assert.equal(h.draft,'Typed goal');h.capture.open=async()=>h.recording;await h.controller.start();assert.equal(h.controller.state,'listening');h.controller.cancel();});
test('cancel before audio opens releases late capture without transcribing',async()=>{const gate=deferred(),h=harness({capture:{open:()=>gate.promise}});const start=h.controller.start();await Promise.resolve();h.controller.cancel();gate.resolve(h.recording);await start;assert.ok(h.counts.released);assert.equal(h.counts.transcribed,0);assert.equal(h.controller.state,'idle');});
test('cancel rejects late transcription even after a new recording begins',async()=>{const gate=deferred(),h=harness({api:{goalVoiceTranscribe:()=>gate.promise}});await h.controller.start();const stop=h.controller.stop();await Promise.resolve();h.controller.cancel();await h.controller.start();gate.resolve({text:'stale speech'});await stop;assert.equal(h.draft,'Typed goal');assert.equal(h.controller.state,'listening');h.controller.cancel();});
test('investigation change rejects the prior transcript',async()=>{const gate=deferred(),h=harness({api:{goalVoiceTranscribe:()=>gate.promise}});await h.controller.start();const stop=h.controller.stop();await Promise.resolve();h.context='two';h.controller.cancel();gate.resolve({text:'old goal'});await stop;assert.equal(h.draft,'Typed goal');});
test('transcription failure preserves draft and permits retry',async()=>{const h=harness({api:{goalVoiceTranscribe:async()=>{throw Error('Local backend failed');}}});await h.controller.start();await h.controller.stop();assert.equal(h.controller.state,'error');assert.equal(h.draft,'Typed goal');assert.ok(h.counts.released);await h.controller.start();h.controller.cancel();});
test('double Stop sends one request',async()=>{const h=harness();await h.controller.start();await Promise.all([h.controller.stop(),h.controller.stop()]);assert.equal(h.counts.transcribed,1);});

test('setup and engine progress are scoped to the active request and cancelled setup cannot overwrite newer state',async()=>{const waiting=deferred(),h=harness({api:{goalVoiceInstall:()=>waiting.promise}});const setup=h.controller.install();assert.equal(h.controller.state,'installing');h.controller.progress({id:'stale',phase:'download',name:'Model',percent:90,received:9,total:10});assert.ok(!h.events.at(-1).message.includes('90%'));h.controller.progress({id:h.controller.id,phase:'download',name:'Model',percent:50,received:5,total:10});assert.match(h.events.at(-1).message,/50%/);h.controller.cancel();waiting.resolve({available:true});await setup;assert.equal(h.controller.state,'idle');assert.equal(h.draft,'Typed goal');assert.match(h.events.at(-1).message,/cancelled/);});
test('goal limit preserves all draft and exposes complete overflow transcript',()=>{assert.deepEqual(appendGoalTranscript('x'.repeat(599),'spoken'),{value:'x'.repeat(599),remainder:'spoken'});assert.equal(appendGoalTranscript('Typed\n',' hello ').value,'Typed\nhello');});

test('shared dictation honors each field limit without imposing the goal limit',async()=>{
 const long=harness({controller:{limit:()=>2000,fieldLabel:'text',reviewAction:'using it'}});long.draft='x'.repeat(650);await long.controller.start();await long.controller.stop();assert.equal(long.draft,'x'.repeat(650)+' spoken idea');assert.match(long.events.at(-1).message,/Review it before using it/);
 const short=harness({controller:{limit:()=>12,fieldLabel:'text'}});await short.controller.start();await short.controller.stop();assert.equal(short.draft,'Typed goal');assert.equal(short.events.at(-1).remainder,'spoken idea');assert.match(short.events.at(-1).message,/12-character text limit/);
});
test('WAV format and bounded input are validated',()=>{const audio=wave();assert.equal(validateWave(audio).length,3244);assert.throws(()=>validateWave(new Uint8Array(10)),/60 seconds/);const malformed=audio.slice();malformed[24]=0;assert.throws(()=>validateWave(malformed),/Unsupported/);assert.throws(()=>validateWave(new Uint8Array(1920046)),/60 seconds/);});
test('local runtime unavailability is reported without falling back to Windows recognition',async()=>{const service=new GoalSpeech({runtime:{status:async()=>({available:false,canInstall:true,reason:'Download local dictation'})}});assert.equal((await service.status()).canInstall,true);await assert.rejects(service.transcribe('one',wave()),/Download local/);});
test('local service transcribes WAV file and removes temporary audio',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'goal-voice-test-'));let file;
  try{const service=new GoalSpeech({tempRoot:root,runtime:{status:async()=>({available:true}),transcribe:async(wav,options)=>{file=wav;assert.equal((await fs.readFile(file)).toString('ascii',0,4),'RIFF');return {text:'offline words'};}}});assert.equal((await service.status()).available,true);assert.deepEqual(await service.transcribe('one',wave()),{text:'offline words'});assert.deepEqual(await fs.readdir(root),[]);assert.ok(file);}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('cancel aborts local helper and cleans audio on failure',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'goal-voice-cancel-')),started=deferred();
  try{const service=new GoalSpeech({tempRoot:root,runtime:{status:async()=>({available:true}),transcribe:async(file,{signal}={})=>{started.resolve();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));}}});await service.status();const pending=service.transcribe('one',wave());await started.promise;service.cancel('one');await assert.rejects(pending,/cancelled/);assert.deepEqual(await fs.readdir(root),[]);}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('empty recognition result is an error, never a successful fake transcript',async()=>{const service=new GoalSpeech({runtime:{status:async()=>({available:true}),transcribe:async()=>({text:''})}});await service.status();await assert.rejects(()=>service.transcribe('silence',wave()),/No speech/);});
function gateHarness(confirm=async()=>true){const wc={},clock={now:1000};return {wc,clock,gate:new GoalMicrophoneGate({url:'file:///owned/ui/index.html',getWindow:()=>({webContents:wc}),confirm,now:()=>clock.now}),details:{requestingUrl:'file:///owned/ui/index.html',isMainFrame:true,mediaTypes:['audio']}};}
test('session consent is remembered while every recording still requires a valid ticket',async()=>{
  let prompts=0;const {gate,wc,clock,details}=gateHarness(async()=>{prompts++;return true;});
  gate.arm('first');assert.equal(await gate.request(wc,'media',details),true);gate.consume('first');
  assert.equal(await gate.request(wc,'media',details),false);
  gate.arm('second');assert.equal(await gate.request(wc,'media',{...details,mediaTypes:['audio','video']}),false);assert.equal(await gate.request({},'media',details),false);assert.equal(await gate.request(wc,'media',{...details,isMainFrame:false}),false);assert.equal(await gate.request(wc,'media',{...details,requestingUrl:'https://elsewhere.test'}),false);
  assert.equal(await gate.request(wc,'media',details),true);gate.cancel('second');assert.equal(prompts,1);
  gate.arm('expired');clock.now+=15001;assert.equal(await gate.request(wc,'media',details),false);
});
test('consent is not inherited by a replacement window or a new gate',async()=>{
  let wc={},prompts=0;const h=gateHarness(),gate=new GoalMicrophoneGate({url:h.details.requestingUrl,getWindow:()=>({webContents:wc}),confirm:async()=>{prompts++;return true;}});
  gate.arm('first');assert.equal(await gate.request(wc,'media',h.details),true);gate.consume('first');wc={};gate.arm('replacement');assert.equal(await gate.request(wc,'media',h.details),true);assert.equal(prompts,2);
  const next=gateHarness(async()=>{prompts++;return true;});next.gate.arm('restart');await next.gate.request(next.wc,'media',next.details);assert.equal(prompts,3);
});
test('cancelled or expired consent does not authorize the next recording',async()=>{
  for(const expire of [false,true]){let prompts=0;const waiting=deferred(),h=gateHarness(async()=>{prompts++;return prompts===1?waiting.promise:true;});h.gate.arm('first');const pending=h.gate.request(h.wc,'media',h.details);if(expire)h.clock.now+=15001;else h.gate.cancel('first');waiting.resolve(true);assert.equal(await pending,false);h.gate.arm('next');assert.equal(await h.gate.request(h.wc,'media',h.details),true);assert.equal(prompts,2);}
});
test('permission is one-use, audio-only, exact main frame and expires',async()=>{const {gate,wc,clock,details}=gateHarness();assert.equal(await gate.request(wc,'media',details),false);gate.arm('one');assert.equal(await gate.request(wc,'media',{...details,mediaTypes:['video']}),false);assert.equal(await gate.request({},'media',details),false);assert.equal(await gate.request(wc,'media',{...details,isMainFrame:false}),false);assert.equal(await gate.request(wc,'media',{...details,requestingUrl:'https://elsewhere.test'}),false);assert.equal(await gate.request(wc,'notifications',details),false);assert.equal(await gate.request(wc,'media',details),true);assert.equal(await gate.request(wc,'media',details),false);gate.consume('one');assert.throws(()=>gate.consume('one'),/microphone button/);gate.arm('two');clock.now+=15001;assert.equal(await gate.request(wc,'media',details),false);});
test('denied/cancelled permission prompts cannot grant a late recording',async()=>{const waiting=deferred(),{gate,wc,details}=gateHarness(()=>waiting.promise);gate.arm('one');const pending=gate.request(wc,'media',details);gate.cancel('one');waiting.resolve(true);assert.equal(await pending,false);assert.throws(()=>gate.consume('one'));const denied=gateHarness(async()=>false);denied.gate.arm('no');assert.equal(await denied.gate.request(denied.wc,'media',denied.details),false);});
test('capture releases a stream received after cancellation without starting WebAudio',async()=>{
  const old=Object.getOwnPropertyDescriptor(globalThis,'navigator'),pending=deferred();let stopped=0;
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>pending.promise}}});
  try{const controller=new AbortController(),opening=goalAudio.open(()=>{},controller.signal);controller.abort();pending.resolve({getTracks:()=>[{stop:()=>stopped++}]});await assert.rejects(opening,/cancelled/);assert.ok(stopped);}finally{if(old)Object.defineProperty(globalThis,'navigator',old);else delete globalThis.navigator;}
});
