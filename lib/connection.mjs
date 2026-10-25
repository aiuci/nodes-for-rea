// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {runtimeConfig,runProcess,codexCommand,claudeCommand,capabilities} from './runtime.mjs';
import {gatewayBase,runJSON} from './providers.mjs';
import {AgentDiscovery,loginInstructions} from './agent-discovery.mjs';
import {checkAgentConnectivity} from './agent-connectivity.mjs';
import {providerSetup} from './provider-setup.mjs';
export class ConnectionStore{
  constructor(root,crypto,options={}){this.root=root;this.crypto=crypto;this.file=path.join(root,'connection.json');this.discovery=options.discovery||new AgentDiscovery(options);}
  async read(){try{return JSON.parse(await fs.readFile(this.file,'utf8'));}catch(error){if(error.code==='ENOENT')return {version:1,provider:'codex',gatewayUrl:'http://127.0.0.1:18789/v1',agentId:'',configured:false};throw error;}}
  decrypt(settings){if(!settings.tokenEncrypted)return '';try{return this.crypto.decryptString(Buffer.from(settings.tokenEncrypted,'base64'));}catch{throw new Error('Re-enter your gateway token in Connection on this computer.');}}
  async view(){const settings=await this.read();let needsToken=false;if(settings.provider==='openclaw')try{this.decrypt(settings);}catch{needsToken=true;}const config=runtimeConfig(settings),readiness=this.readinessKey===JSON.stringify([settings.provider,config.codex,config.claude,settings.model,settings.verifiedAt])?this.readinessResult:null;return {setup:providerSetup(settings.provider,{configured:settings.configured&&!needsToken,needsToken,readiness}),provider:settings.provider,codexPath:settings.codexPath||'',claudePath:settings.claudePath||'',model:settings.model||'',gatewayUrl:settings.gatewayUrl,agentId:settings.agentId||'',configured:settings.configured&&!needsToken,tokenSaved:!!settings.tokenEncrypted,needsToken,verification:settings.verification||(settings.configured?'model-response':null),modelAccess:settings.verification==='local-auth'?'unknown':settings.configured?'verified-at-check':'unknown',capabilities:capabilities(config),readiness};}
  async config(){const settings=await this.read();return runtimeConfig({...settings,gatewayToken:settings.provider==='openclaw'?this.decrypt(settings):''});}
  async checkReadiness(signal){
    if(this.readinessPending)return this.readinessPending;
    this.readinessPending=this.measureReadiness(signal);try{return await this.readinessPending;}finally{this.readinessPending=null;}
  }
  async measureReadiness(signal){
    const settings=await this.read(),config=runtimeConfig(settings),key=JSON.stringify([settings.provider,config.codex,config.claude,settings.model,settings.verifiedAt]);
    let result={state:'unknown',code:'not-selected',message:'Choose your agent. No model request is made by this check.'};
    if(settings.configured){
      if(!['codex','claude'].includes(config.provider))result=await checkAgentConnectivity(config,{signal});
      else{
        const candidate=await this.discovery.normalize({provider:config.provider,path:config.provider==='codex'?config.codex:config.claude,source:'saved',required:true});
        const local=await this.discovery.check(candidate,signal);
        result={version:local.version||'',installation:local.installation,authentication:local.authentication};
        if(local.installation!=='available')Object.assign(result,{state:'failed',code:'unavailable',message:'The saved agent installation is unavailable. Choose an installed agent.'});
        else if(local.authentication==='signed-out')Object.assign(result,{state:'failed',code:'sign-in',message:'The selected agent is signed out. Sign in below; your saved work is kept.'});
        else if(local.authentication!=='signed-in')Object.assign(result,{state:'unknown',code:'sign-in-unknown',message:'The selected agent sign-in could not be confirmed. Review it below.'});
        else Object.assign(result,await checkAgentConnectivity(config,{signal}));
      }
    }
    const current=await this.read(),now=runtimeConfig(current);
    if(key!==JSON.stringify([current.provider,now.codex,now.claude,current.model,current.verifiedAt]))return {state:'unknown',code:'settings-changed',message:'The connection changed. Recheck the selected agent.'};
    this.readinessKey=key;this.readinessResult={...result,checkedAt:new Date().toISOString()};return this.readinessResult;
  }
  async discover(signal){return this.discovery.discover(await this.read(),signal);}
  async connectDetected(input,signal){
    const candidate=await this.discovery.resolve(input?.candidateId,signal),checked=await this.discovery.check(candidate,signal);
    if(checked.installation!=='available')throw new Error('This agent is unavailable. Refresh detected agents or choose another installation.');
    if(checked.authentication==='signed-out')throw new Error('Sign in to this agent, then refresh and connect.');
    if(checked.authentication!=='signed-in')throw new Error('Sign-in status could not be confirmed. Sign in or use the optional response test in advanced settings.');
    await this.discovery.resolve(input?.candidateId,signal);
    const previous=await this.read(),settings={...previous,version:1,provider:candidate.provider,[`${candidate.provider}Path`]:candidate.path,model:previous.provider===candidate.provider?previous.model||'':'',configured:true,verification:'local-auth',verifiedAt:new Date().toISOString()};
    await this.persist(settings,signal);
    return {ok:true,message:`${checked.label} selected using its existing sign-in. No AI request was made. Model access has not been tested.`,settings:await this.view()};
  }
  async loginDetected(input,signal,onInstruction){return this.discovery.login(input?.candidateId,signal,onInstruction,{deviceAuth:input?.deviceAuth===true});}
  async persist(settings,signal){
    if(signal?.aborted)throw new Error('Connection check canceled.');
    await fs.mkdir(this.root,{recursive:true});const temporary=path.join(this.root,`.connection-${randomUUID()}.tmp`);
    try{await fs.writeFile(temporary,JSON.stringify(settings,null,2),{mode:0o600});if(signal?.aborted)throw new Error('Connection check canceled.');await fs.rename(temporary,this.file);}finally{await fs.unlink(temporary).catch(()=>{});}
  }
  async candidate(input){
    const previous=await this.read();if(!['codex','claude','openclaw'].includes(input.provider))throw new Error('Choose Codex, Claude or OpenClaw.');
    const gatewayUrl=gatewayBase(input.gatewayUrl||previous.gatewayUrl),codexPath=String(input.codexPath||'').trim(),claudePath=String(input.claudePath||'').trim(),model=String(input.model||'').trim(),agentId=String(input.agentId||'').trim();
    if(codexPath&&!/\.(exe|[cm]?js)$/i.test(codexPath))throw new Error('Choose codex.exe or the Codex JavaScript entry point.');
    if(claudePath&&!/\.(exe|[cm]?js)$/i.test(claudePath))throw new Error('Choose claude.exe or the Claude JavaScript entry point.');
    if(model.length>200||agentId.length>100||/[\r\n]/.test(model+agentId))throw new Error('Model or agent identifier is invalid.');
    let token=String(input.token||'').trim();if(!token&&gatewayUrl===previous.gatewayUrl){try{token=this.decrypt(previous);}catch{if(input.provider==='openclaw')throw new Error('Enter the gateway token again on this computer.');}}
    if(token.length>16000||/[\r\n]/.test(token))throw new Error('Gateway token is invalid.');
    return {version:1,provider:input.provider,codexPath,claudePath,model,gatewayUrl,agentId,gatewayToken:token};
  }
  async probe(candidate,signal){
    await fs.mkdir(this.root,{recursive:true});const config=runtimeConfig(candidate),probe=path.join(this.root,`check-${randomUUID()}.schema.json`),schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
    await fs.writeFile(probe,JSON.stringify(schema));try{const result=await runJSON(config,schema,'Connection check: return {"ok":true} and nothing else. Do not use tools.',probe,{directory:this.root,signal});if(result.ok!==true)throw new Error('The model did not complete the connection check.');return {ok:true,message:config.provider==='openclaw'?'OpenClaw responded successfully.':config.provider==='claude'?'Claude responded successfully.':'Codex responded successfully.'};}finally{await fs.unlink(probe).catch(()=>{});}
  }
  async saveVerified(input,signal){const candidate=await this.candidate(input),result=await this.probe(candidate,signal),settings={...candidate,configured:true,verification:'model-response',verifiedAt:new Date().toISOString()};delete settings.gatewayToken;if(candidate.gatewayToken){if(!this.crypto.isEncryptionAvailable())throw new Error('Encrypted credential storage is unavailable. The token was not saved.');settings.tokenEncrypted=this.crypto.encryptString(candidate.gatewayToken).toString('base64');}await this.persist(settings,signal);return {...result,settings:await this.view()};}
  async login(input,signal,onInstruction){const candidate=await this.candidate(input),config=runtimeConfig(candidate);if(config.provider==='openclaw')throw new Error('Use the gateway connection fields.');const deviceAuth=input?.deviceAuth===true;if(deviceAuth&&config.provider!=='codex')throw new Error('Device sign-in is available for Codex. Use browser sign-in for Claude Code.');const command=config.provider==='claude'?claudeCommand(config,['auth','login']):codexCommand(config,['login',...(deviceAuth?['--device-auth']:[])]);onInstruction?.({type:deviceAuth?'waiting-device':'browser',message:deviceAuth?'Preparing device sign-in…':'Complete sign-in in your browser.'});try{await runProcess(command.command,command.args,{signal,timeout:240000,maxOutput:16384,onOutput:loginInstructions(config.provider,onInstruction,{deviceAuth})});}catch{if(signal?.aborted)throw new Error('Sign-in canceled.');throw new Error('Sign-in did not finish. Try again, or sign in using the installed agent and refresh.');}return {ok:true,message:`${config.provider==='claude'?'Claude':'Codex'} sign-in finished. Use Find agents again to select it; the model-response test is optional.`};}
}
