// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { appRoot, portableRoot } from './paths.mjs';
import distribution from './distribution.cjs';

// Read only the REA registration. Other MCP sections (including credentials)
// never enter the returned configuration or diagnostics.
export function parseReaRegistration(text) {
  const sections = {};
  let current = '';
  const lines = String(text).split(/\r?\n/);
  const uncomment = value => {
    let quote = '', escaped = false;
    for (let index = 0; index < value.length; index++) {
      const char = value[index];
      if (escaped) { escaped = false; continue; }
      if (quote === '"' && char === '\\') { escaped = true; continue; }
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '#') return value.slice(0, index).trim();
    }
    return value.trim();
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const header = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (header) { current = header[1]; continue; }
    if (!['mcp_servers.rea', 'mcp_servers.rea.env'].includes(current)) continue;
    const entry = line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
    if (!entry) continue;
    let raw = uncomment(entry[2]);
    if (raw.startsWith('[')) {
      while (!raw.endsWith(']') && index + 1 < lines.length && !/^\s*\[/.test(lines[index + 1])) raw += '\n' + uncomment(lines[++index]);
    }
    let value;
    try { value = JSON.parse(raw.replace(/,\s*]$/, ']')); }
    catch { if (/^'[^']*'$/.test(raw)) value = raw.slice(1, -1); else continue; }
    (sections[current] ||= {})[entry[1]] = value;
  }
  const server = sections['mcp_servers.rea'];
  if (!server || typeof server.command !== 'string' || !Array.isArray(server.args) || !server.args.every(x => typeof x === 'string')) return null;
  const env = Object.fromEntries(Object.entries(sections['mcp_servers.rea.env'] || {}).filter(([key, value]) => /^(GHIDRA_INSTALL_DIR|JAVA_HOME|REA_[A-Z0-9_]+)$/.test(key) && typeof value === 'string'));
  return { command: server.command, args: server.args, env, ...(typeof server.cwd === 'string' ? { cwd: server.cwd } : {}) };
}

function fileExists(file) { try { return existsSync(file) && statSync(file).isFile(); } catch { return false; } }
function npmRuntime(options={}){
  const root=options.appRoot||appRoot;
  if(!distribution.distributionPaths(root).npm)return null;
  return {entry:distribution.dependencyEntry(root,'rea-agents','scripts/rea.mjs'),node:(options.env||process.env).INVESTIGATOR_NODE||process.execPath};
}
function bundledCandidates(options){const npm=npmRuntime(options);if(npm)return [npm.entry||path.join(options.appRoot||appRoot,'node_modules/rea-agents/scripts/rea.mjs')];return [options.portableRoot || portableRoot, options.appRoot || appRoot].flatMap(root=>[
  path.join(root,'engines/rea/node_modules/rea-agents/scripts/rea.mjs'),path.join(root,'engines/rea/scripts/rea.mjs'),path.join(root,'engines/rea/rea.mjs'),path.join(root,'engines/rea/rea.exe'),
]);}
export function bundledReaInfo(options={}){
  const npm=npmRuntime(options);
  const entry=bundledCandidates(options).find(fileExists);
  const reason=npm?'The npm inspection engine is missing or incomplete. Close Nodes and reinstall nodes-for-rea with npm. Your saved work is stored separately.':'The included inspection engine is missing or incomplete. Extract the complete Nodes for REA ZIP to a new writable folder, then open that copy. Keep your existing Data folder.';
  if(!entry)return {available:false,entry:bundledCandidates(options)[0],reason};
  const node=npm?.node||path.join(options.portableRoot||portableRoot,'engines/node/node.exe');
  if(/\.[cm]?js$/i.test(entry)&&!fileExists(node))return {available:false,entry,reason};
  // The distributed REA dispatcher needs this compiled entry; its presence alone
  // is still not execution proof. restoreBundled probes before changing settings.
  if(path.basename(path.dirname(entry))==='scripts'&&!fileExists(path.join(path.dirname(path.dirname(entry)),'dist/mcp/main.js')))return {available:false,entry,reason};
  return {available:true,entry,...(/\.[cm]?js$/i.test(entry)?{node}:{})};
}
function localCommand(command, env) {
  if (fileExists(command)) return command;
  if (!path.isAbsolute(command) && !/[\\/]/.test(command)) {
    for (const directory of (env.PATH || env.Path || '').split(path.delimiter)) {
      for (const suffix of process.platform === 'win32' ? ['', '.exe', '.cmd'] : ['']) {
        const candidate = path.join(directory, command + suffix);
        if (fileExists(candidate) && !/\.(?:cmd|bat)$/i.test(candidate)) return candidate;
      }
    }
  }
  return '';
}

