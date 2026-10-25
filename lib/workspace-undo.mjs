// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Only local presentation state belongs here. Research, drafts, provider work
// and document identities never enter the undo journal.
export const WORKSPACE_EDIT_FIELDS=['layout','mapPositions','layouts','placedNodes','tidiedLayouts','arrangeUndo','hidden','collapsed','expanded','deletedNodes','deleteUndo','pins','processMap','outline','outlineWidth','outlineFollow','outlineExpanded','dottedLines','wiresVisible','wireStyle','panel'];
const copy=value=>structuredClone(value);
export function editSignature(value){
 const workspace={...value.workspace};
 // Navigation alone must not bury an edit under camera/reader-scroll entries.
 workspace.layouts=Object.fromEntries(Object.entries(workspace.layouts||{}).map(([id,layout])=>[id,{positions:layout.positions}]));
 return JSON.stringify({workspace,theme:value.theme,controls:value.controls,navigation:value.navigation});
}
export function createWorkspaceUndo({limit=50,maxBytes=8*1024*1024}={}){
 let current=null;const past=[],future=[];
 const trim=()=>{while(past.length>limit||past.length>1&&JSON.stringify(past).length>maxBytes)past.shift();};
 return {
  get canUndo(){return past.length>0;},get canRedo(){return future.length>0;},get count(){return past.length;},
  reset(value){past.length=0;future.length=0;current=copy(value);},
  observe(value,{record=true,merge=false}={}){
   const next=copy(value);if(!current){current=next;return false;}
   if(editSignature(current)===editSignature(next)){current=next;return false;}
   if(record){if(merge&&past.length)past.at(-1).after=next;else past.push({before:current,after:next});future.length=0;trim();}
   current=next;return record;
  },
  undo(value=current){const entry=past.pop();if(!entry)return null;future.push({...entry,after:copy(value)});current=copy(entry.before);return copy(current);},
  redo(value=current){const entry=future.pop();if(!entry)return null;past.push({...entry,before:copy(value)});trim();current=copy(entry.after);return copy(current);}
 };
}
