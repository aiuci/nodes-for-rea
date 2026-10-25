import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {cleanTour,tourFinding,mayFinishTour,exampleSource} from '../lib/onboarding.mjs';
import {installOnboardingHost} from '../lib/onboarding-host.mjs';
import {InvestigationStore} from '../lib/investigation.mjs';
const id='00000000-0000-4000-8000-000000000001';
const fixture=()=>({id,status:'saved',tutorialExample:{version:1},evidence:[{id:'s',kind:'file',evidenceStatus:'static',text:exampleSource,sha256:'owned'}],messages:[{id:'r',role:'assistant',claims:[{state:'observed',text:'The code returns zero at 50 or above.',quote:'subtotal >= 50 ? 0 : 5',evidenceId:'s'}],findings:[{finding:'Shipping is free at 50 or above.',change:'new',claimIndexes:[0]}]}]});
test('tour completion binds to supported result, exact evidence exposure and successful saves',()=>{
  const state=fixture(),finding=tourFinding(state,id),tour={investigationId:id,evidenceKey:finding.key};
  assert.equal(finding.category.key,'observed');
  assert.equal(mayFinishTour(tour,state,{workspaceSaved:true,snapshotReadable:true}),true);
  for(const options of [{workspaceSaved:false,snapshotReadable:true},{workspaceSaved:true,snapshotReadable:false},{}])assert.equal(mayFinishTour(tour,state,options),false);
  assert.equal(mayFinishTour({...tour,evidenceKey:'unread'},state,{workspaceSaved:true,snapshotReadable:true}),false);
  assert.equal(tourFinding(state,'00000000-0000-4000-8000-000000000002'),null);
  state.evidence[0].sha256='changed';assert.notEqual(tourFinding(state,id).key,finding.key);
});
test('running, unsupported, failed, stale, proposal and blocked results cannot complete a tour',()=>{
  for(const modify of [s=>s.status='inspecting',s=>s.tutorialExample=null,s=>s.evidence=[],s=>s.evidence[0].stale=true,s=>s.evidence[0].evidenceStatus='inspection-failed',s=>s.messages[0].claims[0].state='proposed',s=>s.messages[0].claims[0].quote='not in source',s=>s.messages[0].continuation={status:'blocked'}]){const state=fixture();modify(state);assert.equal(tourFinding(state,id),null);}
});
test('progress resumes exact valid step/identity without accepting corrupt completion data',()=>{
  assert.equal(cleanTour(null).status,'new');assert.equal(cleanTour({version:7,status:'done'}).status,'new');
  const input={version:1,status:'paused',step:2,investigationId:id,evidenceKey:'retained'};assert.deepEqual(cleanTour(JSON.parse(JSON.stringify(input))),input);
  assert.equal(cleanTour({...input,step:50}).step,3);assert.equal(cleanTour({...input,investigationId:'../../elsewhere'}).investigationId,null);
});
test('example preparation preserves existing research and draft; resume never overwrites edited source',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-tour-'));t.after(()=>fs.rm(root,{recursive:true}));
  const store=new InvestigationStore(root),original=await store.create();original.draft='Keep this original question';original.title='Existing work';await store.save(original);await store.updateWorkspace(original.id,{draft:original.draft});
  const before=await fs.readFile(path.join(store.directory(original.id),'investigation.json')),handlers={};let active=original.id,guard=true;
  installOnboardingHost({handle:(name,fn)=>handlers[name]=fn,store,idle(){},flush:async()=>{},guard:async()=>guard,activate:async value=>{active=value;}});
  guard=false;assert.equal(await handlers['tutorial-example'](),null);assert.equal((await store.list()).length,1);
  guard=true;const example=await handlers['tutorial-example']();assert.notEqual(example.state.id,original.id);assert.equal(active,example.state.id);assert.equal(await fs.readFile(example.sourceFile,'utf8'),exampleSource);assert.match(example.question,/Do not execute/);
  assert.deepEqual(await fs.readFile(path.join(store.directory(original.id),'investigation.json')),before);assert.equal((await store.read(original.id)).draft,original.draft);
  assert.equal((await handlers['tutorial-example'](example.state.id)).state.id,example.state.id);
  await assert.rejects(handlers['tutorial-example'](original.id),/not a tour/);
  await fs.writeFile(example.sourceFile,'edited by owner');await assert.rejects(handlers['tutorial-example'](example.state.id),/changed/);assert.equal(await fs.readFile(example.sourceFile,'utf8'),'edited by owner');
  assert.equal((await handlers['tutorial-status'](example.state.id)).id,example.state.id);
});
