// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createEvidenceMetadataReader} from '../lib/evidence-metadata-host.mjs';
import {evidenceAwareFixture} from './fixtures/evidence-aware-fixture.mjs';
const hash=raw=>createHash('sha256').update(raw).digest('hex');
async function fixture(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-evidence-metadata-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const {state,raw}=evidenceAwareFixture();await fs.mkdir(path.join(directory,'evidence'));
  for(const [index,source]of state.evidence.entries()){source.snapshotPath=path.join(directory,'evidence',source.id+'.txt');source.sha256=hash(raw[index]);await fs.writeFile(source.snapshotPath,raw[index]);}
  const store={directory:id=>{assert.equal(id,state.id);return directory;},read:async id=>{assert.equal(id,state.id);return structuredClone(state);}};
  return {directory,state,raw,store,read:createEvidenceMetadataReader(store)};
}
test('read-only metadata hashes full retained bytes before projecting beyond the snapshot preview cap',async t=>{
  const f=await fixture(t),source=f.state.evidence[0],record=JSON.parse(f.raw[0]).structuredContent;record.normalized_result.padding='x'.repeat(300000);record.confidence='derived';const raw=JSON.stringify({structuredContent:record});source.sha256=hash(raw);await fs.writeFile(source.snapshotPath,raw);const before=structuredClone(f.state);
  const value=await f.read(f.state.id,source.id);assert.equal(value.integrity.localBytes,'sha256-matches-recorded-snapshot');assert.equal(value.canonicalEvidence.fields.confidence,'derived');assert.equal(value.integrity.nativeSemanticIdentity,'not-authenticated');assert.equal(await fs.readFile(source.snapshotPath,'utf8'),raw);assert.deepEqual(f.state,before);
});
test('cached interpretation never conceals changed bytes and returned DTOs cannot mutate its cache',async t=>{
  const f=await fixture(t),source=f.state.evidence[0];const first=await f.read(f.state.id,source.id);first.canonicalEvidence.fields.confidence='invented';assert.equal((await f.read(f.state.id,source.id)).canonicalEvidence.fields.confidence,'derived');
  await fs.appendFile(source.snapshotPath,' ');await assert.rejects(f.read(f.state.id,source.id),/recorded hash/);
});
test('cache identity includes new source hashes while applicability updates independently',async t=>{
  const f=await fixture(t),source=f.state.evidence[0];await f.read(f.state.id,source.id);source.applicability='changed';assert.equal((await f.read(f.state.id,source.id)).source.applicability,'changed');const record=JSON.parse(f.raw[0]);record.structuredContent.confidence='inferred';const raw=JSON.stringify(record);source.sha256=hash(raw);await fs.writeFile(source.snapshotPath,raw);assert.equal((await f.read(f.state.id,source.id)).canonicalEvidence.fields.confidence,'inferred');
});
test('missing hash stays unverified and missing/excluded sources never become metadata',async t=>{
  const f=await fixture(t),source=f.state.evidence[0];delete source.sha256;source.snapshotPath='not-read-without-a-digest';const result=await f.read(f.state.id,source.id);assert.equal(result.status,'unavailable');assert.equal(result.integrity.localBytes,'unverified');
  await assert.rejects(f.read(f.state.id,'missing'),/Source not found/);source.portableAttachment={status:'excluded',reason:'Owned exclusion'};await assert.rejects(f.read(f.state.id,source.id),/Owned exclusion/);
});
test('missing, escaping and oversized snapshots reject without changing retained sources',async t=>{
  const f=await fixture(t),source=f.state.evidence[0];await fs.unlink(source.snapshotPath);await assert.rejects(f.read(f.state.id,source.id),/snapshot is missing/);const outside=path.join(f.directory,'outside.txt');await fs.writeFile(outside,f.raw[0]);source.snapshotPath=outside;await assert.rejects(f.read(f.state.id,source.id),/outside.*evidence folder/);
  source.snapshotPath=path.join(f.directory,'evidence','large.txt');const file=await fs.open(source.snapshotPath,'w');await file.truncate(32*1024*1024+1);await file.close();await assert.rejects(f.read(f.state.id,source.id),/32 MiB/);assert.equal(await fs.readFile(outside,'utf8'),f.raw[0]);
});
test('verified bytes with unsupported structure or excessive parse size retain an explicit interpretation limitation',async t=>{
  const f=await fixture(t),source=f.state.evidence[0];for(const [raw,status]of [['plain source text','unrecognized'],[' '.repeat(8*1024*1024+1),'unavailable']]){source.sha256=hash(raw);await fs.writeFile(source.snapshotPath,raw);const value=await f.read(f.state.id,source.id);assert.equal(value.status,status);assert.equal(value.integrity.localBytes,'sha256-matches-recorded-snapshot');assert.equal(value.integrity.nativeSemanticIdentity,'not-authenticated');}
});
