// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Streaming ZIP reader reused under MIT; no dependency manager or shell extraction.
import fs from 'node:fs/promises';
import {createWriteStream,createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import yauzl from './vendor/yauzl/index.cjs';
import crc32 from './vendor/buffer-crc32/index.cjs';

export const nativeArtifacts=Object.freeze({
 ghidra:Object.freeze({id:'ghidra',name:'Ghidra',version:'12.1.4',root:'ghidra_12.1.4_PUBLIC',bytes:569649598,sha256:'ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db',url:'https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip',source:'National Security Agency / GitHub official release',license:'Apache-2.0 and bundled component notices'}),
 jdk:Object.freeze({id:'jdk',name:'Eclipse Temurin full JDK',version:'21.0.11+10',root:'jdk-21.0.11+10',bytes:205073954,sha256:'d3625e7cadf23787ea540229544b6e2ab494b3b54da1801879e583e1dfee0a64',url:'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.11%2B10/OpenJDK21U-jdk_x64_windows_hotspot_21.0.11_10.zip',source:'Eclipse Adoptium / GitHub official release',license:'GPLv2 with Classpath Exception; vendor notices included'}),
});
const within=(root,file)=>{const r=path.relative(root,file);return !!r&&!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r);};
export async function managedTool(root,artifact){
 try{const stat=await fs.lstat(root);if(!stat.isDirectory()||stat.isSymbolicLink())return null;for(const entry of (await fs.readdir(root,{withFileTypes:true})).slice(0,100)){if(!entry.isDirectory()||entry.isSymbolicLink()||!entry.name.startsWith(artifact.id+'-'))continue;const parent=path.join(root,entry.name),receipt=path.join(parent,'NODES-INSTALL-RECEIPT.json');try{if((await fs.stat(receipt)).size>16000)continue;const record=JSON.parse(await fs.readFile(receipt,'utf8')),folder=path.join(parent,artifact.root);if(record.archiveSha256===artifact.sha256&&record.version===artifact.version&&record.component===artifact.id&&(await fs.realpath(folder)).toLowerCase()===folder.toLowerCase()&&(await fs.lstat(folder)).isDirectory())return folder;}catch{}}
 }catch(e){if(e.code!=='ENOENT')throw e;}return null;
}
export async function safeToolRoot(root){
 const absolute=path.resolve(root);let current=path.parse(absolute).root;
 for(const part of absolute.slice(current.length).split(path.sep).filter(Boolean)){current=path.join(current,part);try{const stat=await fs.lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory())throw Error('The tool destination contains a link or a non-directory. Choose a local ordinary folder.');}catch(e){if(e.code!=='ENOENT')throw e;await fs.mkdir(current);}}
 if((await fs.realpath(absolute)).toLowerCase()!==absolute.toLowerCase())throw Error('Tool destination resolves through a redirected path.');return absolute;
}
export function safeToolEntry(name){
 if(typeof name!=='string'||name.length>230||name.includes('\\')||name.startsWith('/')||name.includes(':')||name.includes('\0'))return false;
 return name.replace(/\/$/,'').split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[. ]$/.test(p)&&!/[<>"|?*\x00-\x1f]/.test(p)&&! /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p));
}
export async function downloadTool(artifact,directory,{signal,onProgress=()=>{},fetcher=fetch}={}){
 await safeToolRoot(directory);signal?.throwIfAborted();const file=path.join(directory,`${artifact.id}-${randomUUID()}.zip.part`),h=createHash('sha256');let bytes=0,last=0;
 try{
  let url=artifact.url,response;for(let i=0;i<5;i++){const parsed=new URL(url);if(parsed.protocol!=='https:'||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(parsed.hostname))throw Error('Tool download redirected outside its approved official hosts.');response=await fetcher(url,{signal,redirect:'manual'});if([301,302,303,307,308].includes(response.status)){const next=response.headers.get('location');await response.body?.cancel();url=new URL(next,url).href;continue;}break;}
  if(!response?.ok||!response.body)throw Error(`Official download failed (${response?.status||'no response'}). Nothing was installed.`);
  const length=Number(response.headers.get('content-length'));if(length&&length!==artifact.bytes)throw Error('The official archive size changed. Review a new pinned artifact before downloading.');
  const measure=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;if(bytes>artifact.bytes)return callback(Error('Download exceeds its reviewed size.'));h.update(chunk);if(Date.now()-last>120){last=Date.now();onProgress({state:'Downloading',component:artifact.name,loaded:bytes,total:artifact.bytes});}callback(null,chunk);}});
  await pipeline(response.body,measure,createWriteStream(file,{flags:'wx'}),{signal});signal?.throwIfAborted();if(bytes!==artifact.bytes||h.digest('hex')!==artifact.sha256)throw Error('Downloaded archive failed its pinned size/SHA-256 verification. It was not installed.');onProgress({state:'Downloaded',component:artifact.name,loaded:bytes,total:artifact.bytes});return file;
 }catch(error){await fs.unlink(file).catch(()=>{});throw error;}
}
async function verifyArchive(file,artifact){const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==artifact.bytes)throw Error('The reviewed archive changed before extraction.');const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);if(h.digest('hex')!==artifact.sha256)throw Error('The reviewed archive digest changed before extraction.');}
export async function extractTool(file,parent,artifact,{signal,onProgress=()=>{}}={}){
 const root=await safeToolRoot(parent),final=path.join(root,`${artifact.id}-${artifact.version.replaceAll('+','_')}-${randomUUID().slice(0,8)}`),stage=await fs.mkdtemp(path.join(root,'.extract-'));let zip;
 try{
  signal?.throwIfAborted();await verifyArchive(file,artifact);zip=await new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true,validateEntrySizes:true,strictFileNames:true},(e,z)=>e?reject(e):resolve(z)));const names=new Set();let total=0,count=0;
  await new Promise((resolve,reject)=>{const fail=e=>{signal?.removeEventListener('abort',abort);zip.close();reject(e);};const abort=()=>fail(signal.reason||Error('Extraction canceled'));signal?.addEventListener('abort',abort,{once:true});zip.on('error',fail);zip.on('end',()=>{signal?.removeEventListener('abort',abort);resolve();});zip.on('entry',async entry=>{try{
   signal?.throwIfAborted();if(++count>30000||!safeToolEntry(entry.fileName)||entry.generalPurposeBitFlag&1)throw Error('Archive contains an unsafe, encrypted or excessive entry.');const mode=entry.externalFileAttributes>>>16;if(mode&&![0,0x8000,0x4000].includes(mode&0xf000))throw Error('Archive links and special files are not allowed.');
   const name=entry.fileName.replace(/\/$/,''),key=name.toLowerCase();if(names.has(key))throw Error('Archive contains duplicate paths.');names.add(key);if(name.split('/')[0]!==artifact.root)throw Error('Archive has an unexpected installation root.');total+=entry.uncompressedSize;if(total>3*1024**3||entry.uncompressedSize>512*1024**2)throw Error('Archive exceeds reviewed extraction limits.');
   const dest=path.resolve(stage,name);if(!within(stage,dest))throw Error('Archive path escapes its destination.');if(entry.fileName.endsWith('/'))await fs.mkdir(dest,{recursive:true});else{await fs.mkdir(path.dirname(dest),{recursive:true});const stream=await new Promise((res,rej)=>zip.openReadStream(entry,(e,s)=>e?rej(e):res(s)));let checksum=0,size=0;const verify=new Transform({transform(chunk,_e,cb){size+=chunk.length;if(size>entry.uncompressedSize)return cb(Error('Archive entry exceeds declared size.'));checksum=crc32.unsigned(chunk,checksum);cb(null,chunk);}});await pipeline(stream,verify,createWriteStream(dest,{flags:'wx'}),{signal});if(size!==entry.uncompressedSize||checksum!==entry.crc32)throw Error('Extracted file checksum failed.');}
   if(count%100===0)onProgress({state:'Installing',component:artifact.name,loaded:count,total:zip.entryCount});zip.readEntry();
  }catch(e){fail(e);}});zip.readEntry();});
  signal?.throwIfAborted();await verifyArchive(file,artifact);await fs.rename(stage,final);const install=path.join(final,artifact.root);await fs.writeFile(path.join(final,'NODES-INSTALL-RECEIPT.json'),JSON.stringify({component:artifact.id,version:artifact.version,archiveSha256:artifact.sha256,source:artifact.url,installedAt:new Date().toISOString(),verification:'Installed; native operation not verified'},null,2));return install;
 }catch(error){zip?.close();if(within(root,stage)&&path.basename(stage).startsWith('.extract-'))await fs.rm(stage,{recursive:true,force:true});throw error;}
}
