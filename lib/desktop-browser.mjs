// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {randomUUID} from 'node:crypto';
export function browserCapture({BrowserWindow},publicUrl){
  return async(value,signal)=>{
    const url=publicUrl(value).href,window=new BrowserWindow({show:false,webPreferences:{partition:`rea-public-${randomUUID()}`,sandbox:true,nodeIntegration:false,contextIsolation:true}}),wc=window.webContents;
    wc.setWindowOpenHandler(()=>({action:'deny'}));wc.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));wc.session.on('will-download',event=>event.preventDefault());
    const navigation=(event,target)=>{try{publicUrl(target);}catch{event.preventDefault();}};wc.on('will-navigate',navigation);wc.on('will-redirect',navigation);
    wc.session.webRequest.onBeforeRequest({urls:['*://*/*']},(details,callback)=>{try{publicUrl(details.url);callback({cancel:false});}catch{callback({cancel:true});}});
    let timer;const destroy=()=>{if(!window.isDestroyed())window.destroy();},abort=()=>destroy();signal?.addEventListener('abort',abort,{once:true});
    try{
      signal?.throwIfAborted();await Promise.race([window.loadURL(url),new Promise((_,reject)=>timer=setTimeout(()=>{destroy();reject(new Error('Public-page browser capture timed out.'));},60000))]);clearTimeout(timer);
      await new Promise(resolve=>setTimeout(resolve,1800));signal?.throwIfAborted();const html=await wc.executeJavaScript('document.documentElement.outerHTML'),locator=publicUrl(wc.getURL()).href;
      if(html.length>24000000)throw new Error('Public-page capture exceeded the local capture limit.');
      return {evidence_id:randomUUID(),normalized_result:{steps:[{after_url:{url:locator},artifacts:{dom:{state:'captured',value:{text:html}}}}]},limitations:['Captured with the bundled Chromium runtime in a fresh public session; no signed-in workflows or private backend source.']};
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);destroy();}
  };
}
