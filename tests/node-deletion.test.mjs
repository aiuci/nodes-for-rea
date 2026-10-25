import {prepareShare} from '../lib/document-sharing.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {deletionPlan,withoutDeletedNodes} from '../lib/node-deletion.mjs';
import {workspaceMap,serializeWorkspaceMap} from '../lib/workspace-map.mjs';
import {cleanWorkspace} from '../lib/workspace.mjs';
const state=()=>({title:'Test',messages:[{id:'d',role:'assistant',features:[{name:'A'},{name:'B'}]},{id:'r',role:'assistant',branchFeatureName:'A',findings:[{question:'Q',finding:'F'}],directions:['Next']}],workspace:cleanWorkspace()});
test('bulk plan includes folded/hidden descendants once, excludes root and preserves research',()=>{
  const s=state(),before=structuredClone(s),map=workspaceMap(s),p=deletionPlan(map,['core','feature:a','turn:r','feature:b']);
  assert.equal(p.ids.length,5);assert.deepEqual(p.roots,['feature:a','feature:b']);assert.equal(p.ids.includes('core'),false);assert.deepEqual(s,before);
  const next=withoutDeletedNodes(map,p.ids);assert.equal(next.nodes.has('core'),true);for(const id of p.ids)assert.equal(next.nodes.has(id),false);assert.ok(next.edges.every(e=>next.nodes.has(e.from)&&next.nodes.has(e.to)));
});
test('active operations and draft destinations block deletion before mutation',()=>{
  const map=workspaceMap(state());assert.match(deletionPlan(map,['feature:a'],{busy:true}).blocked,/Wait/);
  for(const draftContext of [{nodeId:'turn:r'},{featureName:'A'},{resultId:'r'}])assert.match(deletionPlan(map,['feature:a'],{draft:'Retain',draftContext}).blocked,/draft/);
  assert.equal(deletionPlan(map,['feature:b'],{draft:'Retain',draftContext:{featureName:'A'}}).blocked,'');
});
test('deletions and Undo roundtrip in existing workspace; identities/evidence/positions survive restoration',()=>{
  const s=state(),original=workspaceMap(s),before=structuredClone(s.messages);s.workspace.deletedNodes=deletionPlan(original,['feature:a']).ids;s.workspace.deleteUndo={deletedNodes:[]};s.workspace=cleanWorkspace(JSON.parse(JSON.stringify(s.workspace)));
  assert.equal(workspaceMap(s).nodes.has('feature:a'),false);assert.equal(serializeWorkspaceMap(s).nodes.some(n=>n.id==='feature:a'),false);assert.deepEqual(serializeWorkspaceMap(s).deletedNodes,s.workspace.deletedNodes);
  s.workspace.deletedNodes=s.workspace.deleteUndo.deletedNodes;s.workspace.deleteUndo=null;assert.deepEqual(workspaceMap(s),original);assert.deepEqual(s.messages,before);
  assert.deepEqual(cleanWorkspace({deletedNodes:['core','feature:a','feature:a'],deleteUndo:{deletedNodes:['core']}}).deletedNodes,['feature:a']);
});

test('sharing excludes retained deleted research by default; explicit inclusion preserves it',()=>{
  const s=state();s.evidence=[];s.targets=[];s.workspace.deletedNodes=deletionPlan(workspaceMap(s),['feature:a']).ids;s.workspace.deleteUndo={deletedNodes:[]};
  const shared=prepareShare(s);assert.equal(shared.state.messages.some(m=>m.id==='r'),false);assert.equal(shared.state.workspace.deleteUndo,null);assert.deepEqual(shared.state.workspace.deletedNodes,[]);
  const included=prepareShare(s,{includeDeleted:true,includeHidden:true});assert.equal(included.state.messages.some(m=>m.id==='r'),true);assert.equal(workspaceMap(included.state).nodes.has('feature:a'),false);
});
