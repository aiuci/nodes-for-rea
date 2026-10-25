// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {renderUserError,clearUserError} from './user-feedback.js';
import {providerSummaries} from './rea-providers.mjs';
import {engineReadiness} from '../lib/setup-readiness.mjs';
const api=window.investigation,$=id=>document.getElementById(id);
const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
let working=false,checkingEngine=false;
const report=text=>{const activity=$('workspace-notice');if(text&&typeof text==='object')renderUserError(activity,text,{context:'setup'});else{clearUserError(activity,text);activity.hidden=!text;}};
function setWorking(value){working=value;document.dispatchEvent(new CustomEvent('rea-operation-state',{detail:value}));sync();}
function sync(){
  const unavailable=working||$('send').disabled;
  for(const button of document.querySelectorAll('[data-rea-work],.run-declared-checks'))button.disabled=unavailable;
}
function settings(){return {reaPath:$('rea-path').value.trim(),browser:$('rea-browser').value.trim(),ghidraPath:$('rea-ghidra').value.trim(),javaHome:$('rea-java').value.trim()};}
function showInfo(info){
  const values=info.settings||info.config||info;
  for(const [id,key]of [['rea-path','reaPath'],['rea-browser','browser'],['rea-ghidra','ghidraPath'],['rea-java','javaHome']])if(typeof values[key]==='string')$(id).value=values[key];
  const details=$('rea-availability');details.replaceChildren();$('rea-use-bundled').hidden=!info.bundled?.available;
  const checked=info.status||values.lastCheck||{},session=checked.session||{};
  const capability=info.capabilities||info.availability||info.providers||session.providers||{};
  const tools=info.tools||checked.tools||capability.tools;
  if(checked.toolCount||Array.isArray(tools))details.append(node('p',`${checked.toolCount||tools.length} analysis tools advertised by the connected engine.`));
  if(info.provenance){const installation=engineReadiness(info).installation;details.append(node('p',installation.engine),node('p',installation.runtime));}
  if(info.reason||checked.reason)details.append(node('p',info.reason||checked.reason));
  if(checked.session){
    for(const card of engineReadiness(info).cards){
      const labels={ready:'Available',missing:'Setup needed',unavailable:'Unavailable',unknown:'Not checked'};
      details.append(node('p',`${card.label}: ${labels[card.state]}. ${card.detail}${card.reason&&card.state!=='ready'?` ${card.reason}`:''}`));
      if(card.remediation&&card.state!=='ready'&&card.remediation!==card.reason)details.append(node('p',card.remediation));
    }
  }else for(const summary of providerSummaries(capability))details.append(node('p',summary));
  if(!details.children.length)details.append(node('p','Target-specific availability is established by an engine check and the selected target.'));
}

