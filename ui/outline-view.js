// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {bookmark} from './flywheel-actions.js';
import {installOutlineHierarchy} from './outline-hierarchy.js';
import {selectionCheckbox} from './bulk-delete.js';
import {outlineRows,revealOutlinePaths} from '../lib/outline-state.mjs';
import {openMapNode,collapseBranch} from './growing-map.js';
import {wireContextActions,wireRadialTrigger} from './radial-menu.js';
import {nodeStatus,nodeStatusMarker} from './node-status.js';
import {categoryBadge} from './finding-category.js';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text,run,cls)=>{const n=el('button',text,cls);n.type='button';n.onclick=run;return n;};

export function refreshOutlinePaths(view,previous,switched){
  if(switched){view.outlineLastSelection=null;view.outlineWasOpen=false;view.outlinePendingFollow=null;}
  if(!switched&&previous){const added=[...view.map.nodes.keys()].filter(id=>!previous.nodes.has(id));if(added.length&&view.ws.outlineFollow&&view.outlineWasOpen)view.outlinePendingFollow=view.ws.inspected||view.map.root||'core';if(revealOutlinePaths(view.ws,view.map,added))queueMicrotask(()=>view.persist());}
}
export function drawOutline(view){
  const panel=document.getElementById('workspace-outline'),selected=view.ws.inspected||view.map.root||'core',scroll=panel.scrollTop;
  const keydown=event=>{
    if(event.defaultPrevented||event.isComposing||event.altKey||event.metaKey||event.shiftKey||!['ArrowUp','ArrowDown'].includes(event.key)||event.target.closest('input,textarea,select,[contenteditable],[role=textbox]'))return;
    event.preventDefault();event.stopPropagation();
    const direction=event.key==='ArrowDown'?1:-1;
    if(event.ctrlKey){panel.scrollBy({top:direction*48,behavior:'instant'});return;}
    const labels=[...panel.querySelectorAll('.outline-node')],focused=event.target.closest('.outline-row')?.dataset.nodeId,current=focused||view.ws.inspected||view.map.root||'core',at=labels.findIndex(node=>node.dataset.nodeId===current);
    const next=labels[Math.max(0,Math.min(labels.length-1,at<0?(direction>0?0:labels.length-1):at+direction))];
    if(!next)return;
    const id=next.dataset.nodeId;openMapNode(view,id,{focus:true});
    const label=[...panel.querySelectorAll('.outline-node')].find(node=>node.dataset.nodeId===id);
    label?.focus({preventScroll:true});
    label?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  };
  panel.onkeydown=event=>{if(!event.ctrlKey)keydown(event);};
  if(!view.outlineKeyboardInstalled){
    panel.addEventListener('keydown',event=>{if(event.ctrlKey)keydown(event);},{capture:true});
    view.outlineKeyboardInstalled=true;
  }
  if(view.outlineLastSelection!==selected||!view.outlineWasOpen){
    if(view.ws.outlineFollow)view.outlinePendingFollow=selected;if(revealOutlinePaths(view.ws,view.map,[selected]))queueMicrotask(()=>view.persist());
  }
  const rows=outlineRows(view.map,view.ws),treeKey=JSON.stringify(rows.map(r=>r.id));let anchor=null;
  if(view.outlineWasOpen&&view.outlineTreeKey!==treeKey){const bounds=panel.getBoundingClientRect(),heading=panel.querySelector('.outline-heading')?.offsetHeight||0;for(const row of panel.querySelectorAll('.outline-row')){const r=row.getBoundingClientRect();if(r.bottom>bounds.top+heading&&r.top<bounds.bottom){anchor={id:row.dataset.nodeId,offset:r.top-bounds.top};break;}}}
  if(!view.ws.outlineFollow)view.outlinePendingFollow=null;
  view.outlineLastSelection=selected;view.outlineWasOpen=true;view.sidebarToggle.remove();panel.replaceChildren();
  const head=el('div',undefined,'outline-heading'),follow=button('Follow selection',()=>{view.ws.outlineFollow=!view.ws.outlineFollow;view.outlineLastSelection=null;view.draw();view.persist();document.getElementById('outline-follow')?.focus({preventScroll:true});},'outline-follow');
  follow.id='outline-follow';follow.setAttribute('aria-label','Follow selection in sidebar');follow.setAttribute('aria-pressed',String(view.ws.outlineFollow));follow.title=view.ws.outlineFollow?'Stop centering the selected node in the sidebar':'Center the selected node in the sidebar';head.append(view.sidebarToggle,el('strong','Outline'),follow);panel.append(head);
  const newRoots=new Set((view.ws.growth||[]).filter(r=>!r.seenAt||Date.now()<r.seenAt+60000).map(r=>r.nodeId));
  const tree=el('div',undefined,'outline-tree');panel.append(tree);
  for(const {id,depth,children,folded}of rows){
    const item=view.map.nodes.get(id),row=el('div',undefined,'outline-row');row.dataset.nodeId=id;row.dataset.outlineDepth=depth;row.style.setProperty('--outline-depth',depth);row.style.setProperty('--topic',view.color(id));row.classList.toggle('selected',selected===id);
    if(view.nodeSelectionMode&&id!==view.map.root)row.append(selectionCheckbox(view,id,item.title));
    const slot=el('span',undefined,'outline-branch-slot');row.append(slot);
    if(children.length){const fold=button(folded?'›':'⌄',()=>{const forced=view.ws.collapsed.includes(id)&&view.ws.outlineExpanded.includes(id);view.ws.outlineExpanded=view.ws.outlineExpanded.filter(key=>key!==id);if(forced){view.draw();view.persist();}else collapseBranch(view,id);},'outline-fold');fold.setAttribute('aria-label',`${folded?'Expand':'Collapse'} ${item.title}`);fold.setAttribute('aria-expanded',String(!folded));slot.append(fold);}
    const label=button(item.title,()=>{openMapNode(view,id,{focus:true});[...panel.querySelectorAll('.outline-node')].find(node=>node.dataset.nodeId===id)?.focus({preventScroll:true});},'outline-node');label.dataset.nodeId=id;label.title=item.summary||item.title;if(selected===id)label.setAttribute('aria-current','true');wireContextActions(view,id,row,'outline');
    const status=nodeStatus(view,item),marker=nodeStatusMarker(status);label.setAttribute('aria-description',status);if(marker?.tone==='neutral'&&item.type!=='finding'){const mark=el('span',marker.symbol,'outline-selection-marker');mark.setAttribute('aria-hidden','true');label.prepend(mark);}
    if(item.type==='finding')label.append(categoryBadge(item.category,'outline-finding-category'));
    const actions=button('⋯',event=>{event.stopPropagation();view.nodeMenu(id,event.currentTarget,{pin:true,focus:true,representation:'outline'});},'outline-actions');actions.dataset.nodeId=id;actions.setAttribute('aria-label',`Actions for ${item.title}`);wireRadialTrigger(view,id,actions,{representation:'outline'});row.append(label);if(item.type==='feature'){const record=view.records.find(r=>r.id===id);if(record)row.append(bookmark(view,record,'outline'));}row.append(actions);
    if(newRoots.has(id))row.append(el('small','New','outline-new'));if(view.ws.hidden.includes(id))row.append(el('small','hidden'));tree.append(row);
  }
  installOutlineHierarchy(view,tree);
  panel.append(el('p','↑/↓ select nodes · Ctrl+↑/↓ scroll. Selection is shared with the map. Hidden branches remain searchable.','outline-note'));const selectionToggle=button(view.nodeSelectionMode?'Done selecting nodes':'Select nodes',()=>{view.nodeSelectionMode=!view.nodeSelectionMode;if(!view.nodeSelectionMode)view.bulkSelected?.clear();view.draw();document.getElementById('outline-select-nodes')?.focus({preventScroll:true});},'outline-select-nodes');selectionToggle.id='outline-select-nodes';selectionToggle.setAttribute('aria-label','Select nodes for deletion');selectionToggle.setAttribute('aria-pressed',String(!!view.nodeSelectionMode));panel.append(selectionToggle);panel.scrollTop=scroll;
  if(anchor){const row=[...panel.querySelectorAll('.outline-row')].find(n=>n.dataset.nodeId===anchor.id);if(row)panel.scrollTop+=row.getBoundingClientRect().top-panel.getBoundingClientRect().top-anchor.offset;}
  view.outlineTreeKey=treeKey;
  cancelAnimationFrame(view.outlineFollowFrame);
  if(view.outlinePendingFollow)view.outlineFollowFrame=requestAnimationFrame(()=>{
    if(!view.ws.outline||!view.ws.outlineFollow||view.outlinePendingFollow!==(view.ws.inspected||view.map.root||'core'))return;
    const row=[...panel.querySelectorAll('.outline-row')].find(n=>n.dataset.nodeId===view.outlinePendingFollow);if(!row){view.outlinePendingFollow=null;return;}
    const r=row.getBoundingClientRect(),p=panel.getBoundingClientRect(),heading=panel.querySelector('.outline-heading').offsetHeight;
    panel.scrollTo({top:panel.scrollTop+r.top-p.top+r.height/2-(panel.clientHeight+heading)/2,behavior:'instant'});view.outlinePendingFollow=null;
  });
}
