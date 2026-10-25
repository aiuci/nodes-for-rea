// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {InvestigationDocuments} from './document-controller.mjs';
import {readDocument} from './investigation-document.mjs';

export function installDocumentHost({store,app,dialog,Menu,getWindow,handle,idle,flushQueue,getCurrent,setCurrent,stop,waitIdle,flushTimeoutMs=5000}){
  const documents=new InvestigationDocuments(store,{appVersion:app.getVersion()}),filters=[{name:'Nodes for REA investigation',extensions:['reanodes']}];let queue=Promise.resolve(),closing=false,skipClose=false,pendingFlush;
  const run=fn=>{const result=queue.then(fn,fn);queue=result.catch(()=>{});return result;};
  const display=async id=>{const status=await documents.status(id);if(id===getCurrent())getWindow()?.setTitle(status.recoveryOnly?'Nodes for REA':`${status.name}${status.dirty?' *':''} — Nodes for REA`);return status;};
  const chooseSave=async(id,title)=>{const state=await store.read(id),b=await documents.binding(id),name=(state.title||'Investigation').replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').trim().slice(0,80)||'Investigation';return dialog.showSaveDialog(getWindow(),{title,defaultPath:b?.filePath||`${name}.reanodes`,filters});};
  const save=async(id,copy=false)=>{
    idle();await flushQueue();const b=await documents.binding(id);let file=b?.filePath;
    if(copy||!file){const chosen=await chooseSave(id,copy?'Save investigation as':'Save investigation');if(chosen.canceled||!chosen.filePath)return null;file=/\.reanodes$/i.test(chosen.filePath)?chosen.filePath:chosen.filePath+'.reanodes';}
    idle();await flushQueue();const result=await documents.save(id,file,{copy});if(copy)await setCurrent(result.state.id);return {...result,status:await display(result.state.id)};
  };
  const guard=async()=>{
    await flushQueue();const id=getCurrent();if(!id)return true;const status=await documents.status(id);if(!status.dirty)return true;
    const result=await dialog.showMessageBox(getWindow(),{type:'question',title:'Unsaved document changes',message:`Save changes to “${status.name}”?`,detail:'Your latest work is also saved in local recovery. Keep recovery copy leaves the document unchanged and retains these changes in History.',buttons:['Save','Keep recovery copy','Cancel'],defaultId:0,cancelId:2,noLink:true});
    if(result.response===2)return false;if(result.response===1)return true;return !!await save(id,false);
  };
  handle('document-status',id=>display(id));
  handle('document-save',(id,copy=false)=>run(()=>save(id,copy===true)));
  handle('document-open',provided=>run(async()=>{
    idle();await flushQueue();let file=provided;
    if(file!==undefined&&typeof file!=='string')throw new Error('Choose an investigation document.');
    if(!file){const chosen=await dialog.showOpenDialog(getWindow(),{title:'Open investigation',properties:['openFile'],filters});if(chosen.canceled||!chosen.filePaths[0])return null;file=chosen.filePaths[0];}
    const checked=await readDocument(file); // Validate before asking to leave or publishing recovery.
    if(!await guard())return null;idle();await flushQueue();const result=await documents.open(file,{checked:await readDocument(file)});await setCurrent(result.state.id);return {...result,status:await display(result.state.id)};
  }));
  handle('document-review',(id,choices)=>run(async()=>{idle();await flushQueue();return documents.review(id,choices);}));
  handle('document-share',(id,token)=>run(async()=>{
    idle();await flushQueue();const chosen=await chooseSave(id,'Save shared investigation copy');if(chosen.canceled||!chosen.filePath)return null;
    const file=/\.reanodes$/i.test(chosen.filePath)?chosen.filePath:chosen.filePath+'.reanodes';idle();await flushQueue();return documents.share(id,file,token);
  }));
  handle('document-flushed',(token,id,error)=>{if(!pendingFlush||pendingFlush.token!==token)return false;const request=pendingFlush;pendingFlush=null;clearTimeout(request.timer);if(id!==getCurrent())request.reject(new Error('The active investigation changed during closing.'));else if(error)request.reject(new Error(error));else request.resolve();return true;});
  const flushRenderer=()=>new Promise((resolve,reject)=>{const token=randomUUID(),timer=setTimeout(()=>{pendingFlush=null;reject(new Error('Could not confirm that the workspace finished saving. Try closing again.'));},flushTimeoutMs);pendingFlush={token,resolve,reject,timer};getWindow().webContents.send('document-flush-request',token);});
  const closeWindow=async event=>{
    if(skipClose)return;if(closing){event.preventDefault();return;}event.preventDefault();closing=true;getWindow()?.webContents.send('document-close-state',true);
    try{stop();await waitIdle();if(getCurrent())await flushRenderer();await queue;await flushQueue();if(!await guard())return;skipClose=true;getWindow()?.destroy();}
    catch(error){const result=await dialog.showMessageBox(getWindow(),{type:'error',title:'Workspace kept open',message:'Your work could not be saved before closing.',detail:`This window is still open. Check the save location and free space, then try saving again.\n\nTechnical details: ${error.message}`,buttons:['Keep window open','Try saving again'],defaultId:1,cancelId:0,noLink:true});if(result.response===1)setTimeout(()=>getWindow()?.webContents.send('document-command','save'),0);}
    finally{if(!skipClose){closing=false;getWindow()?.webContents.send('document-close-state',false);}}
  };
  const menu=Menu.buildFromTemplate([{label:'File',submenu:[{label:'Open…',accelerator:'CmdOrCtrl+O',click:()=>getWindow()?.webContents.send('document-command','open')},{label:'Save',accelerator:'CmdOrCtrl+S',click:()=>getWindow()?.webContents.send('document-command','save')},{label:'Save As…',accelerator:'CmdOrCtrl+Shift+S',click:()=>getWindow()?.webContents.send('document-command','save-as')},{label:'Share a copy…',click:()=>getWindow()?.webContents.send('document-command','share')},{type:'separator'},{role:'close'}]},{role:'editMenu'},{role:'viewMenu'}]);Menu.setApplicationMenu(menu);
  return {documents,guard,closeWindow,display,async restart(){if(!await guard())return false;skipClose=true;app.relaunch({args:app.isPackaged?[]:[app.getAppPath()]});app.quit();return true;}};
}
