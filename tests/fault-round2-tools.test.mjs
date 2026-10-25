import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {openReaClient,unwrapReaResult} from '../lib/rea-client.mjs';
import {ReaInvestigation} from '../lib/rea-engine.mjs';
import {InvestigationStore} from '../lib/investigation.mjs';
import {fileIdentity,assessFreshness} from '../lib/targets.mjs';
import {buildDocument,readDocument} from '../lib/investigation-document.mjs';
import {errorPresentation} from '../lib/user-feedback.mjs';
import {recordFailure} from '../lib/failure-recovery-host.mjs';

const output=await fs.mkdtemp(path.resolve('qa-output/round2-tools-'));
const cases=[];
async function fixture(id,mode){
 const folder=path.join(output,String(id));await fs.mkdir(folder);const store=new InvestigationStore(path.join(folder,'data')),state=await store.create();state.title=`Owned fault ${id}`;state.draft='Retained partial goal';state.messages=[{id:'saved-result',role:'assistant',title:'Previous completed finding',features:[],findings:[{finding:'Previously saved work'}],claims:[]}];
 const targetFile=path.join(folder,'owned-native.bin');await fs.writeFile(targetFile,'owned native fixture');const target={kind:'artifact',targetType:'native',root:targetFile,locator:targetFile,identity:await fileIdentity(targetFile)};state.targets=[target];await store.save(state);
 const launch={available:true,command:process.execPath,args:[fileURLToPath(new URL('./fixtures/rea-round2-mcp-fixture.mjs',import.meta.url)),mode],env:{}},events=[];
 const client=await openReaClient(launch,{onEvent:event=>events.push(event)}),rea=new ReaInvestigation({},state,store.directory(state.id),{addEvidence:record=>store.addEvidence(state,record),saveState:()=>store.save(state)});rea.client=client;
 return {id,folder,store,state,target,client,rea,events};
}
async function record(f,{fault,error,observed,functional=true,extra={}}){
 if(error){const attempt={id:randomUUID(),nodeId:'core',status:'failed',question:`Owned injected case ${f.id}`,reason:error.message,startedAt:new Date().toISOString(),finishedAt:new Date().toISOString()};recordFailure(attempt,error,{});(f.state.attempts||=[]).push(attempt);}
 await f.store.save(f.state);const reopened=await f.store.read(f.state.id);assert.equal(reopened.id,f.state.id);assert.equal(reopened.draft,'Retained partial goal');assert.equal(reopened.messages[0].id,'saved-result');
 const built=await buildDocument(f.store,f.state.id),artifact=path.join(f.folder,`case-${f.id}.reanodes`);await fs.writeFile(artifact,built.data);const doc=await readDocument(artifact);assert.equal(doc.state.evidence.length,reopened.evidence.length);assert.equal(doc.state.draft,reopened.draft);
 const feedback=error?errorPresentation(error):null,applicationDiagnostic=error?reopened.attempts?.at(-1):null;
 // Harness observation is kept separate from application diagnostics. Do not
 // manufacture a passing product run/stage/outcome record in the receipt.
 const diagnosticComplete=!!applicationDiagnostic?.diagnostic?.runId&&!!applicationDiagnostic?.diagnostic?.stage&&!!applicationDiagnostic?.diagnostic?.faultType&&!!applicationDiagnostic?.diagnostic?.recoveryOutcome;
 const row={id:f.id,status:'FAIL',functionalStatus:functional?'PASS':'FAIL',injectedFault:fault,observed,savedArtifact:artifact,recordReopen:'PASS',actualAppReopen:'NOT RUN',ui:feedback,applicationDiagnostic,diagnosticComplete,missingAcceptance:['Actual application File Open not yet executed for this artifact',...(!diagnosticComplete?['Application diagnostics do not yet contain the required run/fault/stage/recovery fields']:[])],codeChanges:[],...extra};cases.push(row);await fs.writeFile(path.join(output,'report.json'),JSON.stringify({output,cases},null,2));
}
async function close(f){await f.client.close().catch(()=>{});}

