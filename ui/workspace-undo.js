// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {createWorkspaceUndo,WORKSPACE_EDIT_FIELDS} from '../lib/workspace-undo.mjs';
import {readMagneticControls,restoreMagneticControls} from './magnetic-controls.js';
import {workspaceMap} from '../lib/workspace-map.mjs';
import {inventoryRecords} from '../lib/discovery-inventory.mjs';
import {topicGroups} from '../lib/workspace.mjs';
import {hideNodeTooltip} from './node-tooltip.js';

export function installWorkspaceUndo(view){
 const history=createWorkspaceUndo();let applying=false,merge=false,revision='',investigation='';
 const snapshot=()=>({workspace:Object.fromEntries(WORKSPACE_EDIT_FIELDS.map(key=>[key,structuredClone(view.ws[key])])),camera:{...view.camera},theme:window.NodesTheme?.current.id,controls:readMagneticControls(),navigation:view.navigation?.snapshot()});
 const observe=()=>{
  if(!view.state||applying)return;
  const changed=history.observe(snapshot(),{record:!view.suspendUndo,merge});
  if(changed&&!merge){merge=true;queueMicrotask(()=>{merge=false;});}
 };
 async function apply(direction){
  if(applying||view.busy||view.fileBusy||view.preparingNode)return false;
  const current=snapshot(),target=history[direction](current);if(!target)return false;
  applying=true;hideNodeTooltip();view.cancelFocusMotion();view.radialMenu?.close(false,true);
  try{
   const geometry=JSON.stringify([current.workspace.layout,current.workspace.mapPositions])!==JSON.stringify([target.workspace.layout,target.workspace.mapPositions]);
   for(const key of WORKSPACE_EDIT_FIELDS){if(target.workspace[key]===undefined)delete view.ws[key];else view.ws[key]=structuredClone(target.workspace[key]);}
   if(geometry)view.camera={...target.camera};
   if(target.theme&&target.theme!==window.NodesTheme?.current.id)document.querySelector(`#theme-strip [data-appearance="${CSS.escape(target.theme)}"]`)?.click();
   if(JSON.stringify(target.controls)!==JSON.stringify(readMagneticControls()))restoreMagneticControls(target.controls);
   view.navigation?.restore(target.navigation);
   view.state.workspace=view.ws;view.map=workspaceMap(view.state);view.records=inventoryRecords(view.state).filter(record=>view.map.nodes.has(record.id));view.groups=topicGroups(view.records);
   if(view.ws.inspected&&!view.map.nodes.has(view.ws.inspected)){view.ws.inspected='';view.nodeOpen=false;view.askOpen=false;}
   view.draw();view.saveCamera();view.persist();history.observe(snapshot(),{record:false});
   view.actions.notify(direction==='undo'?'Workspace edit undone.':'Workspace edit redone.');return true;
  }finally{applying=false;}
 }
 const controller={observe,undo:()=>apply('undo'),redo:()=>apply('redo'),get canUndo(){return !applying&&history.canUndo;},get canRedo(){return !applying&&history.canRedo;},get count(){return history.count;},accept(state){
  const switched=state.id!==investigation;investigation=state.id;
  // Collection membership has its own durable restore path; it must not erase
  // unrelated presentation edits from Ctrl+Z/Redo.
  const next=JSON.stringify([state.id,state.messages.filter(message=>!message.collectionCommand),state.evidence,state.targets,state.verificationRuns]);
  if(next!==revision){revision=next;history.reset(snapshot());merge=false;
   // Preserve the established saved Undo Tidy snapshot across reopening.
   const old=view.ws.arrangeUndo;if(switched&&old?.layout===view.ws.layout){const current=snapshot(),before=structuredClone(current);before.workspace.mapPositions={...before.workspace.mapPositions,...structuredClone(old.positions)};before.workspace.layouts[old.layout]={positions:before.workspace.mapPositions,camera:old.camera};before.workspace.arrangeUndo=null;before.camera=old.camera||before.camera;history.reset(before);history.observe(current);}
  }else history.observe(snapshot(),{record:false});
 }};
 for(const event of ['nodes-appearance-change','nodes-controls-change','nodes-navigation-change'])document.addEventListener(event,()=>queueMicrotask(observe));
 return controller;
}
