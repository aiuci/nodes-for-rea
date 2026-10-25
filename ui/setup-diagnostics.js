// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {setupStateLabels} from '../lib/setup-diagnostics.mjs';
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
export function renderSetupDiagnostic(parent,record,{paths,verify,official,disabled=false}={}){
  if(!record)return;
  const section=el('section');section.className='setup-diagnostic';section.setAttribute('aria-label','Inspection setup diagnosis');
  const heading=el('h4',record.status==='blocked'?'Inspection setup needed':'Inspection prerequisites checked');heading.tabIndex=-1;section.append(heading,el('p',record.summary));
  const rows=el('ul'),optional=el('ul');for(const card of record.cards||[]){const row=el('li');row.append(el('strong',`${card.label}: ${setupStateLabels[card.state]||'Not checked'}`),el('span',card.required?' — required':' — optional for this request'));(card.required?rows:optional).append(row);}section.append(rows);if(optional.children.length){const other=el('details');other.append(el('summary','Other inspection routes — optional for this request'),optional);section.append(other);}
  const usingAlternative=record.recommendation?.selectedProvider&&record.recommendation.selectedProvider!=='ghidra';
  const details=el('details');details.className='setup-components';details.open=!!record.recommendation?.relevant;details.append(el('summary',usingAlternative?'Native inspection — existing provider available; Ghidra optional':record.recommendation?.relevant?'Native tools — required for the recommended route':'Native tools — optional for other targets'));
  if(usingAlternative)details.append(el('p',`The engine reports ${record.recommendation.selectedProvider} available. Reuse this provider first; installing Ghidra is an optional alternative, not a prerequisite for that route. The explicit operation still checks the selected target.`));
  const components=el('ul');for(const card of record.components||[]){const row=el('li');row.dataset.component=card.id;row.append(el('strong',`${card.label}: ${setupStateLabels[card.state]||'Not checked'}${card.required?' — required for Ghidra':' — optional alternative'}`),el('p',card.detail));if(card.code)row.append(el('small',`Check code: ${card.code}`));components.append(row);}details.append(components);
  const observed=record.observations||{};details.append(el('p',`Detected: Ghidra ${observed.ghidraVersion||'not established'}; Java ${observed.javaVersion||'not established'}; host ${observed.hostPlatform||'not established'}/${observed.hostArchitecture||'not established'}.`));
  const guide=record.recommendation;if(guide){details.append(el('h4',guide.title),el('p',guide.reason),el('p','Reuse a compatible existing installation first. Download only the components the measured checks show you need.'),el('p',guide.ghidra),el('p',guide.jdk),el('p','The Java compiler belongs to the full JDK. A C/C++ reconstruction compiler is a separate later workflow and is not required for this static inspection.'));
    const steps=el('ol');for(const step of guide.steps){const li=el('li');li.append(el('strong',step.label),el('p',step.authority));steps.append(li);}details.append(steps);
  }
  const add=(label,action)=>{if(!action)return;const button=el('button',label);button.type='button';button.disabled=disabled;button.onclick=action;details.append(button);};
  if(official){add('Open official Ghidra setup guide',()=>official('ghidra-guide'));add('Open official Ghidra download choices',()=>official('ghidra'));add('Open official full JDK download choices',()=>official('jdk'));}
  add('Choose existing tool folders…',paths);add('Verify native static inspection…',verify);
  const state=record.verification?.state;details.append(el('p',`Native static check: ${setupStateLabels[state]||'Not checked'}${record.verification?.code?' — '+record.verification.code:''}${record.verification?.operation?' — '+record.verification.operation:''}.`));details.append(el('p',state==='ready'?`Static overview verified at ${record.verification.checkedAt}. This does not run discovery or certify every feature.`:'Native operation not verified for the current target and tool settings. Saving paths or a working engine alone is insufficient.'));section.append(details);
  const boundaries=el('details');boundaries.append(el('summary','What Nodes includes and what is separate'));for(const line of record.boundaries||[])boundaries.append(el('p',line));section.append(boundaries,el('p',record.nextAction));parent.append(section);
}
