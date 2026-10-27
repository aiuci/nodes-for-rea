// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {workspaceMap,serializeWorkspaceMap} from '../lib/workspace-map.mjs';
import {nodeStatus} from '../ui/node-status.js';
import {nodeContextText,responseDisplayLabel} from '../ui/evidence-understanding.js';
import {resultOutcome} from '../lib/outcomes.mjs';
import {evidenceAwareFixture} from './fixtures/evidence-aware-fixture.mjs';
import {InvestigationStore} from '../lib/investigation.mjs';
import {buildDocument,parseDocument,digest} from '../lib/investigation-document.mjs';
import {readZip,writeZip} from '../lib/document-zip.mjs';

test('map and caption share exact saved knowledge while retaining separate question and parent-context references',()=>{
  const {state,message}=evidenceAwareFixture(),before=structuredClone(state),map=workspaceMap(state),response=map.nodes.get('turn:fixture-response'),gap=map.nodes.get('finding:fixture-response:5'),other=map.nodes.get('finding:fixture-response:1');
  assert.equal(response.understanding.knowledge.items.length,3);assert.equal(gap.category.key,'unknown');assert.deepEqual(gap.understanding.directSupport.evidenceIds,[]);
  assert.match(nodeContextText(gap).knowledge,/^Parent: The fixture enters its update pipeline/);assert.match(nodeContextText(gap).next,/^Unresolved · next: Trace the fixture lifecycle/);assert.equal(nodeContextText(gap).scope,'parent-response');assert.match(nodeContextText(gap).description,/Parent response context:/);assert.match(nodeContextText(gap).description,/Next recorded:/);assert.match(nodeContextText(gap).compact,/parent response/);
  assert.equal(nodeContextText(other).knowledge,message.findings[1].finding);assert.match(nodeContextText(other).description,/sensor-shaped/);assert.doesNotMatch(nodeContextText(other).description,/enters its update pipeline/);assert.equal(nodeContextText(other).scope,'finding');assert.deepEqual(state,before);
});
test('view statuses never turn completed workflow into central-question completion, including empty results',()=>{
  const {state,message}=evidenceAwareFixture();
  for(const findings of [message.findings,message.findings.slice(0,3),[]]){const copy={...state,messages:[{...message,findings}]},map=workspaceMap(copy),item=map.nodes.get('turn:fixture-response'),status=nodeStatus({state:copy,map},item);assert.doesNotMatch(status,/Question complete/);assert.match(status,/Saved response/);}
  message.continuation.status='blocked';const map=workspaceMap(state);assert.match(nodeStatus({state,map},map.nodes.get('turn:fixture-response')),/further work blocked/);
});

test('result cards without a cached understanding still distinguish a saved inspection from a resolved question',()=>{
  const {state,message}=evidenceAwareFixture(),before=structuredClone(state);
  const status=()=>{const map=workspaceMap(state),item={...map.nodes.get('turn:fixture-response')};delete item.understanding;return nodeStatus({state,map},item);};
  assert.equal(status(),'Saved response · questions remain');
  assert.deepEqual(state,before);
  message.findings=message.findings.slice(0,3);
  assert.equal(status(),'Saved response · evidence retained');
  message.findings=[];
  assert.equal(status(),'Saved response · no findings recorded');
  message.continuation.status='blocked';
  assert.equal(status(),'Saved response · further work blocked');
});
test('feature captions use shared evidence interpretation while preserving newer attempts and candidate precedence',()=>{
  const {state,message}=evidenceAwareFixture();message.branchFeatureName='Owned feature';message.createdAt='2026-10-25T10:00:00Z';state.messages.unshift({id:'discovery',role:'assistant',features:[{name:'Owned feature',claimIndexes:[]}]});
  const status=()=>{const map=workspaceMap(state);return nodeStatus({state,map},map.nodes.get('feature:owned feature'));};
  assert.equal(status(),'Saved response · questions remain');message.findings=[];assert.equal(status(),'Saved response · no findings recorded');
  state.status='inspecting';state.attempts=[{id:'newer-attempt',nodeId:'feature:owned feature',branchFeatureName:'Owned feature',status:'running',startedAt:'2026-10-25T11:00:00Z'}];assert.equal(status(),'Running attempt');
  state.messages[0].features[0].evidenceBasis='proposed';assert.equal(status(),'Proposed · not discovered');state.messages[0].features[0].evidenceBasis='inferred';assert.equal(status(),'Inferred · needs verification');
});
test('run feedback display translation preserves recorded outcome status and counts without claiming question completion',()=>{
  const {state,message}=evidenceAwareFixture(),recorded=resultOutcome(state,message),display={...recorded,label:responseDisplayLabel(state,message)};
  assert.equal(recorded.label,'Question complete');assert.equal(display.label,'Saved response · questions remain');assert.equal(display.status,recorded.status);assert.equal(display.findings,recorded.findings);assert.equal(display.openQuestions,recorded.openQuestions);assert.deepEqual(resultOutcome(state,message),recorded);
  message.findings=[];assert.equal(responseDisplayLabel(state,message),'Saved response · no findings recorded');message.continuation.status='blocked';assert.equal(responseDisplayLabel(state,message),'Saved response · further work blocked');
});
test('derived v1 document graph remains byte-shape compatible with the pre-UI projection',async()=>{
  // Golden generated from the verified Ticket 01 commit 7cbaed30, using only
  // the synthetic fixture. Existing v1 packages compare this DTO exactly.
  const {state}=evidenceAwareFixture(),expected=JSON.parse(await fs.readFile(new URL('./fixtures/evidence-aware-v1-map.json',import.meta.url),'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(serializeWorkspaceMap(state))),expected);assert.ok(!JSON.stringify(serializeWorkspaceMap(state)).includes('understanding'));assert.equal(workspaceMap(state).nodes.size,expected.nodes.length);
});
test('v1 saved document opens and rebuilds the same graph, source bytes, layout and camera without persisting interpretation',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-evidence-v1-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new InvestigationStore(root),{state,raw}=evidenceAwareFixture();
  await store.save(state);for(const [index,source]of state.evidence.entries()){source.sha256=digest(raw[index]);await store.addEvidence({...state,evidence:state.evidence.filter(item=>item.id!==source.id)},{...source,raw:raw[index]});}
  // Write the explicit synthetic state once; projection/reading must not save it.
  await store.save(state);const before=await fs.readFile(path.join(store.directory(state.id),'investigation.json'),'utf8');const built=await buildDocument(store,state.id),files=readZip(built.data),manifest=JSON.parse(files.get('manifest.json'));
  // Existing v1 graph bytes from the prior serializer have no understanding DTO.
  const canonical=JSON.parse(files.get('investigation.json')),projection=serializeWorkspaceMap(canonical);files.set('workspace-map.json',Buffer.from(JSON.stringify(projection,null,2)));manifest.records.find(item=>item.path==='workspace-map.json').sha256=digest(files.get('workspace-map.json'));files.set('manifest.json',Buffer.from(JSON.stringify(manifest)));
  const opened=parseDocument(writeZip(files));assert.deepEqual(serializeWorkspaceMap(opened.state),projection);assert.deepEqual(opened.state.workspace.mapPositions,state.workspace.mapPositions);assert.deepEqual(opened.state.workspace.mapCamera,state.workspace.mapCamera);assert.equal(opened.state.draft,state.draft);assert.equal(opened.snapshots.length,3);assert.ok(!files.get('workspace-map.json').toString().includes('understanding'));assert.equal(await fs.readFile(path.join(store.directory(state.id),'investigation.json'),'utf8'),before);
});
