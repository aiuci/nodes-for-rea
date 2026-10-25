#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const fs = require('node:fs');
const path = require('node:path');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const {distributionPaths, dependencyEntry} = require('../lib/distribution.cjs');
const info = require('../package.json');
const args = process.argv.slice(2);
const env = {...process.env, INVESTIGATOR_NODE: process.execPath};
delete env.ELECTRON_RUN_AS_NODE;
let electronArgs = [];

function fail(message) { console.error(`Nodes for REA: ${message}`); process.exit(1); }
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--help' || arg === '-h') {
    console.log('Nodes for REA\n\nUsage: nodes-for-rea [--data-dir PATH]\n       nodes-for-rea --diagnostics | --version | --help\n\nOpens the desktop mind map. The first launch downloads Electron if needed.\nClose Nodes before updating with npm. Saved work is outside the package.\nNative analysis tools and AI account access are configured separately.');
    process.exit(0);
  }
  if (arg === '--version' || arg === '-v') { console.log(info.version); process.exit(0); }
  if (arg === '--data-dir') {
    if (!args[index + 1] || args[index + 1].startsWith('--')) fail('--data-dir requires a folder.');
    env.INVESTIGATOR_DATA = path.resolve(args[++index]);
  } else if (arg === '--') { electronArgs = args.slice(index + 1); break; }
  else if (arg !== '--diagnostics') fail(`Unknown option ${arg}. Run nodes-for-rea --help.`);
}
if (process.platform !== 'win32' || process.arch !== 'x64') fail('This preview supports Windows x64 only.');
const [major, minor] = process.versions.node.split('.').map(Number);
if (!((major === 22 && minor >= 19) || (major === 24 && minor >= 11) || major >= 26)) fail('Install Node.js 22.19+, 24.11+, or 26+ to run the included REA engine.');
const paths = distributionPaths(root, {env});
if (args.includes('--diagnostics')) {
  console.log(JSON.stringify({version:info.version, node:process.version, platform:process.platform, arch:process.arch, ...paths,
    rea:dependencyEntry(root, 'rea-agents', 'scripts/rea.mjs'), codex:dependencyEntry(root, '@openai/codex', 'bin/codex.js')}, null, 2));
  process.exit(0);
}
let executable;
try {
  fs.mkdirSync(paths.dataRoot, {recursive:true});
  fs.mkdirSync(paths.profileRoot, {recursive:true});
  fs.mkdirSync(paths.settingsRoot, {recursive:true});
  fs.accessSync(paths.dataRoot, fs.constants.W_OK);
  fs.accessSync(paths.profileRoot, fs.constants.W_OK);
  fs.accessSync(paths.settingsRoot, fs.constants.W_OK);
  if (!dependencyEntry(root, 'rea-agents', 'dist/mcp/main.js')) fail('The included REA engine is missing. Reinstall nodes-for-rea with npm; saved work is kept separately.');
  const electronModule=dependencyEntry(root,'electron','index.js');
  let runtimePresent=false;
  try{const folder=path.dirname(electronModule),entry=fs.readFileSync(path.join(folder,'path.txt'),'utf8');runtimePresent=fs.existsSync(path.join(folder,'dist',entry));}catch{}
  if(!runtimePresent)console.log('Preparing Nodes: downloading the desktop runtime. Leave this window open; the app will open when it is ready.');
  // Electron 44 acquires its binary on first require, not an assumed postinstall.
  executable = require('electron');
  if (!fs.existsSync(executable)) fail('Electron is unavailable. Check your internet connection and retry.');
} catch (error) { fail(`Could not prepare the desktop runtime. Check folder permissions and internet/proxy access, then retry. ${error.message}`); }
const child = spawn(executable, [...electronArgs, root], {env, stdio:'inherit', windowsHide:false});
child.on('error', error => fail(`Could not start Electron: ${error.message}`));
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => child.kill(signal));
