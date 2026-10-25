import test from 'node:test';
import assert from 'node:assert/strict';
import {needsTreeUpgrade} from '../lib/tree-layout.mjs';
import {cleanWorkspace} from '../lib/workspace.mjs';

test('legacy flattened Tree qualifies once; manual, compact and kept arrangements do not',()=>{
 const positions=Object.fromEntries(Array.from({length:20},(_,i)=>[`n${i}`,{x:i*260,y:(i%3)*170,width:220,height:66}]));
 const legacy=cleanWorkspace({layout:'tree',layouts:{tree:{positions}},mapPositions:positions});
 assert.equal(needsTreeUpgrade(legacy),true);
 assert.equal(needsTreeUpgrade({...legacy,layout:'manual'}),false);
 assert.equal(needsTreeUpgrade({...legacy,treeVersion:1}),false);
 assert.equal(needsTreeUpgrade({...legacy,placedNodes:{tree:['n1']}}),false);
 assert.equal(needsTreeUpgrade({...legacy,mapPositions:Object.fromEntries(Object.entries(positions).map(([id,p],i)=>[id,{...p,x:(i%4)*260,y:Math.floor(i/4)*170}]))}),false);
 assert.equal(cleanWorkspace({...legacy,treeVersion:1}).treeVersion,1);
});
