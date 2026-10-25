import test from 'node:test';
import assert from 'node:assert/strict';
import {ADDITIONAL_LAYOUTS,additionalLayout,layoutFamilies} from '../lib/additional-layouts.mjs';
import {intersects} from '../lib/result-growth.mjs';
import {layoutMap,switchLayout} from '../lib/map-layouts.mjs';
import {tidyMap} from '../lib/tidy-map.mjs';
import {cleanWorkspace} from '../lib/workspace.mjs';
const rect=(x,y)=>({x,y,width:220,height:66});
export function populated(){const nodes=new Map(),children=new Map();const add=(id,parent,type='finding')=>{nodes.set(id,{id,parent,type,title:id});if(parent){const row=children.get(parent)||[];row.push(id);children.set(parent,row);}};add('core',null,'root');for(let i=0;i<5;i++){const f=`family${i}`;add(f,'core','feature');add(`${f}:result`,f,'result');for(let j=0;j<[2,11,4,8,1][i];j++)add(`${f}:finding${j}`,`${f}:result`);}
return {root:'core',nodes,children,edges:[...nodes.values()].filter(n=>n.parent).map(n=>({from:n.parent,to:n.id,relation:'branches'})).concat({from:'family0:result',to:'family3:result',relation:'compares'})};}
const noCollisions=positions=>{const entries=Object.entries(positions);for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)assert.equal(intersects(entries[i][1],entries[j][1],20),false,`${entries[i][0]} overlaps ${entries[j][0]}`);};
for(const layout of ADDITIONAL_LAYOUTS)test(`${layout}: distinct deterministic composition, readable rectangles, graph preservation and explicit tidy`,()=>{
 const map=populated(),original=structuredClone(map),saved=Object.fromEntries([...map.nodes.keys()].map(id=>[id,rect(0,0)])),result=additionalLayout(map,layout,saved);assert.equal(Object.keys(result.positions).length,map.nodes.size);noCollisions(result.positions);assert.deepEqual(map,original);assert.deepEqual(tidyMap(map,layout,result.positions).positions,result.positions);assert.ok(result.moved.length);assert.equal(tidyMap(map,layout,result.positions).moved.length,0);
 const ws=switchLayout(cleanWorkspace({layout:'manual',mapPositions:{core:rect(10,20)},mapCamera:{x:20,y:10,scale:1}}),map,layout),camera={x:150,y:250,scale:.9};ws.mapCamera=camera;const other=switchLayout(ws,map,'manual'),restored=switchLayout(other,map,layout);assert.deepEqual(restored.mapPositions,ws.mapPositions);assert.deepEqual(restored.mapCamera,camera);
 const grown=structuredClone(map);grown.nodes.set('new-result',{id:'new-result',parent:'family1',type:'result'});grown.nodes.set('new-finding',{id:'new-finding',parent:'new-result',type:'finding'});grown.children.get('family1').push('new-result');grown.children.set('new-result',['new-finding']);const appended=layoutMap(grown,layout,result.positions);for(const [id,p]of Object.entries(result.positions))assert.deepEqual(appended[id],p);noCollisions(appended);
});
test('Orbit rings encode real primary depth, River spine follows actual parent edges, Honeycomb covers recorded families',()=>{
 const map=populated(),orbit=additionalLayout(map,'orbit');for(const [id,depth]of orbit.depths){if(!depth)continue;const p=orbit.positions[id];assert.ok(Math.abs(Math.hypot(p.x+p.width/2,p.y+p.height/2)-orbit.radii[depth])<.001);}
 const river=additionalLayout(map,'river');for(let i=1;i<river.spine.length;i++)assert.equal(map.nodes.get(river.spine[i]).parent,river.spine[i-1]);assert.ok(river.spine.some(id=>map.nodes.get(id).type==='result'));
 const honey=additionalLayout(map,'honeycomb'),families=layoutFamilies(map);assert.equal(honey.cells.length,families.groups.size);for(const cell of honey.cells)for(const id of families.groups.get(cell.id)){const p=honey.positions[id];for(const angle of [0,Math.PI/3,Math.PI*2/3])for(const x of [p.x,p.x+p.width])for(const y of [p.y,p.y+p.height])assert.ok(Math.abs((x-cell.x)*Math.cos(angle)+(y-cell.y)*Math.sin(angle))<Math.sqrt(3)/2*cell.radius);}
 const shapes=ADDITIONAL_LAYOUTS.map(name=>JSON.stringify(additionalLayout(map,name).positions));assert.equal(new Set(shapes).size,ADDITIONAL_LAYOUTS.length);
});

test('Orbit keeps each root branch in a contiguous angular region through successive depth rings',()=>{
 const map=populated(),orbit=additionalLayout(map,'orbit'),families=map.children.get(map.root);let previous=-Infinity;
 for(const family of families){const ids=[],walk=id=>{ids.push(id);for(const child of map.children.get(id)||[])walk(child);};walk(family);const angles=ids.map(id=>orbit.angles.get(id)),low=Math.min(...angles),high=Math.max(...angles);assert.ok(low>previous);assert.ok(orbit.angles.get(family)>=low&&orbit.angles.get(family)<=high);previous=high;}
});
