import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {classifyTarget} from '../lib/targets.mjs';

for(const [location,expected] of [['extractor/WvEdge/resources/app.asar','native'],['resources/app.asar','javascript'],['app.asar','javascript']]){
 test(`application folder ${location} selects the ${expected} implementation boundary`,async t=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'rea-asar-selection-'));t.after(()=>fs.rm(folder,{recursive:true,force:true,maxRetries:5}));
  const executable=path.join(folder,'OwnedApp.exe'),archive=path.join(folder,location),pe=Buffer.alloc(128);pe.write('MZ');await fs.writeFile(executable,pe);await fs.mkdir(path.dirname(archive),{recursive:true});await fs.writeFile(archive,'Owned archive classification fixture');
  const target=await classifyTarget(folder);assert.equal(target.targetType,expected);assert.equal(target.root,expected==='native'?executable:archive);assert.ok(target.artifactCandidates.includes(location.replaceAll('/',path.sep)));
 });
}
