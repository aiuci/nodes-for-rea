// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {renderUserError,clearUserError} from './user-feedback.js';
import {settleSetupFailure} from './setup-failure.js';
import {setupFlow} from '../lib/setup-presentation.mjs';
import {renderSetupDiagnostic} from './setup-diagnostics.js';
import {PROVIDER_SETUP,providerSetup} from '../lib/provider-setup.mjs';
const api=window.investigation,$=id=>document.getElementById(id);
const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
const clean=error=>error.message.replace(/^Error invoking remote method '[^']+': Error: /,'');
let saved,busy=false,agents=[],selectedId=null,lastEngine=null,entryContext=null,completedSession=0,seenSession=0;
const start=node('div',undefined,'setup-start-actions'),connect=node('button','Connect your agent'),test=node('button','Start REA');connect.id='setup-connect-agent';test.id='setup-test-rea';connect.type=test.type='button';start.append(connect,test);$('connection-status').before(start);
const health=node('section');health.id='agent-readiness';health.hidden=true;health.setAttribute('aria-live','polite');
const healthMessage=node('p'),repairAgent=node('button','Repair agent connection'),copyAgent=node('button','Copy diagnostics');repairAgent.type=copyAgent.type='button';health.append(healthMessage,repairAgent,copyAgent);$('workspace-heading').after(health);
const providerStages=node('section');providerStages.id='setup-provider-stages';providerStages.setAttribute('aria-label','Provider setup');$('setup-agents').before(providerStages);
const providerNotice=node('p',undefined,'connection-note');providerNotice.id='connection-provider-notice';$('connection-provider').after(providerNotice);
const localHealth=node('p');localHealth.id='setup-agent-readiness';$('setup-agents').before(localHealth);
repairAgent.onclick=()=>open({agent:true});
copyAgent.onclick=async()=>{try{await api.setupReport();healthMessage.textContent='Diagnostics copied. Account details, paths and raw output are excluded.';}catch{renderUserError(healthMessage,new Error('Diagnostics could not be copied.'),{context:'clipboard',action:{label:'Copy diagnostics again',run:()=>copyAgent.click()}});}};
function showHealth(result){if(!result)return;saved={...saved,readiness:result};drawProviderSetup();localHealth.textContent=result.message;clearUserError(healthMessage,result.message);if(result.state==='failed')renderUserError(healthMessage,new Error(result.message),{category:'connection',title:'Your agent connection needs attention',message:result.message,action:{label:'Repair agent connection',run:()=>open({agent:true})}});health.dataset.state=result.state;health.hidden=result.state!=='failed';repairAgent.hidden=true;indicator({...saved,readiness:result});}
async function checkAgent(){showHealth(await api.connectionReadiness());}
const advanced=node('details');advanced.className='setup-advanced';advanced.append(node('summary','Details and other options'));const oldFooter=$('setup-report').parentElement;advanced.append(oldFooter);$('connection-dialog').append(advanced);
const toolOptions=node('details');toolOptions.className='setup-tool-options';toolOptions.append(node('summary','Engine options'));for(const id of ['setup-engine-installation','setup-use-bundled','setup-engine-settings','setup-ghidra-help'])toolOptions.append($(id));$('setup-rea-section').append(toolOptions);
$('connection-title').textContent='Set up Nodes';$('connection-dialog').querySelector('.setup-intro').textContent='Start REA loads the engine and verifies your selected application with a real static inspection. Checks advance from actual results. Allow up to 6 minutes for native analysis. No AI request or application execution; installations ask first.';
for(const p of $('setup-rea-section').querySelectorAll(':scope > p'))p.hidden=true;$('setup-engine-title').textContent='Is REA ready?';$('setup-agents-title').textContent='Choose your agent';
connect.onclick=()=>{$('setup-nodes-section').hidden=false;refreshAgents();};test.onclick=()=>runSetup(undefined,true);
async function refreshAgents(){waiting(true);status('Finding your agents…');try{await discover();await checkAgent();status(saved.configured?'Review the selected agent check below. No AI request was made.':'Choose an agent or sign in below.');}catch(e){showError(e);}finally{completedSession=Math.max(completedSession,seenSession);waiting(false);}}
async function runSetup(target,launch=false){
 if(busy)return;waiting(true);$('setup-rea-section').hidden=false;status(launch?'Starting REA and verifying inspection…':'Checking REA…');
 drawEngine({context:entryContext||lastEngine?.context,cards:[{id:'engine-core',state:'unknown'}],diagnostic:{components:[],verification:{state:'unknown'}}});waiting(true);
 try{finishEngine(await (launch?api.setupLaunch(target):api.setupCheck(target)));status('');}
 catch(e){settleSetupFailure($('setup-engine'),e);renderUserError($('connection-status'),e,{context:'setup',message:'Your saved request is kept. Review the failed inspection check, then retry setup.',action:{label:'Retry setup check',run:()=>runSetup(undefined,true)}});}
 finally{completedSession=Math.max(completedSession,seenSession);waiting(false);}
}
api.onSetupProgress?.(p=>{
 if(!$('connection-dialog').open||!busy||p.session&&p.session<=completedSession)return;if(p.session)seenSession=Math.max(seenSession,p.session);
 if(p.type==='snapshot'){drawEngine(p.result);waiting(busy);return;}
 const row=$('setup-engine').querySelector(`[data-check="${p.row||'operation'}"]`);if(row){row.dataset.state=p.state;const label=row.querySelector('.setup-row-status');if(label)label.textContent=p.state;const icon=row.querySelector('.setup-check-icon');if(icon)icon.textContent=['Identified','Verified working'].includes(p.state)?'✓':['Needs setup','Failed'].includes(p.state)?'!':p.state==='Checking'?'…':'·';const progress=row.querySelector('progress');if(progress){progress.hidden=!p.total;if(p.total){progress.max=p.total;progress.value=p.loaded||0;}}const detail=row.querySelector('.setup-row-detail');if(detail&&p.component)detail.textContent=p.component+(p.total?' · '+Math.floor((p.loaded||0)*100/p.total)+'%':'');}
});

