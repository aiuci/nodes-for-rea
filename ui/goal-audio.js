// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
export function pcmWave(chunks){
  const count=chunks.reduce((n,c)=>n+c.length,0),buffer=new ArrayBuffer(44+count*2),v=new DataView(buffer);
  const word=(offset,text)=>[...text].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
  word(0,'RIFF');v.setUint32(4,buffer.byteLength-8,true);word(8,'WAVE');word(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);word(36,'data');v.setUint32(40,count*2,true);
  let offset=44;for(const chunk of chunks)for(const sample of chunk){const x=Math.max(-1,Math.min(1,sample));v.setInt16(offset,Math.round(x*(x<0?32768:32767)),true);offset+=2;}return new Uint8Array(buffer);
}
export const goalAudio={
  supported:()=>!!(globalThis.navigator?.mediaDevices?.getUserMedia&&globalThis.AudioContext&&globalThis.AudioWorkletNode),
  async open(onLost,signal){
    let stream,context,source,node,closed=false;const chunks=[];let count=0;
    const close=()=>{closed=true;signal?.removeEventListener('abort',close);for(const track of stream?.getTracks()||[]){track.onended=null;track.stop();}node?.disconnect();source?.disconnect();if(context&&context.state!=='closed')context.close().catch(()=>{});};
    try{if(signal?.aborted)throw new Error('Dictation cancelled.');signal?.addEventListener('abort',close,{once:true});
      stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
      if(closed||signal?.aborted){close();throw new Error('Dictation cancelled.');}
      for(const track of stream.getTracks())track.onended=onLost;
      context=new AudioContext({sampleRate:16000});await context.audioWorklet.addModule(new URL('./goal-audio-worklet.js',import.meta.url));if(closed)throw new Error('Microphone disconnected.');
      source=context.createMediaStreamSource(stream);node=new AudioWorkletNode(context,'goal-pcm');node.port.onmessage=({data})=>{if(closed)return;const chunk=new Float32Array(data),remaining=960000-count;if(remaining>0){chunks.push(chunk.slice(0,remaining));count+=Math.min(chunk.length,remaining);}};
      source.connect(node);node.connect(context.destination);await context.resume();if(closed)throw new Error('Dictation cancelled.');
      return {finish:()=>{close();return pcmWave(chunks);},cancel:()=>{close();chunks.length=0;}};
    }catch(error){close();throw error;}
  }
};
