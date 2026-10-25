import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutMap,switchLayout} from '../lib/map-layouts.mjs';
import {cleanWorkspace,LAYOUTS} from '../lib/workspace.mjs';
import {treeHierarchyRoutes} from '../lib/tree-layout.mjs';
import {segmentHits} from '../lib/result-growth.mjs';
import {treeMap} from '../lib/additional-layouts.mjs';
const fixture=(count=200)=>{const nodes=new Map(),children=new Map();for(let i=0;i<count;i++){const id='n'+i,parent=i?'n'+Math.floor((i-1)/3):null;nodes.set(id,{id,parent,type:i?'feature':'root'});children.set(id,[]);if(parent)children.get(parent).push(id);}return {root:'n0',nodes,children};};
test('Tree keeps a broad shallow inventory from becoming one flattened strip',()=>{
 const nodes=new Map(),children=new Map(),add=(id,parent)=>{nodes.set(id,{id,parent,type:parent?'feature':'root'});children.set(id,[]);if(parent)children.get(parent).push(id);};
 add('root',null);add('inventory','root');for(let i=0;i<24;i++){add('branch'+i,'inventory');for(let j=0;j<5;j++)add(`leaf${i}-${j}`,'branch'+i);}
 const map={root:'root',nodes,children},positions=layoutMap(map,'tree'),boxes=Object.values(positions),width=Math.max(...boxes.map(p=>p.x+p.width))-Math.min(...boxes.map(p=>p.x)),height=Math.max(...boxes.map(p=>p.y+p.height))-Math.min(...boxes.map(p=>p.y));
 assert.ok(width/height<=4,`Tree is a flattened ${width.toFixed(0)} × ${height.toFixed(0)} strip`);
 assert.ok(width<=6000&&height<=6000,'Compact branching should not use a huge empty envelope');
 for(const [id,n]of nodes)if(n.parent)assert.ok(positions[id].y>=positions[n.parent].y+positions[n.parent].height+40);
});
test('Tree and Grid place every node without overlaps and preserve graph relationships',()=>{
 for(const layout of ['tree','grid']){const map=fixture(),edges=JSON.stringify([...map.children]),positions=layoutMap(map,layout);assert.equal(Object.keys(positions).length,200);for(const [id,p]of Object.entries(positions)){assert.ok([p.x,p.y,p.width,p.height].every(Number.isFinite));for(const [other,q]of Object.entries(positions))if(id!==other)assert.ok(p.x+p.width<=q.x||q.x+q.width<=p.x||p.y+p.height<=q.y||q.y+q.height<=p.y);}assert.equal(JSON.stringify([...map.children]),edges);assert.deepEqual(layoutMap(map,layout),positions);}
});
test('Tree has parent-child depth; Grid uses consistent scan rows and columns',()=>{
 const map=fixture(50),tree=layoutMap(map,'tree'),grid=layoutMap(map,'grid');for(const [id,n]of map.nodes)if(n.parent)assert.ok(tree[id].y>tree[n.parent].y);
 assert.ok(new Set(Object.values(grid).map(p=>p.x)).size>2);assert.ok(new Set(Object.values(grid).map(p=>p.y)).size>2);assert.notDeepEqual(tree,grid);assert.ok(LAYOUTS.includes('tree')&&LAYOUTS.includes('grid'));
});
test('new presets keep independent saved coordinates and return to the original layout',()=>{
 const map=fixture(20),ws=cleanWorkspace({layout:'horizontal',mapPositions:layoutMap(map,'horizontal'),mapCamera:{x:24,y:36,scale:.7},layouts:{horizontal:{positions:layoutMap(map,'horizontal'),camera:{x:24,y:36,scale:.7}}}}),original=structuredClone(ws.mapPositions);
 let next=switchLayout(ws,map,'tree');next.mapPositions.n4={...next.mapPositions.n4,x:12345};next=switchLayout(next,map,'grid');next=switchLayout(next,map,'tree');assert.equal(next.mapPositions.n4.x,12345);next=switchLayout(next,map,'horizontal');assert.deepEqual(next.mapPositions,original);assert.deepEqual(next.mapCamera,ws.mapCamera);
});
test('wrapped Tree families have clear shared trunks, including variable card sizes',()=>{
 const map=fixture(200),sizes=Object.fromEntries([...map.nodes.keys()].map((id,i)=>[id,{x:0,y:0,width:i%3?220:300,height:i%4?66:110}]));
 const positions=new Map(Object.entries(treeMap(map,sizes).positions));
 // Explicit Tidy accepts the actual retained rectangles rather than moving
 // existing anchors as part of an ordinary append.
 const routes=treeHierarchyRoutes(map,positions);assert.ok(routes.size>0);
 for(const [key,route]of routes){const [parent,child]=key.split('\0');assert.equal(map.nodes.get(child).parent,parent);for(const [id,p]of positions)if(id!==parent&&id!==child)for(let i=1;i<route.points.length;i++)assert.equal(segmentHits(route.points[i-1],route.points[i],p,6),false);}
});
