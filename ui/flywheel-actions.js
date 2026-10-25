// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {renderUserError} from './user-feedback.js';
import {FEATURE_ACTIONS,FEATURE_ACTION_HELP,ROOT_ACTIONS,actionBlock,featureActionReason,stableNodeReference} from '../lib/node-actions.mjs';
import {existingRadial,presentRadial} from './radial-menu.js';
import {openMapNode,hideBranch,collapseBranch} from './growing-map.js';
import {keepNodePosition} from './tidy-controls.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,run,cls)=>{const n=el('button',text,cls);n.type='button';n.onclick=run;return n;};
export function guard(view,kind='work'){return actionBlock({...view.actions.operationState?.(),busy:view.busy,fileBusy:view.fileBusy,preparingNode:view.preparingNode},kind);}
export function subject(view,id){const item=view.map.nodes.get(id),record=view.records.find(r=>r.id===id)||view.featureForResult(item?.message),result=item?.type==='feature'?view.latestResult(record):item?.message;return {investigationId:view.state.id,nodeId:id,item,record,result:result?.role==='assistant'&&!result.features?.length?result:null,featureName:record?.row.name||null};}
const origin=s=>s.result?{parentResultId:s.result.id,parentNodeId:s.item.type==='feature'?`turn:${s.result.id}`:s.nodeId}:{};
function valid(view,s,kind='work'){
  if(view.state.id!==s.investigationId)return 'The investigation changed. Open this action again.';
  if(!view.map.nodes.has(s.nodeId))return 'This node is no longer available.';
  if(s.record&&!view.records.some(r=>r.id===s.record.id&&r.row.name===s.featureName))return 'The selected feature changed. Open this action again.';
  if(s.result&&!view.state.messages.some(m=>m.id===s.result.id&&m.role==='assistant'))return 'The saved finding is no longer available.';
  return guard(view,kind);
}
function traceBoundary(view){
  const retained=view.state.evidence.some(e=>/trace|call|xref|reference|depend|managed.members|javascript.semantics/i.test(e.operation||''));
  return {retained,reason:!retained&&!view.state.targets?.length?'No selected inspection target or saved relationship evidence.':'',description:retained?'Saved relationship receipts are available. New static operations depend on the selected target’s advertised capabilities.':'Static trace capability has not been established. The existing inspection planner checks advertised operations; unsupported links must remain unresolved.'};
}
function dialogFor(title,anchor){const d=el('dialog',undefined,'workspace-dialog flywheel-dialog');d.append(el('h2',title));document.body.append(d);d.showModal();d.addEventListener('close',()=>{d.remove();if(anchor?.isConnected)anchor.focus({preventScroll:true});},{once:true});return d;}
function boundaries(view,d,s,saved=false){
  d.append(el('p',`Selected scope: ${s.record?.title||s.item.title}`),el('p',`Feature branch: ${s.featureName||'Whole investigation'}`));
  if(s.result)d.append(el('small',`Exact saved result: ${s.result.id} · ${s.result.createdAt||'Time not recorded'}`));
  d.append(el('p',saved?'AI review of saved evidence; no new source inspection or target execution.':'One investigation step using AI, retained evidence and allowed static inspection. It may answer from retained evidence. Runtime checks remain a separate explicit action.'));
  const details=el('details');details.append(el('summary',`Selected sources and retained evidence (${view.state.evidence.length})`));
  for(const target of view.state.targets||[])details.append(el('p',target.locator||target.root||'Selected target'),...(target.limitations||[]).map(x=>el('p',x)));
  if(!view.state.targets?.length)details.append(el('p','No inspection target is selected. Saved evidence may still support a qualified answer.'));
  d.append(details);
}
export function previewAction(view,id,action,anchor){
  const s=subject(view,id);if(!s.item)return;
  const spec=view.investigationFor(id),trace=traceBoundary(view),reason=action==='discover'||action==='deeper'&&spec?guard(view):featureActionReason(action,{guard:guard(view),...s,spec,traceReason:trace.reason});
  if(reason){view.actions.notify(reason);return;}
  const title=FEATURE_ACTIONS.find(([key])=>key===action)?.[1]||'Discover Features',d=dialogFor(title,anchor),saved=action==='verify';boundaries(view,d,s,saved);
  let request=action==='inspect'?(s.record.row.investigate?.trim()||s.record.row.displayQuestion?.trim()||`Investigate ${s.record.title}`):action==='deeper'?spec.request:action==='verify'?'Check the support for this saved finding. Distinguish supported claims, inference, and unresolved gaps.':'Discover more capabilities and update the feature map from available sources. Preserve all existing findings and expose discovery limits.';
  let input,relation,alternatives;
  if(action==='trace'){
    d.append(el('p',trace.description));const label=el('label','Relationship to investigate'),select=el('select');
    for(const [value,text]of [['dependencies','Dependencies'],['callers and callees','Callers and callees'],['references','References'],['data flow','Data flow']]){const o=el('option',text);o.value=value;select.append(o);}label.append(select);d.append(label);relation=select;
    d.append(el('p','These are requested relationships, not a declaration that an operation is available. Actual receipts identify the operation used, inference and unresolved links.'));
  }
  if(action==='probe'){
    const choices=view.alternativesFor(id);if(choices.length){const label=el('label','Saved alternative direction'),select=el('select'),blank=el('option','Choose a saved direction');blank.value='';select.append(blank);for(const text of choices){const o=el('option',text);o.value=text;select.append(o);}label.append(select);d.append(label);alternatives=select;}
    const label=el('label','Custom behavior or hypothesis'),area=el('textarea');area.rows=4;area.maxLength=18000;label.append(area);d.append(label,el('p','Choose a saved alternative or write a custom hypothesis. This field stays separate from your unsent composer draft.'));input=area;
    if(alternatives){alternatives.onchange=()=>{if(alternatives.value)input.value='';};input.oninput=()=>{if(input.value.trim())alternatives.value='';};}
  }
  if(!['trace','probe'].includes(action))d.append(el('h3','Request'),el('p',request,'flywheel-request'));
  if(action==='deeper')d.append(el('p',spec.reason));
  const error=el('p','','material-limit');error.setAttribute('role','status');d.append(error);
  d.append(button('Start',()=>{
    const blocked=valid(view,s);if(blocked){error.textContent=blocked;return;}
    if(action==='deeper'&&JSON.stringify(view.investigationFor(id))!==JSON.stringify(spec)){error.textContent='The suggested step changed. Close and open Take the next step again.';return;}
    if(action==='trace')request=`Trace ${relation.value} for ${s.featureName}. Use only supported static inspection operations and retained references; distinguish observed static relationships, inference, and unresolved links. Do not execute target runtime checks.`;
    if(action==='probe'){request=alternatives?.value||input.value.trim();if(!request){error.textContent='Choose a saved alternative or enter a hypothesis.';return;}if(!alternatives?.value)request=`Investigate this behavior or hypothesis for ${s.featureName}: ${request}\nUse allowed static inspection and saved evidence; do not execute target runtime checks.`;}
    d.close();view.runningNode=id;view.actions.submit(request,action==='deeper'?spec.target:s.featureName,{...origin(s),nodeId:id,automation:{mode:'step',maxSteps:1},...(saved?{auditIds:[s.result.id]}:{})});
  },'primary'),button('Cancel',()=>d.close()));
  return d;
}
export function askNode(view,id){
  // Opening a node never transfers ownership of an existing unsent draft.
  openMapNode(view,id);view.ask();
}
export function nodeMenu(view,id,anchor,options={}){
  if(existingRadial(view,id,options))return;const s=subject(view,id),item=s.item;if(!item)return;
  const menu=el('div',undefined,'node-context-menu');menu.append(el('strong',item.title));
  const add=(key,label,run,reason='')=>{const n=button('',async()=>{if(n.disabled)return;view.radialMenu?.close(false);try{await run();}catch(error){view.actions.notify(error);}});n.dataset.actionId=key;if(key!=='close'&&(item.type==='feature'&&options.intent!=='secondary'||key==='agent-control')){const help=el('small',key==='agent-control'?'Direct the investigation from here.':FEATURE_ACTION_HELP[key],'action-menu-help');if(help.textContent){help.id=`action-help-${crypto.randomUUID()}`;help.hidden=true;n.append(help);n.dataset.helpId=help.id;n.setAttribute('aria-describedby',help.id);}}n.prepend(el('span',label));if(reason){const why=el('small',reason,'action-disabled-reason');why.id=`action-reason-${crypto.randomUUID()}`;n.append(why);n.setAttribute('aria-describedby',[n.dataset.helpId,why.id].filter(Boolean).join(' '));n.title=reason;}n.disabled=!!reason;n.setAttribute('aria-label',label);menu.append(n);};
  const presentation=guard(view,'presentation'),work=guard(view);
  if(options.intent==='secondary'){
    if(item.type==='feature')add('agent-control','Agent Control',()=>view.actions.openAgentControl?.(view.state.id,id),!view.actions.openAgentControl?'Agent Control is unavailable.':'');
    if(s.record){const kept=view.state.keptFeatures?.some(f=>f.name===s.featureName);add('keep',kept?'Remove from my app':'Keep for my app',()=>view.actions.keep(s.record.message,s.record.row,!kept),guard(view,'collection'));add('pin',view.ws.pins.includes(s.record.id)?'Unpin comparison':'Pin for comparison',()=>view.pin(s.record),presentation);}
    if(view.map.children.get(id)?.length)add('fold',view.ws.collapsed.includes(id)?'Expand branch':'Collapse branch',()=>collapseBranch(view,id),presentation);
    if(id!=='core')add('hide',view.ws.hidden.includes(id)?'Show branch':'Hide branch',()=>{if(view.ws.hidden.includes(id)){view.ws.hidden=view.ws.hidden.filter(n=>n!==id);view.draw();view.persist();}else hideBranch(view,id);},presentation);
    if(id!=='core'&&!['radial','spiral','shattered','exploded'].includes(view.ws.layout))add('position',view.ws.placedNodes[view.ws.layout]?.includes(id)?'Allow tidying':'Keep position',()=>{keepNodePosition(view,id,!view.ws.placedNodes[view.ws.layout]?.includes(id));view.draw();view.persist();},presentation);
    add('copy','Copy node reference',async()=>{await navigator.clipboard.writeText(stableNodeReference(view.state.id,id));view.actions.notify('Node reference copied.');});
  }else if(item.type==='feature'){
    const spec=view.investigationFor(id),trace=traceBoundary(view);
    for(const [key,label]of FEATURE_ACTIONS){const reason=featureActionReason(key,{guard:work,...s,spec,traceReason:trace.reason,compareAvailable:!!view.actions.comparisonCandidates});add(key,label,()=>key==='ask'?askNode(view,id):key==='auto'?view.automation(id,'bounded'):key==='compare'?comparisonPicker(view,id,anchor):previewAction(view,id,key,anchor),reason);}
  }else if(item.type==='root'){
    for(const [key,label]of ROOT_ACTIONS)add(key,label,()=>key==='discover'?previewAction(view,id,'discover',anchor):key==='coverage'?view.coverage():key==='sources'?view.openRoot():askNode(view,id),key==='discover'?work:'');
  }else if(item.utility==='preflight'){
    add('read','View connection check',()=>openMapNode(view,id));add('setup','Open setup',()=>view.actions.openSetup?.(),work||(!view.actions.openSetup?'Setup is unavailable.':''));
    if(item.preflight.status==='blocked'&&item.preflight.request)add('retry','Recheck and retry saved request',()=>view.actions.retryPreflight?.(),work||(!view.actions.retryPreflight?'No saved retry request.':''));
  }else{
    add('read',item.type==='attempt'?'Read attempt and recovery':item.type==='source'?'Read source and limits':'Read saved response',()=>['result','finding'].includes(item.type)?view.openReader(id):openMapNode(view,id));
    if(item.type==='source')add('discover','Discover Features',()=>previewAction(view,id,'discover',anchor),work);
    if(item.type==='direction'&&view.investigationFor(id))add('route','Follow this saved direction',()=>previewAction(view,id,'deeper',anchor),work);
    if(s.result)add('evidence','Evidence / Receipts',()=>view.openReader(id,'evidence'));
    add('ask','Ask my own question',()=>askNode(view,id));
  }
  add('close','Close menu',()=>{});menu.lastElementChild.onclick=()=>view.radialMenu?.close(true);presentRadial(view,id,anchor,menu,options);
}
export function bookmark(view,record,representation='map'){
  const kept=view.state.keptFeatures?.some(f=>f.name===record.row.name),n=button(kept?'◆':'◇',async event=>{event.stopPropagation();if(n.disabled)return;const investigationId=view.state.id;let ownsFocus=document.activeElement===n;
    const followFocus=event=>{const target=event.target;if(target===n)return;const sameBookmark=target?.classList?.contains('node-bookmark')&&target.closest(representation==='outline'?'.outline-row':'.growing-node')?.dataset.nodeId===record.id;if(target?.isConnected&&target!==document.body&&target!==document.documentElement&&!sameBookmark)ownsFocus=false;};
    const cancel=()=>{ownsFocus=false;};document.addEventListener('focusin',followFocus,true);document.addEventListener('pointerdown',cancel,true);document.addEventListener('keydown',cancel,true);view.bookmarkPending=record.id;n.disabled=true;n.setAttribute('aria-busy','true');try{await view.actions.keep(record.message,record.row,!kept);}catch(error){view.actions.notify(error);}finally{
    view.bookmarkPending=null;const selected=view.ws?.inspected;
    const restore=()=>{const owner=[...document.querySelectorAll(representation==='outline'?'.outline-row':'.growing-node')].find(x=>x.dataset.nodeId===record.id),current=owner?.querySelector('.node-bookmark');if(!current)return;current.disabled=!!guard(view,'collection');current.setAttribute('aria-busy','false');const active=document.activeElement;if(ownsFocus&&view.state.id===investigationId&&view.ws?.inspected===selected&&(active===n||active===current||active===document.body||active===document.documentElement)&&active!==current)current.focus({preventScroll:true});};
    let expiry,scheduled=false;const cleanup=()=>{ownsFocus=false;document.removeEventListener('focusin',followFocus,true);document.removeEventListener('pointerdown',cancel,true);document.removeEventListener('keydown',cancel,true);clearTimeout(expiry);};
    try{restore();expiry=setTimeout(cleanup,150);requestAnimationFrame(()=>requestAnimationFrame(()=>{restore();cleanup();}));scheduled=true;}finally{if(!scheduled)cleanup();}
  }} ,'node-bookmark');
  const reason=guard(view,'collection');n.disabled=!!reason;n.setAttribute('aria-busy',String(view.bookmarkPending===record.id));if(reason)n.setAttribute('aria-description',reason);n.setAttribute('aria-pressed',String(!!kept));n.setAttribute('aria-label',`${kept?'Remove':'Keep'} ${record.title} ${kept?'from':'for'} my app`);n.title=reason||n.getAttribute('aria-label');n.addEventListener('pointerdown',e=>e.stopPropagation());return n;
}
export async function comparisonPicker(view,id,anchor){
  const s=subject(view,id),blocked=valid(view,s);if(blocked){view.actions.notify(blocked);return;}if(!s.result){view.actions.notify('Investigate this feature first.');return;}
  const d=dialogFor('Compare two findings',anchor);boundaries(view,d,s,true);d.append(el('p','Select two exact saved results. Comparison adds a supplementary saved finding here and preserves both originals. Pinning only saves a local choice.'));
  const status=el('p','Loading saved results.');status.setAttribute('role','status');const list=el('select'),detail=el('div'),pin=button('',()=>{view.pin(s.record);updatePin();}),more=button('Load more saved results',()=>load()),start=button('Compare',()=>run(),'primary'),cancel=button('Cancel',()=>d.close());
  const label=el('label','Other saved result');label.append(list);d.append(status,label,detail,pin,more,start,cancel);start.disabled=true;
  const stop=button('Stop comparison',()=>{stop.disabled=true;status.textContent='Stopping comparison. Saved findings are retained.';view.actions.stop?.();});stop.hidden=true;d.append(stop);
  const operationId=crypto.randomUUID();let candidates=[],offset=0,sideA=null,chosen=null,inFlight=false;
  function updatePin(){pin.hidden=!s.record;pin.textContent=view.ws.pins.includes(s.record?.id)?'Unpin this feature':'Pin this feature for comparison';pin.setAttribute('aria-pressed',String(view.ws.pins.includes(s.record?.id)));pin.disabled=!!guard(view,'presentation');}updatePin();
  const tuple=x=>`${x.investigationId}:${x.messageId}`;
  function selection(){chosen=candidates.find(x=>tuple(x)===list.value);detail.replaceChildren();if(chosen){detail.append(el('p',`${chosen.investigationTitle} · ${chosen.investigationId}`),el('p',`${chosen.featureName||'Whole investigation'} · ${chosen.resultCreatedAt||'Time not recorded'} · ${chosen.messageId}`),el('p',chosen.overview||''),el('small',`${chosen.evidenceCount} retained receipts`),...(chosen.limitations||[]).map(x=>el('p',x,'material-limit')));}start.disabled=inFlight||!sideA||!chosen||chosen.availability!=='available';}
  list.onchange=selection;
  async function load(){more.disabled=true;try{const response=await view.actions.comparisonCandidates({offset,limit:100});if(!d.isConnected)return;offset+=response.candidates.length;for(const x of response.candidates)if(tuple(x)!==tuple(sideA)&&!candidates.some(c=>tuple(c)===tuple(x))){candidates.push(x);const option=el('option',`${x.investigationTitle} · ${x.featureName||'Whole investigation'} · ${x.resultCreatedAt||'Undated'} · ${x.messageId}`);option.value=tuple(x);option.disabled=x.availability!=='available';list.append(option);}more.hidden=!response.hasMore;status.textContent=`Side A: ${sideA?.title||s.result.overview||s.result.id} · ${sideA?.messageId||s.result.id}. ${response.unavailableCount||0} unavailable source(s). Saved evidence only; current target applicability may be unknown.`;const pinned=view.ws.pins.find(x=>x!==s.record?.id),other=view.latestResult(view.records.find(x=>x.id===pinned));if(other&&!chosen){const match=candidates.find(x=>x.investigationId===s.investigationId&&x.messageId===other.id);if(match)list.value=tuple(match);}selection();}catch(error){renderUserError(status,error,{title:'Saved comparison sources could not be read',message:'Your original findings remain available. Reload the saved-source choices or choose another saved result.',action:{label:'Reload saved sources',run:()=>load()}});}finally{more.disabled=false;}}
  try{const exact=await view.actions.comparisonCandidates({investigationId:s.investigationId,messageId:s.result.id});sideA=exact.candidates.find(x=>x.messageId===s.result.id&&x.investigationId===s.investigationId&&x.availability==='available');if(!sideA){status.textContent='The exact selected saved result is unavailable. Close and reselect it.';more.hidden=true;return;}await load();}catch(error){renderUserError(status,error,{title:'Saved comparison sources could not be read',message:'Your original findings remain available. Reload the saved-source choices or choose another saved result.',action:{label:'Reload saved sources',run:()=>load()}});more.hidden=true;}
  const settleOutcome=message=>{status.textContent=message;view.actions.notify(message);};
  async function refresh(){try{const outcome=await view.actions.comparisonStatus(s.investigationId,operationId);settleOutcome(outcome.message||outcome.status);if(outcome.status==='saved')refreshButton.hidden=true;}catch(error){settleOutcome(error.message);}}
  const refreshButton=button('Refresh saved status',refresh);refreshButton.hidden=true;d.append(refreshButton);
  async function run(){const reason=valid(view,s);if(reason){status.textContent=reason;return;}if(!sideA||!chosen||chosen.availability!=='available'){status.textContent='Choose two available saved results.';return;}inFlight=true;selection();status.textContent='Comparing selected saved evidence. No new inspection or target execution.';stop.hidden=false;cancel.textContent='Close';more.disabled=true;list.disabled=true;
    try{const outcome=await view.actions.compareSaved({operationId,destinationInvestigationId:s.investigationId,anchorResultId:s.result.id,selections:[sideA,chosen].map(({investigationId,messageId,selectionDigest})=>({investigationId,messageId,selectionDigest})),request:'Compare these saved findings. Preserve each side’s evidence, attribution, recorded checks, limitations and unresolved claims. Do not imply new inspection or runtime verification.',nodeId:id,preserveDraft:true});settleOutcome(outcome.message||outcome.status);refreshButton.hidden=outcome.status==='saved';}
    catch(error){settleOutcome(`${error.message} No automatic comparison retry was made.`);refreshButton.hidden=false;}
    stop.hidden=true;
    // An unchanged/uncertain outcome never re-enables the paid operation.
  }
}
