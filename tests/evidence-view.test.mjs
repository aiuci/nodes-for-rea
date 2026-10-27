// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import test from 'node:test';
import assert from 'node:assert/strict';
import {responseUnderstanding,findingUnderstanding,retainedEvidenceMetadata,METADATA_PARSE_LIMIT} from '../lib/evidence-view.mjs';
import {evidenceAwareFixture,javascriptGraphFixture} from './fixtures/evidence-aware-fixture.mjs';

const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const item of Object.values(value))freeze(item);}return value;};
test('six sibling rows retain three Nodes observations and three questions; quotation support overlaps',()=>{
  const {state,message}=evidenceAwareFixture(),before=structuredClone(state);freeze(state);
  const view=responseUnderstanding(state,message);
  assert.equal(view.counts.findingRows,6);assert.equal(view.counts.observedFindingRows,3);assert.equal(view.counts.unresolvedQuestionRows,3);assert.equal(view.counts.quoteSupportedFindingRows,4);assert.equal(view.counts.supportingFindingRows,3);
  assert.equal(view.summary,'In this saved response: 3 observed findings · 3 unresolved questions.');assert.match(view.limitations[0],/Nodes finding rows.*not canonical/);assert.deepEqual(view.workflow,{recordedStatus:'complete',reason:'The saved fixture pass ended.'});assert.equal(view.resolution.state,'unresolved');assert.deepEqual(state,before);
});
test('identity gap has no direct evidence; observed siblings are explicitly parent-response context',()=>{
  const {state,message}=evidenceAwareFixture(),view=findingUnderstanding(state,message,message.findings[5]);
  assert.equal(view.category.key,'unknown');assert.equal(view.resolution.state,'unresolved');assert.deepEqual(view.directSupport.claimIndexes,[]);assert.deepEqual(view.directSupport.evidenceIds,[]);assert.equal(view.directSupport.quoteSupported,false);
  assert.deepEqual(view.parentContext.scope,{kind:'response',messageId:message.id});assert.equal(view.parentContext.counts.supportingFindingRows,3);assert.match(view.parentContext.qualification,/not additional claim-specific support/);assert.match(view.summary,/Unresolved.*parent response.*3 supporting findings/);assert.equal(view.nextRecordedAction,message.recommendation);
});
test('accumulated knowledge excerpts keep exact saved statements, categories and references, with a recorded next step',()=>{
  const {state,message}=evidenceAwareFixture(),view=responseUnderstanding(state,message),gap=findingUnderstanding(state,message,message.findings[5],{response:view});
  assert.equal(view.knowledge.items.length,3);assert.deepEqual(view.knowledge.items.map(item=>item.finding),message.findings.slice(0,3).map(finding=>finding.finding));assert.equal(view.knowledge.items[0].nodeId,'finding:fixture-response:0');assert.deepEqual(view.knowledge.items[0].evidenceIds,['fixture-source-0']);assert.equal(view.knowledge.items[0].category.key,'observed');
  assert.deepEqual(gap.parentContext.knowledge,view.knowledge);assert.equal(gap.recordedFinding.finding,message.findings[5].finding);assert.equal(gap.nextRecordedAction,message.recommendation);assert.deepEqual(gap.directSupport.evidenceIds,[]);
  state.evidence[0].stale=true;assert.equal(responseUnderstanding(state,message).knowledge.items.length,2);
});
test('knowledge and next-step previews are bounded and disclose omissions without rewriting saved wording',()=>{
  const {state,message}=evidenceAwareFixture();message.findings[0].finding='x'.repeat(800);message.recommendation='y'.repeat(800);for(let i=0;i<12;i++)message.findings.push({...message.findings[0]});const before=structuredClone(state),view=responseUnderstanding(state,message);
  assert.equal(view.knowledge.items.length,8);assert.equal(view.knowledge.omitted,7);assert.equal(view.knowledge.items[0].finding.length,360);assert.equal(view.knowledge.items[0].excerpted,true);assert.equal(view.nextRecordedAction.length,280);assert.deepEqual(state,before);
});
test('a quote-supported bounded no-match gap is still unresolved, with its exact direct references',()=>{
  const {state,message}=evidenceAwareFixture(),view=findingUnderstanding(state,message,message.findings[3]);
  assert.equal(view.category.key,'unknown');assert.equal(view.directSupport.quoteSupported,true);assert.deepEqual(view.directSupport.claimIndexes,[3]);assert.deepEqual(view.directSupport.evidenceIds,['fixture-source-0']);assert.equal(view.resolution.state,'unresolved');assert.doesNotMatch(view.summary,/absent|does not exist/);
});
test('workflow completion and quotation matches never establish central resolution even without gap rows',()=>{
  const {state,message}=evidenceAwareFixture();message.findings=message.findings.slice(0,3);
  assert.equal(responseUnderstanding(state,message).resolution.state,'not-assessed');assert.equal(findingUnderstanding(state,message,message.findings[0]).resolution.state,'not-assessed');
});
test('stale, failed, missing, proposed and limitation-only support remain conservative and visible',()=>{
  for(const patch of [{stale:true},{applicability:'changed'},{applicability:'unknown'},{evidenceStatus:'inspection-failed'},{text:'unrelated content'}]){
    const {state,message}=evidenceAwareFixture();Object.assign(state.evidence[0],patch);const view=responseUnderstanding(state,message);assert.equal(view.counts.observedFindingRows,2);assert.equal(view.counts.unverifiedFindingRows,1);assert.match(view.compact,/1 unverified finding/);
  }
  for(const kind of ['missing','proposed','limitation']){const {state,message}=evidenceAwareFixture();if(kind==='missing')state.evidence=[];if(kind==='proposed')message.claims[0].state='proposed';if(kind==='limitation')message.claims[0].quoteOrigin='inspection-limit';assert.equal(findingUnderstanding(state,message,message.findings[0]).category.key,'unknown');}
});
test('only unverified legacy findings are named in compact copy rather than hidden behind zero counts',()=>{
  const message={id:'old',findings:[{finding:'Legacy statement'}],continuation:{status:'complete'}},view=responseUnderstanding({evidence:[]},message);assert.match(view.compact,/1 unverified finding/);assert.equal(view.resolution.state,'not-assessed');assert.match(responseUnderstanding({},{}).summary,/No findings/);
});
test('canonical confidence and authority retain exact original layers and IDs independently of Nodes categories',()=>{
  const {state,message,raw}=evidenceAwareFixture(),before=structuredClone(state);
  assert.deepEqual(raw.map((text,index)=>retainedEvidenceMetadata(text,state.evidence[index]).canonicalEvidence.fields.confidence),['derived','observed','derived']);
  const metadata=retainedEvidenceMetadata(raw[0],state.evidence[0]);assert.equal(metadata.canonicalEvidence.fields.authority,'shipped-artifact');assert.equal(metadata.canonicalEvidence.fields.evidence_id,state.evidence[0].reaEvidenceId);assert.equal(metadata.canonicalEvidence.originPath,'$.structuredContent');assert.equal(metadata.transport,'mcp-structuredContent');assert.equal(metadata.integrity.nativeSemanticIdentity,'not-authenticated');assert.equal(metadata.engineVersion.status,'not-established');assert.equal(responseUnderstanding(state,message).counts.observedFindingRows,3);assert.deepEqual(state,before);
});
test('known direct, result and MCP text representations retain their original JSON origin',()=>{
  const {raw}=evidenceAwareFixture(),record=JSON.parse(raw[0]).structuredContent;
  for(const [value,origin]of [[record,'$'],[{result:record},'$.result'],[{content:[{type:'text',text:JSON.stringify({result:record})}]},'$.content[0].text(JSON).result']])assert.equal(retainedEvidenceMetadata(JSON.stringify(value)).canonicalEvidence.originPath,origin);
});
test('JS graph fact state, confidence, authority and native identities remain separate from canonical Evidence',()=>{
  const {raw}=evidenceAwareFixture(),record=JSON.parse(raw[0]).structuredContent;
  const graph=javascriptGraphFixture(record.evidence_id);record.normalized_result={graph};
  const view=retainedEvidenceMetadata(JSON.stringify({result:record}));assert.equal(view.canonicalEvidence.fields.confidence,'derived');assert.equal(view.javascriptGraphs[0].factCount,3);assert.deepEqual(view.javascriptGraphs[0].facts[0].evidence,graph.nodes[0].observations[0].evidence);assert.equal(view.javascriptGraphs[0].facts[0].observation_id,graph.nodes[0].observations[0].observation_id);assert.equal(view.javascriptGraphs[0].facts[2].evidence.state,'unknown');assert.match(view.javascriptGraphs[0].facts[2].originPath,/edges\[0\]\.evidence$/);
});
test('malformed known field values are exposed without coercion or a native validation claim',()=>{
  const view=retainedEvidenceMetadata(JSON.stringify({evidence_id:'not-an-authenticated-id',confidence:'future-value',provider:[],locations:'wrong-shape'}));assert.equal(view.status,'recognized');assert.equal(view.canonicalEvidence.fields.confidence,'future-value');assert.ok(view.canonicalEvidence.shapeWarnings.length>=4);assert.ok(view.canonicalEvidence.missingFields.includes('subject'));assert.equal(view.integrity.localBytes,'not-checked-by-pure-projection');
});
test('unsupported, deeply wrapped and circular input remain inert and bounded',()=>{
  for(const raw of ['not-json',JSON.stringify({unknown:{confidence:'observed'}})])assert.equal(retainedEvidenceMetadata(raw).status,'unrecognized');
  const cyclic={};cyclic.structuredContent=cyclic;assert.equal(retainedEvidenceMetadata(cyclic).status,'unrecognized');
  let nested={evidence_id:'ev_'+'1'.repeat(64)};for(let i=0;i<10;i++)nested={content:[{type:'text',text:JSON.stringify(nested)}]};assert.equal(retainedEvidenceMetadata(nested).status,'unrecognized');
  assert.equal(retainedEvidenceMetadata(' '.repeat(METADATA_PARSE_LIMIT+1)).status,'unavailable');
});
test('large native metadata and graph facts report omissions within a bounded display',()=>{
  const {raw}=evidenceAwareFixture(),record=JSON.parse(raw[0]).structuredContent;record.parameters={['x'.repeat(10000)]:'private',many:Array.from({length:80},()=>({text:'a'.repeat(10000)}))};
  record.normalized_result={schema:'JavaScriptApplicationGraph',nodes:Array.from({length:80},(_,index)=>({node_id:'node-'+index,observations:[{observation_id:'observation-'+index,evidence:{state:'observed',confidence:'exact',authority:'shipped-artifact'}}]})),edges:[]};
  const view=retainedEvidenceMetadata(JSON.stringify(record));assert.equal(view.javascriptGraphs[0].facts.length,32);assert.equal(view.javascriptGraphs[0].factCount,80);assert.ok(view.omissions.length);assert.ok(view.omissions.length<=64);assert.ok(JSON.stringify(view).length<100000);assert.ok(view.omissions.some(item=>/original|retained|snapshot/.test(item.reason)));
});
