// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {portableRoot} from './paths.mjs';
import {runProcess,codexCommand,claudeCommand} from './runtime.mjs';

const labels={codex:'Codex',claude:'Claude Code'};
const stopped=signal=>{if(signal?.aborted)throw new Error('Connection check canceled.');};
const keyFor=(provider,file,platform)=>createHash('sha256').update(`${provider}\0${platform==='win32'?file.toLowerCase():file}`).digest('hex').slice(0,24);
const unavailable='This installation could not be verified. Refresh or choose another agent.';

// Device flow codes are intentionally displayed only during the explicit login
// operation. OAuth URLs, account details and arbitrary CLI text never leave here.
export function loginInstructions(provider,callback,{deviceAuth=false}={}){
  let buffer='',previous='';
  return text=>{
    if(provider!=='codex'||!deviceAuth||typeof callback!=='function')return;
    buffer=(buffer+String(text)).slice(-8192).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g,'');
    if(!/https:\/\/auth\.openai\.com\/codex\/device(?=[\s\u001b]|$)/.test(buffer))return;
    const context=buffer.match(/\b(?:one[- ]time|device|verification|user|enter)[^\n]{0,80}\bcode\b([\s\S]{0,160})/i);
    const code=context?.[1].match(/\b[A-Z0-9]{4,6}-[A-Z0-9]{4,6}\b/)?.[0];
    const instruction={type:'device-auth',url:'https://auth.openai.com/codex/device',...(code?{code}:{})},key=JSON.stringify(instruction);
    if(key!==previous){previous=key;callback(instruction);}
  };
}

