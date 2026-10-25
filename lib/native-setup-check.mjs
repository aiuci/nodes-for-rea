// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import {statSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {openReaClient,unwrapReaResult,compactReaStatus} from './rea-client.mjs';
import {resolveReaConfig} from './rea-config.mjs';
import {fileIdentity,sameIdentity} from './targets.mjs';
import {diagnosticCode} from './setup-diagnostics.mjs';
// Shipped REA 6.5 providerStartupTimeout.js allows 330s for Ghidra import, analysis, bridge and readiness. Keep 30s for protocol/cleanup, and disclose the finite bound before approval.
export const NATIVE_TOOL_TIMEOUT_MS=330000,NATIVE_CHECK_TIMEOUT_MS=360000;
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function binding(config,session){
  const launch=resolveReaConfig(config),providers=(session?.providers||[]).filter(p=>['ghidra','ida','hopper'].includes(p.id)).map(({id,version,selected,availability})=>({id,version,selected,availability}));
  const environment=Object.fromEntries(Object.entries({...process.env,...launch.env}).filter(([key])=>/^(REA_[A-Z0-9_]+|GHIDRA_INSTALL_DIR|JAVA_HOME|PATH)$/i.test(key)));
  const files=[launch.command,...(launch.args||[])].filter(file=>typeof file==='string'&&path.isAbsolute(file)).map(file=>{try{const stat=statSync(file);return {path:file,size:stat.size,mtimeMs:stat.mtimeMs};}catch{return {path:file,missing:true};}});
  return sha({command:launch.command,args:launch.args,environment,providers,files});
}
export async function readNativePolicy(config){
  try{const launch=resolveReaConfig(config),entry=launch.args?.find(a=>/\.[cm]?js$/i.test(a));if(!entry)return {};
    const text=await fs.readFile(path.join(path.dirname(path.dirname(entry)),'dist/ghidra/GhidraInstallationPolicy.js'),'utf8'),verified=text.match(/SUPPORTED_GHIDRA_VERSION\s*=\s*"(\d+\.\d+\.\d+)"/)?.[1];
    return verified?{verifiedGhidra:verified,releaseLine:verified.split('.').slice(0,2).join('.')+'.x'}:{};
  }catch{return {};}
}
// A separate additive settings file; never rewrites investigations or drafts.
export class NativeSetupCheck{
  constructor(root,{openClient=openReaClient,identity=fileIdentity,now=()=>Date.now(),timeoutMs=NATIVE_CHECK_TIMEOUT_MS}={}){Object.assign(this,{root,openClient,identity,now,timeoutMs});this.file=path.join(root,'native-inspection-check.json');}
  async read(){try{if((await fs.stat(this.file)).size>2*1024*1024)return [];const value=JSON.parse(await fs.readFile(this.file,'utf8'));return value?.schemaVersion===1&&Array.isArray(value.records)?value.records:[];}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return [];throw error;}}
  async current(target,config,session){
    const saved=(await this.read()).findLast(record=>record?.target?.path===target.identity?.path);if(!saved)return {state:'unknown',code:'operation_unverified'};
    if(saved.state!=='ready')return {state:['unavailable','canceled'].includes(saved.state)?saved.state:'unknown',code:diagnosticCode(saved.code),checkedAt:saved.checkedAt,operation:saved.failedOperation||null,localDetail:saved.error||''};
    const time=Date.parse(saved.checkedAt);if(!Number.isFinite(time)||this.now()-time>600000||this.now()<time||saved.binding!==binding(config,session))return {state:'unknown',code:'stale',checkedAt:saved.checkedAt};
    try{const identity=await this.identity(target.root);if(!sameIdentity(identity,target.identity)||!sameIdentity(identity,saved.target))return {state:'unknown',code:'stale',checkedAt:saved.checkedAt};
      for(const file of saved.toolFiles||[]){const stat=await fs.stat(file.path);if(stat.size!==file.size||stat.mtimeMs!==file.mtimeMs)return {state:'unknown',code:'stale',checkedAt:saved.checkedAt};}
    }catch{return {state:'unknown',code:'stale',checkedAt:saved.checkedAt};}
    return {state:'ready',code:null,checkedAt:saved.checkedAt};
  }
  async write(record){const records=[...await this.read(),record].slice(-100);await fs.mkdir(this.root,{recursive:true});const temporary=path.join(this.root,`native-check-${randomUUID()}.tmp`);try{await fs.writeFile(temporary,JSON.stringify({schemaVersion:1,records},null,2));await fs.rename(temporary,this.file);}finally{await fs.unlink(temporary).catch(()=>{});}}
  async run(target,config,session,{signal}={}){
    if(target.targetType!=='native'||!target.identity)throw Error('Choose a recognized native application file. No target was executed.');
    if(!session?.providers?.some(p=>['ghidra','ida','hopper'].includes(p.id)&&p.availability?.status==='available'))throw Error('Native prerequisites are missing or not checked. Recheck tools before approving a static inspection.');
    const started=Date.now(),remaining=()=>Math.max(1,Math.min(NATIVE_TOOL_TIMEOUT_MS,this.timeoutMs-(Date.now()-started)));const controller=new AbortController(),abort=()=>controller.abort(signal?.reason||Error('Native check canceled'));if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(Error('Native static check timed out.')),this.timeoutMs);let client;
    const checkedAt=new Date(this.now()).toISOString(),record={state:'unavailable',code:'failed',checkedAt,target:target.identity,binding:binding(config,session),operations:[],toolFiles:[]};
    try{
      controller.signal.throwIfAborted();if(!sameIdentity(await this.identity(target.root),target.identity))throw Error('The selected target changed before inspection.');
      await this.write({...record,state:'unknown',code:'operation_unverified'});
      const launch=resolveReaConfig(config),environment={...process.env,...launch.env},diagnostics=session.providers.filter(p=>['ghidra','ida','hopper'].includes(p.id)&&p.availability?.status==='available').map(p=>p.availability?.diagnostics||{});
      const files=[...diagnostics.flatMap(d=>[d.application_properties_path,d.analyze_headless_path,d.native_decompiler_path,d.java_command,d.launcher_path]),...(session.providers.some(p=>p.id==='ida'&&p.availability?.status==='available')?[environment.REA_IDA_MCP_CONFIG]:[])];
      for(const file of [...new Set(files)].filter(file=>file&&path.isAbsolute(file))){const stat=await fs.stat(file);record.toolFiles.push({path:file,size:stat.size,mtimeMs:stat.mtimeMs});}
      controller.signal.throwIfAborted();client=await this.openClient(config,{signal:controller.signal,timeout:remaining(),maxFrameBytes:8*1024*1024,allowedTools:['open_binary','binary_overview']});
      for(const [name,args]of [['open_binary',{path:target.root}],['binary_overview',{}]]){
        controller.signal.throwIfAborted();record.failedOperation=name;const raw=await client.callTool(name,args,{signal:controller.signal,timeout:remaining()});controller.signal.throwIfAborted();if(raw?.isError){const failed=unwrapReaResult(raw),error=Error(`REA ${name}: ${failed.error?.message||failed.message||'The operation did not complete.'}`);error.code=failed.error?.code||failed.code;throw error;}
        const body=unwrapReaResult(raw),envelope=body.result||body,result=envelope.normalized_result??envelope;
        if(envelope.normalized_result&&!(typeof envelope.evidence_id==='string'&&envelope.evidence_id.trim()))throw Error('REA overview evidence has no retained receipt identity.');
        if(name==='binary_overview'&&!(typeof result.document==='string'&&Number.isInteger(result.procedure_count)&&result.procedure_count>=0&&Number.isInteger(result.string_count)&&result.string_count>=0))throw Error('REA returned no valid native overview; inspection is not verified.');
        record.operations.push({name,sha256:sha(raw)});
      }
      controller.signal.throwIfAborted();record.failedOperation='binary_session';const actual=compactReaStatus(await client.callTool('binary_session',{}, {signal:controller.signal,timeout:10000}));
      if(!actual.open||!actual.analysisProviderBinding?.provider?.id)throw Error('The native provider binding was not established.');
      if(!sameIdentity(await this.identity(target.root),target.identity))throw Error('The selected target changed during inspection.');
      record.provider=actual.analysisProviderBinding.provider.id;if(!session.providers.some(p=>p.id===record.provider&&p.availability?.status==='available'))throw Error('The bound native provider does not match the checked provider facts.');
      for(const file of record.toolFiles){const stat=await fs.stat(file.path);if(stat.size!==file.size||stat.mtimeMs!==file.mtimeMs)throw Error('An analysis tool changed during inspection. Recheck before retrying.');}
      controller.signal.throwIfAborted();record.state='ready';record.code=null;delete record.failedOperation;
    }catch(error){record.state=signal?.aborted?'canceled':'unavailable';record.code=signal?.aborted?'canceled':controller.signal.aborted||/timed out|deadline elapsed/i.test(error.message)?'analysis_timeout':!diagnosticCode(error.code)||diagnosticCode(error.code)==='unclassified'?'failed':diagnosticCode(error.code);record.error=String(error.message||error).slice(0,2000);}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);try{await client?.close({verify:true});}catch(error){record.state='unavailable';record.code='runtime_unavailable';record.error='The owned static inspection session did not close cleanly: '+String(error.message||error).slice(0,1000);}}
    // Even a failed/canceled attempt replaces a previous success; never reuse it.
    await this.write(record);return {state:record.state,code:record.code,checkedAt,operation:record.state==='ready'?'open_binary + binary_overview':null};
  }
}
