// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {AGENT_MESSAGE_LIMIT} from './agent-control-input.js';

export {AGENT_MESSAGE_LIMIT} from './agent-control-input.js';
const stamp=()=>new Date().toISOString();
const messageId=value=>typeof value==='string'&&/^[a-zA-Z0-9:_-]{1,180}$/.test(value);
export const emptyAgentControl=id=>({version:1,investigationId:id,revision:0,generation:0,updatedAt:'',messages:[],coverage:null,followUps:[]});

// Windows readers/indexers can briefly hold the existing file against replacement.
// Retry only sharing-style failures; never delete the good destination first.
export async function replaceControlFile(file,value,{rename=(from,to)=>fs.rename(from,to),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  const temp=`${file}.${randomUUID()}.tmp`;
  try{
    await fs.writeFile(temp,JSON.stringify(value,null,2));
    for(let attempt=0;;attempt++){
      try{await rename(temp,file);return;}
      catch(error){if(!['EPERM','EBUSY'].includes(error.code)||attempt>=5)throw error;await wait(20*2**attempt);}
    }
  }finally{await fs.rm(temp,{force:true}).catch(()=>{});}
}

// Control records have their own writer. Never save a stale investigation snapshot
// merely to receive a message while Investigator is retaining a tool result.
export class AgentControlStore {
  constructor(store){this.store=store;this.queues=new Map();}
  file(id){return path.join(this.store.directory(id),'agent-control.json');}
  async read(id){
    try{
      const value=JSON.parse(await fs.readFile(this.file(id),'utf8'));
      if(value.version!==1||value.investigationId!==id||!Array.isArray(value.messages)||!Array.isArray(value.followUps))throw Error('This Agent Control record is not supported. Saved investigation findings are unchanged.');
      return {...emptyAgentControl(id),...value};
    }catch(error){if(error.code==='ENOENT')return emptyAgentControl(id);throw error;}
  }
  serial(id,work){const previous=this.queues.get(id)||Promise.resolve(),next=previous.catch(()=>{}).then(work);this.queues.set(id,next);next.finally(()=>{if(this.queues.get(id)===next)this.queues.delete(id);}).catch(()=>{});return next;}
  mutate(id,change){return this.serial(id,async()=>{
    const control=await this.read(id),changed=await change(control);
    if(changed===false)return control;
    control.revision++;control.updatedAt=stamp();
    await replaceControlFile(this.file(id),control);
    return control;
  });}
  submit(id,{id:inputId,text,followUpId}={}){
    if(!messageId(inputId))throw Error('This message needs a valid identity. Your text is kept.');
    if(typeof text!=='string'||!text.trim()||text.length>AGENT_MESSAGE_LIMIT)throw Error(`Enter a message of 1–${AGENT_MESSAGE_LIMIT.toLocaleString('en-US')} characters. Your text is kept.`);
    if(followUpId!==undefined&&!messageId(followUpId))throw Error('Invalid saved follow-up identity.');
    return this.mutate(id,control=>{
      const existing=control.messages.find(m=>m.id===inputId);
      if(existing){if(existing.role!=='user'||existing.text!==text)throw Error('This message identity is already used. Your text is kept.');return false;}
      control.messages.push({id:inputId,role:'user',text,status:'queued',createdAt:stamp(),...(followUpId?{followUpId}:{})});
    });
  }
  append(id,message){
    if(!message||!['agent','system'].includes(message.role)||typeof message.text!=='string'||!message.text.trim())throw Error('Invalid Agent Control reply.');
    return this.mutate(id,control=>{
      const id=message.id||randomUUID();if(control.messages.some(m=>m.id===id))return false;
      control.messages.push({...message,id,createdAt:message.createdAt||stamp()});
    });
  }
  async next(id){
    let ticket=null;
    const control=await this.mutate(id,record=>{
      const message=record.messages.find(m=>m.role==='user'&&m.status==='queued');
      if(!message)return false;
      message.status='applying';message.updatedAt=stamp();
      ticket={message:structuredClone(message),generation:record.generation};
    });
    return ticket?{...ticket,control}:null;
  }
  finish(id,ticket,{status,text,nodeId,kind}={}){
    return this.mutate(id,control=>{
      const message=control.messages.find(m=>m.id===ticket.message.id);
      if(control.generation!==ticket.generation||message?.status!=='applying')return false;
      message.status=status;message.updatedAt=stamp();if(nodeId)message.nodeId=nodeId;if(kind)message.kind=kind;
      if(text&&!control.messages.some(m=>m.id===`${message.id}:reply`))control.messages.push({id:`${message.id}:reply`,role:'agent',text,replyTo:message.id,kind:kind||'reply',createdAt:stamp()});
    });
  }
  applied(id,directionId,nodeId,generation){
    return this.mutate(id,control=>{
      const message=control.messages.find(m=>m.id===directionId);
      if(control.generation!==generation||!['applying','needs-clarification'].includes(message?.status))return false;
      message.status='applied';message.nodeId=nodeId;message.updatedAt=stamp();
    });
  }
  supersede(id,messageId,replacementId,generation){
    return this.mutate(id,control=>{const message=control.messages.find(m=>m.id===messageId);if(control.generation!==generation||!['applying','needs-clarification'].includes(message?.status))return false;message.status='not-applied';message.reason='Replaced by your later direction.';message.supersededBy=replacementId;message.updatedAt=stamp();});
  }
  hold(id,reason='Stopped before this direction was applied.',expectedGeneration){
    return this.mutate(id,control=>{
      if(expectedGeneration!==undefined&&control.generation!==expectedGeneration)return false;
      control.generation++;
      for(const message of control.messages)if(message.role==='user'&&['queued','applying'].includes(message.status)){message.status='not-applied';message.reason=reason;message.updatedAt=stamp();}
    });
  }
}
