// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {randomUUID,createHash} from 'node:crypto';
import {publicUrl,extractHtml} from './sources.mjs';
import {redactText} from './document-privacy.mjs';

export function accessUrl(value){const url=publicUrl(value);if(url.protocol!=='https:')throw Error('Use the intended HTTPS resource URL for sign-in.');return url;}
const cleanUrl=value=>{const url=new URL(value);url.hash='';url.search='';return redactText(url.href).text;};
const diagnostic=error=>redactText(String(error.message||error).replace(/https?:\/\/[^\s"'<>]+/g,value=>{try{return cleanUrl(value);}catch{return '[selected resource]';}})).text;
const cleanDom=(value,locator)=>redactText(value.replace(/\s+href="([^"]*)"/gi,(_all,href)=>{try{const url=new URL(href,locator);if(!['https:','http:'].includes(url.protocol))return '';return ` href="${cleanUrl(url.href).replaceAll('&','&amp;').replaceAll('"','&quot;')}"`;}catch{return '';}})).text;
const sameResource=(a,b)=>{const left=new URL(a),right=new URL(b);return left.origin===right.origin&&left.pathname.replace(/\/$/,'')===right.pathname.replace(/\/$/,'')&&left.search===right.search;};
export class AccessReadError extends Error{constructor(reason,{kind='unverified',url='',observedUrl=''}={}){super(reason);this.code='SELECTED_SESSION_ACCESS';this.observation={status:'blocked',kind,url:cleanUrl(url),observedUrl:observedUrl?cleanUrl(observedUrl):'',reason,checkedAt:new Date().toISOString()};}}

// This script returns a deliberately reduced readable document. It never reads
// cookies, storage, request headers, input values or page JavaScript state.
const readableDocument=`(()=>{const visible=n=>{const s=getComputedStyle(n);return !!n.getClientRects().length&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'&&!n.closest('[hidden],[aria-hidden="true"]');};const password=[...document.querySelectorAll('input[type="password"]')].some(visible),login=[...document.querySelectorAll('form[action*="login" i],form[action*="signin" i]')].some(visible);const clone=document.documentElement.cloneNode(true),original=[...document.documentElement.querySelectorAll('*')],copies=[...clone.querySelectorAll('*')];original.forEach((n,i)=>{if(n.closest('body')&&!visible(n))copies[i]?.remove();});clone.querySelectorAll('script,style,noscript,template,iframe,object,embed,svg,input,textarea,select,button,[hidden],[aria-hidden="true"]').forEach(n=>n.remove());clone.querySelectorAll('*').forEach(n=>{for(const a of [...n.attributes])if(!['href','role'].includes(a.name))n.removeAttribute(a.name);});return {html:clone.outerHTML,password,login,title:document.title};})()`;

// Electron objects and partition names stay in this process only. No object
// returned by this class carries credentials or a browser/session handle.
export class AccessSessionManager{
  constructor({BrowserWindow,urlPolicy=accessUrl,onObservation=async()=>{},settleMs=300,timeoutMs=30000}={}){this.BrowserWindow=BrowserWindow;this.urlPolicy=urlPolicy;this.onObservation=onObservation;this.settleMs=settleMs;this.timeoutMs=timeoutMs;this.sessions=new Map();this.selected=new Set();}
  key(id,url){return `${id}\n${this.urlPolicy(url).origin}`;}
  selectIntent(id,url){this.selected.add(this.key(id,url));}
  clearIntent(id,url){this.selected.delete(this.key(id,url));}
  has(id,url){try{return this.selected.has(this.key(id,url));}catch{return false;}}
  isOpen(id,url){try{const entry=this.sessions.get(this.key(id,url));return !!entry&&!entry.window.isDestroyed();}catch{return false;}}
  async observed(id,record,entry){if(entry){if(this.sessions.get(this.key(id,entry.expected))!==entry)return record;entry.last=record;}await this.onObservation(id,record);return record;}
  async open(id,value){
    const url=this.urlPolicy(value),key=this.key(id,url.href);this.selected.add(key);let entry=this.sessions.get(key);
    if(entry&&!entry.window.isDestroyed()){entry.expected=url.href;entry.verified=false;entry.window.show();entry.window.focus();await this.load(entry,url.href);return this.observed(id,{status:'unverified',url:cleanUrl(url.href),origin:url.origin,reason:'Sign in directly in the Nodes browser, return to this intended resource, then choose Read selected page.',checkedAt:new Date().toISOString()},entry);}
    const window=new this.BrowserWindow({show:true,title:'Nodes · Sign in to the selected resource',width:1100,height:800,webPreferences:{partition:`persist:nodes-access-${randomUUID()}`,sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true,allowRunningInsecureContent:false}}),wc=window.webContents;
    entry={window,expected:url.href,origin:url.origin,verified:false,statuses:new Map()};this.sessions.set(key,entry);
    wc.setWindowOpenHandler(()=>({action:'deny'}));wc.session.setPermissionRequestHandler((_w,_p,answer)=>answer(false));wc.session.setPermissionCheckHandler(()=>false);wc.session.on('will-download',event=>event.preventDefault());
    const guard=(event,target)=>{try{this.urlPolicy(target);}catch{event.preventDefault();}};wc.on('will-navigate',guard);wc.on('will-redirect',guard);
    wc.session.webRequest.onBeforeRequest({urls:['<all_urls>']},(request,answer)=>{try{if(!['data:','blob:'].includes(new URL(request.url).protocol))this.urlPolicy(request.url);answer({cancel:false});}catch{answer({cancel:true});}});
    wc.session.webRequest.onCompleted({urls:['*://*/*']},request=>{if(request.resourceType==='mainFrame')entry.statuses.set(request.url,request.statusCode);});
    wc.on('did-start-navigation',(_event,_url,_inPlace,isMainFrame)=>{if(isMainFrame){if(!entry.loading){entry.loadedFrom=null;entry.loadedUrl=null;}const hadRead=entry.verified;entry.verified=false;if(hadRead)this.observed(id,{status:'unverified',url:cleanUrl(entry.expected),origin:entry.origin,reason:'The selected page navigated. Read the intended resource again to verify its current content.',checkedAt:new Date().toISOString()},entry).catch(()=>{});}});
    window.on('closed',()=>{this.sessions.delete(key);if(!entry.suppressClose)this.observed(id,{status:'unverified',url:cleanUrl(entry.expected),origin:entry.origin,reason:'The selected sign-in browser was closed. Open it and read the intended page again.',checkedAt:new Date().toISOString()}).catch(()=>{});});
    try{await this.load(entry,url.href);}catch(error){await this.observed(id,{status:'blocked',kind:'tool',url:cleanUrl(url.href),origin:url.origin,reason:'The selected browser could not load this resource. '+diagnostic(error),checkedAt:new Date().toISOString()},entry);throw Error('The selected browser could not load this resource. '+diagnostic(error));}
    return this.observed(id,{status:'unverified',url:cleanUrl(url.href),origin:url.origin,reason:'Sign in directly in the Nodes browser, then read the intended page. Opening a browser does not verify access.',checkedAt:new Date().toISOString()},entry);
  }
  async load(entry,url,signal){
    signal?.throwIfAborted();let timer;const abort=()=>entry.window.webContents.stop();signal?.addEventListener('abort',abort,{once:true});entry.loading=true;entry.loadedFrom=null;entry.loadedUrl=null;
    try{await Promise.race([entry.window.loadURL(url),new Promise((_,reject)=>timer=setTimeout(()=>{entry.window.webContents.stop();reject(Error('Selected-page navigation timed out.'));},this.timeoutMs))]);signal?.throwIfAborted();entry.loadedFrom=url;entry.loadedUrl=entry.window.webContents.getURL();}
    finally{entry.loading=false;clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  async read(id,value,{signal,navigate=false}={}){
    const wanted=this.urlPolicy(value),entry=this.sessions.get(this.key(id,wanted.href));let capturedDocument;
    const fail=async(reason,kind,observedUrl='')=>{if(entry)entry.verified=false;const error=new AccessReadError(reason,{kind,url:wanted.href,observedUrl});if(capturedDocument&&['sign-in','denied'].includes(kind)){const locator=cleanUrl(observedUrl||wanted.href),raw=cleanDom(capturedDocument.html,locator),extracted=extractHtml(raw,locator),evidenceId=randomUUID();error.observation.evidenceId=evidenceId;error.evidence={id:evidenceId,kind:'browser',locator,title:extracted.title,capturedAt:error.observation.checkedAt,raw,...extracted,sha256:createHash('sha256').update(raw).digest('hex'),evidenceStatus:'inspection-failed',captureRoute:'electron-selected-session',accessObservation:{...error.observation,origin:wanted.origin},limitations:[reason,'Only the access barrier was observed. No protected content was read.']};}await this.observed(id,{...error.observation,origin:wanted.origin},entry);throw error;};
    if(!entry||entry.window.isDestroyed())return fail('Open the Nodes sign-in browser for this resource before reading it.','unverified');
    signal?.throwIfAborted();const wc=entry.window.webContents;
    try{
      // A changed origin is never repaired by silently reading a different tab.
      const current=this.urlPolicy(wc.getURL());if(current.origin!==wanted.origin)return fail('The selected browser is on a different origin. Return to the intended resource before reading it.','wrong-origin',current.href);
      // Re-read the intended page from its server, rather than trusting an old
      // still-rendered protected DOM after session expiry or sign-out elsewhere.
      if(navigate||sameResource(current.href,wanted.href))await this.load(entry,wanted.href,signal);
      await new Promise(resolve=>setTimeout(resolve,this.settleMs));signal?.throwIfAborted();
      const actual=this.urlPolicy(wc.getURL());if(actual.origin!==wanted.origin)return fail('This resource redirected outside the approved origin. Return to the intended resource.','wrong-origin',actual.href);
      const intendedResponse=sameResource(actual.href,wanted.href)||entry.loadedFrom&&sameResource(entry.loadedFrom,wanted.href)&&entry.loadedUrl===actual.href;
      if(!intendedResponse)return fail('The selected browser is on a different page. Return to the intended resource before reading it.','wrong-resource',actual.href);
      const dom=await wc.executeJavaScript(readableDocument);signal?.throwIfAborted();capturedDocument=dom;
      if(dom.password||dom.login)return fail('The intended resource displays a sign-in form. Sign in directly in the Nodes browser, then return to this resource and read it again.','sign-in',actual.href);
      const http=entry.statuses.get(actual.href);if(http===401||http===403)return fail(`The intended resource returned HTTP ${http}. Access is limited for this page.`,'denied',actual.href);
      if(!sameResource(actual.href,wanted.href))return fail('The browser did not return the intended page. Its readable content has not been added as evidence.','wrong-resource',actual.href);
      if(typeof dom.html!=='string'||dom.html.length>3000000)return fail('The selected page exceeds the bounded DOM capture limit.','tool',actual.href);
      const locator=cleanUrl(actual.href),raw=cleanDom(dom.html,locator),extracted=extractHtml(raw,locator);if(extracted.text.trim().length<20)return fail('The intended page did not provide enough readable text. Its access remains unverified.','unreadable',actual.href);
      const idEvidence=randomUUID(),capturedAt=new Date().toISOString(),observation={status:'read',kind:'content',url:cleanUrl(wanted.href),origin:wanted.origin,observedUrl:locator,evidenceId:idEvidence,checkedAt:capturedAt,reason:'Content read in the selected Nodes session. This establishes only this page at this time.'};
      entry.expected=wanted.href;entry.verified=true;await this.observed(id,observation,entry);signal?.throwIfAborted();
      return {id:idEvidence,kind:'browser',locator,requested:cleanUrl(wanted.href),title:extracted.title,capturedAt,sha256:createHash('sha256').update(raw).digest('hex'),raw,...extracted,evidenceStatus:'runtime-observed',captureRoute:'electron-selected-session',accessObservation:observation,limitations:['Readable DOM captured in the explicitly selected Nodes-owned session; not a REA tool result.','This page read does not establish authentication elsewhere, whole-product coverage or access to private backend code.','Forms, input values, scripts, embedded frames and hidden content were excluded before capture.']};
    }catch(error){if(signal?.aborted)throw error;if(error.code==='SELECTED_SESSION_ACCESS')throw error;return fail('The selected page could not be read: '+diagnostic(error),'tool');}
  }
  async capture(id,url,signal){return this.read(id,url,{signal,navigate:true});}
  close(id,url){const key=this.key(id,url),entry=this.sessions.get(key);this.selected.delete(key);if(entry){entry.suppressClose=true;if(!entry.window.isDestroyed())entry.window.close();}this.sessions.delete(key);}
  closeAll(){for(const entry of this.sessions.values()){entry.suppressClose=true;if(!entry.window.isDestroyed())entry.window.destroy();}this.sessions.clear();}
}
