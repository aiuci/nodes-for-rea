// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const api=window.investigation;
const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const dialog=make('dialog',undefined,'delete-dialog');dialog.id='delete-confirmation';dialog.setAttribute('aria-labelledby','delete-confirmation-title');dialog.setAttribute('aria-describedby','delete-confirmation-description delete-confirmation-kept');
const close=make('button','×','delete-dialog-close');close.type='button';close.setAttribute('aria-label','Cancel deletion');
const icon=make('span',undefined,'delete-dialog-icon');icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
const heading=make('h2');heading.id='delete-confirmation-title';
const description=make('p','The selected conversations and saved source snapshots will move to the Recycle Bin.');description.id='delete-confirmation-description';
const list=make('ul',undefined,'delete-dialog-items');list.setAttribute('aria-label','Selected investigations');
const kept=make('p','Original source folders, saved .reanodes documents and exports elsewhere are kept.','delete-dialog-kept');kept.id='delete-confirmation-kept';
const footer=make('div',undefined,'delete-dialog-actions'),cancel=make('button','Cancel'),confirm=make('button','Move to Recycle Bin','delete-dialog-confirm');cancel.type=confirm.type='button';footer.append(cancel,confirm);dialog.append(close,icon,heading,description,list,kept,footer);document.body.append(dialog);
let token,opener;
const dismiss=()=>{token=null;if(dialog.open)dialog.close();if(opener?.isConnected)opener.focus();};
const answer=approved=>{if(!token)return;const current=token;dismiss();api.answerDeleteConfirmation(current,approved).catch(()=>{});};
cancel.onclick=close.onclick=()=>answer(false);confirm.onclick=()=>answer(true);dialog.addEventListener('cancel',event=>{event.preventDefault();answer(false);});
api.onDeleteConfirmation(request=>{
 if(token)answer(false);token=request.token;opener=document.activeElement;heading.textContent=request.items.length===1?'Delete this investigation?':`Delete ${request.items.length} investigations?`;list.replaceChildren();
 for(const item of request.items.slice(0,20)){const row=make('li'),title=make('strong',item.title),detail=make('span',`${item.savedAt} · Session ${item.shortId}`);row.append(title,detail);list.append(row);}
 if(request.items.length>20)list.append(make('li',`And ${request.items.length-20} more selected investigations`));
 dialog.showModal();cancel.focus();
});
api.onDeleteConfirmationDismiss(current=>{if(current===token)dismiss();});
