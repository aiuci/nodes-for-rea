import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceAwareFixture} from './fixtures/evidence-aware-fixture.mjs';
import {workspaceMap,serializeWorkspaceMap} from '../lib/workspace-map.mjs';
import {readingStatement,coverageHeading,retainedMapSummary,nodeContextText} from '../ui/evidence-understanding.js';
import {savedStepState} from '../lib/saved-step-state.mjs';

test('explicit recorded proposals stay distinct from evidence and unresolved questions without rewriting classifications',()=>{
  const {state,message}=evidenceAwareFixture();
  message.claims.push({state:'proposed',text:'Add a stable key',evidenceId:state.evidence[0].id,quote:message.claims[0].quote});
  const index=message.claims.length-1;
  message.findings.push({question:'Could a stable key help?',finding:'Use a stable key to correlate readings.',change:'new',claimIndexes:[index]});
  const before=structuredClone(state),get=()=>workspaceMap(state).nodes.get('finding:fixture-response:6');
  assert.equal(get().category.key,'unknown');assert.match(readingStatement(state,get()),/^Recorded proposal: Use a stable key/);assert.equal(nodeContextText(get()).compact,'Recorded proposal');
  assert.deepEqual(state,before);
  message.findings[6].claimIndexes=[0,index];assert.match(readingStatement(state,get()),/^Saved statement with proposed behavior:/);assert.equal(get().category.key,'unknown');
  message.findings[6].change='gap';assert.match(readingStatement(state,get()),/^Unresolved:/);assert.match(nodeContextText(get()).compact,/Unresolved/);
  message.findings[6].change='new';message.findings[6].claimIndexes=[];assert.equal(nodeContextText(get()).compact,'Unverified statement');assert.doesNotMatch(readingStatement(state,get()),/Recorded proposal/);
});

test('reading statements retain scope, uncertainty and original records rather than presenting missing support as a discovery',()=>{
  const {state,message}=evidenceAwareFixture(),before=structuredClone(state),dto=serializeWorkspaceMap(state);
  const map=workspaceMap(state),statement=i=>readingStatement(state,map.nodes.get('finding:fixture-response:'+i));
  assert.match(statement(0),/^Static: The fixture enters/);
  assert.match(statement(5),/^Unresolved: Object identity.*unverified/);
  assert.doesNotMatch(statement(5),/enters its update pipeline/);
  assert.deepEqual(state,before);assert.deepEqual(serializeWorkspaceMap(state),dto);
  state.evidence=[];const missing=workspaceMap(state);
  assert.match(readingStatement(state,missing.nodes.get('finding:fixture-response:0')),/^Unverified:/);
  assert.equal(readingStatement(state,{type:'feature'}),'');
  assert.equal(message.findings[5].change,'gap');assert.deepEqual(message.findings[5].claimIndexes,[]);
});

test('header distinguishes absent inventory from explicitly recorded zero and from feature-level review',()=>{
  const {state}=evidenceAwareFixture();
  assert.match(coverageHeading(state),/^Feature inventory not recorded here/);
  state.messages.unshift({id:'empty-discovery',role:'assistant',features:[]});
  assert.match(coverageHeading(state),/^0 features discovered · 0 features investigated/);
  state.messages[0].features=[{name:'Cooling'}];
  assert.match(coverageHeading(state),/^1 feature discovered · 0 features investigated · 0\/1 features reviewed/);
  assert.match(coverageHeading(state),/Total coverage unknown/);
});

test('brief type/list wording is target-neutral and never compresses a negated or unsupported statement into a finding',()=>{
  const {state,message}=evidenceAwareFixture();
  const text='The executable contains a generic DeviceSample identity and a list specialized for DeviceSample objects, alongside other identities.';
  message.findings[1].finding=text;let map=workspaceMap(state);
  assert.equal(readingStatement(state,map.nodes.get('finding:fixture-response:1')),'Static DeviceSample type and list');
  message.findings[1].finding='The executable does not establish a DeviceSample identity or list.';map=workspaceMap(state);
  assert.match(readingStatement(state,map.nodes.get('finding:fixture-response:1')),/does not establish/);
  message.findings[5].question='How does refresh preserve device identity?';map=workspaceMap(state);
  assert.equal(readingStatement(state,map.nodes.get('finding:fixture-response:5')),'Identity continuity unverified.');
});

test('map summary separates row counts from scope and never calls saved answers physical attempts',()=>{
  const {state}=evidenceAwareFixture();const text=retainedMapSummary(state,9);
  assert.equal(text,'3 saved findings · 3 unresolved questions · 9 nodes shown · Lines show investigation branches, not evidence support');
  assert.doesNotMatch(text,/1 attempts|0 investigated|percent/);
});

test('missing matching run is not a claim that the action never ran; recorded and active outcomes remain distinct',()=>{
  const {state}=evidenceAwareFixture(),spec={request:'Trace the fixture lifecycle'},id='direction:fixture-response:0';
  assert.equal(savedStepState({state},id,spec).status,'Saved proposal · No run recorded here');
  state.attempts=[{nodeId:id,question:spec.request,status:'continue',resultId:'saved'}];
  assert.equal(savedStepState({state},id,spec).state,'saved');
  state.attempts[0].status='stopped';delete state.attempts[0].resultId;
  assert.equal(savedStepState({state},id,spec).state,'stopped');
  assert.equal(savedStepState({state},'other',spec).state,'idle');
});
