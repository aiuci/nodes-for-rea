// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {deletionPlan} from '../lib/node-deletion.mjs';
import {workspaceMap} from '../lib/workspace-map.mjs';
import {inventoryRecords} from '../lib/discovery-inventory.mjs';
import {topicGroups} from '../lib/workspace.mjs';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const button=(text,run)=>{const n=el('button',text);n.type='button';n.onclick=run;return n;};
export function selectionCheckbox(view,id,title){
  const box=el('input');box.type='checkbox';box.className='node-select-checkbox';box.dataset.selectNode=id;box.checked=!!view.bulkSelected?.has(id);box.setAttribute('aria-label',`Select ${title} for deletion`);
  for(const name of ['pointerdown','click','keydown'])box.addEventListener(name,event=>event.stopPropagation());
  box.onchange=()=>{view.bulkSelected??=new Set();if(box.checked)view.bulkSelected.add(id);else view.bulkSelected.delete(id);syncBulkDelete(view);};return box;
}
function refresh(view){
  view.state.workspace=view.ws;view.map=workspaceMap(view.state);view.records=inventoryRecords(view.state).filter(r=>view.map.nodes.has(r.id));view.groups=topicGroups(view.records);
  if(!view.map.nodes.has(view.ws.inspected)){view.ws.inspected='';view.nodeOpen=false;view.askOpen=false;}
  if(view.ws.reader&&!view.map.nodes.has(view.ws.reader.nodeId))view.ws.reader=null;
  view.draw();view.persist();
}
export function syncBulkDelete(view){
  view.bulkSelected??=new Set();for(const id of view.bulkSelected)if(!view.map?.nodes.has(id))view.bulkSelected.delete(id);
  let bar=document.getElementById('bulk-node-actions');if(!bar){bar=el('div');bar.id='bulk-node-actions';bar.setAttribute('aria-label','Selected nodes');document.querySelector('#workspace-heading .workspace-view-tools').prepend(bar);}
  bar.replaceChildren();bar.hidden=!view.nodeSelectionMode||(!view.bulkSelected.size&&!view.ws.deleteUndo);
  if(view.bulkSelected.size){const count=el('span',`${view.bulkSelected.size} selected`);count.setAttribute('role','status');const remove=button('Delete selected',()=>confirmDelete(view));remove.disabled=!!(view.busy||view.fileBusy||view.preparingNode);bar.append(count,remove,button('Clear selection',()=>{view.bulkSelected.clear();syncBulkDelete(view);}));}
  if(view.ws.deleteUndo){const undo=button('Undo delete',()=>{if(view.busy||view.fileBusy||view.preparingNode)return;view.ws.deletedNodes=[...view.ws.deleteUndo.deletedNodes];view.ws.deleteUndo=null;view.bulkSelected.clear();refresh(view);view.actions.notify('Deleted nodes restored.');});undo.disabled=!!(view.busy||view.fileBusy||view.preparingNode);bar.append(undo);}
  for(const box of document.querySelectorAll('[data-select-node]'))box.checked=view.bulkSelected.has(box.dataset.selectNode);
}
function plan(view){return deletionPlan(view.map,[...view.bulkSelected],{busy:view.busy||view.fileBusy||view.preparingNode,draft:view.state.draft||'',draftContext:view.state.draftContext});}
function confirmDelete(view){
  const initial=plan(view);if(initial.blocked){view.actions.notify(initial.blocked);return;}if(!initial.ids.length)return;
  const investigationId=view.state.id,dialog=el('dialog');dialog.className='workspace-dialog bulk-delete-dialog';dialog.setAttribute('aria-label','Delete selected nodes');
  dialog.append(el('h2',`Delete ${initial.ids.length} nodes?`),el('p',`${initial.roots.length} selected branches, including their child nodes—even if folded or hidden. This removes them from the map and sidebar. Original research and evidence remain saved for recovery; Undo delete restores the nodes.`));
  const list=el('ul');for(const id of initial.roots)list.append(el('li',view.map.nodes.get(id).title));dialog.append(list);
  const cancel=button('Cancel',()=>dialog.close()),remove=button(`Delete ${initial.ids.length} nodes`,()=>{
    const current=plan(view);if(view.state.id!==investigationId||current.blocked||JSON.stringify(current.ids)!==JSON.stringify(initial.ids)){view.actions.notify(current.blocked||'The investigation changed. Review the selection again.');dialog.close();return;}
    view.radialMenu?.close(false);view.cancelFocusMotion();view.ws.deleteUndo={deletedNodes:[...(view.ws.deletedNodes||[])]};view.ws.deletedNodes=[...new Set([...(view.ws.deletedNodes||[]),...current.ids])];view.bulkSelected.clear();dialog.close();refresh(view);view.actions.notify(`${current.ids.length} nodes deleted. Undo delete is available.`);
  });dialog.append(cancel,remove);document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();document.querySelector('#bulk-node-actions button')?.focus({preventScroll:true});},{once:true});dialog.showModal();cancel.focus();
}
