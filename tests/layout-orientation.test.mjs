import test from 'node:test';
import assert from 'node:assert/strict';
import {packMap,matchesOrientation,orientPositions} from '../lib/adaptive-layout.mjs';
import {layoutMap,switchLayout} from '../lib/map-layouts.mjs';
import {tidyMap} from '../lib/tidy-map.mjs';
import {workspaceMap} from '../lib/workspace-map.mjs';
import {cleanWorkspace} from '../lib/workspace.mjs';
const fixture=(count=24)=>workspaceMap({title:'Orientation',targets:[],evidence:[],messages:[{id:'inventory',role:'assistant',features:Array.from({length:count},(_,i)=>[{name:`Area ${i}`},...Array.from({length:3},(_,j)=>({name:`Area ${i} part ${j}`,parentName:`Area ${i}`}))]).flat()}]});
const legacy=(map,layout)=>Object.fromEntries([...map.nodes].map(([id],i)=>[id,{x:layout==='horizontal'?i%4*308:i*276,y:layout==='vertical'?i%4*170:i*108,width:220,height:66}]));
function check(map,layout,p){
 assert.equal(matchesOrientation(p,layout),true,`${layout} overall bounds`);
 assert.deepEqual(new Set(Object.keys(p)),new Set(map.nodes.keys()));
 for(const [id,node]of map.nodes)if(node.parent)assert.ok(layout==='horizontal'?p[id].x>p[node.parent].x:p[id].y>p[node.parent].y,`${id} parent direction`);
 const all=Object.values(p);for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const a=all[i],b=all[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,`${i}/${j} overlap`);}
}
test('named presets produce the visible orientation on dense graphs at wide and tall viewport ratios',()=>{
 for(const count of [2,9,24,64]){const map=fixture(count),before=structuredClone(map);for(const layout of ['horizontal','vertical']){
  check(map,layout,layoutMap(map,layout));
  for(const size of [{width:1500,height:500},{width:700,height:1000},{width:390,height:700}]){const p=packMap(map,layout,size);check(map,layout,p);assert.deepEqual(p,packMap(map,layout,size));}
 }assert.deepEqual(map,before);}
});
test('opening and switching saved IDs retains old coordinates; explicit correction has a lossless root and hidden anchors',()=>{
 const map=fixture(),horizontal=legacy(map,'horizontal'),vertical=legacy(map,'vertical');
 let ws=cleanWorkspace({layout:'horizontal',mapPositions:horizontal,mapCamera:{x:23,y:41,scale:.6},layouts:{vertical:{positions:vertical,camera:{x:90,y:80,scale:.3}}},inspected:'feature:area 0'});
 const before=structuredClone(ws);ws=switchLayout(ws,map,'vertical');assert.deepEqual(ws.mapPositions,vertical);ws=switchLayout(ws,map,'horizontal');assert.deepEqual(ws.mapPositions,horizontal);assert.deepEqual(ws.mapCamera,before.mapCamera);
 for(const layout of ['horizontal','vertical']){const saved={...legacy(map,layout),hidden:{x:99999,y:-77,width:220,height:66}},snapshot=structuredClone(saved),fixed=orientPositions(map,layout,saved);
  assert.equal(fixed.changed,true);assert.deepEqual(saved,snapshot);assert.deepEqual(fixed.positions.hidden,saved.hidden);assert.deepEqual(fixed.positions[map.root],saved[map.root]);check(map,layout,Object.fromEntries([...map.nodes.keys()].map(id=>[id,fixed.positions[id]])));
 }
});
test('explicit orientation respects Keep position and collapsed constraints and leaves other layouts untouched',()=>{
 const map=fixture(),saved=legacy(map,'vertical'),id='feature:area 0';
 for(const options of [{locked:[id]},{collapsed:[id]}]){const result=orientPositions(map,'vertical',saved,options);assert.equal(result.changed,false);assert.equal(result.constrained,true);assert.strictEqual(result.positions,saved);}
 for(const layout of ['manual','compact','radial','spiral','wisp','bloom','tree','grid'])assert.strictEqual(orientPositions(map,layout,saved).positions,saved);
});
test('Tidy preserves each named orientation and protected coordinates',()=>{
 const map=fixture(9);for(const layout of ['horizontal','vertical']){
  const fresh=layoutMap(map,layout),tidied=tidyMap(map,layout,fresh);assert.equal(matchesOrientation(tidied.positions,layout),true);
  const wrong=legacy(map,layout),repaired=tidyMap(map,layout,wrong);assert.equal(matchesOrientation(repaired.positions,layout),true);assert.deepEqual(repaired.positions[map.root],wrong[map.root]);
  const id='feature:area 0',locked=tidyMap(map,layout,wrong,{locked:[id]});assert.deepEqual(locked.positions[id],wrong[id]);
 }
});