// No credential files are read. The official local status commands are the
// authority for sign-in; neither a version check nor sign-in establishes model access.
// https://learn.chatgpt.com/docs/developer-commands?surface=cli (login status)
// https://code.claude.com/docs/en/cli-reference (auth status)
export class AgentDiscovery{
  constructor(options={}){
    this.home=options.home??homedir();this.env=options.env??process.env;
    this.portableRoot=options.portableRoot??portableRoot;this.platform=options.platform??process.platform;
    this.fs=options.fs??fs;this.runner=options.runner??runProcess;this.node=options.node??this.env.INVESTIGATOR_NODE??process.execPath;
    this.now=options.now??Date.now;this.candidates=new Map();this.refreshedAt=0;
  }
  async file(file){try{const stat=await this.fs.stat(file);return stat.isFile()?stat:null;}catch{return null;}}
  async fingerprint(file){const stat=await this.file(file);return stat?`${stat.size}:${stat.mtimeMs}:${stat.ino??''}`:null;}
  command(candidate,args){const config={node:this.node,codex:candidate.path,claude:candidate.path};return candidate.provider==='codex'?codexCommand(config,args):claudeCommand(config,args);}
  async locations(settings){
    const values=[],add=(provider,file,source,required=false)=>{if(file&&path.isAbsolute(file))values.push({provider,path:file,source,required});};
    const appData=this.env.APPDATA||path.join(this.home,'AppData/Roaming'),local=this.env.LOCALAPPDATA||path.join(this.home,'AppData/Local');
    for(const provider of ['codex','claude'])add(provider,settings[`${provider}Path`],'saved',settings.provider===provider);
    add('codex',this.env.INVESTIGATOR_CODEX,'environment');add('claude',this.env.INVESTIGATOR_CLAUDE,'environment');
    add('claude',path.join(this.home,'.local/bin/claude.exe'),'installed');
    add('claude',path.join(local,'Microsoft/WinGet/Links/claude.exe'),'installed');
    // Current desktop Codex stores its CLI in a versioned local bin directory.
    // Prefer that detected installation on a fresh profile; saved choices remain first.
    if(this.platform==='win32'){
      const directory=path.join(local,'OpenAI/Codex/bin');let names=[];try{names=await this.fs.readdir(directory);}catch{}
      for(const name of names.filter(name=>/^[a-f0-9]{16}$/i.test(name)).sort().reverse().slice(0,4))add('codex',path.join(directory,name,'codex.exe'),'desktop');
    }
    for(const directory of (this.env.PATH||this.env.Path||'').split(path.delimiter).slice(0,64)){
      if(!path.isAbsolute(directory))continue;
      for(const provider of ['codex','claude']){
        add(provider,path.join(directory,provider+(this.platform==='win32'?'.exe':'')),'path');
        // Resolve known npm targets beside a shim; never execute or parse a shell wrapper.
        add(provider,path.join(directory,provider==='codex'?'node_modules/@openai/codex/bin/codex.js':'node_modules/@anthropic-ai/claude-code/cli.js'),'path');
      }
    }
    add('codex',path.join(appData,'npm/node_modules/@openai/codex/bin/codex.js'),'installed');
    add('claude',path.join(appData,'npm/node_modules/@anthropic-ai/claude-code/cli.js'),'installed');
    for(const directory of [path.join(local,'Programs/Codex'),path.join(local,'Programs/OpenAI/Codex'),...(this.env.ProgramFiles?[path.join(this.env.ProgramFiles,'Codex')]:[])]){
      for(const suffix of ['resources/codex.exe','app/resources/codex.exe'])add('codex',path.join(directory,suffix),'desktop');
    }
    // Store package names are versioned. Only enumerate one known directory and
    // inspect at most four matching package roots, never recurse through a disk.
    if(this.platform==='win32'&&this.env.ProgramFiles){
      const directory=path.join(this.env.ProgramFiles,'WindowsApps');
      let names=[];try{names=await this.fs.readdir(directory);}catch{}
      for(const name of names.filter(name=>/^OpenAI\.Codex_[\w.-]+$/i.test(name)).sort().reverse().slice(0,4))add('codex',path.join(directory,name,'app/resources/codex.exe'),'desktop');
    }
    if(this.platform!=='win32'){
      for(const directory of [path.join(this.home,'.local/bin'),'/usr/local/bin','/opt/homebrew/bin'])for(const provider of ['codex','claude'])add(provider,path.join(directory,provider),'installed');
      for(const directory of ['/Applications/Codex.app',path.join(this.home,'Applications/Codex.app')])add('codex',path.join(directory,'Contents/Resources/codex'),'desktop');
    }
    add('codex',path.join(this.portableRoot,'engines/codex/bin/codex.exe'),'bundled');
    return values;
  }
  async normalize(location){
    let file=location.path;
    if(/\.(cmd|bat)$/i.test(file)){
      const directory=path.dirname(file),entry=location.provider==='codex'?'node_modules/@openai/codex/bin/codex.js':'node_modules/@anthropic-ai/claude-code/cli.js';
      file='';
      for(const target of [path.join(directory,`${location.provider}.exe`),path.join(directory,entry)])if(await this.file(target)){file=target;break;}
      if(!file)return location.required?{...location,id:keyFor(location.provider,location.path,this.platform),invalid:true}:null;
    }
    if(this.platform==='win32'&&!/\.(exe|[cm]?js)$/i.test(file))return location.required?{...location,id:keyFor(location.provider,file,this.platform),invalid:true}:null;
    const exists=await this.file(file);if(!exists&&!location.required)return null;
    if(exists){try{file=await this.fs.realpath(file);}catch{}}
    return {...location,path:file,id:keyFor(location.provider,file,this.platform),fingerprint:await this.fingerprint(file)};
  }
  async check(candidate,signal){
    stopped(signal);
    const result={id:candidate.id,provider:candidate.provider,label:labels[candidate.provider],source:candidate.source,path:candidate.path,version:'',installation:'unavailable',authentication:'unknown',message:unavailable};
    if(candidate.invalid||!await this.file(candidate.path))return {...result,message:'This installation is missing. Refresh to find an installed agent.'};
    try{
      const versionCommand=this.command(candidate,['--version']),version=await this.runner(versionCommand.command,versionCommand.args,{signal,timeout:3000,maxOutput:8192,env:this.env});
      const match=`${version.stdout||''}\n${version.stderr||''}`.match(/\b(\d{1,4}\.\d{1,4}\.\d{1,6}(?:[-+][a-z0-9.-]{1,50})?)\b/i);
      if(!match)return result;result.version=match[1];result.installation='available';
      const command=this.command(candidate,candidate.provider==='codex'?['login','status']:['auth','status']);
      const status=await this.runner(command.command,command.args,{signal,timeout:4000,maxOutput:16384,acceptedExitCodes:[0,1],env:this.env}),raw=`${status.stdout||''}\n${status.stderr||''}`;
      if(/unknown (?:command|subcommand|option)|unrecognized|unexpected argument|usage:/i.test(raw))result.authentication='unknown';
      else if(candidate.provider==='codex')result.authentication=status.exitCode===0?'signed-in':/not (?:logged|signed) in|logged out|no (?:stored )?credentials/i.test(raw)?'signed-out':'unknown';
      else{
        let body;try{body=JSON.parse(status.stdout);}catch{}
        if(body?.loggedIn===false||body?.authMethod==='none')result.authentication='signed-out';
        else if(status.exitCode===0&&(body?.loggedIn===true||['claude.ai','oauth_token','api_key','api_key_helper','third_party'].includes(body?.authMethod)))result.authentication='signed-in';
        else if(status.exitCode===1&&/not (?:logged|signed) in|logged out/i.test(raw))result.authentication='signed-out';
      }
    }catch{stopped(signal);}
    stopped(signal);
    result.message=result.installation==='unavailable'?unavailable:result.authentication==='signed-in'?'Existing sign-in found. Model access has not been tested.':result.authentication==='signed-out'?'Installed. Sign in to connect.':'Installed, but sign-in status could not be confirmed. Sign in or use the optional response test in advanced settings.';
    return result;
  }
  async discover(settings={},signal){
    stopped(signal);this.candidates.clear();const records=[],seen=new Set();
    for(const location of await this.locations(settings)){
      stopped(signal);const candidate=await this.normalize(location);if(!candidate||seen.has(candidate.id))continue;
      seen.add(candidate.id);records.push(candidate);if(records.length===18)break;
    }
    const agents=new Array(records.length);let cursor=0;
    await Promise.all(Array.from({length:Math.min(3,records.length)},async()=>{while(cursor<records.length){const index=cursor++;agents[index]=await this.check(records[index],signal);}}));
    stopped(signal);for(const record of records)this.candidates.set(record.id,record);this.refreshedAt=this.now();
    const selected=records.find(record=>record.provider===settings.provider&&record.source==='saved');
    const sameProvider=agents.find(agent=>agent.provider===settings.provider&&agent.authentication==='signed-in'&&agent.source!=='bundled');
    const ready=agents.find(agent=>agent.authentication==='signed-in'&&agent.source!=='bundled')||agents.find(agent=>agent.authentication==='signed-in');
    const fallback=agents.find(agent=>agent.source==='bundled'&&agent.installation==='available')||agents.find(agent=>agent.installation==='available');
    return {agents,selectedId:selected?.id||null,defaultId:selected?.id||sameProvider?.id||ready?.id||fallback?.id||null};
  }
  async resolve(id,signal){
    stopped(signal);const candidate=typeof id==='string'?this.candidates.get(id):null;
    if(!candidate||this.now()-this.refreshedAt>300000)throw new Error('This agent selection has expired. Refresh detected agents and choose again.');
    if(candidate.invalid||!candidate.fingerprint||await this.fingerprint(candidate.path)!==candidate.fingerprint)throw new Error('This installation changed or is missing. Refresh detected agents and choose again.');
    stopped(signal);return candidate;
  }
  async login(id,signal,onInstruction,{deviceAuth=false}={}){
    const candidate=await this.resolve(id,signal),checked=await this.check(candidate,signal);
    if(checked.installation!=='available')throw new Error(unavailable);
    if(deviceAuth&&candidate.provider!=='codex')throw new Error('Device sign-in is available for Codex. Use browser sign-in for Claude Code.');
    const command=this.command(candidate,candidate.provider==='codex'?['login',...(deviceAuth?['--device-auth']:[])]:['auth','login']);
    onInstruction?.({type:deviceAuth?'waiting-device':'browser',message:deviceAuth?'Preparing device sign-in…':'Complete sign-in in your browser.'});
    try{await this.runner(command.command,command.args,{signal,timeout:240000,maxOutput:16384,env:this.env,onOutput:loginInstructions(candidate.provider,onInstruction,{deviceAuth})});}catch{stopped(signal);throw new Error('Sign-in did not finish. Try again, or sign in using the installed agent and refresh.');}
    stopped(signal);return {ok:true,message:`${labels[candidate.provider]} sign-in finished. Refresh detected agents to check its status.`};
  }
}
