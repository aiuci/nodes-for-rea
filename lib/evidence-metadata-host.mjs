// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {EVIDENCE_VIEW_VERSION,retainedEvidenceMetadata} from './evidence-view.mjs';

const MAX_SNAPSHOT_BYTES=32*1024*1024;
const inside=(parent,file)=>{const relative=path.relative(parent,file);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};

// A new, explicit read-only boundary. Renderer callers supply saved IDs only.
// Cache interpretation, never a successful integrity verdict: reread/hash bytes
// on every requested disclosure so a damaged file cannot hide behind the cache.
export function createEvidenceMetadataReader(store,{cacheEntries=24}={}){
  const cache=new Map(),limit=Math.max(0,Math.min(64,Number.isInteger(cacheEntries)?cacheEntries:24));
  return async function readEvidenceMetadata(id,evidenceId){
    const state=await store.read(id),source=state.evidence?.find(record=>record.id===evidenceId);
    if(!source)throw new Error('Source not found.');
    if(source.portableAttachment&&source.portableAttachment.status!=='bundled')throw new Error(source.portableAttachment.reason||'This evidence remains external or was excluded from the document.');
    if(!/^[a-f0-9]{64}$/.test(source.sha256||''))return {...retainedEvidenceMetadata(null,source),status:'unavailable',reason:'This source has no recorded SHA-256 digest. Retained bytes cannot be verified for metadata display.',integrity:{localBytes:'unverified',nativeSemanticIdentity:'not-authenticated'}};
    const directory=await fs.realpath(store.directory(id)),file=await fs.realpath(source.snapshotPath).catch(error=>{if(error.code==='ENOENT')throw new Error('This snapshot is missing. Saved findings remain readable; no target was contacted.');throw error;});
    if(!inside(path.join(directory,'evidence'),file))throw new Error('Evidence resolves outside this investigation’s evidence folder.');
    const stat=await fs.stat(file);
    if(!stat.isFile()||stat.size>MAX_SNAPSHOT_BYTES)throw new Error('Metadata requires a regular retained snapshot no larger than 32 MiB. The original source remains unchanged.');
    const raw=await fs.readFile(file);
    const digest=createHash('sha256').update(raw).digest('hex');
    if(digest!==source.sha256)throw new Error('The saved snapshot no longer matches its recorded hash.');
    const key=JSON.stringify([id,evidenceId,digest,EVIDENCE_VIEW_VERSION]);
    let interpretation=cache.get(key);
    if(!interpretation){interpretation=retainedEvidenceMetadata(raw.toString('utf8'),source);if(limit){cache.set(key,interpretation);while(cache.size>limit)cache.delete(cache.keys().next().value);}}
    // Source applicability/redaction can change independently of snapshot bytes.
    // Reproject its small metadata instead of caching a stale currentness label.
    const currentSource=retainedEvidenceMetadata(null,source).source;
    return {...structuredClone(interpretation),source:currentSource,integrity:{localBytes:'sha256-matches-recorded-snapshot',sha256:digest,nativeSemanticIdentity:'not-authenticated'}};
  };
}
