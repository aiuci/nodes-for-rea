// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Only complete renderer-owned view/draft snapshots may supersede each other.
// Research, evidence, selection and collection operations never enter this queue.
export function createWorkspaceSaveQueue(write){
  let active=null,sequence=0,epoch=0;const pending=[],idle=[],failures=new Map();
  function pump(){
    if(active||!pending.length)return;
    const job=active=pending.shift();
    Promise.resolve().then(()=>write(job.id,job.snapshot)).then(value=>{
      if((failures.get(job.id)?.sequence||0)<=job.sequence)failures.delete(job.id);
      job.resolve(value);
    },error=>{failures.set(job.id,{sequence:job.sequence,error});job.reject(error);}).finally(()=>{
      active=null;if(pending.length)pump();else for(const resolve of idle.splice(0))resolve();
    });
  }
  return {
    enqueue(id,snapshot){
      if(typeof id!=='string'||!id||!snapshot||Object.keys(snapshot).sort().join(',')!=='draft,draftContext,workspace'||typeof snapshot.draft!=='string'||!snapshot.workspace||typeof snapshot.workspace!=='object'||Array.isArray(snapshot.workspace))throw Error('A complete investigation view/draft snapshot is required. Independent patches cannot be coalesced.');
      const value=structuredClone(snapshot),tail=pending.at(-1),serial=++sequence;
      if(tail?.id===id&&tail.epoch===epoch){tail.snapshot=value;tail.sequence=serial;return tail.promise;}
      const job={id,snapshot:value,sequence:serial,epoch};job.promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});
      // UI callers receive the original rejecting promise; ignoring a superseded
      // snapshot must not create an unhandled rejection during a close failure.
      job.promise.catch(()=>{});pending.push(job);pump();return job.promise;
    },
    async flush(){
      // A boundary seals pending snapshots. Later independent work cannot replace
      // a snapshot already promised to an earlier save/switch/close operation.
      epoch++;
      while(active||pending.length)await new Promise(resolve=>idle.push(resolve));
      if(failures.size)throw failures.values().next().value.error;
    },
    get pending(){return !!active||pending.length>0;}
  };
}