const draft=()=>({provider:$('connection-provider').value,codexPath:$('connection-codex-path').value,claudePath:$('connection-claude-path').value,model:$('connection-provider').value==='claude'?$('connection-claude-model').value:$('connection-model').value,gatewayUrl:$('connection-gateway').value,agentId:$('connection-agent').value,token:$('connection-token').value});
function provider(){const selected=$('connection-provider').value;providerNotice.textContent=PROVIDER_SETUP[selected]?.notice||'Unsupported provider.';for(const name of ['codex','claude','claw'])$('connection-'+name).hidden=selected!==(name==='claw'?'openclaw':name);}
function waiting(value){busy=value;for(const e of $('connection-dialog').querySelectorAll('input,select,button'))if(!['connection-close','connection-cancel','setup-device-page'].includes(e.id))e.disabled=value;$('connection-cancel').hidden=!value;}
function showError(error){renderUserError($('connection-status'),error,{actions:{agent:()=>{$('setup-nodes-section').hidden=false;$('connection-provider').focus();},setup:()=>runSetup(undefined,true)}});$('setup-device-page').hidden=true;}
function status(text){clearUserError($('connection-status'),text);$('setup-device-page').hidden=true;}
function indicator(info,count){const n=$('connection-indicator');const label=info.readiness?.state==='failed'?'Agent connection needs repair · open Settings':info.configured?`${info.provider==='claude'?'Claude Code':info.provider==='openclaw'?'OpenClaw':'Codex'} selected · access checked when you investigate`:count?`${count} signed-in agent${count===1?'':'s'} detected · choose in Settings`:'Agent settings · choose or sign in when needed';n.title=label;n.setAttribute('aria-label',label);n.dataset.state=info.configured?'selected':count?'detected':'available';}
function drawProviderSetup(){
 const setup=providerSetup(saved.provider,saved);providerStages.replaceChildren();providerStages.dataset.releaseStatus=setup.releaseStatus;
 providerStages.append(node('p',setup.notice,'connection-note'));const steps=node('ol');steps.className='connection-note';
 for(const step of setup.steps){const row=node('li');row.dataset.providerStep=step.id;row.dataset.state=step.state;row.append(node('strong',step.label+': '),document.createTextNode(step.detail));steps.append(row);}providerStages.append(steps);
 const actions=node('div',undefined,'connection-buttons'),check=node('button','Check selected connection'),repair=node('button',saved.provider==='openclaw'?'Review gateway settings':'Find agents again'),copy=node('button','Copy diagnostics');check.type=repair.type=copy.type='button';check.id='provider-check';repair.id='provider-repair';copy.id='provider-diagnostics';
 check.onclick=async()=>{waiting(true);status('Checking the selected connection without an AI response…');try{await checkAgent();status('Connection check finished. Review measured states and unknowns above.');}catch(error){showError(error);}finally{waiting(false);}};
 repair.onclick=()=>{if(saved.provider==='openclaw'){$('connection-advanced').open=true;$('connection-provider').value='openclaw';provider();$('connection-gateway').focus();}else refreshAgents();};
 copy.onclick=()=>$('setup-report').click();actions.append(check,repair,copy);providerStages.append(actions);
}
function fill(){
  indicator(saved);drawProviderSetup();
  $('connection-provider').value=saved.provider||'codex';$('connection-codex-path').value=saved.codexPath||'';$('connection-claude-path').value=saved.claudePath||'';$('connection-claude-model').value=saved.provider==='claude'?saved.model||'':'';$('connection-model').value=saved.model||'';$('connection-gateway').value=saved.gatewayUrl||'http://127.0.0.1:18789/v1';$('connection-agent').value=saved.agentId||'';$('connection-token').value='';$('connection-token').placeholder=saved.needsToken?'Enter token again on this computer':saved.tokenSaved?'Saved on this computer; leave blank to keep':'Gateway token or password';provider();
}
function drawAgents(){
  const list=$('setup-agents');list.replaceChildren();
  for(const agent of agents){
    const card=node('article',undefined,'setup-agent');card.dataset.agentId=agent.id;card.dataset.selected=String(agent.id===selectedId);
    const heading=node('div',undefined,'setup-agent-heading'),name=node('strong',agent.label),badge=node('span',agent.authentication==='signed-in'?'Signed in':agent.authentication==='signed-out'?'Sign-in needed':'Sign-in not confirmed','setup-badge');heading.append(name,badge);if(PROVIDER_SETUP[agent.provider]?.releaseStatus==='experimental')heading.append(node('span','Experimental, not yet verified','setup-badge'));
    const sources={saved:'Previously selected',environment:'Configured installation',path:'On your PATH',installed:'Installed on this computer',desktop:'Desktop app',bundled:'Included with Nodes'};
    const details=node('p',[sources[agent.source]||'Local installation',agent.version].filter(Boolean).join(' · '),'connection-note'),location=node('details');location.append(node('summary','Installation details'),node('p',agent.path,'setup-location'));
    const actions=node('div',undefined,'connection-buttons');
    if(agent.installation==='available'){
      const signedIn=agent.authentication==='signed-in';const action=node('button',signedIn?(agent.id===selectedId?'Selected':'Use this agent'):'Sign in');action.type='button';action.dataset.agentAction=signedIn?'connect':'login';action.onclick=()=>useAgent(agent,!signedIn);actions.append(action);
      if(!signedIn&&agent.provider==='codex'){const device=node('button','Use a device code');device.type='button';device.onclick=()=>useAgent(agent,true,true);actions.append(device);}
    }else{const help=node('button',`Set up ${agent.label}`);help.type='button';help.onclick=()=>api.connectionHelp(agent.provider);actions.append(help);}
    card.append(heading,details,location,node('p',agent.message,'connection-note'),actions);list.append(card);
  }
  $('setup-agent-summary').textContent=agents.length?(saved.configured?`Selected: ${saved.provider==='openclaw'?'OpenClaw':saved.provider==='claude'?'Claude Code':'Codex'}. Model access is checked when you investigate; you can choose another agent below.`:'Choose a signed-in agent, or sign in with its official flow.'):'No supported local agent was found. Use Advanced to choose a CLI or connect an OpenClaw gateway.';
  if(!agents.length){const help=node('button','Install or connect an agent');help.type='button';help.onclick=()=>{$('connection-advanced').open=true;$('connection-provider').focus();};list.append(help);}
}
async function discover(){const result=await api.connectionDiscover();agents=result.agents||[];selectedId=result.selectedId;drawAgents();}
function finishEngine(result){completedSession=Math.max(completedSession,result.setupSession||0);drawEngine(result);}
function drawEngine(result){
 lastEngine=result;$('connection-dialog').classList.toggle('target-bound',result.context?.kind==='target');const list=$('setup-engine');list.replaceChildren();const flow=setupFlow(result);list.append(node('h4',flow.title),node('p',flow.summary));const rows=node('ol',undefined,'setup-checklist');rows.setAttribute('aria-label','Application inspection checks');
 for(const item of flow.rows){const row=node('li');row.dataset.check=item.id;row.dataset.state=item.state;const icon=node('span',['Identified','Verified working'].includes(item.state)?'✓':['Needs setup','Failed'].includes(item.state)?'!':'·','setup-check-icon');icon.setAttribute('aria-hidden','true');const copy=node('div');copy.append(node('strong',item.label),node('small',item.detail,'setup-row-detail'));const status=node('span',item.state,'setup-row-status');status.setAttribute('role','status');const progress=node('progress');progress.hidden=true;progress.setAttribute('aria-label',item.label+' progress');copy.append(progress);row.append(icon,copy,status);rows.append(row);}list.append(rows);
 const launches=['Choose application','Verify this application','Set up native inspection'].includes(flow.action);
 const action=node('button',launches?'Start REA':flow.action);action.type='button';action.className='setup-next';const blocker=rows.querySelector('[data-state="Needs setup"],[data-state="Failed"]');(blocker?.querySelector('div')||list).append(action);
 const feedback=node('p',result.repairDiagnosis||'','setup-repair-feedback');feedback.setAttribute('role','status');list.append(feedback);const technical=node('details');technical.append(node('summary','Technical details'));list.append(technical);
 action.onclick=async()=>{
  if(launches){await runSetup(undefined,true);return;}
  if(flow.action==='Return to map'){$('connection-dialog').close();return;}
  if(flow.action==='Review local diagnosis'){technical.open=true;technical.querySelector('summary').focus();return;}
  if(flow.action==='Choose application'){const target=await api.chooseTarget();if(target)runSetup(typeof target==='string'?target:target.path);return;}
  waiting(true);try{
   if(flow.action==='Repair included engine'){await api.reaRestoreBundled();finishEngine(await api.setupLaunch());}
   else if(flow.action==='Verify this application')finishEngine(await (result.context.nativeTargets?.length?api.setupNativeCheck():api.setupRouteCheck()));
   else if(flow.action==='Set up native inspection')finishEngine(await api.setupRepair());
   else if(flow.action==='Retry saved inspection'){const info=await api.setupResumeInfo();if(info&&confirm('Retry the preserved inspection now? This may use your selected AI account.')){$('connection-dialog').close();document.dispatchEvent(new CustomEvent('setup-resume-request',{detail:info}));}}
  }catch(e){const outcome=settleSetupFailure($('setup-engine'),e);lastEngine={...(lastEngine||result),...outcome};}
  finally{completedSession=Math.max(completedSession,seenSession);waiting(false);}
 };
 renderSetupDiagnostic(technical,result.diagnostic,{paths:()=>$('setup-engine-settings').click(),official:kind=>api.connectionHelp(kind)});if(result.operationCheck?.detail)technical.append(node('pre',result.operationCheck.detail));$('setup-engine-summary').textContent='';

  const installation=$('setup-engine-installation');installation.replaceChildren();
  if(result.installation)installation.append(node('p',result.installation.engine),node('p',result.installation.runtime));
  const labels={ready:'Ready',missing:'Setup needed',unavailable:'Unavailable',unknown:'Not checked'};
  if(!result.diagnostic)for(const card of result.cards){const row=node('div',undefined,'setup-tool');row.dataset.state=card.state;const heading=node('div',undefined,'setup-agent-heading');heading.append(node('strong',card.label+(card.optional?' · target-specific':'')),node('span',labels[card.state]||card.state,'setup-badge'));row.append(heading,node('p',card.detail,'connection-note'));if(card.state!=='ready'&&(card.reason||card.remediation)){const details=node('details');details.append(node('summary','Technical diagnostics'),node('pre',[...new Set([card.reason,card.remediation].filter(Boolean))].join('\n')));row.append(details);}if(card.id==='native'&&card.state!=='ready')row.append(node('p','For Ghidra-based decompilation, REA needs a compatible Ghidra release and the full JDK required by that release. These are separate REA tools, not requirements to open Nodes. Use the contextual setup action above; Nodes reviews each download, extraction and local path change for your approval.','connection-note'));list.append(row);}
  if(result.localToolChecks?.length){const local=node('details');local.append(node('summary','Local tool diagnostics — paths stay on this computer'));for(const check of result.localToolChecks)local.append(node('p',check.name+(check.code?' — '+check.code:'')),node('pre',check.detail));technical.append(local);}
  if(result.localDiagnostic){const local=node('details');local.append(node('summary','Local static-check failure details — excluded from copied handoff'),node('pre',result.localDiagnostic));technical.append(local);}

  $('setup-ghidra-help').hidden=!result.cards.some(c=>c.id==='native'&&c.state!=='ready');
  $('setup-use-bundled').hidden=!result.bundled?.available||result.installation?.engine==='REA engine included with Nodes';
}
async function verifyNative(){waiting(true);status('Checking native prerequisites before asking for static-inspection approval.');try{const result=await api.setupNativeCheck();drawEngine(result);status(result.canceled?'Native check canceled. Your request, draft and prior settings are preserved.':result.verification?.state==='ready'?'Native static overview verified. No AI work started. Close Setup and explicitly retry your saved request.':'Native inspection is still blocked. Review the component diagnostics, correct the next blocker, then recheck.');}catch(error){renderUserError($('connection-status'),error,{context:'setup',message:'Your saved request and draft are preserved.',action:{label:'Check inspection tools again',run:()=>verifyNative()}});}finally{completedSession=Math.max(completedSession,seenSession);waiting(false);}}
async function checkEngine(){ $('setup-engine-summary').textContent='Checking the local engine and inspection routes…';try{finishEngine(await api.setupCheck());}catch(error){renderUserError($('setup-engine-summary'),error,{context:'setup'});throw error;}}
async function refresh(){waiting(true);status('Finding installed agents and checking local sign-in status…');try{await discover();if(!$('connection-dialog').open)return;status('Checking inspection tools…');await checkEngine();const diagnosticHeading=$('setup-engine').querySelector('.setup-diagnostic>h4');if(diagnosticHeading)diagnosticHeading.focus();status(saved.configured?'Your agent connection is saved. Review tool readiness above; model access is confirmed when you make a request.':'Choose an agent above. Saved work is available at any time.');}catch(error){showError(error);}finally{completedSession=Math.max(completedSession,seenSession);waiting(false);}}
async function useAgent(agent,login=false,deviceAuth=false){
  waiting(true);status(login?(deviceAuth?'Starting official device-code sign-in…':'Complete the official sign-in in your browser. If it cannot open, cancel and use a device code for Codex.'):'Confirming local sign-in…');
  try{
    if(login){await api.connectionLoginDetected({candidateId:agent.id,deviceAuth});if(!$('connection-dialog').open)return;await discover();agent=agents.find(item=>item.id===agent.id);if(!agent||agent.authentication!=='signed-in'){status('Sign-in was not confirmed. Try Find agents again, or use Advanced to test your connection.');return;}}
    const result=await api.connectionConnectDetected({candidateId:agent.id});saved=result.settings;selectedId=agent.id;fill();drawAgents();await checkAgent();status(result.message);
  }catch(error){showError(error);}finally{completedSession=Math.max(completedSession,seenSession);waiting(false);}
}
async function open({agent=false}={}){
  if($('connection-dialog').open||busy)return;
  try{saved=await api.connectionInfo();fill();$('connection-advanced').open=false;$('setup-agent-summary').textContent='Looking for local agents…';$('setup-agents').replaceChildren();status('');$('setup-nodes-section').hidden=true;$('setup-rea-section').hidden=true;advanced.open=false;$('connection-dialog').classList.remove('target-bound');$('connection-dialog').showModal();connect.focus();const entry=await api.setupEntry?.();entryContext=entry?.context||null;if(!$('connection-dialog').open)return;if(agent){start.hidden=true;$('setup-nodes-section').hidden=false;await refreshAgents();}else if(entry?.context?.kind==='target'&&entry.blocked){$('setup-rea-section').hidden=false;start.hidden=true;await runSetup();$('setup-engine').querySelector('h4')?.setAttribute('tabindex','-1');$('setup-engine').querySelector('h4')?.focus();}else{start.hidden=false;if(lastEngine&&entry?.context?.label===lastEngine.context?.label){$('setup-rea-section').hidden=false;await runSetup();}}}
  catch(error){const activity=$('workspace-notice');renderUserError(activity,error,{actions:{agent:()=>open({agent:true}),setup:()=>open()}});}
}
$('connection-open').onclick=$('setup-open').onclick=open;
document.addEventListener('setup-agent-request',()=>open({agent:true}));
$('connection-provider').onchange=()=>{provider();status('Save and test to switch this advanced connection. Your previous connection stays active until it succeeds.');};
$('connection-close').onclick=()=>{$('connection-dialog').close();};
$('connection-dialog').addEventListener('close',()=>{if(busy)api.connectionCancel();$('connection-token').value='';status('');document.dispatchEvent(new CustomEvent('agent-connection-changed'));document.querySelector('#node-settings>summary').focus();});
$('connection-cancel').onclick=()=>api.connectionCancel();
$('setup-refresh').onclick=()=>refreshAgents();
$('setup-recheck').textContent='Start REA again';$('setup-recheck').onclick=()=>runSetup(undefined,true);
$('setup-engine-settings').onclick=()=>{$('connection-dialog').close();$('rea-open')?.click();};
$('setup-use-bundled').onclick=async()=>{waiting(true);status('Restoring and verifying the engine included with this app…');try{await api.reaRestoreBundled();await checkEngine();status('Included engine verified and selected. Close Setup and retry your saved request.');}catch(error){showError(error);}finally{completedSession=Math.max(completedSession,seenSession);waiting(false);}};
$('setup-ghidra-help').onclick=()=>api.connectionHelp('ghidra');
$('setup-device-page').onclick=()=>api.connectionHelp('device');
$('setup-report').onclick=async()=>{try{await api.setupReport();status('Diagnostic handoff copied: measured component states, unknowns and next steps. Tokens, account details, paths, source content and raw command output are excluded.');}catch(error){showError(error);}};
$('connection-browse').onclick=async()=>{try{const file=await api.connectionPick();if(file)$('connection-codex-path').value=file;}catch(error){showError(error);}};
$('connection-claude-browse').onclick=async()=>{try{const file=await api.connectionPick();if(file)$('connection-claude-path').value=file;}catch(error){showError(error);}};
$('connection-claude-login').onclick=$('connection-login').onclick=async()=>{waiting(true);status('Complete sign-in in your browser.');try{const result=await api.connectionLogin(draft());status(result.message+' Use Find agents again to connect without an AI test, or run the optional test below.');}catch(error){showError(error);}finally{completedSession=Math.max(completedSession,seenSession);waiting(false);}};
$('connection-test').onclick=async()=>{waiting(true);status('Checking a small model response…');try{const result=await api.connectionTest(draft());saved=result.settings;fill();drawAgents();status(`${result.message} AI connection saved. Review inspection readiness separately above.`);}catch(error){showError(error);}finally{completedSession=Math.max(completedSession,seenSession);waiting(false);}};
for(const id of ['codex','claude','claw'])$(`connection-help-${id}`).onclick=()=>api.connectionHelp(id);
$('connection-shortcut').onclick=async()=>{try{await api.connectionShortcut();status('Desktop shortcut created.');}catch(error){showError(error);}};
api.onConnectionInstruction?.(instruction=>{if(busy&&$('connection-dialog').open){status((instruction.message||'Open the official sign-in page and enter the one-time code.')+(instruction.url?`\n${instruction.url}`:'')+(instruction.code?`\nCode: ${instruction.code}`:''));$('setup-device-page').hidden=instruction.type!=='device-auth';}});
// Detection is read-only: never select an account, sign in, test a model or
// change settings merely because the workspace opened.
api.connectionInfo().then(async info=>{
 saved=info;indicator(info);
 if(info.configured){await checkAgent();return;}
 try{const result=await api.connectionDiscover({background:true});indicator(saved,(result.agents||[]).filter(a=>a.authentication==='signed-in').length);}catch{indicator(saved);}
}).catch(()=>{const n=$('connection-indicator');n.title='Agent status unavailable · open Settings';n.setAttribute('aria-label',n.title);});
