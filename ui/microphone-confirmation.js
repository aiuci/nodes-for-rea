// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const api=window.investigation;
const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const dialog=make('dialog',undefined,'delete-dialog microphone-dialog');dialog.id='microphone-confirmation';dialog.setAttribute('aria-labelledby','microphone-confirmation-title');dialog.setAttribute('aria-describedby','microphone-confirmation-description microphone-confirmation-scope');
const close=make('button','×','delete-dialog-close');close.type='button';close.setAttribute('aria-label','Cancel dictation permission');
const icon=make('span',undefined,'delete-dialog-icon');icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';
const heading=make('h2','Allow local dictation?');heading.id='microphone-confirmation-title';
const description=make('p','Use your microphone to dictate text into the selected field. Audio is transcribed on this computer by local Whisper, and temporary audio is deleted after transcription.');description.id='microphone-confirmation-description';
const scope=make('p','Click the microphone to start each recording; Stop or Cancel ends it. Allow once for this app session. You’ll be asked again after reopening.');scope.id='microphone-confirmation-scope';
const note=make('p','Your transcript stays editable. Review questions before starting an investigation or planning a route through your selected AI connection.','delete-dialog-kept');
const footer=make('div',undefined,'delete-dialog-actions'),cancel=make('button','Cancel'),allow=make('button','Allow dictation','microphone-confirm');cancel.type=allow.type='button';footer.append(cancel,allow);dialog.append(close,icon,heading,description,scope,note,footer);document.body.append(dialog);
let token,opener;
const dismiss=()=>{token=null;if(dialog.open)dialog.close();if(opener?.isConnected)opener.focus({preventScroll:true});};
const answer=approved=>{if(!token)return;const current=token;dismiss();api.answerMicrophoneConfirmation(current,approved).catch(()=>{});};
cancel.onclick=close.onclick=()=>answer(false);allow.onclick=()=>answer(true);dialog.addEventListener('cancel',event=>{event.preventDefault();answer(false);});
api.onMicrophoneConfirmation(request=>{if(token)answer(false);token=request.token;opener=document.activeElement;dialog.showModal();cancel.focus();});
api.onMicrophoneConfirmationDismiss(current=>{if(current===token)dismiss();});
