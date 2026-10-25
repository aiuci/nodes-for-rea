// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
export function appendGoalTranscript(draft,transcript,limit=600){
  const text=String(transcript||'').trim();if(!text)return {value:draft,remainder:''};
  const separator=draft&&!/\s$/.test(draft)?' ':'';
  // Preserve the entire existing draft, including any edits made during transcription.
  if(draft.length+separator.length+text.length>limit)return {value:draft,remainder:text};
  return {value:draft+separator+text,remainder:''};
}

export class GoalVoiceController {
  constructor({api,capture,readDraft,writeDraft,getContext,render,limit=600,fieldLabel='goal',reviewAction='planning',setTimer=(fn,ms)=>globalThis.setTimeout(fn,ms),clearTimer=id=>globalThis.clearTimeout(id)}){Object.assign(this,{api,capture,readDraft,writeDraft,getContext,render,limit,fieldLabel,reviewAction,setTimer,clearTimer});this.state='idle';this.sequence=0;}
  update(state,message=''){this.state=state;this.render({state,message});}
  progress(event){
    if(event.id!==this.id||!['installing','transcribing'].includes(this.state))return;
    if(event.phase==='download')this.update('installing',`Downloading ${event.name.toLowerCase()} — ${event.percent}% (${Math.round(event.received/1000000)} / ${Math.round(event.total/1000000)} MB). Microphone is off.`);
    else if(event.phase==='transcribing')this.update('transcribing',Number.isFinite(event.percent)?`Transcribing locally — ${event.percent}%. Microphone is off.`:event.message||'Transcribing locally — microphone is off.');
    else if(event.message)this.update(this.state,event.message);
  }
  async install(){
    if(!['idle','error'].includes(this.state))return;
    const token=++this.sequence,id=globalThis.crypto.randomUUID();this.id=id;this.update('installing','Downloading local dictation. Microphone is off.');
    try{const info=await this.api.goalVoiceInstall(id);if(token!==this.sequence)return;this.update('idle','Local Whisper is ready. Click the microphone to record.');return info;}
    catch(error){if(token===this.sequence)this.update('error',error.message||'Could not download local dictation. You can retry.');}
  }
  async start(){
    if(!['idle','error'].includes(this.state))return;
    const token=++this.sequence,id=globalThis.crypto.randomUUID(),context=this.getContext();this.id=id;this.context=context;this.captureAbort=new AbortController();
    const current=()=>token===this.sequence&&context===this.getContext();
    this.update('preparing','Requesting microphone permission…');
    try{
      if(!this.capture.supported())throw new Error('Microphone recording is not supported in this runtime. Type your goal instead.');
      await this.api.goalVoicePrepare(id);if(!current())return;
      const recording=await this.capture.open(()=>this.cancel('Microphone disconnected. Try again.'),this.captureAbort.signal);
      if(!current()){recording.cancel();return;}
      this.recording=recording;this.update('listening','Listening — click Stop when finished (60 seconds maximum).');
      this.timer=this.setTimer(()=>this.stop(),60000);
    }catch(error){if(current()){this.release();await this.api.goalVoiceCancel(id).catch(()=>{});this.update('error',error.name==='NotAllowedError'?'Microphone permission was denied. You can retry or type your goal.':error.name==='NotFoundError'?'No microphone was found. Connect one or type your goal.':error.message||'Could not start dictation.');}}
  }
  release(){this.clearTimer(this.timer);this.timer=null;this.captureAbort?.abort();this.recording?.cancel();this.recording=null;}
  async stop(){
    if(this.state!=='listening')return;
    const token=this.sequence,id=this.id,context=this.context;
    this.update('transcribing','Transcribing locally — microphone is off.');
    try{const wave=await this.recording.finish();this.release();if(token!==this.sequence)return;
      const {text}=await this.api.goalVoiceTranscribe(id,wave);
      if(token!==this.sequence||context!==this.getContext())return;
      const limit=typeof this.limit==='function'?this.limit():this.limit,merged=appendGoalTranscript(this.readDraft(),text,limit);
      if(merged.remainder){const message=`Transcript exceeds the ${limit}-character ${this.fieldLabel} limit. Copy or shorten it below.`;this.update('idle',message);this.render({state:'idle',message,remainder:merged.remainder});}
      else {this.writeDraft(merged.value);this.update('idle',`Speech added to your ${this.fieldLabel}. Review it before ${this.reviewAction}.`);}
    }catch(error){if(token===this.sequence){this.release();await this.api.goalVoiceCancel(id).catch(()=>{});this.update('error',error.message||'Local transcription failed. Your goal is unchanged.');}}
  }
  cancel(message='Dictation cancelled. Your goal is unchanged.'){
    const id=this.id;++this.sequence;this.release();this.update('idle',message);
    if(id)this.api.goalVoiceCancel(id).catch(()=>{});
  }
}
