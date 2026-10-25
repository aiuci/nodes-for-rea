// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {ProjectHandoffs} from './project-handoff.mjs';
export function installProjectHandoffHost({handle,store,idle,flushQueue,dialog,getWindow,documentsFolder,shell,clipboard}){
 const handoffs=new ProjectHandoffs(store);
 handle('project-review',async(id,choices)=>{idle();await flushQueue();return handoffs.review(id,choices);});
 handle('project-export',async(id,token,goal)=>{idle();await flushQueue();const selected=await dialog.showOpenDialog(getWindow(),{title:'Choose your project or a new handoff destination',defaultPath:documentsFolder,properties:['openDirectory','createDirectory']});if(selected.canceled||!selected.filePaths[0])return null;idle();await flushQueue();return handoffs.write(id,token,selected.filePaths[0],goal);});
 handle('project-copy',key=>{idle();const result=handoffs.completedResult(key);clipboard.writeText(result.instructions);return true;});
 handle('project-show',async key=>{idle();const result=handoffs.completedResult(key);const error=await shell.openPath(result.folder);if(error)throw Error(error);return true;});
 return handoffs;
}
