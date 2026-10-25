import test from 'node:test';
import assert from 'node:assert/strict';
import {claimCategory,findingCategory} from '../lib/finding-category.mjs';
import {workspaceMap,branchStats} from '../lib/workspace-map.mjs';
import {nodeStatus,nodeStatusMarker} from '../ui/node-status.js';

const source={id:'s',kind:'rea',evidenceStatus:'static',text:'if (count > 3) retry();'};
const claim={state:'observed',evidenceId:'s',quote:'retry();',text:'The code calls retry.'};
const finding={question:'Retries?',finding:'The code calls retry.',change:'new',claimIndexes:[0]};
const fixture=()=>({evidence:[structuredClone(source)],messages:[{id:'r',role:'assistant',claims:[structuredClone(claim)],findings:[structuredClone(finding)]}]});

test('direct static evidence and runtime evidence are distinguished without promising execution',()=>{
  assert.equal(claimCategory(claim,source).key,'observed');assert.match(claimCategory(claim,source).detail,/runtime behavior is not verified/);
  assert.match(claimCategory(claim,{...source,evidenceStatus:'runtime-observed'}).detail,/Behavior observed/);
  assert.equal(claimCategory({...claim,state:'inferred'},source).key,'inferred');
});
test('mixed observed/inferred support stays inferred; one missing citation prevents promotion',()=>{
  const state=fixture(),message=state.messages[0];message.claims.push({...claim,state:'inferred'});message.findings[0].claimIndexes=[0,1];
  assert.equal(findingCategory(state,message,message.findings[0]).key,'inferred');
  message.claims.push({...claim,evidenceId:'missing'});message.findings[0].claimIndexes.push(2);
  assert.equal(findingCategory(state,message,message.findings[0]).key,'unknown');
});
test('gaps, proposals, missing metadata and broken references remain unknown',()=>{
  const state=fixture(),message=state.messages[0];
  assert.equal(findingCategory(state,message,{...finding,change:'gap'}).key,'unknown');
  for(const refs of [[],[4],[-1],['0']])assert.equal(findingCategory(state,message,{...finding,claimIndexes:refs}).key,'unknown');
  assert.match(claimCategory({...claim,state:'proposed'},null).detail,/Proposal/);
  assert.equal(claimCategory({...claim,state:undefined},source).key,'unknown');
});
test('failed, stale, changed, mismatched and limitation-only sources cannot establish a finding',()=>{
  for(const patch of [{evidenceStatus:'inspection-failed'},{stale:true},{applicability:'changed'},{applicability:'unknown'},{text:'other content'}])assert.equal(claimCategory(claim,{...source,...patch}).key,'unknown',JSON.stringify(patch));
  assert.equal(claimCategory({...claim,quoteOrigin:'inspection-limit'},source).key,'unknown');
  assert.equal(claimCategory(claim,{...source,text:'',limitations:[claim.quote]}).key,'unknown');
});
test('public source descriptions and prerequisite checks are not observed implementation',()=>{
  assert.match(claimCategory(claim,{...source,kind:'page',evidenceStatus:undefined}).detail,/Source description only/);
  for(const patch of [{kind:'host-process'},{evidenceStatus:'check-result'}])assert.equal(claimCategory(claim,{...source,...patch}).key,'unknown');
  assert.equal(claimCategory({...claim,state:'inferred'},{...source,kind:'page',evidenceStatus:undefined}).key,'inferred');
});
test('saved comparison receipts retain their original file evidence kind',()=>{
  assert.equal(claimCategory(claim,{...source,kind:'comparison-receipt',evidenceStatus:undefined,comparisonOrigin:{originalKind:'file'}}).key,'observed');
});
test('map, captions and category totals agree and never rewrite saved investigation records',()=>{
  const state=fixture(),message=state.messages[0];message.claims.push({...claim,state:'inferred'});message.findings.push({...finding,claimIndexes:[0,1]},{...finding,change:'gap'});
  const before=structuredClone(state),map=workspaceMap(state),view={state,map};
  for(const [i,label]of ['Observed','Inferred','Unknown'].entries()){
    const node=map.nodes.get(`finding:r:${i}`);assert.equal(nodeStatus(view,node),label);assert.ok(nodeStatusMarker(label));
  }
  const stats=branchStats(map,'core');assert.equal(stats.observedFindings,1);assert.equal(stats.inferredFindings,1);assert.equal(stats.unknownFindings,1);
  assert.deepEqual(state,before);
});
