// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {InvestigationStore} from '../lib/investigation.mjs';
import {AgentControlStore} from '../lib/agent-control.mjs';
import {AgentFollowUpStore,deriveFollowUps} from '../lib/agent-followups.mjs';
import {InvestigationDocuments} from '../lib/document-controller.mjs';
import {ProjectHandoffs} from '../lib/project-handoff.mjs';
import {buildDocument,readDocument,parseDocument,digest} from '../lib/investigation-document.mjs';
import {readZip,writeZip} from '../lib/document-zip.mjs';
import {readPortableAgentControl} from '../lib/agent-control-portable.mjs';

async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-followups-owned-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new InvestigationStore(path.join(root,'data')),state=await store.create(),control=new AgentControlStore(store),paths=new AgentFollowUpStore(control,store),docs=new InvestigationDocuments(store);
 state.title='Owned export study';state.purpose={current:'Understand file export'};
 await store.addEvidence(state,{id:'owned-source',kind:'file',locator:path.join(root,'owned.txt'),text:'Export uses a local file. Pricing has paid plans.',raw:'Export uses a local file. Pricing has paid plans.',sha256:digest('Export uses a local file. Pricing has paid plans.')});
 state.messages=[{id:'discovery',role:'assistant',features:[{name:'Export',displayQuestion:'How does export work?',claimIndexes:[0]}],claims:[{evidenceId:'owned-source',state:'observed',quote:'Export uses a local file.'}],directions:['Inspect export formats'],openQuestions:['Which export formats are supported?'],continuation:{status:'continue',nextEvidence:'The format options would resolve the remaining question.'}}];
 await store.save(state);return {root,store,state,control,paths,docs,file:path.join(root,'owned.reanodes')};
}
test('zero to three deterministic paths come from retained questions/directions/gaps with provenance',async t=>{
 const {state}=await fixture(t);const first=deriveFollowUps(state,null),second=deriveFollowUps(state,null);
 assert.ok(first.length>0&&first.length<=3);assert.deepEqual(first,second);assert.equal(first[0].origin.messageId,'discovery');assert.equal(first[0].origin.nodeId,'turn:discovery');assert.deepEqual(first[0].origin.evidenceIds,['owned-source']);assert.equal(first[0].relationship,'Understand file export');
 state.messages=[];state.evidence=[];state.openQuestions=[];assert.deepEqual(deriveFollowUps(state,null),[]);
});
test('save is serialized, deduplicated and never changes research or creates execution work',async t=>{
 const {state,store,control,paths}=await fixture(t),before=await fs.readFile(path.join(store.directory(state.id),'investigation.json'));
 const item=(await paths.refresh(state.id)).followUpSuggestions[0];
 await Promise.all([paths.save(state.id,item.id),paths.save(state.id,item.id),control.submit(state.id,{id:'concurrent',text:'What is known?'})]);
 const saved=await control.read(state.id);assert.equal(saved.followUps.length,1);assert.equal(saved.followUps[0].status,'saved');assert.equal(saved.messages.length,1);assert.equal(saved.messages[0].id,'concurrent');assert.deepEqual(await fs.readFile(path.join(store.directory(state.id),'investigation.json')),before);
 const freshPaths=new AgentFollowUpStore(new AgentControlStore(store),store),list=await freshPaths.listSaved();assert.equal(list.length,1);assert.equal(list[0].investigationId,state.id);assert.equal(list[0].nodeId,item.origin.nodeId);assert.equal(list[0].followUp.why,item.why);
 await control.mutate(state.id,c=>{c.followUps[0].why='Updated investigation-owned context';});assert.equal((await freshPaths.listSaved())[0].followUp.why,'Updated investigation-owned context');
});
test('explicit Explore queues same-investigation direction once and lifecycle follows actual route dispatch/result',async t=>{
 const {state,control,paths}=await fixture(t),id=state.id,item=(await paths.refresh(id)).followUpSuggestions[0];await paths.save(id,item.id);
 const [first,again]=await Promise.all([paths.explore(id,item.id,{messageId:'explore-one'}),paths.explore(id,item.id,{messageId:'explore-two'})]);
 assert.equal(first.message.id,again.message.id);assert.equal(first.message.followUpId,item.id);assert.equal(first.control.investigationId,id);assert.equal((await control.read(id)).messages.length,1);
 await control.mutate(id,c=>{c.messages[0].status='applied';});await paths.sync(id,{session:{status:'running',cursor:0,currentNode:item.origin.nodeId,route:[{nodeId:item.origin.nodeId,directionMessageId:first.message.id,status:'pending'}]}});assert.equal((await control.read(id)).followUps[0].status,'active');
 await paths.sync(id,{session:{route:[{directionMessageId:first.message.id,status:'done'}]}});assert.equal((await control.read(id)).followUps[0].status,'completed');assert.deepEqual(await paths.listSaved(),[]);
});
test('coverage prerequisites are retained and stopped directions become blocked without losing saved context',async t=>{
 const {state,store,control,paths}=await fixture(t);state.messages[0].openQuestions=[];state.messages[0].directions=[];state.messages[0].features[0].displayQuestion='';await store.save(state);
 await control.mutate(state.id,c=>{c.coverage={areas:[{id:'protected-area',nodeId:'feature:export',label:'Protected export settings',status:'blocked',reason:'Observed sign-in page',evidenceIds:['owned-source'],prerequisite:{kind:'access',reason:'Sign in directly in the selected browser'}}]};});
 const item=(await paths.refresh(state.id)).followUpSuggestions[0];assert.equal(item.origin.kind,'coverage');assert.match(item.prerequisite,/Sign in directly/);await paths.save(state.id,item.id);await paths.explore(state.id,item.id,{messageId:'protected'});await control.hold(state.id);await paths.sync(state.id,{});
 assert.equal((await control.read(state.id)).followUps[0].status,'blocked');assert.equal((await paths.listSaved())[0].requiresPrerequisiteRecheck,true);
});
test('real Save As/open round trip preserves conversation, coverage, IDs and evidence but drops runtime auth',async t=>{
 const {root,store,state,control,paths,docs,file}=await fixture(t),id=state.id,item=(await paths.refresh(id)).followUpSuggestions[0];await paths.save(id,item.id);await paths.explore(id,item.id,{messageId:'queued-path'});
 await control.mutate(id,c=>{c.selectedSession={handle:'OWNED-SESSION-HANDLE',partition:'persist:OWNED-PROFILE',cookies:'OWNED-COOKIE'};c.token='OWNED-TOKEN';c.messages[0].cookies='OWNED-MESSAGE-COOKIE';c.coverage={version:1,summary:'limited',label:'Access limited',scope:'Owned export area',areas:[{id:'export',nodeId:'feature:export',label:'Export',status:'blocked',reason:'Sign-in page observed',evidenceIds:['owned-source'],prerequisite:{kind:'access',url:'https://example.com/settings?token=OWNED-QUERY-TOKEN',reason:'Sign in in the selected browser'},sessionHandle:'OWNED-AREA-SESSION'}],inspected:[],unexplored:[],blocked:['export'],boundaries:['Public description only'],stop:{kind:'access',reason:'Sign-in page',next:'Explicit selected-session read'},wholeApplicationComplete:false};});
 const evidenceBefore=await fs.readFile(path.join(store.directory(id),'evidence','owned-source.txt'));await docs.save(id,file);assert.equal((await docs.status(id)).dirty,false);
 const zip=readZip(await fs.readFile(file)),serialized=[...zip.values()].map(x=>x.toString()).join('\n');for(const secret of ['OWNED-SESSION-HANDLE','OWNED-PROFILE','OWNED-COOKIE','OWNED-TOKEN','OWNED-MESSAGE-COOKIE','OWNED-AREA-SESSION','OWNED-QUERY-TOKEN'])assert.ok(!serialized.includes(secret),secret);
 const parsed=await readDocument(file);assert.equal(parsed.control.messages[0].status,'not-applied');assert.equal(parsed.control.messages[0].continuationRequired,true);assert.equal(parsed.control.followUps[0].id,item.id);assert.equal(parsed.control.followUps[0].status,'saved');assert.equal(parsed.control.coverage.accessNeedsVerification,true);assert.equal(parsed.control.coverage.areas[0].reason,'Sign-in page observed');
 const imported=await docs.open(file);assert.notEqual(imported.state.id,id);const reopened=await new AgentControlStore(store).read(imported.state.id);assert.equal(reopened.investigationId,imported.state.id);assert.equal(reopened.messages[0].id,'queued-path');assert.equal(reopened.followUps[0].origin.messageId,'discovery');assert.equal((await docs.status(imported.state.id)).dirty,false);assert.deepEqual(await fs.readFile(path.join(store.directory(imported.state.id),'evidence','owned-source.txt')),evidenceBefore);
 const copy=await docs.save(id,path.join(root,'copy.reanodes'),{copy:true});assert.notEqual(copy.state.id,id);assert.equal((await new AgentControlStore(store).read(copy.state.id)).followUps[0].id,item.id);assert.equal((await docs.status(copy.state.id)).dirty,false);
});
test('control-only edits mark documents dirty and invalidate document/handoff reviews',async t=>{
 const {root,store,state,control,docs,file}=await fixture(t);await docs.save(state.id,file);assert.equal((await docs.status(state.id)).dirty,false);
 const review=await docs.review(state.id,{includeHidden:true}),handoffs=new ProjectHandoffs(store),handoff=await handoffs.review(state.id,{includeHidden:true});await control.submit(state.id,{id:'after-review',text:'Private follow-up text'});
 assert.equal((await docs.status(state.id)).dirty,true);await assert.rejects(docs.share(state.id,path.join(root,'stale.reanodes'),review.token),/changed/);await assert.rejects(handoffs.write(state.id,handoff.token,root),/changed/);await docs.save(state.id);assert.equal((await docs.status(state.id)).dirty,false);
});
test('shared exclusions conservatively omit conversation and saved paths while full saves retain them',async t=>{
 const {root,state,control,docs,file}=await fixture(t);await control.submit(state.id,{id:'private',text:'PRIVATE-CONTROL-CONTEXT'});
 for(const choices of [{includeContext:false,includeHidden:true},{includeHidden:true,excludedEvidence:['owned-source']}]){const review=await docs.review(state.id,choices),shared=path.join(root,`shared-${choices.includeContext===false?'context':'evidence'}.reanodes`);await docs.share(state.id,shared,review.token);const zip=readZip(await fs.readFile(shared));assert.equal(zip.has('agent-control.json'),false);assert.ok(![...zip.values()].some(bytes=>bytes.toString().includes('PRIVATE-CONTROL-CONTEXT')));}
 await docs.save(state.id,file);assert.equal((await readDocument(file)).control.messages[0].text,'PRIVATE-CONTROL-CONTEXT');
});
test('legacy documents without control open and malicious/future control DTOs are rejected before install',async t=>{
 const {state,store,control}=await fixture(t);const legacy=await buildDocument(store,state.id);assert.equal(parseDocument(legacy.data).control,null);await control.submit(state.id,{id:'safe',text:'Retained direction'});const built=await buildDocument(store,state.id);
 for(const edit of [c=>{c.version=2;},c=>{c.browserProfile='unsafe';},c=>{c.messages.push({...c.messages[0]});},c=>{c.investigationId='wrong';},c=>{c.messages[0].role='provider';}]){const files=readZip(built.data),c=JSON.parse(files.get('agent-control.json'));edit(c);files.set('agent-control.json',Buffer.from(JSON.stringify(c)));const m=JSON.parse(files.get('manifest.json'));m.records.find(r=>r.path==='agent-control.json').sha256=digest(files.get('agent-control.json'));files.set('manifest.json',Buffer.from(JSON.stringify(m)));assert.throws(()=>parseDocument(writeZip(files)),/Agent Control|portable|conversation/i);}
 assert.equal((await readPortableAgentControl(store,state.id)).messages[0].text,'Retained direction');
});
test('refresh keeps previously saved records beyond the current three suggestions and deduplicates repeated questions',async t=>{
 const {state,store,paths,control}=await fixture(t);const saved=[];
 for(let batch=0;batch<3;batch++){
  state.messages[0].openQuestions=[`Retained question ${batch} A?`,`Retained question ${batch} B?`,`Retained question ${batch} C?`];state.messages[0].directions=[];await store.save(state);
  const suggestions=(await paths.refresh(state.id)).followUpSuggestions;assert.equal(suggestions.length,3);
  for(const item of suggestions){await paths.save(state.id,item.id);saved.push(item.id);}
  await paths.refresh(state.id);assert.equal((await control.read(state.id)).followUps.length,saved.length);
 }
 assert.equal(saved.length,9);assert.equal((await paths.listSaved()).length,9);
 state.messages[0].openQuestions=['Retained question 0 A?'];state.openQuestions=['Retained question 0 A?'];await store.save(state);
 const again=(await paths.refresh(state.id)).followUpSuggestions.filter(f=>f.question==='Retained question 0 A?');assert.equal(again.length,1);assert.equal(again[0].id,saved[0]);await paths.save(state.id,again[0].id);assert.equal((await control.read(state.id)).followUps.length,9);
});
test('portable access observations retain historical support and scope boundaries but reopen unverified',async t=>{
 const {state,store,control}=await fixture(t);await control.append(state.id,{id:'read-observed',role:'system',text:'Owned selected page retained.',evidenceId:'owned-source'});
 await control.mutate(state.id,c=>{c.coverage={version:1,summary:'uncertain',label:'Coverage uncertain',scope:'Owned scope',areas:[{id:'feature:export',nodeId:'feature:export',label:'Export',status:'inspected',supportedComplete:false,evidenceIds:['owned-source']}],inspected:['feature:export'],unexplored:[],blocked:[],questions:['What remains unknown?'],boundaries:[{kind:'partial-source',sourceId:'owned-source',reason:'Only this owned page was read.'}],stop:{kind:'route',reason:'Route complete',next:'Review unknowns'},wholeApplicationComplete:false};c.accessRequests=[{id:'owned-read',status:'read',kind:'content',url:'https://example.com/protected',origin:'https://example.com',reason:'Owned fixture page read',evidenceId:'owned-source',checkedAt:'2026-10-25T12:00:00.000Z',partition:'NEVER-PORTABLE'}];});
 const parsed=parseDocument((await buildDocument(store,state.id)).data);assert.equal(parsed.control.messages[0].evidenceId,'owned-source');assert.equal(parsed.control.accessRequests[0].status,'unverified');assert.equal(parsed.control.accessRequests[0].lastObservedStatus,'read');assert.equal(parsed.control.accessRequests[0].evidenceId,'owned-source');assert.equal(parsed.control.accessRequests[0].partition,undefined);assert.equal(parsed.control.coverage.areas[0].supportedComplete,false);assert.equal(parsed.control.coverage.boundaries[0].sourceId,'owned-source');assert.deepEqual(parsed.control.coverage.questions,['What remains unknown?']);
});
test('handoff exports the same portable control projection and context exclusions omit it',async t=>{
 const {root,state,store,control}=await fixture(t);await control.submit(state.id,{id:'handoff-message',text:'Retained control question'});const handoffs=new ProjectHandoffs(store);
 for(const includeContext of [true,false]){const review=await handoffs.review(state.id,{includeContext,includeHidden:true}),result=await handoffs.write(state.id,review.token,root,'Owned build goal'),decisions=JSON.parse(await fs.readFile(path.join(result.folder,'DECISIONS.json'),'utf8'));assert.equal(!!decisions.agentControl,includeContext);if(includeContext)assert.equal(decisions.agentControl.messages[0].text,'Retained control question');}
});
test('shared copy freezes the reviewed control snapshot when a new message arrives during export',async t=>{
 const {root,state,control,docs}=await fixture(t);await control.submit(state.id,{id:'reviewed',text:'Reviewed conversation'});const review=await docs.review(state.id,{includeHidden:true}),binding=docs.binding.bind(docs);
 docs.binding=async id=>{await control.submit(id,{id:'during-export',text:'UNREVIEWED-CONVERSATION'});return binding(id);};
 const file=path.join(root,'reviewed-copy.reanodes');await docs.share(state.id,file,review.token);assert.deepEqual((await readDocument(file)).control.messages.map(m=>m.id),['reviewed']);assert.equal((await control.read(state.id)).messages.length,2);
});
test('completed paths stay terminal when the historical session is absent or replaced',async t=>{
 const {state,control,paths}=await fixture(t),item=(await paths.refresh(state.id)).followUpSuggestions[0];await paths.save(state.id,item.id);await paths.explore(state.id,item.id,{messageId:'completed-direction'});await control.mutate(state.id,c=>{c.messages[0].status='applied';});await paths.sync(state.id,{session:{route:[{directionMessageId:'completed-direction',status:'done'}]}});
 for(const session of [null,{status:'running',cursor:0,currentNode:'other',route:[{directionMessageId:'unrelated',nodeId:'other',status:'pending'}]},{status:'stopped',route:[]}]){await paths.sync(state.id,{session});assert.equal((await control.read(state.id)).followUps[0].status,'completed');}
 await assert.rejects(paths.explore(state.id,item.id),/already completed/);assert.equal((await control.read(state.id)).messages.length,1);
});
test('imported active paths stay saved through sync and require explicit Explore to bind a fresh direction',async t=>{
 const {state,control,paths,docs,file,store}=await fixture(t),item=(await paths.refresh(state.id)).followUpSuggestions[0];await paths.save(state.id,item.id);await paths.explore(state.id,item.id,{messageId:'historical-direction'});await control.mutate(state.id,c=>{c.messages[0].status='applied';c.followUps[0].status='active';});await docs.save(state.id,file);const imported=await docs.open(file),id=imported.state.id,restoredControl=new AgentControlStore(store),restoredPaths=new AgentFollowUpStore(restoredControl,store);
 for(const session of [null,{status:'running',cursor:0,currentNode:item.origin.nodeId,route:[{directionMessageId:'historical-direction',nodeId:item.origin.nodeId,status:'pending'}]}]){await restoredPaths.sync(id,{session});const f=(await restoredControl.read(id)).followUps[0];assert.equal(f.status,'saved');assert.equal(f.continuationRequired,true);assert.equal((await restoredControl.read(id)).messages.length,1);}
 const explored=await restoredPaths.explore(id,item.id,{messageId:'explicit-new-direction'});assert.equal(explored.followUp.continuationRequired,undefined);assert.equal(explored.followUp.messageId,'explicit-new-direction');assert.equal(explored.followUp.status,'queued');assert.equal(explored.control.messages.length,2);
 await restoredControl.mutate(id,c=>{c.messages.find(m=>m.id==='explicit-new-direction').status='applied';});await restoredPaths.sync(id,{session:{status:'running',cursor:0,currentNode:item.origin.nodeId,route:[{directionMessageId:'explicit-new-direction',nodeId:item.origin.nodeId,status:'pending'}]}});assert.equal((await restoredControl.read(id)).followUps[0].status,'active');
});
test('stopped or replanned missing work cannot reactivate from an applied historical message',async t=>{
 const {state,control,paths}=await fixture(t),item=(await paths.refresh(state.id)).followUpSuggestions[0];await paths.save(state.id,item.id);
 for(const [index,session]of [null,{status:'stopped',route:[]},{status:'running',cursor:0,currentNode:'different',route:[{nodeId:'different',directionMessageId:'unrelated',status:'pending'}]}].entries()){
  await paths.explore(state.id,item.id,{messageId:`prior-${index}`});await control.mutate(state.id,c=>{c.messages.find(m=>m.id===`prior-${index}`).status='applied';c.followUps[0].status='active';});await paths.sync(state.id,{session});const before=await control.read(state.id);assert.notEqual(before.followUps[0].status,'active');assert.equal(before.followUps[0].continuationRequired,true);
  await paths.sync(state.id,{session:{status:'running',cursor:0,currentNode:item.origin.nodeId,route:[{directionMessageId:`prior-${index}`,nodeId:item.origin.nodeId,status:'pending'}]}});assert.deepEqual((await control.read(state.id)).followUps,before.followUps);
 }
 assert.equal((await control.read(state.id)).messages.length,3);
});
