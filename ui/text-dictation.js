// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {GoalVoiceController} from './goal-voice-core.js';
import {goalAudio} from './goal-audio.js';
import {renderUserError,clearUserError} from './user-feedback.js';
const mic='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const eligible=field=>!field.readOnly&&!field.disabled&&(field.tagName==='TEXTAREA'||['text','search','url','email','tel'].includes(field.type));
const visible=field=>field.isConnected&&eligible(field)&&!!field.getClientRects().length&&!field.closest('[hidden],dialog:not([open])');

// Reuse the same offline audio, permission ticket and local Whisper service as
// Agent Control. Dynamic dialogs get controls when their editable fields appear.
export function installTextDictation({api,getContext,capture=goalAudio}){
 const bindings=new Map();let active=null,info=null,sequence=0,watch;
 const cancel=message=>{if(active){const binding=active;active=null;binding.controller.cancel(message||'Dictation cancelled. Your text is unchanged.');}clearInterval(watch);};
 const ready=value=>{info=value;for(const binding of bindings.values())binding.refresh();};
 const context=field=>visible(field)?getContext(field):null;
 const attach=field=>{
  if(bindings.has(field)||field.id==='agent-goal'||field.closest('.dictation-overflow')||!eligible(field))return;
  const label=(field.getAttribute('aria-label')||field.labels?.[0]?.textContent||field.placeholder||'text').trim().slice(0,160);
  const wrap=node('div',null,'dictation-field'),button=node('button',null,'text-mic'),feedback=node('div',null,'dictation-feedback'),status=node('div'),setup=node('button','Download local dictation (199 MB)'),stop=node('button','Cancel dictation'),dismiss=node('button','Dismiss'),overflow=node('textarea',null,'dictation-overflow');
  button.type=setup.type=stop.type=dismiss.type='button';button.innerHTML=mic;button.setAttribute('aria-label',`Dictate ${label}`);button.setAttribute('aria-pressed','false');button.title='Local dictation';
  const statusId=`text-dictation-status-${++sequence}`;status.id=statusId;status.setAttribute('role','status');status.setAttribute('aria-live','polite');button.setAttribute('aria-describedby',statusId);
  feedback.hidden=true;overflow.hidden=true;overflow.readOnly=true;overflow.rows=3;overflow.setAttribute('aria-label','Transcript to copy or shorten');
  field.before(wrap);wrap.append(field,button,feedback);feedback.append(status,setup,stop,dismiss,overflow);
  const binding={field,button,wrap,feedback,refresh:()=>{
   const hidden=!eligible(field),disabled=!visible(field),busy=['installing','preparing','listening','transcribing'].includes(wrap.dataset.dictationState),hideSetup=busy||!!info?.available||!info?.canInstall;
   if(button.hidden!==hidden)button.hidden=hidden;if(button.disabled!==disabled)button.disabled=disabled;if(setup.hidden!==hideSetup)setup.hidden=hideSetup;
  }};
  const controller=binding.controller=new GoalVoiceController({api,capture,getContext:()=>context(field),readDraft:()=>field.value,
   limit:()=>field.maxLength>=0?field.maxLength:Infinity,fieldLabel:'text',reviewAction:'using it',
   writeDraft:value=>{if(!visible(field))return;field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));field.focus({preventScroll:true});},
   render:({state,message,remainder})=>{
    const busy=['installing','preparing','listening','transcribing'].includes(state);feedback.hidden=false;wrap.dataset.dictationState=state;
    button.innerHTML=state==='listening'?'Stop':busy?'Cancel':mic;button.setAttribute('aria-label',state==='listening'?`Stop dictation for ${label}`:busy?`Cancel dictation for ${label}`:`Dictate ${label}`);button.setAttribute('aria-pressed',String(busy));
    stop.hidden=!busy;dismiss.hidden=busy;setup.hidden=busy||info?.available||!info?.canInstall;
    if(state==='error')renderUserError(status,new Error(message),{context:'dictation',message:'You can keep typing in this field. Review the microphone or local dictation details before retrying.',action:{label:'Type instead',run:()=>field.focus()}});else clearUserError(status,message);
    if(remainder){overflow.hidden=false;overflow.value=remainder;}
    if(!busy&&active===binding){active=null;clearInterval(watch);}
   }});
  const claim=()=>{document.dispatchEvent(new CustomEvent('rea-dictation-start',{detail:button}));cancel();active=binding;overflow.hidden=true;
   watch=setInterval(()=>{if(!visible(field)||controller.context!==undefined&&controller.context!==context(field)&&controller.state!=='installing')cancel('Dictation cancelled because this field or investigation changed. Your text is kept.');},100);};
  button.onclick=async()=>{
   if(controller.state==='listening')return controller.stop();
   if(['installing','preparing','transcribing'].includes(controller.state))return cancel();
   try{ready(await api.goalVoiceStatus());document.dispatchEvent(new CustomEvent('rea-dictation-ready',{detail:info}));}catch(error){controller.update('error',error.message);return;}
   if(!visible(field))return;
   if(!info.available){controller.update('error',info.reason||'Local dictation is unavailable. You can type instead.');return;}
   claim();controller.start();
  };
  setup.onclick=async()=>{claim();const value=await controller.install();if(value){ready(value);document.dispatchEvent(new CustomEvent('rea-dictation-ready',{detail:value}));field.focus();}};
  stop.onclick=()=>cancel();dismiss.onclick=()=>{feedback.hidden=true;};
  bindings.set(field,binding);
 };
 const scan=()=>{
  for(const [field,binding]of bindings){if(!field.isConnected){if(active===binding)cancel();bindings.delete(field);}else binding.refresh();}
  if(active&&!visible(active.field))cancel('Dictation cancelled because this field was closed. Your text is kept.');
  for(const field of document.querySelectorAll('input,textarea'))attach(field);
 };
 const observer=new MutationObserver(scan);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','disabled','readonly','type']});scan();
 const unsubscribe=api.onGoalVoiceProgress?.(event=>active?.controller.progress(event));
 document.addEventListener('rea-dictation-start',event=>{if(active?.button!==event.detail)cancel();});
 document.addEventListener('rea-dictation-ready',event=>ready(event.detail));
 document.addEventListener('click',event=>{for(const binding of bindings.values())if(binding!==active&&!binding.wrap.contains(event.target)&&!binding.feedback.hidden)binding.feedback.hidden=true;});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){event.preventDefault();event.stopImmediatePropagation();cancel();}},{capture:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel('Dictation cancelled while the app was hidden.');});
 globalThis.addEventListener('pagehide',()=>{cancel();observer.disconnect();unsubscribe?.();});
 api.goalVoiceStatus().then(ready).catch(()=>{});
 return {cancel};
}
