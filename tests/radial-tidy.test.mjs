import test from 'node:test';
import assert from 'node:assert/strict';
import {circularMap,spiralMap,SPIRAL_PITCH} from '../lib/shape-arrangements.mjs';
import {shatteredMap,explodedMap,clusteredRadial,primaryTree} from '../lib/cluster-arrangements.mjs';
import {tidyMap} from '../lib/tidy-map.mjs';
import {cleanWorkspace} from '../lib/workspace.mjs';
import {wispTidy} from '../lib/wisp-tidy.mjs';
import {intersects} from '../lib/result-growth.mjs';
const box=(x=0,y=0,width=220,height=66)=>({x,y,width,height});
function uneven(){const nodes=new Map([['core',{id:'core',type:'root'}]]),children=new Map();const add=(id,parent,type='feature')=>{nodes.set(id,{id,parent,type});children.set(parent,[...(children.get(parent)||[]),id]);};add('small','core');add('large','core');add('chain','core');for(let i=0;i<30;i++)add(`fan${i}`,'large','finding');for(let i=0;i<8;i++)add(`chain${i}`,i?`chain${i-1}`:'chain',i%2?'result':'feature');return {root:'core',nodes,children,edges:[{from:'small',to:'chain7',relation:'compares'}]};}
function noHits(map,result){const ids=[...map.nodes.keys()];assert.deepEqual(new Set(ids),new Set(Object.keys(result.positions)));for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)assert.equal(intersects(result.positions[ids[i]],result.positions[ids[j]],32),false,`${ids[i]}/${ids[j]}`);}
test('radial recomposes saved coordinates, centers root and uses actual concentric depth rings',()=>{
  const map=uneven(),before=structuredClone(map),saved=Object.fromEntries([...map.nodes.keys()].map(id=>[id,box(4000,200)])),r=tidyMap(map,'radial',saved,{locked:[...map.nodes.keys()],collapsed:['large']});assert.deepEqual(r.positions.core,box(-110,-33));assert.notDeepEqual(r.positions.large,saved.large);noHits(map,r);assert.deepEqual(map,before);assert.deepEqual(circularMap(map,r.positions).positions,r.positions);
  const depth=new Map([['core',0]]),rings=new Map();for(const id of primaryTree(map).order)if(id!=='core'){const d=depth.get(map.nodes.get(id).parent)+1;depth.set(id,d);if(rings.has(d))assert.equal(r.radii[id],rings.get(d));rings.set(d,r.radii[id]);assert.ok(r.radii[id]>r.radii[map.nodes.get(id).parent]);}const sectors=Object.fromEntries(r.sectors.map(s=>[s.id,s.end-s.start]));assert.ok(sectors.large>sectors.small*10);
});
test('Spiral uses increasing radius and continuous unwrapped winding; upright rectangles do not collide',()=>{
  const map=uneven(),r=spiralMap(map),order=primaryTree(map).order;noHits(map,r);let prior=-1;for(const id of order){const p=r.positions[id],radius=Math.hypot(p.x+p.width/2,p.y+p.height/2);assert.ok(radius>prior);prior=radius;}assert.ok(prior/SPIRAL_PITCH>Math.PI*4);assert.deepEqual(spiralMap(map,r.positions).positions,r.positions);
});
test('Shattered and Exploded compose different connected-island geometries without inventing graph records',()=>{
  const map=uneven(),before=structuredClone(map),shattered=shatteredMap(map),exploded=explodedMap(map);noHits(map,shattered);noHits(map,exploded);assert.notDeepEqual(shattered.positions,exploded.positions);assert.deepEqual(map,before);assert.deepEqual(shatteredMap(map,shattered.positions).positions,shattered.positions);assert.deepEqual(explodedMap(map,exploded.positions).positions,exploded.positions);assert.notDeepEqual(clusteredRadial(map).positions,circularMap(map).positions);
});
test('current old Spiral is preserved exactly as Wisp once; true Spiral gets independent state',()=>{
  const oldSpiral={positions:{core:box(7,8),a:box(900,-700)},camera:{x:5,y:9,scale:.8}},priorWisp={positions:{core:box(-100,-200)},camera:{x:1,y:2,scale:1}};
  const w=cleanWorkspace({layout:'spiral',mapPositions:oldSpiral.positions,mapCamera:oldSpiral.camera,layouts:{spiral:oldSpiral,wisp:priorWisp,horizontal:{positions:{core:box(25,3)},camera:null}},placedNodes:{spiral:['a']}});assert.equal(w.layout,'wisp');assert.deepEqual(w.layouts.wisp,oldSpiral);assert.deepEqual(w.mapPositions,oldSpiral.positions);assert.deepEqual(w.mapCamera,oldSpiral.camera);assert.deepEqual(w.layoutBackups.wisp,priorWisp);assert.equal(w.layouts.spiral,undefined);assert.deepEqual(w.placedNodes.wisp,['a']);assert.deepEqual(cleanWorkspace(w),w);
  const modern=cleanWorkspace({...w,layout:'spiral',mapPositions:{core:box(-110,-33)},mapCamera:{x:3,y:5,scale:1},layouts:{...w.layouts,spiral:{positions:{core:box(-110,-33)},camera:{x:3,y:5,scale:1}}}});assert.equal(modern.layout,'spiral');assert.deepEqual(modern.layouts.wisp,oldSpiral);
});
test('comparison edges do not affect any composed hierarchy geometry',()=>{const map=uneven();for(const fn of [circularMap,spiralMap,shatteredMap,explodedMap]){const first=fn(map);map.edges.push({from:'fan0',to:'small',relation:'compares'});assert.deepEqual(fn(map),first);}});
test('Wisp leaves a non-overlapping approved composition untouched instead of repacking its fans',()=>{const map=uneven(),positions=clusteredRadial(map).positions;const r=wispTidy(map,positions);assert.deepEqual(r.positions,positions);assert.deepEqual(r.moved,[]);});
test('Wisp Tidy retains anchors omitted from the visible projection',()=>{const map=uneven(),positions=clusteredRadial(map).positions;positions.omitted={x:-400,y:700,width:220,height:66};const r=tidyMap(map,'wisp',positions);assert.deepEqual(r.positions.omitted,positions.omitted);});
