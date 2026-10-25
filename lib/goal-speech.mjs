// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {WhisperRuntime} from './whisper-runtime.mjs';

export function validateWave(value){
  if(!(value instanceof Uint8Array)||value.byteLength<46||value.byteLength>1920044)throw new Error('Record between a moment and 60 seconds of speech.');
  const b=Buffer.from(value);
  if(b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE'||b.toString('ascii',12,16)!=='fmt '||b.readUInt32LE(16)!==16||b.readUInt16LE(20)!==1||b.readUInt16LE(22)!==1||b.readUInt32LE(24)!==16000||b.readUInt32LE(28)!==32000||b.readUInt16LE(32)!==2||b.readUInt16LE(34)!==16||b.toString('ascii',36,40)!=='data'||b.readUInt32LE(40)!==b.length-44||b.readUInt32LE(4)!==b.length-8||(b.length-44)%2)throw new Error('Unsupported dictation audio. Expected mono 16 kHz PCM WAV.');
  return b;
}

export class GoalSpeech {
  constructor({runtime=new WhisperRuntime(),tempRoot=os.tmpdir()}={}){this.runtime=runtime;this.tempRoot=tempRoot;this.jobs=new Map();}
  status(){return this.runtime.status();}
  async install(id,{onProgress}={}){
    if(this.jobs.size)throw new Error('Finish the current dictation first.');
    const controller=new AbortController();this.jobs.set(id,controller);
    try{return await this.runtime.install({signal:controller.signal,onProgress});}finally{this.jobs.delete(id);}
  }
  async transcribe(id,wave,{onProgress}={}){
    const audio=validateWave(wave);let sum=0,peak=0;
    for(let i=44;i<audio.length;i+=2){const n=audio.readInt16LE(i)/32768;sum+=n*n;peak=Math.max(peak,Math.abs(n));}
    if(Math.sqrt(sum/((audio.length-44)/2))<.001&&peak<.01)throw new Error('No audible speech was recorded. Check your microphone and try again.');
    if(!(await this.runtime.status()).available)throw new Error('Download local dictation before recording.');
    if(this.jobs.size)throw new Error('A dictation is already being transcribed.');
    const controller=new AbortController();this.jobs.set(id,controller);let directory;
    try{directory=await fs.mkdtemp(path.join(this.tempRoot,'rea-goal-speech-'));if(controller.signal.aborted)throw new Error('Dictation cancelled.');
      const file=path.join(directory,'speech.wav');await fs.writeFile(file,audio,{mode:0o600});
      const result=await this.runtime.transcribe(file,{signal:controller.signal,onProgress});
      if(controller.signal.aborted)throw new Error('Dictation cancelled.');if(typeof result.text!=='string')throw new Error('No transcript was returned.');
      const text=result.text.trim();if(!text)throw new Error('No speech was recognized. Try again or type your goal.');return {text:text.slice(0,4000)};
    }finally{if(directory)await fs.rm(directory,{recursive:true,force:true});this.jobs.delete(id);}
  }
  cancel(id){this.jobs.get(id)?.abort();}
  close(){for(const job of this.jobs.values())job.abort();}
}

// Session consent is memory-only; each recording still needs a short-lived ticket.
export class GoalMicrophoneGate {
  constructor({url,getWindow,confirm,now=Date.now}){Object.assign(this,{url,getWindow,confirm,now});this.ticket=null;}
  arm(id){if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw new Error('Invalid dictation request.');if(this.ticket)throw new Error('Finish or cancel the current dictation first.');this.ticket={id,expires:this.now()+15000,allowed:false};}
  async request(wc,permission,details={}){
    const ticket=this.ticket;
    if(!ticket||ticket.allowed||ticket.prompting||this.now()>ticket.expires||permission!=='media'||wc!==this.getWindow()?.webContents||details.requestingUrl!==this.url||details.isMainFrame!==true||details.mediaTypes?.length!==1||details.mediaTypes[0]!=='audio')return false;
    ticket.prompting=true;
    const approved=this.approvedWebContents===wc||await this.confirm();
    if(this.ticket!==ticket||!approved||this.now()>ticket.expires||wc!==this.getWindow()?.webContents){if(this.ticket===ticket)this.ticket=null;return false;}
    this.approvedWebContents=wc;
    ticket.allowed=true;return true;
  }
  consume(id){if(this.ticket?.id!==id||!this.ticket.allowed)throw new Error('Start dictation with the microphone button first.');this.ticket=null;}
  cancel(id){if(!id||this.ticket?.id===id)this.ticket=null;}
}
