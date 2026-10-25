// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {readZip} from './document-zip.mjs';
import {settingsRoot} from './paths.mjs';
import {WHISPER_NOTICES} from './whisper-licenses.mjs';

export const WHISPER_RUNTIME={version:'b5454',url:'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip',bytes:8928640,sha256:'6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb'};
export const WHISPER_MODEL={name:'small.en-q5_1',file:'ggml-small.en-q5_1.bin',url:'https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-small.en-q5_1.bin',bytes:190098681,sha256:'bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30'};
const hash=data=>createHash('sha256').update(data).digest('hex');
const runtimeFile=name=>/^(?:whisper-cli\.exe|whisper\.dll|ggml(?:-base|-cpu-[a-z0-9]+)?\.dll)$/.test(name);

export async function downloadSpeechAsset(asset,file,{signal,onProgress=()=>{},request=fetch}={}){
  let response;try{response=await request(asset.url,{signal});}catch(error){
    if(signal?.aborted)throw error;
    const diagnostic=[error.message,error.code,error.cause?.message,error.cause?.code].filter(Boolean).join(' · ');
    if(/EACCES|EPERM|ERR_NETWORK_ACCESS_DENIED|10013/.test(diagnostic))throw new Error('Local dictation download was blocked. Windows denied network access for Nodes. Check network or security settings for this app, then retry. Microphone is off; your typed goal is unchanged. Details: '+diagnostic,{cause:error});
    throw new Error('Local dictation could not download. Check your internet connection, then retry. Microphone is off; your typed goal is unchanged. Details: '+diagnostic,{cause:error});
  }if(!response.ok)throw Error(`Local dictation download failed (HTTP ${response.status}). Check your connection and retry.`);
  const handle=await fs.open(file,'wx'),digest=createHash('sha256');let received=0,last=-1;
  try{onProgress({phase:'download',name:asset===WHISPER_MODEL?'English speech model':'Speech engine',received,total:asset.bytes,percent:0});
    for await(const chunk of response.body){signal?.throwIfAborted();received+=chunk.byteLength;if(received>asset.bytes)throw Error('Local dictation download exceeds its expected size.');digest.update(chunk);await handle.writeFile(chunk);const percent=Math.floor(received/asset.bytes*100);if(percent!==last){last=percent;onProgress({phase:'download',name:asset===WHISPER_MODEL?'English speech model':'Speech engine',received,total:asset.bytes,percent});}}
    if(received!==asset.bytes||digest.digest('hex')!==asset.sha256)throw Error('Local dictation download did not pass its integrity check. Retry the download.');
  }finally{await handle.close();}
}

// No shell and no remote endpoint: this process reads one bounded local WAV.
export function runWhisper(executable,args,{signal,onProgress=()=>{},timeout=180000}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(Error('Dictation cancelled.'));
  const child=spawn(executable,args,{cwd:path.dirname(executable),windowsHide:true,stdio:['ignore','pipe','pipe']});let finished=false,termination,bytes=0,tail='';
  const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
  const stop=message=>{termination=Error(message);child.kill();};const abort=()=>stop('Dictation cancelled.');const timer=setTimeout(()=>stop('Local transcription took too long. Try a shorter recording.'),timeout);signal?.addEventListener('abort',abort,{once:true});
  child.stdout.resume();child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>1024*1024)return stop('Local speech engine exceeded its output limit.');tail+=chunk;const lines=tail.split(/[\r\n]+/);tail=lines.pop();for(const line of lines){const match=line.match(/whisper_print_progress_callback: progress =\s*(\d+)%/);if(match)onProgress({phase:'transcribing',percent:Math.min(100,Number(match[1]))});}});
  child.on('error',()=>finish(Error('The local speech engine could not start. Re-download local dictation and try again.')));
  child.on('close',code=>finish(termination||(code===0?null:Error('The local speech engine could not finish. Try a shorter recording or re-download local dictation.'))));
 });
}

