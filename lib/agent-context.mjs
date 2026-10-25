// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {extractHtml} from './sources.mjs';
import {restoredAgentGoal} from './agent-goal-draft.mjs';
import {checkedAgentGoal} from './agent-goal.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fingerprint=value=>{const items=value.items.map(i=>({id:i.id,sha256:i.sha256}));return hash(JSON.stringify(Object.hasOwn(value,'projectFolder')?{items,projectFolder:value.projectFolder,projectRevision:value.projectRevision||null}:items));};
const textFile=name=>/\.(txt|md|mdx|csv|tsv|vcf|json|jsonc|jsonl|xml|ya?ml|toml|ini|cfg|conf|html?|css|scss|[cm]?[jt]sx?|vue|svelte|py|cs|c|cpp|h|rs|go|sql|log)$/i.test(name)||/^(README|LICENSE|Dockerfile|Makefile)$/i.test(name);
const sensitive=name=>/^\.|(?:^|[._-])(secrets?|credentials?|passwords?|private|tokens?|keys?)(?:[._-]|$)/i.test(name);
export function contextUrl(value){const url=new URL(String(value).trim());if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Use an HTTP(S) URL without embedded credentials.');url.hash='';return url.href;}
export async function readContextUrl(value,{signal,fetcher=fetch}={}){
  const requested=contextUrl(value);let current=requested;
  for(let i=0;i<4;i++){
    const response=await fetcher(current,{redirect:'manual',signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(15000)]),headers:{Accept:'text/html,text/plain,application/json'}});
    if([301,302,303,307,308].includes(response.status)){const next=contextUrl(new URL(response.headers.get('location')||'',current).href);await response.body?.cancel();if(new URL(next).origin!==new URL(requested).origin)throw Error('This URL redirects to another origin. Add the destination URL explicitly.');current=next;continue;}
    if(!response.ok){await response.body?.cancel();throw Error(`URL returned HTTP ${response.status}.`);}
    if(!/html|text|json|xml/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw Error('This URL is not a readable page. Attach its screenshot or source files.');}
    const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;if(bytes>2*1024*1024){await response.body?.cancel().catch(()=>{});throw Error('The URL exceeds the 2 MB page limit.');}chunks.push(chunk);}
    const raw=Buffer.concat(chunks).toString('utf8'),html=/html/i.test(response.headers.get('content-type')||''),page=html?extractHtml(raw,current):{text:raw,title:new URL(current).hostname};
    if(page.text.trim().length<40)throw Error('This page has little readable text. Add screenshots or the project folder for a JavaScript app.');
    return {title:page.title,text:page.text.slice(0,24000),sha256:hash(raw),capturedAt:new Date().toISOString(),truncated:page.text.length>24000,limitation:'Read-only page text; scripts, sign-in and runtime workflows were not inspected.'};
  }throw Error('This URL has too many redirects.');
}
export class AgentContextStore{
  constructor(store,{normaliseImage,fetcher=fetch}={}){this.store=store;this.normaliseImage=normaliseImage;this.fetcher=fetcher;this.queues=new Map();}
  root(id){return path.join(this.store.directory(id),'agent-context');}
  async read(id){try{return JSON.parse(await fs.readFile(path.join(this.root(id),'context.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return {version:1,goal:null,items:[]};throw error;}}
  async write(id,value){const root=this.root(id);await fs.mkdir(root,{recursive:true});const temp=path.join(root,`${randomUUID()}.tmp`);await fs.writeFile(temp,JSON.stringify(value));await fs.rename(temp,path.join(root,'context.json'));return this.public(value);}
  public(value){
    // The old single-word opening draft hid the actual guidance. Suppress only
    // that unmarked legacy value; retain the original and all real goals/context.
    return {...value,goal:restoredAgentGoal(value.goal,value.goalDraftVersion),items:value.items.map(({text,imageFile,...item})=>item)};
  }
  serial(id,work){const previous=this.queues.get(id)||Promise.resolve(),next=previous.catch(()=>{}).then(work);this.queues.set(id,next);return next;}
  update(id,operation,value){return this.serial(id,async()=>{
    const draft=await this.read(id);
    if(operation==='goal'){draft.goal=checkedAgentGoal(value,{allowEmpty:true});draft.goalDraftVersion=1;return this.write(id,draft);}
    if(operation==='project-folder'){
      if(value!==null){if(typeof value!=='string'||!path.isAbsolute(value)||!(await fs.stat(value)).isDirectory())throw Error('Choose your project folder.');value=await fs.realpath(value);}
      draft.projectFolder=value;draft.projectRevision=randomUUID();return this.write(id,draft);
    }
    if(operation==='remove'){draft.items=draft.items.filter(item=>item.id!==value);return this.write(id,draft);}
    const items=[];
    if(operation==='url'){const url=contextUrl(value);if(draft.items.filter(i=>i.kind==='url').length>=3)throw Error('Add up to three context URLs.');items.push({id:randomUUID(),kind:'url',name:url,url,status:'Read when you plan',sha256:hash(url)});}
    else if(operation==='files'||operation==='paste'){
      if(!Array.isArray(value)||!value.length||value.length>10)throw Error('Choose up to ten files.');
      for(const file of value){
        const pasted=operation==='paste';if(pasted?!(file?.bytes instanceof Uint8Array):typeof file!=='string')throw Error('Choose files from your computer.');const name=path.basename(pasted?String(file.name||'Pasted image.png'):file),stat=pasted?{size:file.bytes.length,isFile:()=>true}:await fs.stat(file);if(!stat.isFile())throw Error('Use Choose project folder for a folder.');if(stat.size>8*1024*1024)throw Error(`${name} exceeds the 8 MB file limit.`);if(sensitive(name))throw Error(`${name} looks like a private settings or credential file. Choose source files instead.`);
        const bytes=pasted?Buffer.from(file.bytes):await fs.readFile(file),key=randomUUID();
        if(/\.(png|jpe?g|webp|gif)$/i.test(name)){
          if(!this.normaliseImage)throw Error('Image input is unavailable.');const result=await this.normaliseImage(bytes);if(!result?.data?.length||result.data.length>4*1024*1024)throw Error(`${name} could not be prepared as an image.`);
          items.push({id:key,kind:'image',name,imageFile:`${key}.png`,bytes:result.data.length,sha256:hash(result.data),width:result.width,height:result.height,status:`Image · ${result.width}×${result.height}`,data:result.data});
        }else{
          if(pasted)throw Error('Paste images here; paste text directly into the goal.');
          if(!textFile(name)||bytes.includes(0))throw Error(`${name} is unsupported. Add text/source files or PNG, JPEG, WebP or GIF images.`);const full=bytes.toString('utf8'),text=new TextDecoder().decode(Buffer.from(full).subarray(0,32768),{stream:true}),truncated=text.length<full.length;items.push({id:key,kind:'text',name,text,bytes:bytes.length,sha256:hash(bytes),truncated,status:truncated?'Text excerpt · truncated':'Text ready'});
        }
      }
    }else throw Error('Unknown context action.');
    const combined=[...draft.items,...items];if(combined.length>12||combined.filter(i=>i.kind==='image').length>4||combined.reduce((n,i)=>n+Buffer.byteLength(i.text||''),0)>131072||combined.filter(i=>i.kind==='image').reduce((n,i)=>n+i.bytes,0)>12*1024*1024)throw Error('Context is full: use up to 12 items, four images and 128 KB of text.');
    await fs.mkdir(this.root(id),{recursive:true});for(const item of items)if(item.data){await fs.writeFile(path.join(this.root(id),item.imageFile),item.data);delete item.data;}
    draft.items=combined;return this.write(id,draft);
  });}
  async plan(id,{signal}={}){
    await this.queues.get(id)?.catch(()=>{});const draft=await this.read(id),items=[];
    for(const item of draft.items){signal?.throwIfAborted();try{items.push(item.kind==='url'?{...item,...await readContextUrl(item.url,{signal,fetcher:this.fetcher}),status:'Page text captured'}:item);}catch(error){throw Error(`${item.name}: ${error.message}`);}}
    const images=[];for(const item of items.filter(i=>i.kind==='image')){const file=path.join(this.root(id),path.basename(item.imageFile));const bytes=await fs.readFile(file);if(hash(bytes)!==item.sha256)throw Error('An attached image changed. Remove and attach it again.');images.push({path:file,mime:'image/png',name:item.name});}
    const text=items.map(item=>item.kind==='image'?`IMAGE ${item.name}: attached visual context, not runtime proof.`:`${item.kind==='url'?'URL '+item.url:'FILE '+item.name}\n${item.text}${item.truncated?'\n[Excerpt truncated]':''}${item.limitation?'\n'+item.limitation:''}`).join('\n\n');
    return {items:items.map(({text,imageFile,...i})=>i),text,images,...(Object.hasOwn(draft,'projectFolder')?{projectFolder:draft.projectFolder,projectRevision:draft.projectRevision}:{}),fingerprint:fingerprint(draft)};
  }
  async fingerprint(id){return fingerprint(await this.read(id));}
}
