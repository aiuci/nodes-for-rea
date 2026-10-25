// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {historyPresentation} from '../lib/history-presentation.mjs';
const element=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};
export function createHistoryEntry(item,{current,selected,onSelect,onOpen,onFolder,onDelete,onUseProject}){
  const info=historyPresentation(item),identity=`${info.title} · ${info.savedAt} · Session ${info.shortId}`;
  const entry=element('div','history-entry');entry.dataset.investigationId=item.id;
  const checkbox=element('input','history-checkbox');checkbox.type='checkbox';checkbox.dataset.historySelect=item.id;checkbox.checked=selected;checkbox.setAttribute('aria-label',`Select ${identity} for deletion`);checkbox.onchange=()=>onSelect(checkbox.checked);
  const open=element('button','history-open');open.type='button';open.setAttribute('aria-label',`${current?'Return to':'Open'} investigation: ${identity}`);
  if(current)open.setAttribute('aria-current','true');
  const heading=element('span','history-open-heading');heading.append(element('strong','history-project-name',info.title),element('span','history-open-cue',current?'Return to investigation →':'Open investigation →'));
  const session=element('span','history-session'),time=element('time','history-saved-at',info.savedAt);if(info.dateTime)time.dateTime=info.dateTime;
  session.append(time,element('span','history-session-id',`Session ${info.shortId}${current?' · Current':''}`));
  const location=element('span','history-location',info.location?`${info.locationLabel}: ${info.shortLocation}`:'No sources yet');location.title=info.location?`${info.locationLabel}: ${info.location}`:'No sources yet';
  open.append(heading,session,location);
  if(item.workspaceRecovery)open.append(element('span','history-location','View recovered · saved research retained'));
  open.onclick=onOpen;
  const actions=element('div','history-entry-actions');
  const folder=element('button','history-folder','Show folder');folder.type='button';folder.title='Open this session’s saved conversation and evidence folder';folder.setAttribute('aria-label',`Show saved investigation folder: ${identity}`);folder.onclick=onFolder;
  const remove=element('button','history-delete','Delete');remove.type='button';remove.setAttribute('aria-label',`Delete investigation: ${identity}`);remove.onclick=onDelete;
  const use=element('button','history-use-project','Use in a project');use.type='button';use.setAttribute('aria-label',`Use investigation in a project: ${identity}`);use.onclick=()=>onUseProject?.(use);
  actions.append(use,folder,remove);entry.append(checkbox,open,actions);return entry;
}
