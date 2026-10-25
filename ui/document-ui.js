// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {renderUserError,clearUserError} from './user-feedback.js';
const $=id=>document.getElementById(id);
const element=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export function installDocumentUI({api,getState,acceptState,flush,busy,fileBusy,notify}){
  let timer,version=0,status;
  const paint=s=>{status=s;$('document-info').textContent=s.recoveryOnly?'Recovery copy · Save to create a portable document':`${s.name} · ${s.fileUnavailable?'Document unavailable · local recovery retained':s.dirty?'Unsaved document changes':`Saved · revision ${s.revision}`}`;$('document-info').title=s.path||'Your work is recovered locally; Save creates a portable .reanodes file.';$('workspace-save').title=s.dirty?'Local recovery is saved. Use Settings → Save to update the portable document.':'Local recovery save status';};
  const refresh=()=>{clearTimeout(timer);const revision=++version,id=getState()?.id;if(!id)return;timer=setTimeout(async()=>{try{const next=await api.documentStatus(id);if(version===revision&&getState()?.id===id)paint(next);}catch(error){notify(error);}},250);};
  const run=async command=>{
    if(busy()||!getState())return;fileBusy(true);
    try{
      await flush();if(command==='share'){await share();return;}
      const result=command==='open'?await api.documentOpen():await api.documentSave(getState().id,command==='save-as');
      if(!result)return;if(result.state.id!==getState().id)acceptState(result.state);paint(result.status);notify(command==='open'?`Opened ${result.status.name}.${result.status.warnings.length?` ${result.status.warnings.length} evidence snapshot(s) missing or excluded; saved findings remain readable.`:''}`:`Saved ${result.status.name}.`);
    }catch(error){notify(error,{context:command==='open'?'open':command==='share'?'share':'save',action:{label:command==='open'?'Choose another file':'Try saving again',run:()=>run(command)}});}finally{fileBusy(false);refresh();}
  };
  for(const [id,command]of [['document-open','open'],['document-save','save'],['document-save-as','save-as'],['document-share','share']])$(id).onclick=()=>run(command);
  api.onDocumentCommand(run);
  // Keep a closing snapshot stable until the host commits or cancels closing.
  // Do not touch the unsent values; error/cancel restores prior focus and access.
  let closeLock=null;
  api.onDocumentCloseState?.(closing=>{
    if(closing&&!closeLock){
      const focus=document.activeElement,locked=[...document.body.children].filter(n=>!['SCRIPT','STYLE','LINK'].includes(n.tagName)).map(n=>({node:n,inert:n.inert}));
      for(const {node}of locked)node.inert=true;
      const notice=element('div','Saving before closing. Your draft stays here until saving finishes.','document-close-notice');notice.setAttribute('role','status');notice.tabIndex=-1;document.body.append(notice);notice.addEventListener('keydown',event=>{event.preventDefault();event.stopPropagation();});notice.focus({preventScroll:true});closeLock={focus,locked,notice};
    }else if(!closing&&closeLock){const {focus,locked,notice}=closeLock;closeLock=null;for(const {node,inert}of locked)if(node.isConnected)node.inert=inert;notice.remove();if(focus?.isConnected)focus.focus({preventScroll:true});}
  });
  api.onDocumentFlush(async token=>{let error;try{await flush();}catch(e){error=e.message;}await api.documentFlushed(token,getState()?.id,error).catch(e=>notify(e));});
  async function share(){
    const dialog=element('dialog',undefined,'workspace-dialog document-review');dialog.setAttribute('aria-labelledby','share-heading');
    const heading=element('h2','Share a copy');heading.id='share-heading';dialog.append(heading,element('p','Review what leaves this workspace. Snapshots may contain private code, URLs or personal information. Connection stores and authentication are never included; recognizable credentials in research are removed.'));
    const choices=element('div',undefined,'share-options'),fields={};
    for(const [key,label,checked,note]of [['includeDraft','Include unsent draft',false,'Includes its saved destination.'],['includeHidden','Include hidden branches',false,'Excluding hidden work also removes owning result records and dependent follow-ups, including repeated prose.'],['includeDeleted','Include research retained behind deleted nodes',false,'Deletion is recoverable. Excluding deleted work removes owning records and dependent follow-ups from this copy.'],['includeContext','Include purpose and request context',true,'Includes purpose, saved request fields and design choices. Findings and evidence may repeat context even when excluded. Unsent draft is a separate choice.'],['includeLocalPaths','Include original local source paths',false,'Targets remain external; installed apps and repositories are not bundled.']]){const row=element('label'),input=element('input');input.type='checkbox';input.checked=checked;input.name=key;fields[key]=input;row.append(input,element('span',label),element('small',note));choices.append(row);}
    const summary=element('p','Preparing review…','share-summary');summary.setAttribute('role','status');summary.id='share-summary';const purpose=element('p',undefined,'share-purpose'),context=element('details'),contextSummary=element('summary','Purpose refinements, draft and design decisions'),contextBody=element('pre',undefined,'share-snapshot');context.append(contextSummary,contextBody);const sources=element('details'),sourceSummary=element('summary','External targets');sources.append(sourceSummary);
    const evidence=element('details');evidence.open=true;evidence.append(element('summary','Evidence snapshots'));const list=element('div',undefined,'share-evidence-list');evidence.append(list);
    const raw=element('pre',undefined,'share-snapshot');raw.hidden=true;raw.tabIndex=0;const actions=element('div',undefined,'share-actions'),cancel=element('button','Cancel'),commit=element('button','Save shared copy…');cancel.type=commit.type='button';commit.className='primary';commit.disabled=true;actions.append(cancel,commit);dialog.append(choices,summary,purpose,context,sources,evidence,raw,actions);document.body.append(dialog);
    let latest=null,sequence=0,reviewTimer,rows=new Map();
    const readChoices=()=>({...Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.checked])),excludedEvidence:[...rows].filter(([,row])=>!row.input.checked).map(([id])=>id)});
    const review=async()=>{const current=++sequence;commit.disabled=true;try{const result=await api.documentReview(getState().id,readChoices());if(current!==sequence||!dialog.open)return;latest=result;clearUserError(summary);summary.textContent=`${result.includedNodes} nodes included · ${result.omittedNodes} omitted · ${result.omittedResultRecords} whole result records omitted · ${result.omittedEvidence} snapshots omitted${result.draftIncluded?' · Unsent draft included':''}`;contextBody.textContent=JSON.stringify({purpose:result.purposeRecord,draft:result.draftText,designDecisions:result.designDecisions},null,2);purpose.textContent=`Purpose: ${result.purpose}${result.conservativeRecordExclusions?' Related raw requests and aggregate summaries are also omitted to avoid repeating excluded work.':''}`;
      if(!rows.size){for(const e of result.evidence){const row=element('div',undefined,'share-evidence-row'),label=element('label'),input=element('input');input.type='checkbox';input.checked=true;input.setAttribute('aria-label',`Include snapshot: ${e.title}`);const detail=element('span'),title=element('strong',e.title),locator=element('small',e.locator),included=element('small');detail.append(title,locator,included);label.append(input,detail);const inspect=element('button','Review');inspect.type='button';inspect.setAttribute('aria-label',`Review snapshot: ${e.title}`);inspect.onclick=async()=>{try{const snapshot=await api.snapshot(getState().id,e.id);raw.hidden=false;raw.textContent=snapshot.text+(snapshot.truncated?'\n[Preview truncated; the package uses the retained snapshot.]':'');raw.focus();}catch(error){raw.hidden=false;renderUserError(raw,error,{title:'This retained snapshot could not be read',message:'The shared-copy review is still open. Review another snapshot or exclude this one.'});}};row.append(label,inspect);list.append(row);rows.set(e.id,{input,included});input.onchange=schedule;}
        for(const locator of result.externalTargets)sources.append(element('p',locator));
      }
      for(const e of result.evidence)rows.get(e.id).included.textContent=e.excluded?'Will be excluded':'Will be bundled if its retained snapshot is available';if(result.privateSourceAliases)purpose.textContent+=` ${result.privateSourceAliases} source identity/identities that encoded local paths will be privately aliased with their map links and colors retained.`;commit.disabled=false;
    }catch(error){renderUserError(summary,error,{context:'share',action:{label:'Review shared copy again',run:()=>review()}});}};
    const schedule=()=>{clearTimeout(reviewTimer);commit.disabled=true;reviewTimer=setTimeout(review,120);};for(const input of Object.values(fields))input.onchange=schedule;
    await new Promise(resolve=>{
      const finish=()=>{clearTimeout(reviewTimer);sequence++;dialog.remove();resolve();};dialog.addEventListener('cancel',event=>{event.preventDefault();finish();});cancel.onclick=finish;
      commit.onclick=async()=>{if(!latest)return;commit.disabled=true;cancel.disabled=true;try{const saved=await api.documentShare(getState().id,latest.token);if(saved){notify(`Shared copy saved to ${saved.path}. ${saved.manifest.attachments.filter(a=>a.status!=='bundled').length} evidence snapshots are excluded or unavailable.`);finish();}else commit.disabled=false;}catch(error){renderUserError(summary,error,{context:'share',action:{label:'Review shared copy again',run:()=>review()}});}finally{cancel.disabled=false;}};
      dialog.showModal();cancel.focus();review();
    });
  }
  return {refresh,async openDropped(file){if(busy())return;fileBusy(true);try{await flush();const result=await api.documentOpen(file);if(result){acceptState(result.state);paint(result.status);notify(`Opened ${result.status.name}.`);}}catch(error){notify(error,{context:'open',action:{label:'Choose another file',run:()=>run('open')}});}finally{fileBusy(false);refresh();}}};
}