export class WhisperRuntime {
 constructor({root=path.join(settingsRoot,'speech'),platform=process.platform,arch=process.arch,download=downloadSpeechAsset,run=runWhisper}={}){Object.assign(this,{root,platform,arch,download,run});this.installing=null;}
 get directory(){return path.join(this.root,`${WHISPER_RUNTIME.version}-${WHISPER_MODEL.name}`);}
 async status(){
  if(this.platform!=='win32'||this.arch!=='x64')return {available:false,reason:'Local dictation currently requires 64-bit Windows. Typed goals still work.'};
  try{const receipt=JSON.parse(await fs.readFile(path.join(this.directory,'installed.json'),'utf8'));if(receipt.model!==WHISPER_MODEL.sha256||!receipt.files?.some(f=>f.name==='whisper-cli.exe'))throw Error();
   for(const f of receipt.files){if(!runtimeFile(f.name)||(await fs.stat(path.join(this.directory,f.name))).size!==f.bytes)throw Error();}
   if((await fs.stat(path.join(this.directory,WHISPER_MODEL.file))).size!==WHISPER_MODEL.bytes)throw Error();
   return {available:true,provider:'Local Whisper · small English model',language:'en',model:WHISPER_MODEL.name};
  }catch{return {available:false,canInstall:true,downloadBytes:WHISPER_MODEL.bytes+WHISPER_RUNTIME.bytes,reason:'Download local dictation once (190 MB model + 9 MB engine). Then speech stays on this computer.'};}
 }
 async install({signal,onProgress=()=>{}}={}){
  if(this.installing)throw Error('Local dictation is already being downloaded.');
  if(this.platform!=='win32'||this.arch!=='x64')throw Error('Local dictation currently requires 64-bit Windows.');
  this.installing=true;let staging;try{
   await fs.mkdir(this.root,{recursive:true});staging=await fs.mkdtemp(path.join(this.root,'.download-'));
   await this.download(WHISPER_RUNTIME,path.join(staging,'runtime.zip'),{signal,onProgress});
   onProgress({phase:'verifying',message:'Checking local speech engine…'});
   const entries=readZip(await fs.readFile(path.join(staging,'runtime.zip'))),files=[];
   for(const [entry,data]of entries){const name=path.posix.basename(entry);if(entry!==`Release/${name}`||!runtimeFile(name))continue;await fs.writeFile(path.join(staging,name),data);files.push({name,bytes:data.length,sha256:hash(data)});}
   if(!files.some(f=>f.name==='whisper-cli.exe')||!files.some(f=>f.name==='whisper.dll')||!files.some(f=>f.name==='ggml.dll'))throw Error('The downloaded speech engine is incomplete.');
   await fs.rm(path.join(staging,'runtime.zip'));
   await this.download(WHISPER_MODEL,path.join(staging,WHISPER_MODEL.file),{signal,onProgress});signal?.throwIfAborted();
   onProgress({phase:'verifying',message:'Checking local dictation…'});await this.run(path.join(staging,'whisper-cli.exe'),['--version'],{signal,timeout:15000});
   await fs.writeFile(path.join(staging,'LICENSES.txt'),WHISPER_NOTICES);
   await fs.writeFile(path.join(staging,'installed.json'),JSON.stringify({version:WHISPER_RUNTIME.version,model:WHISPER_MODEL.sha256,files}));
   signal?.throwIfAborted();let prior;
   try{await fs.access(this.directory);prior=path.join(this.root,`.previous-${randomUUID()}`);await fs.rename(this.directory,prior);}catch(error){if(error.code!=='ENOENT')throw error;}
   try{await fs.rename(staging,this.directory);}catch(error){if(prior)await fs.rename(prior,this.directory);throw error;}staging=null;if(prior)await fs.rm(prior,{recursive:true,force:true});
   return this.status();
  }finally{this.installing=null;if(staging)await fs.rm(staging,{recursive:true,force:true});}
 }
 async transcribe(file,{signal,onProgress=()=>{}}={}){
  if(!(await this.status()).available)throw Error('Download local dictation before recording.');
  const output=path.join(path.dirname(file),'transcript');onProgress({phase:'transcribing',message:'Loading local speech model…'});
  await this.run(path.join(this.directory,'whisper-cli.exe'),['-m',path.join(this.directory,WHISPER_MODEL.file),'-f',file,'-l','en','-t','4','-ng','-pp','-oj','-of',output],{signal,onProgress});signal?.throwIfAborted();
  const result=JSON.parse(await fs.readFile(output+'.json','utf8'));return {text:(result.transcription||[]).map(s=>s.text||'').join(' ').replace(/\s+/g,' ').trim()};
 }
}
