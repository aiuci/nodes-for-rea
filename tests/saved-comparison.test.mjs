import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {InvestigationStore} from '../lib/investigation.mjs';
import {compareSaved,comparisonStatus,listComparisonCandidates,prepareSavedComparison,commitSavedComparison} from '../lib/saved-comparison.mjs';
import {auditSavedSupport} from '../lib/support-audit.mjs';
import {finalAssetContext} from '../lib/finalize.mjs';
import {buildDelivery,deliveryScopeEvidenceIds} from '../lib/delivery.mjs';
import {buildDocument,parseDocument,validateInvestigation} from '../lib/investigation-document.mjs';
import {prepareShare} from '../lib/document-sharing.mjs';
import {exportInvestigation,importInvestigation} from '../lib/archive.mjs';

const sha=raw=>createHash('sha256').update(raw).digest('hex');
async function setup(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-owned-saved-comparison-')),store=new InvestigationStore(path.join(root,'data')),a=randomUUID(),b=randomUUID();
  for(const [id,side]of [[a,'A'],[b,'B']]){
    const raw=Buffer.from(JSON.stringify({content:`${side} retained exact bytes`,padding:'\u00e9'})),text=`${side} saved implementation statement.`,directory=store.directory(id);await fs.mkdir(path.join(directory,'evidence'),{recursive:true});
    const evidence={id:'e1',kind:'rea',title:`${side} receipt`,text,sha256:sha(raw),snapshotPath:path.join(directory,'evidence','e1.txt'),locator:`C:\\owned-${side}\\fixture.exe`,targetIdentity:{path:`C:\\owned-${side}\\fixture.exe`,sha256:'a'.repeat(64)},operation:'analyze_function',reaEvidenceId:'foreign-rea-id',evidenceStatus:'static',applicability:'unknown',capturedAt:'2026-10-20T00:00:00Z',limitations:['Only a retained static passage.']};
    const message={id:'same',role:'assistant',title:`${side} saved report`,overview:`${side} overview`,text:`${side} complete saved answer.`,createdAt:'2026-10-20T00:00:00Z',branchFeatureName:'Feature',claims:[{state:'observed',text:`${side} statement`,evidenceId:'e1',quote:text}],findings:[{question:'Saved support',finding:`${side} retained statement`,change:'new',claimIndexes:[0]}],continuation:{status:'complete',reason:'Saved scope answered.',uncertainty:'',impact:'',nextEvidence:''}};
    const state={id,title:`${side} investigation`,createdAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z',messages:[{id:'request',role:'user',text:'Inspect owned source.'},message],evidence:[evidence],targets:[],draft:'Unsent draft',draftContext:{nodeId:'turn:same'},attempts:[{id:'prior_attempt',status:'failed',question:'Original failed request'}],keptFeatures:[],removedKeptFeatures:[{key:'retained-history',checkpoints:[{id:'checkpoint'}]}],verificationRuns:[{id:'source_check',messageId:'same',scope:`${side} recorded finite check`,status:'failed',evidenceIds:['e1'],cases:[{id:'case',status:'failed',expected:'owned expected',actual:'owned actual'}],limitations:['Only the recorded input.']}],status:'saved'};
    await fs.writeFile(path.join(directory,'investigation.json'),JSON.stringify(state,null,2));await fs.writeFile(path.join(directory,'evidence','e1.txt'),raw);await fs.writeFile(path.join(directory,'workspace.json'),JSON.stringify({draft:state.draft,draftContext:state.draftContext}));
  }
  let calls=0,prompts=[];const config={provider:'owned-injected'};
  const reasoning=async(actual,_schema,prompt)=>{assert.equal(actual,config);calls++;const value=JSON.parse(prompt);prompts.push(value);return answerFor(value.contexts);};
  const candidates=(await listComparisonCandidates(store)).candidates;
  const payload={operationId:randomUUID(),destinationInvestigationId:a,anchorResultId:'same',selections:[a,b].map(id=>{const c=candidates.find(c=>c.investigationId===id);return {investigationId:id,messageId:'same',selectionDigest:c.selectionDigest};}),request:'Compare these two saved results.',nodeId:'turn:same',preserveDraft:true};
  const file=id=>path.join(store.directory(id),'investigation.json'),rawFile=id=>path.join(store.directory(id),'evidence','e1.txt');
  return {root,store,a,b,config,reasoning,payload,file,rawFile,prompts,get calls(){return calls;},run:options=>compareSaved(store,payload,{config,reasoning,...options}),close:async()=>{assert.ok(root.startsWith(path.join(os.tmpdir(),'rea-owned-saved-comparison-')));await fs.rm(root,{recursive:true,force:true});}};
}
function answerFor(contexts){const claims=contexts.map(c=>c.evidence.find(e=>e.kind!=='comparison-context')).filter(Boolean).map(e=>({text:'Saved source statement.',state:'observed',evidenceId:e.id,quote:e.text}));return {title:'Saved comparison',overview:'Both retained sources remain distinct.',answer:'A supplementary comparison of saved support.',features:[],products:[],mechanismCoverage:[],claims,findings:claims.map((_,i)=>({question:`Source ${i+1}`,finding:'Retained statement.',change:'new',claimIndexes:[i]})),behavior:{unknowns:['Runtime behavior untested.'],claimIndexes:[]},continuation:{status:'complete',reason:'Saved support compared.',uncertainty:'',impact:'',nextEvidence:''},recommendation:'',directions:[],caveat:'Saved static receipts only.'};}
const fixture=fn=>async()=>{const h=await setup();try{await fn(h);}finally{await h.close();}};
async function edit(h,id,fn){const state=JSON.parse(await fs.readFile(h.file(id),'utf8'));fn(state);await fs.writeFile(h.file(id),JSON.stringify(state,null,2));}

test('read-only listing counts corrupt investigations, no navigation/activation/source writes, exact historical lookup',fixture(async h=>{
  const before=await fs.readFile(h.file(h.b)),corrupt=randomUUID();await fs.mkdir(h.store.directory(corrupt));await fs.writeFile(path.join(h.store.directory(corrupt),'investigation.json'),'corrupt');
  h.store.list=()=>{throw new Error('Store.list forbidden');};h.store.save=()=>{throw new Error('save forbidden');};
  const list=await listComparisonCandidates(h.store,{limit:1});assert.equal(list.candidates.length,1);assert.equal(list.hasMore,true);assert.equal(list.unavailableCount,1);assert.deepEqual(await fs.readFile(h.file(h.b)),before);
  await assert.rejects(fs.stat(path.join(h.store.root,'.navigation.json')),{code:'ENOENT'});
  await edit(h,h.a,s=>{for(let i=0;i<105;i++)s.messages.push({...s.messages[1],id:`new_${i}`,createdAt:'2026-10-21T00:00:00Z'});});
  const exact=await listComparisonCandidates(h.store,{investigationId:h.a,messageId:'same'});assert.equal(exact.candidates.length,1);assert.equal(exact.candidates[0].messageId,'same');assert.equal(exact.candidates[0].availability,'available');assert.doesNotMatch(JSON.stringify(exact),/owned-A|fixture.exe|foreign-rea-id/);
}));
test('cross-origin duplicate message/evidence IDs use safe distinct references, exact raw bytes and append-only originals',fixture(async h=>{
  const beforeA=await h.store.read(h.a),beforeB=await fs.readFile(h.file(h.b)),rawB=await fs.readFile(h.rawFile(h.b)),out=await h.run();assert.equal(out.status,'saved');assert.equal(h.calls,1);
  const s=out.state,result=s.messages.at(-1);assert.deepEqual(s.messages.slice(0,beforeA.messages.length),beforeA.messages);assert.deepEqual(s.evidence.slice(0,1),beforeA.evidence);assert.deepEqual(s.removedKeptFeatures,beforeA.removedKeptFeatures);assert.deepEqual(s.attempts,beforeA.attempts);assert.equal(s.draft,'Unsent draft');assert.deepEqual(await fs.readFile(h.file(h.b)),beforeB);
  assert.equal(result.parentResultId,'same');assert.equal(result.branchFeatureName,'Feature');assert.deepEqual(result.auditScope.sourceMessageIds,['same']);assert.equal(s.targets.length,0);assert.equal(new Set(result.claims.map(c=>c.evidenceId)).size,2);
  for(const e of s.evidence.slice(1)){assert.match(e.id,/^[a-zA-Z0-9_-]{1,100}$/);assert.equal(e.targetIdentity,undefined);assert.equal(e.reaEvidenceId,undefined);assert.equal(sha(await fs.readFile(e.snapshotPath)),e.sha256);}
  const copied=s.evidence.find(e=>e.kind==='comparison-receipt'&&e.comparisonOrigin.side==='B');assert.deepEqual(await fs.readFile(copied.snapshotPath),rawB);assert.notEqual(copied.sha256,copied.comparisonOrigin.textSha256);assert.equal(copied.comparisonOrigin.reaEvidenceId,'foreign-rea-id');
  assert.notEqual(h.prompts[0].contexts[0].results[0].id,h.prompts[0].contexts[1].results[0].id);assert.deepEqual(h.prompts[0].contexts.map(c=>c.results[0].findings[0].claimIndexes),[[0],[0]]);validateInvestigation(s);
}));
test('same tuple rejected before configuration/AI; cross-origin same message IDs accepted',fixture(async h=>{h.payload.selections[1]=h.payload.selections[0];await assert.rejects(h.run(),/distinct/);assert.equal(h.calls,0);}));
test('unsafe snapshot link and corrupt unrelated research never fall back to external reads or crash listing',fixture(async h=>{
  const directory=path.dirname(h.rawFile(h.b)),outside=path.join(h.root,'owned-outside-evidence');await fs.rename(directory,outside);await fs.symlink(outside,directory,process.platform==='win32'?'junction':'dir');
  await assert.rejects(h.run(),/unsafe evidence directory/);assert.equal(h.calls,0);
  const corrupt=randomUUID();await fs.mkdir(h.store.directory(corrupt));await fs.writeFile(path.join(h.store.directory(corrupt),'investigation.json'),JSON.stringify({id:corrupt,messages:[null],evidence:[]}));const list=await listComparisonCandidates(h.store);assert.ok(list.unavailableCount>=2);assert.ok(list.candidates.some(c=>c.investigationId===h.a&&c.availability==='available'));
}));
for(const linked of ['comparison-parent','operation-directory'])test(`unsafe ${linked} is rejected before any outside mutation or reasoning`,fixture(async h=>{
  const outside=path.join(h.root,'owned-operation-outside');await fs.mkdir(outside);const parent=path.join(h.store.directory(h.a),'.comparisons');let link=parent;
  if(linked==='operation-directory'){await fs.mkdir(parent);link=path.join(parent,h.payload.operationId);}
  await fs.symlink(outside,link,process.platform==='win32'?'junction':'dir');const original=await fs.readFile(h.file(h.a));
  await assert.rejects(h.run(),/Unsafe comparison operation directory/);assert.equal(h.calls,0);assert.deepEqual(await fs.readdir(outside),[]);assert.deepEqual(await fs.readFile(h.file(h.a)),original);
}));
test('new operation hierarchy is created inside the destination after parent checks',fixture(async h=>{
  await assert.rejects(fs.stat(path.join(h.store.directory(h.a),'.comparisons')),{code:'ENOENT'});const out=await h.run();assert.equal(out.status,'saved');const directory=await fs.realpath(path.join(h.store.directory(h.a),'.comparisons',h.payload.operationId));assert.equal(directory.toLowerCase(),path.join(await fs.realpath(h.store.directory(h.a)),'.comparisons',h.payload.operationId).toLowerCase());assert.ok((await fs.stat(path.join(directory,'operation.json'))).isFile());
}));
for(const kind of ['missing-result','missing-project','stale-answer','missing-receipt','hash-mismatch','excluded','stale-evidence','invalid-text','missing-claim-evidence'])test(`${kind} fails before configuration and reasoning`,fixture(async h=>{
  let configCalls=0;
  if(kind==='missing-result')await edit(h,h.b,s=>s.messages=[]);
  if(kind==='missing-project')await fs.rm(h.store.directory(h.b),{recursive:true,force:true});
  if(kind==='stale-answer')await edit(h,h.b,s=>s.messages[1].overview='Changed answer');
  if(kind==='missing-receipt')await fs.rm(h.rawFile(h.b));
  if(kind==='hash-mismatch')await fs.writeFile(h.rawFile(h.b),'tampered bytes');
  if(kind==='excluded')await edit(h,h.b,s=>s.evidence[0].portableAttachment={status:'excluded'});
  if(kind==='stale-evidence')await edit(h,h.b,s=>s.evidence[0].stale=true);
  if(kind==='invalid-text')await edit(h,h.b,s=>s.evidence[0].text={wrong:'type'});
  if(kind==='missing-claim-evidence')await edit(h,h.b,s=>s.messages[1].claims[0].evidenceId='missing');
  const before=await fs.readFile(h.file(h.a));await assert.rejects(h.run({getConfig:async()=>{configCalls++;return h.config;}}),/No comparison started/);assert.equal(h.calls,0);assert.equal(configCalls,0);assert.deepEqual(await fs.readFile(h.file(h.a)),before);
}));
test('draft/view noise stays digest-stable; latest collection/draft survives commit',fixture(async h=>{
  const old=h.payload.selections[0].selectionDigest;await h.store.updateWorkspace(h.a,{draft:'New draft'});const c=(await listComparisonCandidates(h.store,{investigationId:h.a,messageId:'same'})).candidates[0];assert.equal(c.selectionDigest,old);
  const out=await h.run({reasoning:async(...args)=>{await edit(h,h.a,s=>s.removedKeptFeatures.push({key:'new-history'}));await h.store.updateWorkspace(h.a,{draft:'Newest in-model draft'});return h.reasoning(...args);}});assert.equal(out.status,'saved');assert.equal(out.state.draft,'Newest in-model draft');assert.equal(out.state.removedKeptFeatures.length,2);
}));
test('precommit queue preserves newest collection and draft, and refuses source edits before canonical save',fixture(async h=>{
  const out=await h.run({beforeSave:async()=>{await edit(h,h.a,s=>s.removedKeptFeatures.push({key:'latest-queued-history'}));await h.store.updateWorkspace(h.a,{draft:'Latest queued draft'});}});assert.equal(out.status,'saved');assert.equal(out.state.removedKeptFeatures.at(-1).key,'latest-queued-history');assert.equal(out.state.draft,'Latest queued draft');
  h.payload.operationId=randomUUID();const before=await fs.readFile(h.file(h.a));await assert.rejects(h.run({beforeSave:async()=>{await edit(h,h.b,s=>s.messages[1].text='Queued source change');}}),/selection changed/);assert.deepEqual(await fs.readFile(h.file(h.a)),before);
}));
test('provider failure records no append and operation replay never repeats reasoning',fixture(async h=>{
  const before=await fs.readFile(h.file(h.a));let calls=0;await assert.rejects(h.run({reasoning:async()=>{calls++;throw new Error('owned provider failure');}}),/provider failure/);assert.equal((await h.run()).status,'unchanged');assert.equal(calls,1);assert.equal(h.calls,0);assert.deepEqual(await fs.readFile(h.file(h.a)),before);
}));
test('bad mixed-side quote or invalid indexes reject whole answer without metadata publication',fixture(async h=>{
  for(const invalid of ['quote','index','context']){h.payload.operationId=randomUUID();const before=await fs.readFile(h.file(h.a));await assert.rejects(h.run({reasoning:async(_c,_s,p)=>{const {contexts}=JSON.parse(p),answer=answerFor(contexts);if(invalid==='quote')answer.claims[0].quote=contexts[1].evidence[0].text;if(invalid==='index')answer.findings[0].claimIndexes=[100];if(invalid==='context')answer.claims[0].evidenceId=`cmp_${h.payload.operationId.replaceAll('-','')}_a_context`;return answer;}}),/invalid source|absent claim/);assert.deepEqual(await fs.readFile(h.file(h.a)),before);}
}));
test('cancel before AI, during reasoning, and before commit retains canonical sources',fixture(async h=>{
  for(const when of ['pre','mid','commit']){h.payload.operationId=randomUUID();const controller=new AbortController(),before=await fs.readFile(h.file(h.a));if(when==='pre')controller.abort();let calls=0;
    await assert.rejects(h.run({signal:controller.signal,reasoning:async(...args)=>{calls++;if(when==='mid'){controller.abort();controller.signal.throwIfAborted();}return h.reasoning(...args);},beforeSave:async()=>{if(when==='commit')controller.abort();}}),/abort/i);assert.deepEqual(await fs.readFile(h.file(h.a)),before);assert.equal(calls,when==='pre'?0:1);
  }
}));
test('promotion partial failure removes only newly owned files and leaves original bytes',fixture(async h=>{
  const original=await fs.readFile(h.rawFile(h.a)),before=await fs.readFile(h.file(h.a));let n=0;
  await assert.rejects(h.run({promote:async(file,raw)=>{if(++n===2)throw new Error('injected promotion failure');await fs.writeFile(file,raw,{flag:'wx'});}}),/promotion failure/);assert.deepEqual(await fs.readFile(h.file(h.a)),before);assert.deepEqual(await fs.readFile(h.rawFile(h.a)),original);assert.deepEqual(await fs.readdir(path.dirname(h.rawFile(h.a))),['e1.txt']);
}));
test('canonical failure returns unchanged, postcommit failure saved, readback failure uncertain; status/replay never reasons',fixture(async h=>{
  const save=h.store.save.bind(h.store),read=h.store.read.bind(h.store);
  h.store.save=async()=>{throw new Error('before canonical');};let out=await h.run();assert.equal(out.status,'unchanged');assert.equal(h.calls,1);await h.run();assert.equal(h.calls,1);
  h.payload.operationId=randomUUID();h.store.save=async s=>{await save(s);throw new Error('after canonical');};out=await h.run();assert.equal(out.status,'saved');assert.match(out.message,/derived/);const count=h.calls;assert.equal((await h.run()).status,'saved');assert.equal(h.calls,count);
  h.payload.operationId=randomUUID();h.store.save=async s=>{await fs.writeFile(h.file(h.a),JSON.stringify(s,null,2));h.store.read=async()=>{throw new Error('unavailable readback');};throw new Error('lost response');};out=await h.run();assert.equal(out.status,'uncertain');h.store.read=read;out=await comparisonStatus(h.store,h.a,h.payload.operationId);assert.equal(out.status,'saved');assert.equal(h.calls,count+1);
}));
test('operation payload replay rejects changed input and concurrent duplicate returns running without AI',fixture(async h=>{
  let release;const held=new Promise(resolve=>{release=resolve;}),work=h.run({reasoning:async(...args)=>{await held;return h.reasoning(...args);}});
  for(let i=0;i<100;i++){try{await fs.stat(path.join(h.store.directory(h.a),'.comparisons',h.payload.operationId,'operation.json'));break;}catch{await new Promise(resolve=>setTimeout(resolve,5));}}
  assert.equal((await h.run()).status,'running');assert.equal((await comparisonStatus(h.store,h.a,h.payload.operationId)).status,'running');release();assert.equal((await work).status,'saved');assert.equal(h.calls,1);h.payload.request='Different request';await assert.rejects(h.run(),/different request/);assert.equal(h.calls,1);
}));
test('active abort status says stopping; stale persisted running receipt stays uncertain without AI replay',fixture(async h=>{
  const controller=new AbortController();let release,entered;const held=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});let calls=0;
  const work=h.run({signal:controller.signal,reasoning:async()=>{calls++;entered();await held;controller.signal.throwIfAborted();}});const checked=assert.rejects(work,error=>error.name==='AbortError'&&/No comparison saved/.test(error.message)&&!/No comparison started/.test(error.message));await started;controller.abort();const stopping=await comparisonStatus(h.store,h.a,h.payload.operationId);assert.equal(stopping.status,'running');assert.match(stopping.message,/Stopping/);release();await checked;
  const file=path.join(h.store.directory(h.a),'.comparisons',h.payload.operationId,'operation.json'),journal=JSON.parse(await fs.readFile(file,'utf8'));journal.status='running';await fs.writeFile(file,JSON.stringify(journal));assert.equal((await comparisonStatus(h.store,h.a,h.payload.operationId)).status,'uncertain');assert.equal((await h.run()).status,'uncertain');assert.equal(calls,1);assert.equal(h.calls,0);
}));
test('source changes during AI refuse commit; lost operation receipt does not claim never started',fixture(async h=>{const before=await fs.readFile(h.file(h.a));await assert.rejects(h.run({reasoning:async(...args)=>{const answer=await h.reasoning(...args);await edit(h,h.b,s=>s.messages[1].text='Changed in model');return answer;}}),error=>/selection changed/.test(error.message)&&/No comparison saved/.test(error.message)&&!/No comparison started/.test(error.message));assert.deepEqual(await fs.readFile(h.file(h.a)),before);const out=await comparisonStatus(h.store,h.a,randomUUID());assert.equal(out.status,'uncertain');assert.match(out.message,/No comparison restarted/);}));
test('source deletion leaves both contexts/readable raw receipts, document and archive self-contained',fixture(async h=>{
  const out=await h.run();assert.equal(out.status,'saved');await fs.rm(h.store.directory(h.b),{recursive:true,force:true});const state=await h.store.read(h.a),message=state.messages.at(-1);validateInvestigation(state);
  for(const source of message.auditScope.sources){const receipt=state.evidence.find(e=>e.id===source.contextEvidenceId),context=JSON.parse(await fs.readFile(receipt.snapshotPath,'utf8'));assert.match(context.results[0].answer,/complete saved answer/);assert.equal(context.verificationRuns[0].status,'failed');assert.equal(context.verificationRuns[0].historical,true);}
  const later=finalAssetContext(state,message);assert.equal(later.comparisonSources.length,2);assert.equal(later.comparisonContexts[1].context.verificationRuns[0].status,'failed');assert.match(buildDelivery(state,message).asset.comprehensive,/Compared saved results/);assert.match(buildDelivery(state,message).asset.comprehensive,/Historical source checks/);assert.match(buildDelivery(state,message).asset.comprehensive,/not performed by this comparison/);assert.equal(deliveryScopeEvidenceIds(state,message).filter(id=>id.endsWith('_context')).length,2);
  const doc=await buildDocument(h.store,h.a),parsed=parseDocument(doc.data);assert.equal(parsed.state.messages.at(-1).auditScope.sources.length,2);assert.equal(parsed.snapshots.length,state.evidence.length);
  const exportRoot=path.join(h.root,'owned-export');await fs.mkdir(exportRoot);const exported=await exportInvestigation(h.store,h.a,exportRoot);const imported=await importInvestigation(h.store,exported);assert.equal(imported.state.messages.at(-1).auditScope.sources[1].investigationId,h.b);
}));
test('complete chosen branch records and unknown historical metadata survive foreign deletion and portable export',fixture(async h=>{
  const sentinels={openQuestions:['OPEN_QUESTION_SENTINEL'],directions:['DIRECTION_SENTINEL'],recommendation:'RECOMMENDATION_SENTINEL',recommendationReason:'RECOMMENDATION_REASON_SENTINEL',unknownSavedMetadata:{literal:'e1',sourceMessageId:'same',note:'UNKNOWN_METADATA_SENTINEL'}};
  await edit(h,h.b,s=>Object.assign(s.messages[1],sentinels));const original=(await h.store.read(h.b)).messages[1],selected=(await listComparisonCandidates(h.store,{investigationId:h.b,messageId:'same'})).candidates[0];h.payload.selections[1].selectionDigest=selected.selectionDigest;
  const prepared=await prepareSavedComparison(h.store,h.payload),remapped=prepared.contexts[1].results[0];for(const [key,value]of Object.entries(sentinels))assert.deepEqual(remapped[key],value);assert.deepEqual(remapped.historicalRecord,original);assert.notEqual(remapped.id,'same');assert.notEqual(remapped.claims[0].evidenceId,'e1');assert.equal(remapped.historicalRecord.claims[0].evidenceId,'e1');assert.deepEqual(remapped.findings[0].claimIndexes,original.findings[0].claimIndexes);
  const out=await h.run();assert.equal(out.status,'saved');await fs.rm(h.store.directory(h.b),{recursive:true,force:true});const state=await h.store.read(h.a),source=state.messages.at(-1).auditScope.sources[1],context=state.evidence.find(e=>e.id===source.contextEvidenceId),archived=JSON.parse(await fs.readFile(context.snapshotPath,'utf8'));assert.deepEqual(archived.results[0].historicalRecord,original);for(const [key,value]of Object.entries(sentinels))assert.deepEqual(archived.results[0][key],value);
  const document=parseDocument((await buildDocument(h.store,h.a)).data),snapshot=document.snapshots.find(s=>s.id===context.id),portable=JSON.parse(snapshot.data.toString('utf8'));assert.deepEqual(portable.results[0].historicalRecord,original);for(const [key,value]of Object.entries(sentinels))assert.deepEqual(portable.results[0][key],value);
}));
test('nested origin paths and context credentials scrub from shared document; exclusions retain privacy boundary',fixture(async h=>{
  await edit(h,h.b,s=>{s.evidence[0].comparisonOrigin={locator:'C:\\synthetic-private\\deep.exe',token:'synthetic-secret-marker'};});const c=(await listComparisonCandidates(h.store,{investigationId:h.b,messageId:'same'})).candidates[0];h.payload.selections[1].selectionDigest=c.selectionDigest;
  const out=await h.run(),state=out.state,prepared=prepareShare(state,{includeLocalPaths:false,includeContext:true}),doc=await buildDocument(h.store,h.a,{prepared}),parsed=parseDocument(doc.data),serialized=JSON.stringify(parsed.state)+parsed.snapshots.map(s=>s.data.toString()).join('');
  assert.doesNotMatch(serialized,/C:\\\\synthetic-private|synthetic-secret-marker|C:\\\\owned-B/);
  const id=state.messages.at(-1).auditScope.sources[1].contextEvidenceId,excluded=prepareShare(state,{excludedEvidence:[id]});assert.ok(!excluded.state.messages.some(m=>m.auditScope?.operationId===h.payload.operationId));
  const noContext=prepareShare(state,{includeContext:false});assert.ok(noContext.excludedEvidence.includes(id));
}));
test('existing local saved support and comparison remain one reasoning operation with original records retained',fixture(async h=>{
  const state=await h.store.read(h.a);state.messages.push({...structuredClone(state.messages[1]),id:'local_second'});const before=structuredClone(state.messages);const result=await auditSavedSupport(state,['same','local_second'],'Compare local saved results.',{config:h.config,reasoning:h.reasoning});assert.equal(h.calls,1);assert.deepEqual(state.messages.slice(0,before.length),before);assert.equal(result.auditScope.noNewInspection,true);assert.deepEqual(result.auditScope.sourceMessageIds,['same','local_second']);
}));