export function resolveReaConfig(config = {}, options = {}) {
  const environment = options.env || process.env;
  const home = options.home || homedir();
  let registered = null;
  try { registered = parseReaRegistration(readFileSync(options.codexConfigPath || path.join(environment.CODEX_HOME || path.join(home, '.codex'), 'config.toml'), 'utf8')); } catch {}
  const bundleEntries=bundledCandidates(options),bundled=bundleEntries.find(fileExists);
  const explicit = config.rea || config.reaPath;
  const selected = explicit || environment.INVESTIGATOR_REA || bundled || registered;
  const source = explicit ? 'settings' : environment.INVESTIGATOR_REA ? 'environment' : bundled ? 'bundled' : registered ? 'codex-registration' : 'missing';
  const usesBundled=typeof selected==='string'&&bundleEntries.some(entry=>path.resolve(entry)===path.resolve(selected));
  // A portable engine must not silently borrow another app's MCP provider paths.
  // Preserve explicit REA settings and registration-backed working-copy behavior.
  const nativeDefaults={};
  // Optional portable toolkit: paths are local defaults only. The selected REA
  // still validates versions, Windows protections and an actual operation.
  if(usesBundled){
    const nativeRoot=path.join(options.portableRoot||portableRoot,'engines/native'),ghidra=path.join(nativeRoot,'ghidra'),jdk=path.join(nativeRoot,'jdk');
    if(!environment.GHIDRA_INSTALL_DIR&&fileExists(path.join(ghidra,'support/analyzeHeadless.bat')))nativeDefaults.GHIDRA_INSTALL_DIR=ghidra;
    if(!environment.JAVA_HOME&&fileExists(path.join(jdk,'bin/java.exe'))&&fileExists(path.join(jdk,'bin/javac.exe')))nativeDefaults.JAVA_HOME=jdk;
  }
  const nativeEnv = { ...nativeDefaults, ...(usesBundled?{}:registered?.env || {}), ...(config.reaEnv || {}) };
  if (!selected) return { available: false, source, reason: 'Select a local REA executable or scripts/rea.mjs in Connection, set INVESTIGATOR_REA, or configure the local REA MCP registration.' };
  let command, args, extraEnv = {};
  if (typeof selected === 'object') {
    command = selected.command;
    args = selected.args;
    extraEnv = selected.env || {};
  } else if (/\.[cm]?js$/i.test(selected)) {
    const bundledNode=npmRuntime(options)?.node||path.join(options.portableRoot||portableRoot,'engines/node/node.exe');
    if(usesBundled&&!fileExists(bundledNode)&&!config.reaNode)return {available:false,source,bundled:true,reason:'The included Node runtime is missing. Extract the complete Nodes for REA ZIP to a new folder; no separate Node installation is needed.'};
    command = usesBundled&&fileExists(bundledNode)?bundledNode:config.node || environment.INVESTIGATOR_NODE || registered?.command || process.execPath;
    args = [selected, 'mcp'];
  } else { command = selected; args = ['mcp']; }
  if (typeof command !== 'string' || !Array.isArray(args) || !args.every(x => typeof x === 'string')) return { available: false, source, reason: 'REA launch configuration must contain a command and string arguments.' };
  if(config.reaNode)command=config.reaNode;
  const executable = localCommand(command, environment);
  if (!executable || /\.(?:cmd|bat)$/i.test(executable) || /^(?:npx|npm|yarn|pnpm)(?:\.exe)?$/i.test(path.basename(executable))) return { available: false, source, reason: 'REA requires an installed local executable or JavaScript entry. Package-download commands and shell shims are not launched.' };
  const script = args.find(arg => /\.[cm]?js$/i.test(arg));
  if (script && !fileExists(script)) return { available: false, source, reason: 'The configured REA JavaScript entry does not exist.' };
  // The host may be Electron. Running its executable without this flag would
  // reopen the app instead of starting the MCP server as Node.
  const electronEnv = process.versions.electron && path.resolve(executable) === path.resolve(process.execPath) ? { ELECTRON_RUN_AS_NODE: '1' } : {};
  return { available: true, source, bundled:usesBundled, command: executable, args: [...args], env: { ...nativeEnv, ...extraEnv, ...electronEnv }, cwd: config.reaCwd || selected.cwd || undefined };
}
