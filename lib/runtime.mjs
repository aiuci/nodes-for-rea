// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import { spawn } from 'node:child_process';
import { existsSync,readFileSync,realpathSync } from 'node:fs';
import {createRequire} from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';
import {appRoot,portableRoot,npmMode} from './paths.mjs';
import distribution from './distribution.cjs';

export function runtimeConfig(settings={}) {
  const win=process.platform==='win32',exeName=name=>win?`${name}.exe`:name;
  const npmGlobal=win?path.join(homedir(),'AppData/Roaming/npm/node_modules'):[path.join('/opt/homebrew','lib/node_modules'),'/usr/local/lib/node_modules',path.join(homedir(),'.npm-global/lib/node_modules')].find(dir=>existsSync(dir))||'/usr/local/lib/node_modules';
  const claudeCandidates=[path.join(homedir(),'.local/bin',exeName('claude')),...(win?[path.join(homedir(),'AppData/Local/Microsoft/WinGet/Links/claude.exe')]:['/opt/homebrew/bin/claude','/usr/local/bin/claude']),path.join(npmGlobal,'@anthropic-ai/claude-code/cli.js'),...(process.env.PATH||'').split(path.delimiter).map(dir=>path.join(dir,exeName('claude')))];
  const bundled=npmMode?distribution.dependencyEntry(appRoot,'@openai/codex','bin/codex.js'):path.join(portableRoot,'engines/codex/bin/codex.exe'),global=path.join(npmGlobal,'@openai/codex/bin/codex.js');
  const selected=settings.verification==='local-auth';
  return {claude:(selected&&settings.claudePath)||process.env.INVESTIGATOR_CLAUDE||settings.claudePath||claudeCandidates.find(file=>existsSync(file))||'',provider:settings.provider||'codex',model:settings.model||'',gatewayUrl:settings.gatewayUrl||'http://127.0.0.1:18789/v1',gatewayToken:settings.gatewayToken||'',agentId:settings.agentId||'',node:process.env.INVESTIGATOR_NODE||process.execPath,codex:(selected&&settings.codexPath)||process.env.INVESTIGATOR_CODEX||settings.codexPath||(existsSync(bundled)?bundled:global),rea:process.env.INVESTIGATOR_REA||'',browser:process.env.INVESTIGATOR_BROWSER||'',configured:!!settings.configured};
}
export function codexCommand(config,args){
  if(process.platform==='win32'&&/\.[cm]?js$/i.test(config.codex)){
    // The official npm shim spawns codex.exe without windowsHide. Launch that
    // executable ourselves so runProcess's hidden-window option reaches it.
    let entry,root,official=false;
    try{entry=realpathSync(config.codex);root=path.dirname(path.dirname(entry));official=path.basename(entry)==='codex.js'&&path.basename(path.dirname(entry))==='bin'&&JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).name==='@openai/codex';}catch{}
    if(official){
      const target=process.arch==='arm64'?'aarch64-pc-windows-msvc':'x86_64-pc-windows-msvc',packageName=`@openai/codex-win32-${process.arch==='arm64'?'arm64':'x64'}`;
      let vendor;try{vendor=path.join(path.dirname(createRequire(entry).resolve(`${packageName}/package.json`)),'vendor');}catch{vendor=path.join(root,'vendor');}
      const executable=path.join(vendor,target,'bin/codex.exe');if(!existsSync(executable))throw new Error('The native Codex executable is missing. Reinstall Codex or select its executable in Connection.');
      return {command:executable,args};
    }
  }
  return /\.[cm]?js$/i.test(config.codex)?{command:config.node,args:[config.codex,...args]}:{command:config.codex,args};
}

export function claudeCommand(config,args){if(!config.claude)throw new Error('Install Claude Code, then reopen Connection or browse to its executable.');return /\.[cm]?js$/i.test(config.claude)?{command:config.node,args:[config.claude,...args]}:{command:config.claude,args};}

export function runProcess(command, args, { input, signal, timeout = 180000, cwd, onEvent,onOutput,env=process.env,acceptedExitCodes=[0],maxOutput=24000000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Investigation stopped.'));
    const child = spawn(command, args, { cwd, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],env:{...process.env,...env,...(process.versions.electron&&command===process.execPath?{ELECTRON_RUN_AS_NODE:'1'}:{})} });
    let stdout = '', stderr = '', pending = '', settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(result);
    };
    const stop = () => {
      if (child.pid && process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill());
      } else child.kill('SIGTERM');
    };
    const abort = () => { stop(); finish(new Error('Investigation stopped.')); };
    const timer = setTimeout(() => { stop(); finish(new Error('Inspection timed out. Saved progress is available; try a narrower request.')); }, timeout);
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', e => finish(new Error(`Could not start ${path.basename(command)}: ${e.message}`)));
    child.stdout.on('data', buffer => {
      const text = buffer.toString(); stdout += text; pending += text;
      if (stdout.length > maxOutput) { stop(); return finish(new Error('Tool output exceeded the local capture limit.')); }
      try{onOutput?.(text);}catch{}
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) { try { onEvent?.(JSON.parse(line)); } catch {} }
    });
    child.stderr.on('data', buffer => {const text=buffer.toString();stderr = (stderr + text).slice(-6000);try{onOutput?.(text);}catch{} });
    child.on('close', code => {
      if (signal?.aborted) return finish(new Error('Investigation stopped.'));
      if (!acceptedExitCodes.includes(code)) return finish(new Error(`Tool exited with code ${code}: ${stderr.slice(-1800) || stdout.slice(-1800)}`));
      finish(null, { stdout, stderr,exitCode:code });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input || '');
  });
}

export function capabilities(config = runtimeConfig()) {
  const values=Object.fromEntries(['node','codex','claude','rea','browser'].map(key=>[key,!!config[key]&&existsSync(config[key])]));return {...values,browser:values.browser||!!config.captureBrowser,reasoning:config.provider==='openclaw'?!!config.configured:config.provider==='claude'?values.claude:values.codex,provider:config.provider};
}
