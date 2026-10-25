import test from 'node:test';
import assert from 'node:assert/strict';
import {executionGraph} from '../lib/execution-graph.mjs';
import {directionLayout} from '../lib/direction-layout.mjs';
test('one discovery block anchors ordered row ports and branches avoid overlap without moving saved directions',()=>{
  const state={id:'test',title:'Products',targets:[],evidence:[],messages:[{id:'map',role:'assistant',features:[{name:'A'},{name:'B'}]},{id:'a1',role:'assistant',branchFeatureName:'A',recommendation:'Continue A'},{id:'a2',role:'assistant',branchFeatureName:'A',recommendation:'Read deeper A'},{id:'b1',role:'assistant',branchFeatureName:'B',recommendation:'Continue B'}]};
  const graph=executionGraph(state),positions=new Map(),first=directionLayout(graph,new Set([graph.root,'feature:a','turn:a1']),{positions}),original=structuredClone(first.positions.get('turn:a1'));
  const second=directionLayout(graph,new Set([graph.root,'feature:a','turn:a1','feature:b']),{positions});assert.deepEqual(second.positions.get('turn:a1'),original);assert.equal(second.positions.get(graph.root).width,1000);assert.equal(second.positions.get('feature:b').y-second.positions.get('feature:a').y,48);assert.equal(second.positions.get('feature:a').width,0);
  const cards=[...second.positions.values()].filter(point=>point.width);for(let a=0;a<cards.length;a++)for(let b=a+1;b<cards.length;b++){const x=cards[a],y=cards[b];assert.ok(x.x+x.width<=y.x||y.x+y.width<=x.x||x.y+x.height<=y.y||y.y+y.height<=x.y);}
});
