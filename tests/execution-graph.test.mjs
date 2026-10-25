import test from 'node:test';
import assert from 'node:assert/strict';
import {executionGraph} from '../lib/execution-graph.mjs';
test('canvas keeps a connected node for every exploration, including completed results',()=>{
  const map={id:'map',role:'assistant',title:'Example',features:[{name:'A'},{name:'B'}],claims:[],recommendation:'A'};
  const state={id:'test',title:'Example',messages:[map,{id:'a1',role:'assistant',branchFeatureName:'A',findings:[{question:'What happened?',finding:'A saved result',claimIndexes:[]}],recommendation:'Read A source'},{id:'b1',role:'assistant',branchFeatureName:'B',recommendation:'Read B source'},{id:'a2',role:'assistant',branchFeatureName:'A',recommendation:'',text:'Final evidence and limitations'}],targets:[],evidence:[]};
  const graph=executionGraph(state);assert.ok([...graph.nodes.values()].every(node=>['investigation','feature','recommendation','result'].includes(node.type)));assert.equal(graph.nodes.get('turn:a1').title,'Read A source');assert.equal(graph.nodes.get('turn:a1').parent,'feature:a');assert.equal(graph.nodes.get('turn:b1').parent,'feature:b');assert.equal(graph.nodes.get('turn:a2').type,'result');assert.equal(graph.nodes.get('turn:a2').parent,'turn:a1');assert.equal(graph.nodes.get('turn:a2').updates[0].id,'a2');assert.equal(graph.latest,'turn:a2');assert.ok(graph.edges.some(edge=>edge.from==='turn:a1'&&edge.to==='turn:a2'));assert.ok(graph.full.nodes.has('finding:a1:0'));assert.ok(!graph.nodes.has('finding:a1:0'));assert.equal(state.messages[1].findings[0].finding,'A saved result');
});

test('a first-step completion creates a named result node connected to its feature without mutating history',()=>{
  const state={id:'completed',title:'Fabric',messages:[{id:'map',role:'assistant',features:[{name:'Media',displayLabel:'Media input'}]},{id:'done',role:'assistant',branchFeatureName:'Media',recommendation:'',overview:'Media becomes Pattern input.',continuation:{status:'complete'},findings:[{question:'How?',finding:'Transcribe to text.'}]}],targets:[],evidence:[]};
  const before=JSON.stringify(state),graph=executionGraph(state),result=graph.nodes.get('turn:done');assert.equal(result.type,'result');assert.equal(result.title,'Media input');assert.equal(result.parent,'feature:media');assert.equal(graph.latest,result.id);assert.equal(result.updates[0].findings[0].finding,'Transcribe to text.');assert.ok(graph.edges.some(edge=>edge.from==='feature:media'&&edge.to===result.id));assert.equal(JSON.stringify(state),before);
});