export async function runDeclaredChecks(state,message){
  if(working||$('send').disabled)return;
  if(!api.verify){report('Restart to load the behavioral check connection.');return;}
  setWorking(true);report('Choose your declared check manifest. It may execute the target and arguments declared in that file.');
  try{await api.draft(state.id,$('message').value);const updated=await api.verify(state.id,message.id);if(updated){updated.draft=$('message').value;document.dispatchEvent(new CustomEvent('rea-state-changed',{detail:updated}));report('Saved declared check results. Review their scope, failures and untested cases in this result.');}else report('Check selection canceled.');}
  catch(error){report(error.message.replace(/^Error invoking remote method '[^']+': Error: /,''));}
  finally{try{await api.draft(state.id,$('message').value);}catch(error){report(`Could not save your draft: ${error.message}`);}setWorking(false);}
}

export async function createFinishedAsset(state,message){
  if(working||$('send').disabled)return;
  if(!api.finalize){report('Restart to load finished asset generation.');return;}
  setWorking(true);report('Creating the finished asset from this saved branch’s evidence…');
  try{await api.draft(state.id,$('message').value);const updated=await api.finalize(state.id,message.id);if(updated){updated.draft=$('message').value;document.dispatchEvent(new CustomEvent('rea-state-changed',{detail:updated}));report('Saved the finished asset at both reading depths.');}}
  catch(error){report(error.message.replace(/^Error invoking remote method '[^']+': Error: /,''));}
  finally{try{await api.draft(state.id,$('message').value);}catch(error){report(`Could not save your draft: ${error.message}`);}setWorking(false);}
}

if(!$('rea-open')){
  const open=node('button','REA engine');open.id='rea-open';open.type='button';open.dataset.reaWork='true';$('connection-open').before(open);
  const add=node('button','Add target…');add.id='rea-add-target';add.type='button';add.dataset.reaWork='true';$('folder').after(add);
  add.onclick=async()=>{try{if(!api.chooseTarget)throw new Error('Restart to load target selection.');const selected=await api.chooseTarget();const file=typeof selected==='string'?selected:selected?.path||selected?.locator;if(file){$('message').value+=`${$('message').value.trim()?'\n':''}"${file}"\n`;$('message').dispatchEvent(new Event('input'));$('message').focus();}}catch(error){report(error);}};
  const dialog=node('dialog');dialog.id='rea-dialog';dialog.setAttribute('aria-labelledby','rea-title');
  const heading=node('div');heading.className='rea-heading';const title=node('h2','REA engine setup');title.id='rea-title';const close=node('button','Close');close.type='button';close.onclick=()=>dialog.close();heading.append(title,close);dialog.append(heading,node('p','Nodes is the workspace; REA is the inspection engine it needs to investigate targets. Connect a working REA installation here. Your AI agent is connected separately in Setup.'));
  function field(parent,id,labelText,placeholder,kind){
    const label=node('label',labelText);label.htmlFor=id;const input=node('input');input.id=id;input.placeholder=placeholder;input.autocomplete='off';input.dataset.reaWork='true';const browse=node('button','Browse');browse.type='button';browse.dataset.reaWork='true';browse.setAttribute('aria-label',`Browse for ${labelText.toLowerCase()}`);browse.onclick=async()=>{try{if(!api.reaPick)throw new Error('Restart to load engine settings.');const selected=await api.reaPick(kind);if(selected)input.value=selected;}catch(error){renderUserError($('rea-status'),error,{context:'setup'});}};const row=node('div');row.className='rea-field';row.append(input,browse);parent.append(label,row);
  }
  field(dialog,'rea-path','REA executable or JavaScript entry point','Leave blank to detect the installed engine','rea');
  const optional=node('details');optional.append(node('summary','Additional REA tools · required only for specific targets'),node('p','For Ghidra-based native decompilation, REA needs a compatible Ghidra installation and its required full JDK. These are separate REA prerequisites. They are not needed to open Nodes or use available JavaScript inspection routes. No tools are installed by this check.'));
  field(optional,'rea-browser','Browser executable','Use the engine’s detected browser','browser');field(optional,'rea-ghidra','Ghidra folder','Use an existing Ghidra installation','ghidra');field(optional,'rea-java','Java home folder','Use the configured Java runtime','java');dialog.append(optional);
  const restore=node('button','Use included engine');restore.id='rea-use-bundled';restore.type='button';restore.dataset.reaWork='true';restore.hidden=true;dialog.append(restore);restore.onclick=async()=>{checkingEngine=true;cancel.hidden=false;setWorking(true);status.textContent='Verifying the engine included with this app…';try{showInfo(await api.reaRestoreBundled());status.textContent='Included engine verified and selected. Return to your saved request and retry.';failure.hidden=true;}catch(error){showFailure(error);}finally{checkingEngine=false;cancel.hidden=true;setWorking(false);}};
  const test=node('button','Review & save tool paths');test.id='rea-test';test.type='button';test.dataset.reaWork='true';dialog.append(test);
  const cancel=node('button','Cancel check');cancel.id='rea-cancel';cancel.type='button';cancel.hidden=true;cancel.onclick=()=>api.connectionCancel?.();dialog.append(cancel);dialog.addEventListener('close',()=>{if(checkingEngine)api.connectionCancel?.();});
  const status=node('p');status.id='rea-status';status.setAttribute('role','status');dialog.append(status);
  const failure=node('details');failure.hidden=true;failure.append(node('summary','Technical diagnostics'));const failureText=node('pre');failure.append(failureText);dialog.append(failure);function showFailure(error){renderUserError(status,error,{context:'setup',message:'Your previous tool selections remain available. Use the included engine or review the selected tool paths.',action:{label:'Use included engine',run:()=>restore.click()}});const raw=error.message.replace(/^Error invoking remote method '[^']+': Error: /,'');if(/canceled|cancelled/i.test(raw)){failure.hidden=true;return;}failureText.textContent=raw;failure.hidden=false;failure.open=false;}
  const availability=node('div');availability.id='rea-availability';dialog.append(availability,node('p','This connection check does not inspect a target. Provider availability can differ by target type. Settings are saved after a successful check.'));
  document.body.append(dialog);
  open.onclick=async()=>{try{if(!api.reaInfo)throw new Error('Restart to load the REA engine connection.');showInfo(await api.reaInfo());failure.hidden=true;status.textContent='Check the engine connection to see available analysis providers.';dialog.showModal();}catch(error){report(error);}};
  test.onclick=async()=>{checkingEngine=true;cancel.hidden=false;setWorking(true);status.textContent='Checking the engine connection…';try{if(!api.reaTest)throw new Error('Restart to load the REA engine connection.');const info=await api.reaTest(settings());showInfo(info);status.textContent=info.available===false?`Engine unavailable. ${info.reason||info.status?.reason||'Review the selected engine path.'}`:`${info.message||'Local tool paths saved; engine responded. Review individual native checks in Setup before approving an inspection.'} No target was inspected by this check.`;}catch(error){showFailure(error);}finally{checkingEngine=false;cancel.hidden=true;setWorking(false);}};
  new MutationObserver(sync).observe($('send'),{attributes:true,attributeFilter:['disabled']});sync();
}
