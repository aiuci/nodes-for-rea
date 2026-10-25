// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {agentDirectionState} from './agent-direction-state.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
export function renderAgentPlanner(route,session,current,{pending=false,onChange,onSource,fail}={}){
  const scroll=route.scrollTop,panel=route.closest('#agent-panel'),panelScroll=panel?.scrollTop,active=document.activeElement,key=active?.dataset.focusKey;
  const open=new Set([...route.querySelectorAll('details[open]')].map(n=>n.dataset.step));
  route.replaceChildren();
  if(!session)return;
  const editable=session.status==='proposed';
  for(const [index,step] of (session.route||[]).entries()){
    const row=el('li',null,'agent-direction');row.dataset.id=step.id;
    const phase=agentDirectionState(step,session,current);
    row.dataset.phase=phase.phase;row.dataset.included=String(step.status!=='skipped');
    const head=el(editable?'label':'div',null,'agent-bubble'),title=el('strong',step.title);
    const check=document.createElement('input');check.type='checkbox';check.className='agent-include';check.checked=step.status!=='skipped';check.disabled=!editable||pending;check.setAttribute('aria-label',`Include ${step.title}`);check.dataset.focusKey=`${step.id}:include`;
    check.onchange=()=>{step.status=check.checked?'pending':'skipped';row.dataset.included=String(check.checked);onChange();};
    if(editable)head.append(check);else{const marker=el('span',phase.completed?'✓':'',phase.completed?'agent-completion-check':'agent-included-indicator');marker.setAttribute('aria-hidden','true');head.append(marker);}
    head.append(title);row.append(head,el('small',`${phase.label} · ${step.action==='reveal'?'Review saved material':'New investigation'}`,'agent-phase'),el('p',step.why,'agent-why'));
    const details=el('details',null,'agent-reveal');details.dataset.step=step.id;details.open=open.has(step.id);
    const summary=el('summary','Details');summary.title='Question, sources, reasoning and options';summary.dataset.focusKey=`${step.id}:details`;details.append(summary);
    const add=(label,value)=>{details.append(el('strong',label),el('p',value));};
    add('Question',step.question||'No question retained.');add('Why this direction',step.why||'No reasoning summary retained.');
    add('Uncertainty',step.uncertainty||`Saved source status: ${step.sourceStatus||'not recorded'}. ${step.action==='reveal'?'Reviewing existing material adds no new verification.':'New findings depend on supporting evidence; this direction may be blocked.'}`);
    add('Dependencies',step.dependencies?.length?step.dependencies.join(', '):'Runs in route order. No additional dependencies declared by the planner.');
    details.append(el('strong','Saved sources'));
    for(const id of step.evidenceIds||[]){const source=current.evidence?.find(e=>e.id===id),link=el('button',source?.title||id,'agent-evidence-link');link.type='button';link.dataset.focusKey=`${step.id}:source:${id}`;link.title=source?.locator||id;link.onclick=()=>Promise.resolve(onSource(id)).catch(fail);details.append(link);}
    if(!step.evidenceIds?.length)details.append(el('p','No citation retained.'));
    if(editable){const controls=el('div',null,'agent-step-controls');for(const [label,delta] of [['Earlier',-1],['Later',1]]){const b=el('button',label);b.type='button';b.disabled=pending||index+delta<0||index+delta>=session.route.length;b.dataset.focusKey=`${step.id}:${label}`;b.onclick=()=>{[session.route[index],session.route[index+delta]]=[session.route[index+delta],session.route[index]];onChange();};controls.append(b);}details.append(controls);}
    const close=el('button','Close details');close.type='button';close.dataset.focusKey=`${step.id}:close`;close.onclick=()=>{details.open=false;summary.focus();};details.append(close);
    details.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();details.open=false;summary.focus();}};
    row.append(details);route.append(row);
  }
  if(key)[...route.querySelectorAll('[data-focus-key]')].find(n=>n.dataset.focusKey===key)?.focus({preventScroll:true});
  route.scrollTop=scroll;
  if(panel)panel.scrollTop=panelScroll;
}