test('30: compatible added output fields survive; incompatible known envelope types reject',async()=>{
 const f=await fixture(30,'invalid-envelope');try{const saved=await f.rea.invoke('inspect_fixture',{label:'compatible'},f.target);assert.match(saved.text,/added_vendor_field/);let error;await assert.rejects(f.rea.invoke('second_fixture',{},f.target),e=>{error=e;return e.code==='REA_INVALID_OUTPUT';});await record(f,{fault:'Added vendor fields followed by scalar structuredContent',error,observed:'Compatible fields preserved; incompatible envelope rejected before static evidence acceptance'});}finally{await close(f);}
});
test('31: a truncated MCP frame preserves completed evidence and identifies incomplete output',async()=>{
 const f=await fixture(31,'truncated');try{const saved=await f.rea.invoke('inspect_fixture',{label:'kept before truncated frame'},f.target),bytes=await fs.readFile(saved.snapshotPath);let error;await assert.rejects(f.rea.invoke('second_fixture',{},f.target),e=>{error=e;return e.code==='REA_TRUNCATED_OUTPUT'&&e.data?.operation==='second_fixture'&&e.data?.outputUnavailable===true;});assert.deepEqual(await fs.readFile(saved.snapshotPath),bytes);assert.equal(f.state.evidence.at(-1).evidenceStatus,'inspection-failed');await record(f,{fault:'Child exits halfway through one MCP JSON frame',error,observed:'Completed snapshot retained byte-for-byte, incomplete response saved as failure diagnostic'});}finally{await close(f);}
});
test('32: success with invalid known evidence metadata is not accepted as static evidence',async()=>{
 const f=await fixture(32,'invalid-evidence');try{await f.rea.invoke('inspect_fixture',{label:'kept'},f.target);let error;await assert.rejects(f.rea.invoke('second_fixture',{},f.target),e=>{error=e;return e.code==='REA_INVALID_OUTPUT';});assert.equal(f.state.evidence.at(-1).evidenceStatus,'inspection-failed');await record(f,{fault:'Success envelope with numeric evidence_id and object limitations',error,observed:'Malformed evidence quarantined as failed output, prior complete record retained'});}finally{await close(f);}
});
test('33: failed tool preserves earlier evidence and returned partial observations with failure provenance',async()=>{
 const f=await fixture(33,'partial-failure');try{const kept=await f.rea.invoke('inspect_fixture',{label:'complete'},f.target);let error;await assert.rejects(f.rea.invoke('second_fixture',{},f.target),e=>{error=e;return /Inspection failed/.test(e.message);});const failed=f.state.evidence.at(-1);assert.equal(failed.evidenceStatus,'inspection-failed');assert.match(await fs.readFile(failed.snapshotPath,'utf8'),/partial owned observation/);assert.equal(f.state.evidence[0].id,kept.id);await record(f,{fault:'Error envelope after usable complete result and partial observations',error,observed:'Both prior complete record and explicitly failed partial payload are retained; partial is not a successful inspection'});}finally{await close(f);}
});
test('34: colliding evidence ID cannot overwrite an earlier snapshot or attribution',async()=>{
 const f=await fixture(34,'compatible');try{const original={id:'same-id',kind:'text',locator:'owned:first',title:'Original',raw:'Original snapshot',text:'Original snapshot',sha256:createHash('sha256').update('Original snapshot').digest('hex')},kept=await f.store.addEvidence(f.state,original),bytes=await fs.readFile(kept.snapshotPath);let error;await assert.rejects(f.store.addEvidence(f.state,{...original,locator:'owned:other',raw:'Wrong replacement',text:'Wrong replacement'}),e=>{error=e;return /already|conflict|duplicate/i.test(e.message);});assert.deepEqual(await fs.readFile(kept.snapshotPath),bytes);assert.equal(f.state.evidence.length,1);assert.equal(f.state.evidence[0].locator,'owned:first');await record(f,{fault:'Same record ID, different bytes and source attribution',error,observed:'Collision rejected before snapshot write; original bytes and source remain unchanged'});}finally{await close(f);}
});
test('35: concurrent replies arriving in reverse order keep their request/result identities',async()=>{
 const f=await fixture(35,'out-of-order');try{const [first,second]=await Promise.all([f.rea.invoke('inspect_fixture',{label:'first'},f.target),f.rea.invoke('inspect_fixture',{label:'second'},f.target)]);assert.match(first.text,/"observed": "first"/);assert.match(second.text,/"observed": "second"/);assert.notEqual(first.id,second.id);assert.equal(f.state.evidence[0].id,second.id);await record(f,{fault:'Second asynchronous MCP response arrives before first',observed:'Requests match protocol IDs; saved record IDs/parameters remain distinct despite completion ordering'});}finally{await close(f);}
});
test('36: target mutation during an operation never publishes output as current evidence',async()=>{
 const f=await fixture(36,'mutate');try{let error;await assert.rejects(f.rea.invoke('inspect_fixture',{label:'mutation observation',target:f.target.root},f.target),e=>{error=e;return e.code==='TARGET_CHANGED_DURING_INSPECTION';});const failed=f.state.evidence.at(-1);assert.equal(failed.evidenceStatus,'inspection-failed');assert.equal(failed.stale,true);assert.equal(failed.targetIdentity.sha256,f.target.identity.sha256);assert.match(await fs.readFile(failed.snapshotPath,'utf8'),/mutation observation/);await record(f,{fault:'Fixture changes target bytes after request start and before response',error,observed:'Returned bytes retained only as failed/stale evidence with original target identity, never fresh analysis'});}finally{await close(f);}
});
test('37: older-version cached evidence is marked stale before new native dispatch',async()=>{
 const f=await fixture(37,'compatible');try{const kept=await f.rea.invoke('inspect_fixture',{label:'old-version record'},f.target);await fs.appendFile(f.target.root,' newer-version');await assessFreshness(f.state);assert.equal(kept.stale,true);assert.equal(kept.applicability,'changed');let error;await assert.rejects(f.rea.bind(f.target),e=>{error=e;return /changed/.test(e.message);});await record(f,{fault:'Selected artifact changes after a cached record was captured',error,observed:'Old record remains readable and labeled changed/stale; binding changed target is refused'});}finally{await close(f);}
});
test.after(async()=>{
 const changes={30:['lib/rea-client.mjs: known MCP envelope shape checks'],31:['lib/rea-client.mjs: truncated response diagnostic'],32:['lib/rea-engine.mjs: known evidence metadata validation'],33:[],34:['lib/investigation.mjs: collision-safe evidence writes (storage agent)'],35:[],36:['lib/rea-engine.mjs: post-operation target identity check'],37:[]};
 for(const row of cases){row.codeChanges=[...changes[row.id],'lib/user-feedback.mjs and lib/failure-recovery.mjs: actionable tool/target messages',...(row.applicationDiagnostic?['lib/failure-recovery-host.mjs: sanitized failure attribution']:[])];row.confirmedRemainingDefects=[];row.acceptanceEvidenceMissing=row.missingAcceptance;if(row.id===35)row.acceptanceEvidenceMissing=['Actual application File Open not yet executed for this artifact','Actual orchestrator success trace ownership not exercised; reordered MCP replies are valid and do not create an error diagnostic'];}
 await fs.writeFile(path.join(output,'report.json'),JSON.stringify({output,cases},null,2));await fs.writeFile(path.join(output,'artifacts.json'),JSON.stringify(cases.map(row=>({case:row.id,path:row.savedArtifact})),null,2));console.log('ROUND2_TOOLS_RECEIPT '+path.join(output,'report.json'));
});

test('plain text tool output stays compatible; invalid output remains primary when failure retention fails',async()=>{
 const f=await fixture('secondary','invalid-evidence');try{
  const plain=await f.rea.invoke('inspect_fixture',{plain:true},f.target);assert.match(plain.text,/Legitimate plain text inspection/);
  f.rea.addEvidence=async()=>{throw Object.assign(Error('owned full disk'),{code:'ENOSPC'});};
  await assert.rejects(f.rea.invoke('second_fixture',{},f.target),error=>error.code==='REA_INVALID_OUTPUT');
  assert.ok(f.state.activity.some(event=>event.secondary&&/owned full disk/.test(event.reason)));
 }finally{await close(f);}
});
