import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {codexCommand} from '../lib/runtime.mjs';
test('Windows npm Codex launches its native executable directly instead of the console-spawning shim',{skip:process.platform!=='win32'},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-runtime-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const entry=path.join(root,'bin/codex.js'),arch=process.arch==='arm64'?'arm64':'x64',target=arch==='arm64'?'aarch64-pc-windows-msvc':'x86_64-pc-windows-msvc';
  await fs.mkdir(path.dirname(entry),{recursive:true});await fs.writeFile(entry,'// Official launcher fixture');await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'@openai/codex'}));
  const platform=path.join(root,`node_modules/@openai/codex-win32-${arch}`),executable=path.join(platform,'vendor',target,'bin/codex.exe');await fs.mkdir(path.dirname(executable),{recursive:true});await fs.writeFile(path.join(platform,'package.json'),JSON.stringify({name:`@openai/codex-win32-${arch}`}));await fs.writeFile(executable,'fixture');
  assert.deepEqual(codexCommand({codex:entry,node:'unused-node'},['exec','-']),{command:executable,args:['exec','-']});
  await fs.unlink(executable);assert.throws(()=>codexCommand({codex:entry,node:'unused-node'},['exec']),/native Codex executable is missing/);
});
test('legacy vendor layout resolves natively while custom JavaScript CLIs remain supported',{skip:process.platform!=='win32'},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-runtime-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const entry=path.join(root,'bin/codex.js'),target=process.arch==='arm64'?'aarch64-pc-windows-msvc':'x86_64-pc-windows-msvc',executable=path.join(root,'vendor',target,'bin/codex.exe');await fs.mkdir(path.dirname(entry),{recursive:true});await fs.mkdir(path.dirname(executable),{recursive:true});await fs.writeFile(entry,'fixture');await fs.writeFile(executable,'fixture');await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'@openai/codex'}));assert.equal(codexCommand({codex:entry,node:'node'},[]).command,executable);
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({name:'custom-cli'}));assert.deepEqual(codexCommand({codex:entry,node:'node'},['exec']),{command:'node',args:[entry,'exec']});assert.deepEqual(codexCommand({codex:executable,node:'node'},['--version']),{command:executable,args:['--version']});
});
