// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {AGENT_GOAL_LIMIT} from '../lib/agent-goal.mjs';
import {renderUserError,clearUserError} from './user-feedback.js';
const $=id=>document.getElementById(id);
import {restoredAgentGoal} from '../lib/agent-goal-draft.mjs';
export function installAgentContextUI({api,getState,notify,onChange=()=>{}}){
  const panel=$('agent-panel'),goal=$('agent-goal'),area=document.createElement('section');area.id='agent-context-input';area.setAttribute('aria-label','Goal context');
  area.innerHTML='<div class="agent-context-drop" tabindex="0" role="group" aria-label="Add context: drop source files, images or a URL"><strong>Attachments</strong><span>Drop source files or screenshots onto the goal, or paste an image there. Up to 12 attachments, four images and 128 KB of text. URLs are read only when you plan. Your project uses a separate read-only limit of 30 files / 128 KiB.</span><div class="agent-context-buttons"><button type="button" id="agent-context-files">Add files or images</button><button type="button" id="agent-context-link">Add URL</button></div></div><div id="agent-context-url-row" hidden><label for="agent-context-url">Page or local app URL</label><div><input id="agent-context-url" type="url" placeholder="https://example.com or http://localhost:3000"/><button type="button" id="agent-context-url-add">Add</button></div></div><ul id="agent-project-items" aria-label="Your project"></ul><ul id="agent-context-items" aria-label="Attached context"></ul><p id="agent-context-status" role="status"></p>';
  (goal.closest('.agent-goal-entry')||goal).after(area);const css=document.createElement('link');css.rel='stylesheet';css.href='agent-context.css';document.head.append(css);
  let currentId,items=[],projectFolder=null,projectInfo=null,locked=false,pending=false,timer,entry,revision=0;
  const disabled=()=>locked||pending;
  const busy=()=>{area.querySelectorAll('button,input').forEach(n=>n.disabled=disabled());for(const id of ['agent-folder','agent-context-files','agent-context-link'])$(id).disabled=disabled();area.setAttribute('aria-busy',String(pending));};
  const setPending=value=>{pending=value;busy();panel.dispatchEvent(new CustomEvent('agent-context-busy',{detail:value}));};
  const renderProject=()=>{
    $('agent-project-items').replaceChildren();if(!projectFolder)return;
    const row=document.createElement('li'),text=document.createElement('span'),status=document.createElement('small'),remove=document.createElement('button');
    text.textContent=`Your project: ${projectFolder.split(/[\\/]/).filter(Boolean).at(-1)||projectFolder}`;text.title=projectFolder;
    const count=projectInfo?.projectFiles?.length||0;status.textContent=projectInfo?`${count} file${count===1?'':'s'} · ${projectInfo.projectTruncated?'limited':'bounded'} excerpts`:'Read when you plan';
    remove.type='button';remove.textContent='×';remove.title='Remove your project folder';remove.setAttribute('aria-label','Remove your project folder');remove.onclick=()=>change('project-folder',null);
    row.append(text,status,remove);$('agent-project-items').append(row);
  };
  const render=draft=>{
    if(Object.hasOwn(draft,'projectFolder')){if(projectFolder!==draft.projectFolder)projectInfo=null;projectFolder=draft.projectFolder;}
    items=draft.items||[];renderProject();
    $('agent-context-items').replaceChildren(...items.map(item=>{
      const row=document.createElement('li'),text=document.createElement('span');text.textContent=item.name;text.title=`${item.kind==='image'?'Image':item.kind==='url'?'URL':'File'}: ${item.name}`;
      const status=document.createElement('small');status.textContent=item.status;
      const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Remove ${item.name}`);remove.title=`Remove ${item.name}`;remove.onclick=()=>change('remove',item.id);row.append(text,status,remove);return row;
    }));busy();
  };
  async function change(operation,value){
    if(disabled())return;revision++;setPending(true);const id=getState().id;
    try{const draft=await api.agentContextUpdate(id,operation,value);if(getState().id!==id)return false;render(draft);onChange();$('agent-context-status').textContent=operation==='project-folder'?(projectFolder?'Your project attached. Bounded excerpts are read when you plan.':'Your project removed. Plan again before approval.'):`${draft.items.length} context item${draft.items.length===1?'':'s'} ready for planning. URLs are read when you plan.`;return true;}
    catch(error){renderUserError($('agent-context-status'),error,{context:'attachment',action:{label:'Review attachments',run:()=>{$('agent-context-files').focus();}}});notify(error);return false;}finally{setPending(false);}
  }
  async function choose(project){
    if(disabled())return;let value;setPending(true);
    try{value=await (project?api.agentFolder():api.agentContextPick());}catch(error){notify(error);}finally{setPending(false);}
    if(project?!!value:!!value?.length)await change(project?'project-folder':'files',value);
  }
  $('agent-folder').onclick=()=>choose(true);$('agent-context-files').onclick=()=>choose(false);
  $('agent-context-link').onclick=()=>{if(disabled())return;$('agent-context-url-row').hidden=!$('agent-context-url-row').hidden;$('agent-context-link').setAttribute('aria-expanded',String(!$('agent-context-url-row').hidden));if(!$('agent-context-url-row').hidden)$('agent-context-url').focus();};
  const addUrl=async()=>{const input=$('agent-context-url');try{new URL(input.value);}catch{renderUserError($('agent-context-status'),new Error('Enter a complete HTTP(S) URL.'),{context:'validation',action:{label:'Edit URL',run:()=>input.focus()}});input.setAttribute('aria-invalid','true');return;}if(await change('url',input.value)){input.removeAttribute('aria-invalid');input.value='';$('agent-context-url-row').hidden=true;$('agent-context-link').setAttribute('aria-expanded','false');}};
  $('agent-context-url-add').onclick=addUrl;$('agent-context-url').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();addUrl();}};
  const drop=area.querySelector('.agent-context-drop');
  panel.addEventListener('dragover',event=>{if(event.dataTransfer?.types?.some(t=>['Files','text/uri-list','text/plain'].includes(t))){event.preventDefault();event.stopPropagation();drop.classList.add('dragging');entry?.classList.add('dragging');}});
  panel.addEventListener('dragleave',event=>{if(!panel.contains(event.relatedTarget)){drop.classList.remove('dragging');entry?.classList.remove('dragging');}});
  panel.addEventListener('drop',event=>{event.preventDefault();event.stopPropagation();drop.classList.remove('dragging');entry?.classList.remove('dragging');if(disabled())return;const files=[...event.dataTransfer.files];if(files.length)change('files',files.map(file=>api.pathForFile(file)));else{const value=(event.dataTransfer.getData('text/uri-list')||event.dataTransfer.getData('text/plain')).split('\n').find(s=>s.trim()&&!s.startsWith('#'));if(value)change('url',value);}});
  panel.addEventListener('paste',async event=>{const files=[...(event.clipboardData?.files||[])];if(!files.length)return;event.preventDefault();event.stopPropagation();if(disabled())return;revision++;setPending(true);const id=getState().id;try{const value=await Promise.all(files.map(async file=>({name:file.name||'Pasted image.png',bytes:new Uint8Array(await file.arrayBuffer())}))),draft=await api.agentContextPaste(id,value);if(getState().id===id){render(draft);onChange();}}catch(error){notify(error);}finally{setPending(false);}});
  const flushGoal=()=>{clearTimeout(timer);return api.agentContextUpdate(getState().id,'goal',goal.value);};
  goal.addEventListener('input',()=>{revision++;onChange();clearTimeout(timer);const id=getState().id,value=goal.value;if(value.length<=AGENT_GOAL_LIMIT)timer=setTimeout(()=>api.agentContextUpdate(id,'goal',value).catch(error=>notify(error)),250);});
  const icon=(button,label,path)=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),line=document.createElementNS(svg.namespaceURI,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width','18');svg.setAttribute('height','18');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');line.setAttribute('d',path);svg.append(line);button.replaceChildren(svg);button.title=label;button.setAttribute('aria-label',label);};
  return {
    mount(composer,goalEntry,options){
      entry=goalEntry;options.append(drop);composer.insertBefore(area,composer.querySelector('.agent-plan-actions'));
      const tools=document.createElement('div');tools.className='agent-goal-tools';tools.setAttribute('role','group');tools.setAttribute('aria-label','Add context or dictate goal');
      // Folder/document strokes reuse the app's existing Source/Result symbols.
      icon($('agent-folder'),'Add your project folder','M3 6h7l2 3h9v12H3ZM3 9V4h7l2 2h7v3');
      icon($('agent-context-files'),'Add files or images','M5 3h10l4 4v14H5ZM15 3v5h4M8 12h8M8 16h6');
      icon($('agent-context-link'),'Add URL','M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2');
      $('agent-context-link').setAttribute('aria-controls','agent-context-url-row');$('agent-context-link').setAttribute('aria-expanded','false');
      tools.append($('agent-folder'),$('agent-context-files'),$('agent-context-link'),$('agent-mic'));entry.append(tools);
    },
    setProjectInfo:value=>{projectInfo=value?.projectFolder===projectFolder?value:null;renderProject();busy();},get projectFolder(){return projectFolder;},
    setLocked:value=>{locked=value;busy();},get busy(){return pending;},flushGoal,showSnapshot:value=>{if(value)render(value);},reportError:error=>{renderUserError($('agent-context-status'),error,{context:'attachment',action:{label:'Review attachments',run:()=>{$('agent-context-files').focus();}}});},
    async load(id,{goalDraft,savedGoal='',projectFolder:savedProject=null}={}){
      currentId=id;projectFolder=savedProject;projectInfo=null;
      const version=revision,draft=await api.agentContextRead(id);
      if(currentId!==id||getState().id!==id)return;
      if(version===revision){
        // A current draft may have been edited while Agent status was loading,
        // before this read began. Disk is the fallback, not the newer authority.
        goal.value=goalDraft!==undefined?goalDraft:restoredAgentGoal(typeof draft.goal==='string'?draft.goal:savedGoal,draft.goalDraftVersion);
        goal.dispatchEvent(new Event('agent-goal-restored'));
        render(draft);
      }
      return goal.value;
    },items:()=>items
  };
}
