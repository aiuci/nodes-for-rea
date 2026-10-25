// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {createWorkClock} from './work-clock.js';
export function installDiscoveryFeedback({stop,restart,refresh}){
  const panel=document.getElementById('node-workbench'),heading=panel.querySelector('.node-heading');
  const update=document.createElement('section');update.id='node-update';update.hidden=true;update.setAttribute('role','status');
  const explanation=document.createElement('p');explanation.textContent='An app update is ready. Restart to continue; your source and draft will be kept.';
  const updateButton=document.createElement('button');updateButton.id='node-update-restart';updateButton.type='button';updateButton.textContent='Restart to update';updateButton.onclick=restart;update.append(explanation,updateButton);heading.after(update);
  const status=document.createElement('section');status.id='discovery-feedback';status.hidden=true;status.setAttribute('role','status');
  const frame=document.getElementById('node-panel-frame')||panel;
  const ring=document.createElement('span');ring.className='node-activity-ring discovery-activity-ring';ring.setAttribute('aria-hidden','true');ring.hidden=true;frame.append(ring);
  const statusRing=document.createElement('span');statusRing.className='node-activity-ring discovery-status-ring';statusRing.setAttribute('aria-hidden','true');statusRing.hidden=true;status.append(statusRing);
  const row=document.createElement('div');row.className='discovery-feedback-row';const spinner=document.createElement('span');spinner.className='work-spinner';spinner.setAttribute('aria-hidden','true');
  const title=document.createElement('strong');title.id='discovery-status';const elapsed=document.createElement('span');elapsed.id='discovery-elapsed';elapsed.setAttribute('aria-hidden','true');
  const cancel=document.createElement('button');cancel.type='button';cancel.id='discovery-stop';cancel.textContent='Stop';cancel.onclick=stop;
  row.append(spinner,title,elapsed,cancel);const detail=document.createElement('p');detail.id='discovery-phase';detail.setAttribute('aria-live','polite');const source=document.createElement('details');source.id='discovery-source';const sourceLabel=document.createElement('summary');sourceLabel.textContent='Source / question';const sourceText=document.createElement('p');sourceText.id='discovery-source-text';source.append(sourceLabel,sourceText);status.append(row,detail,source);update.after(status);
  const clock=createWorkClock(elapsed);
  let context=null,owner='core',selected='core',visible=false,subject='';
  const show=()=>{status.hidden=!visible||selected!==owner||selected.startsWith('direction:');const working=visible&&clock.running&&selected===owner;ring.hidden=!working;statusRing.hidden=!working;ring.style.borderRadius=getComputedStyle(panel).borderRadius;frame.classList.toggle('discovery-working',working);status.classList.toggle('running',working);};
  const clearTimer=()=>clock.stop();
  document.addEventListener('nodes-appearance-change',show);
  new ResizeObserver(()=>panel.style.setProperty('--panel-heading-height',`${heading.offsetHeight}px`)).observe(heading);
  return {
    context(id){if(context===id)return;context=id;clearTimer();visible=false;show();panel.setAttribute('aria-busy','false');},
    bind(nodeId,label){owner=nodeId||'core';subject=label||'';show();},
    view(nodeId){selected=nodeId||'core';show();panel.setAttribute('aria-busy',String(clock.running&&selected===owner));},
    source(text){sourceText.textContent=text;},
    start(label,stoppable=false){clock.start();visible=true;show();status.dataset.state='working';spinner.hidden=false;title.textContent=subject?`${subject} · ${label}`:label;detail.textContent=stoppable?'Waiting for the next discovery update…':'Checking the app and saving your source…';cancel.hidden=!stoppable;panel.setAttribute('aria-busy',String(selected===owner));refresh();},
    phase(text){if(clock.running)detail.textContent=owner.startsWith('direction:')?'':text;},
    finish(label,text){clearTimer();visible=true;show();status.dataset.state='finished';status.dataset.outcome=/fail|blocked|stopped|no completed/i.test(label)?'boundary':'saved';spinner.hidden=true;cancel.hidden=true;title.textContent=subject?`${subject} · ${label}`:label;detail.textContent=text;panel.setAttribute('aria-busy','false');refresh();},
    clear(){clearTimer();visible=false;show();panel.setAttribute('aria-busy','false');refresh();},
    update(changed,disabled=false){update.hidden=!changed;updateButton.disabled=disabled;refresh();},
    restarting(disabled){updateButton.disabled=disabled;updateButton.textContent=disabled?'Saving and restarting…':'Restart to update';}
  };
}
