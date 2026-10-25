// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {cleanTour,tourFinding,mayFinishTour} from '../lib/onboarding.mjs';

const key='nodes-quick-tour-v1';
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
export function installOnboarding({api,getState,flush,busy,acceptState,run,showFinding,newInvestigation}){
  let progress;try{progress=cleanTour(JSON.parse(localStorage.getItem(key)));}catch{progress=cleanTour();}
  let working=false,prepared=null,finding=null,readSnapshot=null,saveVerified=false,setupReady=false,awaitingSetup=false,returnFocus=null,booted=false;
  const dialog=el('dialog');dialog.id='quick-tour';dialog.setAttribute('aria-labelledby','tour-title');dialog.setAttribute('aria-describedby','tour-description');document.body.append(dialog);
  const reentry=el('button','Resume quick tour','tour-reentry');reentry.type='button';reentry.hidden=true;document.body.append(reentry);
  const menu=document.getElementById('settings-items');menu.append(el('span','Help','menu-section-label'));const menuButton=el('button','Quick tour…');menuButton.type='button';menuButton.id='quick-tour-open';menu.append(menuButton);
  function persist(){try{localStorage.setItem(key,JSON.stringify(progress));}catch{status('Tour progress could not be saved on this computer. Your investigation uses its own saving system.');}menuButton.textContent=['active','paused'].includes(progress.status)?'Resume quick tour…':'Quick tour…';reentry.hidden=progress.status!=='paused';}
  function close(){if(dialog.open)dialog.close();}
  function show(){if(!dialog.open){returnFocus=document.activeElement;dialog.showModal();}paint();}
  function pause(){progress.status='paused';persist();awaitingSetup=false;if(working&&progress.step===0)api.connectionCancel().catch(()=>{});close();returnFocus?.focus?.();}
  function skip(){progress.status='skipped';persist();close();returnFocus?.focus?.();}
  function status(text){const target=dialog.querySelector('#tour-status');if(target)target.textContent=text;}
  function action(label,fn,{secondary=false,disabled=false,id}={}){const button=el('button',label,secondary?'tour-secondary':'tour-primary');button.type='button';button.disabled=disabled;if(id)button.id=id;button.onclick=()=>perform(fn);return button;}
  async function perform(fn){if(working)return;working=true;const primary=dialog.querySelector('.tour-primary');if(primary)primary.disabled=true;try{await fn();}catch(error){if(dialog.open){paint();status(error.message||'That did not finish. Your progress is kept. Try again when you are ready.');}}finally{working=false;const primary=dialog.querySelector('.tour-primary');if(primary)primary.disabled=false;}}
  async function prepare(){
    if(busy())throw Error('Finish or stop the current operation first. Your place in the tour is kept.');
    if(prepared&&getState()?.id===progress.investigationId)return prepared;
    await flush();const result=await api.tutorialExample(progress.investigationId);
    if(!result)throw Error('Your current investigation is still open. Finish saving it, then return to the tour.');
    prepared=result;progress.investigationId=result.state.id;persist();acceptState(result.state);return result;
  }
  async function inspectStatus(){
    if(!progress.investigationId)return null;
    const state=await api.tutorialStatus(progress.investigationId);finding=tourFinding(state,progress.investigationId);return state;
  }
  async function verifySaved(){
    saveVerified=false;status('Checking that your result and workspace are saved…');
    if(busy())throw Error('Your investigation is still running. Wait for it to finish or stop it first.');
    await prepare();await flush();const state=await inspectStatus();
    if(!finding)throw Error('There is no supported finding yet. Return to the example and try again.');
    const snapshot=await api.snapshot(progress.investigationId,finding.evidenceId);
    const readable=typeof snapshot.text==='string'&&snapshot.text.includes(finding.quote);
    saveVerified=mayFinishTour(progress,state,{workspaceSaved:true,snapshotReadable:readable});
    if(!saveVerified)throw Error('The finding or its evidence changed. Go back and open its supporting evidence again.');
  }
  async function advance(step){progress.step=step;progress.status='active';persist();saveVerified=false;paint();if(step===2){await inspectStatus();paint();}if(step===3){await verifySaved();paint();}}
  async function open(){
    if(busy())return;
    document.getElementById('node-settings').open=false;
    if(['done','skipped'].includes(progress.status)){progress=cleanTour();prepared=null;finding=null;readSnapshot=null;setupReady=false;}
    if(progress.status==='new')show();else{progress.status='active';persist();show();if(progress.step===1||progress.step===2){await inspectStatus();paint();}if(progress.step===3){await verifySaved();paint();}}
  }
  function paint(){
    const hadFocus=dialog.open&&dialog.contains(document.activeElement);dialog.replaceChildren();
    const welcome=progress.status==='new';
    if(welcome){const image=el('img',undefined,'tour-brand');image.src='../assets/rea-nodes.svg';image.alt='';dialog.append(image);}
    const eyebrow=el('p',welcome?'A gentle start':`Step ${progress.step+1} of 4`,'tour-eyebrow');dialog.append(eyebrow);
    if(!welcome){const bar=el('div',undefined,'tour-progress');bar.setAttribute('aria-hidden','true');for(let i=0;i<4;i++)bar.append(el('span',undefined,i<=progress.step?'passed':''));dialog.append(bar);}
    const titles=['Let’s get ready.','Try one small example.','Here’s your first finding.','Your work is saved.'];
    const title=el('h2',welcome?'Make yourself at home.':progress.step===3&&!saveVerified?'Let’s check your saved work.':titles[progress.step]);title.id='tour-title';dialog.append(title);
    const descriptions=['Connect your agent, then we’ll check the tools for a tiny code example.','Ask when a small program makes shipping free. We’ll inspect its code without running it.','A finding tells you what the evidence supports. Let’s look at one together.','Find this example again under Investigations. You can keep exploring whenever you like.'];
    const description=el('p',welcome?'Turn questions about software into a map of findings and evidence. We’ll take it one step at a time.':progress.step===3&&!saveVerified?'We’ll confirm that your finding, evidence and workspace have been saved.':descriptions[progress.step]);description.id='tour-description';dialog.append(description);
    const feedback=el('p');feedback.id='tour-status';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');dialog.append(feedback);
    const actions=el('div',undefined,'tour-actions');
    if(welcome){actions.append(action('Guide me',async()=>{progress.status='active';persist();await advance(0);}),action('Start exploring',skip,{secondary:true}));dialog.append(el('p','You can pause at any time. Quick tour is always in Settings → Help.','tour-note'));}
    else if(progress.step===0){
      actions.append(action(setupReady?'Next: try the example':'Get connected',async()=>{
        if(setupReady)return advance(1);
        const info=await api.connectionInfo();
        if(!info.configured){awaitingSetup=true;close();document.dispatchEvent(new CustomEvent('setup-agent-request'));return;}
        status('Your agent is selected. Checking this example’s inspection tools…');const example=await prepare();if(progress.status!=='active')return;
        const result=await api.setupLaunch(example.sourceFile);
        if(result.operationCheck?.state!=='ready')throw Error('The example’s inspection tools need attention. Open inspection setup, check the reported issue, then try again.');
        setupReady=true;paint();status('The code inspection works. Your first question will also check that your agent can respond.');
      }));
      const help=el('details');help.append(el('summary','Need help with inspection tools?'));help.append(action('Open inspection setup',()=>{awaitingSetup=true;close();document.getElementById('setup-open').click();},{secondary:true}));dialog.append(help);
      dialog.append(el('p','REA inspects the source. Your agent explains the evidence. No extra native-analysis tools are needed for this example.','tour-note'));
    }else if(progress.step===1){
      dialog.append(el('pre','export function shippingFee(subtotal) {\n  return subtotal >= 50 ? 0 : 5;\n}'));
      dialog.append(el('p','“When is shipping free, and what is the fee otherwise?”'));
      actions.append(action(finding?'Next: read the finding':'Start example',async()=>{
        if(finding)return advance(2);
        const example=await prepare();if(progress.status!=='active')return;status('Your agent is inspecting the example. This may take a little while.');
        const stop=el('button','Stop inspection','tour-secondary');stop.type='button';stop.id='tour-stop';stop.onclick=()=>api.stop();actions.append(stop);
        try{await run(example.question);}finally{stop.remove();}await inspectStatus();
        if(!finding)throw Error('The example has not produced a supported finding yet. Your request and any saved progress are kept. Check the workspace message, then try again.');
        paint();status('A finding with supporting evidence is saved. Read it when you are ready.');
      }));
      dialog.append(el('p','Start sends this source and question to your selected AI agent and may use your account’s credits. Nothing starts until you choose Start.','tour-note'));
      if(working)actions.append(action('Stop inspection',()=>api.stop(),{secondary:true}));
    }else if(progress.step===2){
      if(finding){dialog.append(el('blockquote',finding.text));dialog.append(el('p',finding.category.key==='observed'?'Observed · directly supported by inspection.':'Inferred · an interpretation supported by evidence.','tour-note'));
        const seen=progress.evidenceKey===finding.key&&readSnapshot;
        if(seen){dialog.append(el('pre',finding.quote));dialog.append(el('p','This saved quotation supports the finding. Code inspection alone does not verify runtime behavior.','tour-note'));}
        actions.append(action(seen?'Next: check it’s saved':'Show the evidence',async()=>{
          if(seen)return advance(3);
          await prepare();const state=await inspectStatus();if(!finding)throw Error('This finding is no longer supported. Return to the example.');
          const snapshot=await api.snapshot(state.id,finding.evidenceId);if(!snapshot.text?.includes(finding.quote))throw Error('The saved quotation could not be read. Your investigation is kept. Return to the example to retry.');
          readSnapshot=snapshot;progress.evidenceKey=finding.key;persist();await showFinding(finding);paint();
        }));
        const labels=el('details');labels.append(el('summary','What do the evidence labels mean?'),el('p','Observed: directly supported by inspection. Inferred: an interpretation of evidence. Unknown: not established.'));dialog.append(labels);
      }else{status('No supported finding is available yet. Return to the example to continue.');actions.append(action('Return to the example',()=>advance(1)));}
    }else{
      if(saveVerified){dialog.append(el('p','You inspected a source, opened its evidence and saved an investigation.'));
        const more=el('details');more.append(el('summary','What can I do next?'),el('p','Open a node to ask a follow-up. Use File → Save As to save a document for transfer or backup. npm updates keep your investigations outside the installed package.'));dialog.append(more);
        actions.append(action('Try my own source',async()=>{await verifySaved();if(progress.status!=='active')return;await newInvestigation();progress.status='done';persist();close();}),action('Keep exploring this example',async()=>{await verifySaved();if(progress.status!=='active')return;progress.status='done';persist();close();},{secondary:true}));
      }else actions.append(action('Check saving again',async()=>{await verifySaved();paint();}));
    }
    dialog.append(actions);
    if(!welcome){const footer=el('div',undefined,'tour-footer');const back=el('button','Back');back.type='button';back.disabled=progress.step===0;back.onclick=()=>perform(()=>advance(progress.step-1));const later=el('button','Finish later');later.type='button';later.onclick=pause;footer.append(back,later);dialog.append(footer);const restart=el('details');restart.append(el('summary','Need a fresh start?'),el('p','Your previous example stays in Investigations.'));restart.append(action('Use a fresh example',async()=>{prepared=finding=readSnapshot=null;setupReady=false;progress.investigationId=progress.evidenceKey=null;await advance(0);},{secondary:true}));dialog.append(restart);}
    if(dialog.open){const target=dialog.querySelector('.tour-primary');if(hadFocus||document.activeElement===dialog)target?.focus({preventScroll:true});}
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(progress.status==='new')skip();else pause();});
  document.getElementById('connection-dialog').addEventListener('close',()=>{if(awaitingSetup){awaitingSetup=false;show();status('When you’re ready, choose Get connected to check the example.');}});
  menuButton.onclick=()=>perform(open);reentry.onclick=()=>perform(open);
  persist();
  return {async boot(result){if(booted)return;booted=true;const state=result.state,returning=!!(state.messages?.length||state.evidence?.length||state.draft?.trim()||result.list?.length>1);if(progress.status==='new'&&!returning)show();else if(progress.status==='active'){progress.status='paused';persist();}},open};
}
