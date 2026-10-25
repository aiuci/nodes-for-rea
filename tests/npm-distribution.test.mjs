import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import distribution from '../lib/distribution.cjs';
import {bundledReaInfo,resolveReaConfig} from '../lib/rea-config.mjs';

test('npm storage survives replacing installed package files; dev and ZIP remain separate',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-npm-paths-'));
  try{
    const root=path.join(temp,'installed app'),local=path.join(temp,'Local App Data');await fs.mkdir(root);
    const options={env:{LOCALAPPDATA:local},platform:'win32',home:temp};
    assert.equal(distribution.distributionPaths(root,options).profileRoot,path.join(root,'candidate-profile'));
    await fs.writeFile(path.join(root,'npm-release.json'),'{}');
    const before=distribution.distributionPaths(root,options);
    assert.equal(before.dataRoot,path.join(local,'Nodes for REA/investigations'));
    assert.equal(before.profileRoot,path.join(local,'Nodes for REA/profile'));
    assert.ok(!before.dataRoot.startsWith(root));
    await fs.mkdir(before.dataRoot,{recursive:true});await fs.writeFile(path.join(before.dataRoot,'retained.txt'),'research');
    await fs.rm(root,{recursive:true});await fs.mkdir(root);await fs.writeFile(path.join(root,'npm-release.json'),'{}');
    assert.deepEqual(distribution.distributionPaths(root,options),before);
    assert.equal(await fs.readFile(path.join(before.dataRoot,'retained.txt'),'utf8'),'research');
    const custom=distribution.distributionPaths(root,{...options,env:{...options.env,INVESTIGATOR_DATA:path.join(temp,'custom')}});
    assert.equal(custom.profileRoot,path.join(temp,'custom/.electron-profile'));
    await fs.writeFile(path.join(root,'portable.json'),'{}');
    const zip=distribution.distributionPaths(root,options);assert.equal(zip.npm,false);assert.equal(zip.dataRoot,path.resolve(root,'../../Data/investigations'));
  }finally{await fs.rm(temp,{recursive:true});}
});

test('npm REA discovery resolves hoisted dependency, uses Node, and reports missing package honestly',async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-npm-rea-'));
  try{
    const appRoot=path.join(temp,'node_modules/nodes-for-rea'),rea=path.join(temp,'node_modules/rea-agents');
    await fs.mkdir(appRoot,{recursive:true});await fs.mkdir(path.join(rea,'scripts'),{recursive:true});await fs.mkdir(path.join(rea,'dist/mcp'),{recursive:true});
    await fs.writeFile(path.join(appRoot,'npm-release.json'),'{}');await fs.writeFile(path.join(appRoot,'package.json'),'{}');
    await fs.writeFile(path.join(rea,'scripts/rea.mjs'),'');await fs.writeFile(path.join(rea,'dist/mcp/main.js'),'');
    const options={appRoot,env:{INVESTIGATOR_NODE:process.execPath},codexConfigPath:path.join(temp,'absent.toml')};
    assert.equal(bundledReaInfo(options).entry,path.join(rea,'scripts/rea.mjs'));
    const resolved=resolveReaConfig({},options);assert.equal(resolved.bundled,true);assert.equal(resolved.command,process.execPath);assert.deepEqual(resolved.args,[path.join(rea,'scripts/rea.mjs'),'mcp']);
    await fs.unlink(path.join(rea,'dist/mcp/main.js'));
    assert.equal(bundledReaInfo(options).available,false);assert.match(bundledReaInfo(options).reason,/npm/);
  }finally{await fs.rm(temp,{recursive:true});}
});
