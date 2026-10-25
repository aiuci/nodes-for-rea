// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {feedbackHeading,feedbackButton} from './user-feedback.js';
import {rankApplicationCandidates} from '../lib/application-candidates.mjs';
import {recoveryFor,pendingTargetAttempt,applicationFilename} from '../lib/target-recovery-state.mjs';
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
export function renderTargetRecovery(panel,view,item){
  const attempt=item?.type==='attempt'?item.attempt:item?.type==='root'?pendingTargetAttempt(view.state):null,recovery=recoveryFor(attempt);if(!recovery)return false;
  const section=el('section');section.className='target-recovery';section.dataset.attemptId=attempt.id;
  if(recovery.status==='ready'&&view.busy&&!recovery.continuedAt){section.append(el('h2','Inspecting…'),el('strong',applicationFilename(recovery.selected)),el('p',recovery.selected.path),el('p','Continuing this investigation with your selected application.'));panel.append(section);view.askOpen=false;return true;}
  if(recovery.continuedAt){section.append(el('h2','Application selected'),el('p',`${view.state.status==='inspecting'?'Inspecting…':'Inspection continued'} using ${applicationFilename(recovery.selected)}.`));const details=el('details');details.append(el('summary','Technical details'),el('p',attempt.reason),el('p',recovery.selected?.path));section.append(details);panel.append(section);view.askOpen=false;return true;}
  if(recovery.selected&&view.state.preflight?.status==='blocked'&&!recovery.continuedAt){section.append(feedbackHeading('Inspection blocked','native-tool'),el('strong',applicationFilename(recovery.selected)),el('p','Your application is selected. Its inspection tools need attention; your request and draft are kept.'));const setup=feedbackButton('Continue setup',()=>view.actions.openSetup?.(),{primary:true,icon:'tools'});setup.disabled=!!view.busy;setup.onclick=()=>view.actions.openSetup?.();section.append(setup);const choice=el('button','Review application choice');choice.type='button';choice.onclick=()=>view.actions.recoverTarget(attempt.id);section.append(choice);panel.append(section);view.askOpen=false;return true;}
  section.append(feedbackHeading('Choose application','document'));
  const run=(text,action)=>{const b=el('button',text);b.type='button';b.dataset.work='true';b.disabled=!!view.busy||!!view.fileBusy;b.onclick=action;return b;};
  if(recovery.status==='needed')section.append(el('p','Nodes can check installed application records and shortcuts to help find the right file.'),run('Find installed application',()=>view.actions.recoverTarget(attempt.id)));
  else if(recovery.status==='ready'){
    const location=el('p',recovery.selected.path);location.className='target-location';section.append(el('strong',applicationFilename(recovery.selected)),location,el('p','Continue this investigation using the selected file. Static inspection does not launch the application.'));
    section.append(run('Inspect this application',()=>view.actions.continueTarget(attempt)),run('Review application choice',()=>view.actions.recoverTarget(attempt.id)));
  }else if(recovery.candidates?.length){
    const count=recovery.candidates.length;section.append(el('h3',`Found ${count} possible application target${count===1?'':'s'}`),el('p','Choose which one you’d like REA to inspect.'));
    const waiting=el('p','Waiting for your selection');waiting.setAttribute('role','status');section.append(waiting);
    const candidates=rankApplicationCandidates(recovery.candidates,{locator:recovery.originalLocator||recovery.locator,partial:recovery.limitations?.some(text=>/partial|bounded|stopped at/.test(text))});
    section.append(el('p',candidates.some(c=>c.recommended)?'A recommended starting point is shown first. Review the evidence and choose any application below.':'There is no single confirmed main application. Review the choices; nothing is selected automatically.'));
    let selecting=false;
    for(const [role,title]of [['main','Likely main applications'],['other','Other application choices'],['related','Other components']]){
      const group=candidates.filter(c=>c.choiceRole===role);if(!group.length)continue;section.append(el('h3',title));
      for(const candidate of group){const row=el('section');row.className='target-candidate';row.dataset.choiceRole=role;row.dataset.recommended=String(candidate.recommended);const heading=el('h3',applicationFilename(candidate));row.append(heading);if(candidate.recommended)row.append(el('strong','Recommended starting point'));const location=el('p',candidate.path);location.className='target-location';row.append(location,el('p',candidate.choiceReason));if(candidate.reason)row.append(el('p',candidate.reason));
        const button=run('Inspect this application',async event=>{if(event.detail>1||selecting||view.busy||view.fileBusy)return;selecting=true;const controls=[...section.querySelectorAll('button[data-work]')];controls.forEach(b=>b.disabled=true);try{await view.actions.recoverTarget(attempt.id,candidate.path);}finally{selecting=false;if(section.isConnected)controls.forEach(b=>b.disabled=!!view.busy||!!view.fileBusy);}});button.className='target-select';button.setAttribute('aria-label',`Inspect this application: ${applicationFilename(candidate)}`);row.append(button);section.append(row);}
    }
  }else section.append(el('p','No supported application file could be identified here. Choose another application to continue.'));
  section.append(run('Choose another application…',()=>view.actions.recoverTarget(attempt.id,null,true)));
  const details=el('details');details.append(el('summary','Technical details'),el('p',`Selected folder: ${recovery.originalLocator||recovery.locator}`),el('p',attempt.reason||'Application identity was unresolved.'));for(const limit of recovery.limitations||[])details.append(el('p',limit));section.append(details);panel.append(section);view.askOpen=false;return true;
}
