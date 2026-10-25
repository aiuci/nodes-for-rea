// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {buildDocument,readDocument,parseDocument,atomicDocumentWrite,installDocument,documentFingerprint,digest} from './investigation-document.mjs';
import {prepareShare,shareChoices} from './document-sharing.mjs';
const samePath=(a,b)=>a&&b&&path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
async function documentDestination(store,file){
  const parent=await fs.realpath(path.dirname(file)),destination=path.join(parent,path.basename(file)),root=await fs.realpath(store.root),relative=path.relative(root,destination);
  if(!relative||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative))throw new Error('Save portable documents outside the app’s recovery folders.');
  return destination;
}
export class InvestigationDocuments{
  constructor(store,{appVersion='unknown'}={}){this.store=store;this.appVersion=appVersion;this.reviews=new Map();}
  async binding(id){try{return JSON.parse(await fs.readFile(path.join(this.store.directory(id),'document.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  async bind(id,binding){const directory=this.store.directory(id),temporary=path.join(directory,`document-${randomUUID()}.tmp`);try{await fs.writeFile(temporary,JSON.stringify(binding,null,2));await fs.rename(temporary,path.join(directory,'document.json'));}catch(error){await fs.rm(temporary,{force:true});throw error;}}
  async status(id){const state=await this.store.read(id),b=await this.binding(id);let fileUnavailable=false;if(b?.filePath)try{await fs.stat(b.filePath);}catch{fileUnavailable=true;}return {id,fileUnavailable,path:b?.filePath||null,name:b?.filePath?path.basename(b.filePath):'Recovery copy',investigationId:b?.investigationId||state.portableIdentity?.id||state.id,revision:b?.revision||0,dirty:!!b&&b.savedFingerprint!==documentFingerprint(state),recoveryOnly:!b?.filePath,warnings:b?.warnings||[]};}
  async operationDiagnostic(id,stage,outcome,error){
    const event={at:new Date().toISOString(),runId:randomUUID(),investigationId:id,stage,outcome,faultType:error?.code||error?.name||null,recovery:outcome==='failed'?'Existing document and local recovery retained.':'Saved artifact acknowledged.'};
    try{await fs.appendFile(path.join(this.store.directory(id),'operation-diagnostics.jsonl'),JSON.stringify(event)+'\n');}catch{/* A diagnostic failure must not replace the primary storage result. */}
  }
  async save(id,file,options={}){try{const result=await this.saveOperation(id,file,options);await this.operationDiagnostic(id,'document-save','completed');return result;}catch(error){await this.operationDiagnostic(id,'document-save','failed',error);throw error;}}
  async saveOperation(id,file,{copy=false,beforeCommit}={}){
    const original=await this.store.read(id),binding=await this.binding(id),destination=file||binding?.filePath;
    if(!destination)throw new Error('Choose a document path with Save As.');
    const canonical=await documentDestination(this.store,destination);
    const pendingFile=path.join(this.store.directory(id),'document-pending.json');
    if(!copy){let pending;try{pending=JSON.parse(await fs.readFile(pendingFile,'utf8'));}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
      if(pending&&samePath(pending.filePath,canonical)&&pending.savedFingerprint===documentFingerprint(original)){
        let committed;try{committed=await readDocument(canonical);}catch{}
        if(committed?.packageHash===pending.packageHash&&committed.state.id===pending.investigationId){await this.bind(id,pending);await fs.rm(pendingFile,{force:true});return {state:await this.store.read(id),binding:pending,acknowledgementRecovered:true};}
      }
    }
    if(copy&&samePath(canonical,binding?.filePath))throw new Error('Save As needs a different path from the current document.');
    const documentId=copy?randomUUID():binding?.investigationId||original.portableIdentity?.id||original.id,origin=copy?{investigationId:binding?.investigationId||original.portableIdentity?.id||original.id,revision:binding?.revision||0,copiedAt:new Date().toISOString()}:binding?.origin;
    const revision=copy?1:(binding?.revision||0)+1,built=await buildDocument(this.store,id,{documentId,revision,origin,appVersion:this.appVersion});
    // Parse our own package before replacing any user document.
    const checked=parseDocument(built.data);let migrationBackup=binding?.migrationBackup;
    if(!copy&&samePath(canonical,binding?.filePath)){
      let old;try{old=await readDocument(canonical);}catch{throw Object.assign(new Error('This document changed or moved outside the app. Use Save As to preserve both versions.'),{code:'DOCUMENT_CONFLICT'});}if(old.packageHash!==binding.packageHash)throw Object.assign(new Error('This document changed or moved outside the app. Use Save As to preserve both versions.'),{code:'DOCUMENT_CONFLICT'});
      if((old.state.workspace?.shapeVersion||1)<(original.workspace?.shapeVersion||1)||(old.state.workspace?.version||1)<(original.workspace?.version||1)){
        migrationBackup=canonical+`.original-revision-${binding.revision}-${randomUUID()}.reanodes`;
        await atomicDocumentWrite(migrationBackup,await fs.readFile(canonical));
      }
    }
    const next={version:1,filePath:canonical,investigationId:documentId,revision,packageHash:digest(built.data),savedFingerprint:built.fingerprint,origin:built.manifest.origin,warnings:checked.warnings,...(migrationBackup?{migrationBackup}:{})};
    if(!copy)await fs.writeFile(pendingFile,JSON.stringify(next),{mode:0o600});
    const filePath=await atomicDocumentWrite(canonical,built.data,{expectedHash:!copy&&samePath(canonical,binding?.filePath)?binding.packageHash:undefined,beforeCommit});
    if(copy)return installDocument(this.store,checked,{filePath,identity:documentId,origin});
    try{await this.bind(id,next);}catch(error){error.code||='DOCUMENT_ACK_FAILED';throw error;}await fs.rm(pendingFile,{force:true});return {state:await this.store.read(id),binding:next};
  }
  async open(file,{checked}={}){return installDocument(this.store,checked||await readDocument(file),{filePath:await fs.realpath(file)});}
  async review(id,input){const state=await this.store.read(id),plan=prepareShare(state,input),token=randomUUID();this.reviews.clear();this.reviews.set(token,{id,fingerprint:documentFingerprint(state),choices:plan.choices});return {token,...plan.preview};}
  async share(id,file,token){
    const review=this.reviews.get(token),state=await this.store.read(id);if(!review||review.id!==id||review.fingerprint!==documentFingerprint(state))throw new Error('The investigation changed. Review the shared copy again.');
    const binding=await this.binding(id),destination=await documentDestination(this.store,file);if(samePath(destination,binding?.filePath))throw new Error('Share a copy needs a separate path.');
    const prepared=prepareShare(state,shareChoices(review.choices)),origin={investigationId:binding?.investigationId||state.portableIdentity?.id||state.id,revision:binding?.revision||0,copiedAt:new Date().toISOString(),kind:'shared-copy'},built=await buildDocument(this.store,id,{documentId:randomUUID(),revision:1,origin,appVersion:this.appVersion,prepared});parseDocument(built.data);const filePath=await atomicDocumentWrite(destination,built.data);this.reviews.delete(token);return {path:filePath,manifest:built.manifest};
  }
}
