// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {renderUserError,clearUserError} from './user-feedback.js';
import {GoalVoiceController} from './goal-voice-core.js';
import {goalAudio} from './goal-audio.js';
import {AGENT_GOAL_LIMIT} from '../lib/agent-goal.mjs';
import {createWorkClock} from './work-clock.js';

export function installGoalVoice({api,getContext,rememberDraft,onBusy,capture=goalAudio}){
  const $=id=>document.getElementById(id),goal=$('agent-goal'),button=$('agent-mic'),cancel=$('agent-mic-cancel'),status=$('agent-voice-status');
  const feedback=status.parentElement,setup=document.createElement('button'),elapsed=document.createElement('span');setup.id='agent-voice-setup';setup.type='button';setup.textContent='Download local dictation (199 MB)';setup.hidden=true;elapsed.id='agent-voice-elapsed';elapsed.className='work-elapsed';elapsed.setAttribute('aria-hidden','true');feedback.append(elapsed,setup);const clock=createWorkClock(elapsed);
  let available=false,canInstall=false,blocked=false,active=false,expanded=false,phase='idle',description='Checking local dictation...';
  const showError=(message,install=false)=>{const denied=/download was blocked/i.test(message),network=/could not download|download failed|fetch failed/i.test(message);return renderUserError(status,new Error(message||description),{context:'dictation',...(install?{category:denied?'network-blocked':network?'connection':'dictation',title:denied?'Local dictation download was blocked':network?'Local dictation could not download':'Local dictation setup did not finish',message:denied?'Windows denied network access for Nodes. Check network or security settings for this app, then retry. Microphone is off; your typed goal is unchanged.':network?'Check your internet connection and try the download again. Microphone is off; your typed goal is unchanged.':'Setup did not finish. Your typed goal is unchanged and the microphone is off. Review the details before retrying.'}:{}),action:install?{label:'Retry download',run:()=>setup.click()}:{label:'Type your goal instead',run:()=>goal.focus()}});};
  const refresh=()=>{button.disabled=(!available&&!canInstall||blocked||!getContext())&&!active;setup.hidden=!canInstall||active;setup.disabled=blocked||active||!getContext();feedback.hidden=!(expanded||active);if(!active)button.setAttribute('aria-label',!available&&canInstall?'Set up local dictation':'Dictate goal');};
  const controller=new GoalVoiceController({api,capture,getContext,limit:AGENT_GOAL_LIMIT,readDraft:()=>goal.value,
    writeDraft:value=>{goal.value=value;rememberDraft(value);goal.dispatchEvent(new Event('input',{bubbles:true}));goal.focus();},
    render:({state,message,remainder})=>{
      active=['installing','preparing','listening','transcribing'].includes(state);expanded=true;if(phase!==state){clock.clear();if(active)clock.start();phase=state;}onBusy(active);button.dataset.state=state;feedback.dataset.state=state;
      button.setAttribute('aria-label',state==='listening'?'Stop goal dictation':active?'Cancel goal dictation':'Dictate goal');
      button.setAttribute('aria-pressed',String(active));button.title=state==='listening'?'Stop recording':active?'Cancel dictation':description;
      $('agent-mic-icon').hidden=active;$('agent-mic-action').textContent=state==='listening'?'Stop':active?'Cancel':'';
      cancel.hidden=!active;if(state==='error')showError(message,!available&&canInstall);else clearUserError(status,message||description);status.hidden=false;
      if(remainder){$('agent-voice-overflow').hidden=false;$('agent-voice-overflow-text').value=remainder;}
      refresh();
    }});
  button.onclick=()=>{expanded=true;refresh();if(!available&&canInstall&&!active){clearUserError(status,description);return;}if(controller.state==='listening')controller.stop();else if(active)controller.cancel();else{document.dispatchEvent(new CustomEvent('rea-dictation-start',{detail:button}));$('agent-voice-overflow').hidden=true;controller.start();}};
  cancel.onclick=()=>controller.cancel();
  const acceptInfo=info=>{available=info.available&&capture.supported();canInstall=!!info.canInstall;description=available?`Local Whisper · English. Audio stays on this computer. Click the mic, then Stop. Review before planning.`:info.reason||'Microphone recording is unsupported here. Typed goals still work.';if(!available&&!canInstall)showError(description);else clearUserError(status,description);status.hidden=false;button.title=description;refresh();};
  setup.onclick=async()=>{document.dispatchEvent(new CustomEvent('rea-dictation-start',{detail:button}));const info=await controller.install();if(info){acceptInfo(info);document.dispatchEvent(new CustomEvent('rea-dictation-ready',{detail:info}));goal.focus();}};
  document.addEventListener('rea-dictation-start',event=>{if(event.detail!==button&&active)controller.cancel();});
  document.addEventListener('rea-dictation-ready',event=>acceptInfo(event.detail));
  const unsubscribe=api.onGoalVoiceProgress?.(event=>controller.progress(event));
  $('agent-panel').addEventListener('keydown',event=>{if(event.key==='Escape'&&active){event.preventDefault();event.stopPropagation();controller.cancel();}});
  globalThis.addEventListener('pagehide',()=>{controller.cancel('');unsubscribe?.();clock.clear();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)controller.cancel('Dictation cancelled while the app was hidden.');});
  api.goalVoiceStatus().then(acceptInfo).catch(()=>{description='Local dictation is unavailable. Typed goals still work.';renderUserError(status,new Error(description),{context:'dictation',action:{label:'Type your goal instead',run:()=>goal.focus()}});refresh();});
  refresh();
  return {cancel:()=>{if(active)controller.cancel();else clearUserError(status,description);expanded=false;$('agent-voice-overflow').hidden=true;refresh();},setBlocked:value=>{blocked=value;if(value&&active)controller.cancel();refresh();}};
}
