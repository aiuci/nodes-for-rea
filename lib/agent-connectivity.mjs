// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {spawn} from 'node:child_process';
import {codexCommand} from './runtime.mjs';
// A live account-service read, never a thread, model turn, login or tool call.
// Results deliberately exclude raw output, account details and usage values.
export function checkAgentConnectivity(config,{signal,timeout=10000}={}){
 if(config.provider!=='codex')return Promise.resolve({state:'unknown',code:'unsupported',message:'A free network check is not available for this provider. Model access is checked when you investigate.'});
 return new Promise(resolve=>{
  let child,buffer='',size=0,settled=false,initialized=false;
  const finish=(state,code,message)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);child?.stdin.end();child?.kill();resolve({state,code,message,checkedAt:new Date().toISOString()});};
  const abort=()=>finish('unknown','canceled','Agent check canceled.');
  const timer=setTimeout(()=>finish('unknown','timeout','The selected agent did not answer its account-service check. Choose another installed agent or retry.'),timeout);
  if(signal?.aborted)return abort();signal?.addEventListener('abort',abort,{once:true});
  try{const command=codexCommand(config,['app-server']);child=spawn(command.command,command.args,{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],env:{...process.env,...(process.versions.electron&&command.command===process.execPath?{ELECTRON_RUN_AS_NODE:'1'}:{})}});}catch{return finish('failed','unavailable','The selected agent could not start. Choose an available installation.');}
  const send=value=>child.stdin.write(JSON.stringify(value)+'\n');
  child.stdin.on('error',()=>{});child.stderr.on('data',()=>{});
  child.on('error',()=>finish('failed','unavailable','The selected agent could not start. Choose an available installation.'));
  child.on('close',()=>finish('unknown','unsupported','This installation did not complete the free account-service check. Choose another installation or review its setup.'));
  child.stdout.on('data',data=>{
   size+=data.length;if(size>262144)return finish('unknown','output-limit','The agent check exceeded its capture limit.');buffer+=data.toString();let end;
   while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let value;try{value=JSON.parse(line);}catch{continue;}
    if(value.id===1&&!initialized){if(value.error)return finish('failed','configuration','The selected agent rejected initialization. Review its settings or choose another installation.');initialized=true;send({method:'initialized'});send({id:2,method:'account/rateLimits/read'});}
    if(value.id===2&&initialized){
     if(value.error){const message=String(value.error.message||'');if(/only.*chatgpt|not supported|api.key|method not found/i.test(message)||value.error.code===-32601)return finish('unknown','unsupported','This sign-in or installation does not support the free account-service check. Model access remains untested.');return finish('failed',/10013|EACCES|forbidden.*socket/i.test(message)?'network-blocked':/401|unauthori|not.*logged|sign.in/i.test(message)?'sign-in':'account-service','The selected agent could not reach its account service. Choose another installed version, or sign in again if needed. Your saved requests are kept.');}
     if(!value.result?.rateLimits&&!value.result?.rateLimitsByLimitId)return finish('unknown','unconfirmed','The agent returned no account-service confirmation. Model access remains untested.');
     return finish('reachable','account-service','The selected agent reached its account service. No AI request was made. Model responses are verified when you investigate.');
    }
   }
  });
  send({id:1,method:'initialize',params:{clientInfo:{name:'nodes_readiness',version:'0.3.0'}}});
 });
}
