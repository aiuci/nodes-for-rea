// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {findingCategory} from '../lib/finding-category.mjs';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};

export function categoryBadge(category,cls=''){
  const badge=el('span',undefined,`finding-category-badge ${cls}`.trim());badge.dataset.findingCategory=category.key;
  const icon=el('span',category.symbol);icon.setAttribute('aria-hidden','true');badge.append(icon,document.createTextNode(category.label));
  badge.title=category.detail;return badge;
}
export function appendFindingCategory(panel,state,message,finding){
  const category=findingCategory(state,message,finding);
  panel.append(categoryBadge(category),el('small',category.detail,'finding-category-detail'));
}
export function appendCategoryKey(panel){
  const key=el('details',undefined,'finding-category-key');key.append(el('summary','What these labels mean'));
  for(const [label,meaning]of [
    ['Observed','Directly supported by inspected code or recorded runtime evidence. Code inspection alone does not verify runtime behavior.'],
    ['Inferred','An interpretation supported by evidence. Its conclusion still needs verification.'],
    ['Unknown','Not established by this investigation. This does not mean absent. Missing evidence and proposals cannot become observations.']
  ])key.append(el('p',`${label}: ${meaning}`));
  key.append(el('p','Source descriptions establish what is advertised, not whether it works. Labels summarize the retained evidence; inspect the sources and reasoning before relying on a conclusion.'));
  panel.append(key);
}
