// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {atomicReplace} from './atomic-replace.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function aiRecoverySeal(state){return hash({messages:state.messages,evidence:(state.evidence||[]).map(({id,sha256})=>({id,sha256})),targets:(state.targets||[]).map(({kind,locator,root,identity})=>({kind,locator,root,identity})),mechanismInventory:state.mechanismInventory,products:state.products});}
export class AiCheckpoint{
  constructor(directory,attemptId,value){if(!/^[\da-f-]{36}$/.test(attemptId))throw Error('Invalid AI checkpoint.');this.file=path.join(directory,'ai-checkpoints',attemptId+'.json');this.value=value||{version:1,attemptId,calls:[],reads:{}};this.index=0;}
  static async load(directory,attempt,state){
    if(!attempt?.aiRecovery?.canResume||attempt.aiRecovery.seal!==aiRecoverySeal(state))throw Error('The investigation changed after this pause. Start a new request using the saved evidence.');
    if(attempt.aiRecovery.retryAt&&Date.parse(attempt.aiRecovery.retryAt)>Date.now())throw Error('The AI service asked us to wait. Retry after '+new Date(attempt.aiRecovery.retryAt).toLocaleString()+'.');
    const checkpoint=new AiCheckpoint(directory,attempt.id);let data;try{const stat=await fs.stat(checkpoint.file);if(stat.size>40000000)throw Error('Oversized checkpoint');data=JSON.parse(await fs.readFile(checkpoint.file,'utf8'));}catch{throw Error('The AI resume checkpoint is unavailable. Your evidence is retained; start a new request using it.');}
    if(data.version!==1||data.attemptId!==attempt.id||!Array.isArray(data.calls)||data.calls.length>40||!data.context)throw Error('This saved AI checkpoint is incompatible. Your evidence is retained.');
    checkpoint.value=data;checkpoint.persisted=true;checkpoint.replaying=true;return checkpoint;
  }
  async save(){
    const data=JSON.stringify(this.value);if(data.length>40000000)throw Error('The AI resume checkpoint exceeded its local limit. Your evidence is retained.');
    await fs.mkdir(path.dirname(this.file),{recursive:true});const temp=this.file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,data,{mode:0o600});await atomicReplace(temp,this.file);this.persisted=true;}finally{await fs.unlink(temp).catch(()=>{});}
  }
  async invoke(schema,prompt,execute){
    const index=this.index++,schemaHash=hash(schema);let call=this.value.calls[index];
    if(call&&call.schemaHash!==schemaHash)throw Error('The AI pipeline changed after this pause. Start a new request using the saved evidence.');
    if(call&&Object.hasOwn(call,'answer'))return structuredClone(call.answer);
    if(!call){call={schemaHash,prompt};this.value.calls[index]=call;}
    this.value.pendingIndex=index;const answer=await execute(call.prompt);call.answer=answer;delete this.value.pendingIndex;if(this.persisted)await this.save();return answer;
  }
  async readDone(key,value){this.value.reads[key]=value;if(this.persisted)await this.save();}
  async finish(){await fs.unlink(this.file).catch(()=>{});}
}
