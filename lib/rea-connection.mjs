// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {resolveReaConfig,bundledReaInfo} from './rea-config.mjs';
import {probeReaConnection} from './rea-client.mjs';
import {portableRoot} from './paths.mjs';

export class ReaConnectionStore{
  constructor(root,{discovery,probe=probeReaConnection}={}){this.root=root;this.file=path.join(root,'rea-connection.json');this.discovery=discovery;this.probe=probe;}
  async read(){try{return JSON.parse(await fs.readFile(this.file,'utf8'));}catch(error){if(error.code==='ENOENT')return {};throw error;}}
  runtime(settings){const entry=settings.reaBundled?bundledReaInfo(this.discovery).entry:settings.reaPath;return {rea:entry||'',browser:settings.browser||'',reaEnv:{...(settings.ghidraPath?{GHIDRA_INSTALL_DIR:settings.ghidraPath}:{}),...(settings.javaHome?{JAVA_HOME:settings.javaHome}:{})}};}
  async config(){return this.runtime(await this.read());}
  async view(){
    const saved=await this.read(),runtime=this.runtime(saved),settings=saved.reaBundled?{...saved,reaPath:runtime.rea}:saved,launch=resolveReaConfig(runtime,this.discovery);
    const included=launch.bundled||saved.reaBundled||launch.source==='bundled',script=launch.args?.some(arg=>/\.[cm]?js$/i.test(arg));
    const bundledNode=path.join(this.discovery?.portableRoot||portableRoot,'engines/node/node.exe'),command=launch.command&&path.resolve(launch.command);
    // Describe the selected launch, not whichever Node happens to be on PATH.
    // These closed identifiers contain no paths or environment values.
    const provenance={engine:included?'included':launch.source==='missing'?'missing':'external',runtime:!launch.available?'unavailable':!script?'engine-executable':command===path.resolve(bundledNode)?'included-node':command===path.resolve(process.execPath)?'app-runtime':'configured-runtime'};
    return {settings,available:launch.available,source:launch.source,provenance,reason:launch.reason||'',status:settings.lastCheck||null};
  }
  async bundled(){return bundledReaInfo(this.discovery);}
  async restoreBundled(signal){
    const bundle=await this.bundled();if(!bundle.available)throw new Error(bundle.reason);
    const previous=await this.read(),settings={...previous,reaPath:bundle.entry,reaBundled:true};
    const status=await this.probe(this.runtime(settings),{signal,discovery:this.discovery});
    if(signal?.aborted)throw new Error('Engine restore canceled. Your previous settings were kept.');
    if(!status.available)throw new Error(`The included engine could not start. ${status.reason||'Repair your Nodes for REA installation, then check the engine again.'} Your previous settings were kept.`);
    await this.writeVerified(settings,status);return this.view();
  }
  async writeVerified(settings,status){settings.lastCheck={checkedAt:new Date().toISOString(),...status};await fs.mkdir(this.root,{recursive:true});const temporary=path.join(this.root,`rea-${randomUUID()}.tmp`);try{await fs.writeFile(temporary,JSON.stringify(settings,null,2));await fs.rename(temporary,this.file);}catch(error){await fs.unlink(temporary).catch(()=>{});throw error;}}
  async saveVerified(input,signal,{checkedStatus}={}){
    const settings={};for(const key of ['reaPath','browser','ghidraPath','javaHome']){const value=String(input?.[key]||'').trim();if(value.length>4000||/[\r\n\0]/.test(value))throw new Error('Invalid REA runtime path.');if(value){if(!path.isAbsolute(value))throw new Error('Choose an absolute runtime path.');const stat=await fs.stat(value);if(['ghidraPath','javaHome'].includes(key)?!stat.isDirectory():!stat.isFile())throw new Error('Choose the requested runtime file or directory.');}settings[key]=value;}
    if(settings.reaPath&&resolveReaConfig(this.runtime(settings),this.discovery).bundled)settings.reaBundled=true;
    const status=checkedStatus||await this.probe(this.runtime(settings),{signal,discovery:this.discovery});if(!status.available)throw new Error(status.reason||'REA connection failed.');if(signal?.aborted)throw new Error('Engine check canceled. Your previous settings were kept.');
    await this.writeVerified(settings,status);return this.view();
  }
}
