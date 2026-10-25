import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {organicMap,tidyOrganic} from '../lib/organic-layout.mjs';
import {explodedMap,explodedGroups,explodedPlate,shatteredMap} from '../lib/cluster-arrangements.mjs';
import {circularMap,spiralMap} from '../lib/shape-arrangements.mjs';
import {cleanWorkspace} from '../lib/workspace.mjs';
import {intersects,boundsOf} from '../lib/result-growth.mjs';
import {InvestigationStore} from '../lib/investigation.mjs';
const box=(x,y)=>({x,y,width:220,height:66});
function fixture(){const nodes=new Map([['core',{id:'core',type:'root'}]]),children=new Map();const add=(id,parent,type='feature')=>{nodes.set(id,{id,parent,type});children.set(parent,[...(children.get(parent)||[]),id]);};add('a','core');add('b','core');add('result','a','result');for(let i=0;i<12;i++)add(`finding${i}`,'result','finding');add('child','b');add('next','child','result');for(let i=0;i<4;i++)add(`direction${i}`,'next','direction');return {root:'core',nodes,children,edges:[]};}
test('Organic is an irregular collection of local fans, distinct from circle and spiral; anchors survive growth',()=>{
  const map=fixture(),before=structuredClone(map),r=organicMap(map),points=Object.values(r.positions);for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)assert.equal(intersects(points[i],points[j],32),false);
  assert.notDeepEqual(r.positions,circularMap(map).positions);assert.notDeepEqual(r.positions,spiralMap(map).positions);assert.deepEqual(map,before);const id='later';map.nodes.set(id,{id,parent:'b',type:'result'});map.children.get('b').push(id);const grown=organicMap(map,r.positions);for(const [key,p]of Object.entries(r.positions))assert.deepEqual(grown.positions[key],p);
  assert.deepEqual(tidyOrganic(map,grown.positions).positions,grown.positions);
});
test('Exploded uses recorded assemblies with persistent gaps and six-row aligned constituent racks',()=>{
  const map=fixture(),before=structuredClone(map),r=explodedMap(map),assemblies=r.assemblies;for(let i=0;i<assemblies.length;i++)for(let j=i+1;j<assemblies.length;j++)assert.equal(intersects(assemblies[i].bounds,assemblies[j].bounds,150),false);
  const {groups}=explodedGroups(map),result=[...groups.get('result')].filter(id=>id!=='result');assert.ok(new Set(result.map(id=>r.positions[id].x)).size>=2);assert.ok(boundsOf(result.map(id=>r.positions[id])).height<700);assert.deepEqual(map,before);assert.deepEqual(explodedMap(map,r.positions).positions,r.positions);
});
test('legacy Shattered identifiers retain the exact Chaotic arrangement and independent saved camera',()=>{const map=fixture(),positions=shatteredMap(map).positions,camera={x:7,y:11,scale:.95},ws=cleanWorkspace({shapeVersion:3,layout:'shattered',mapPositions:positions,mapCamera:camera});assert.equal(ws.layout,'shattered');assert.deepEqual(ws.layouts.shattered,{positions,camera});assert.deepEqual(shatteredMap(map,ws.mapPositions).positions,positions);});

test('Exploded opens assemblies on both sides of the centered subject with parts extending outward',()=>{
  const map=fixture(),r=explodedMap(map);assert.equal(r.positions.core.x+r.positions.core.width/2,0);assert.equal(r.positions.core.y+r.positions.core.height/2,0);
  const parts=r.assemblies.filter(a=>a.id!=='core');assert.ok(parts.some(a=>a.bounds.x+a.bounds.width<0));assert.ok(parts.some(a=>a.bounds.x>0));
  for(const a of parts){const root=r.positions[a.id];assert.equal(root.x,a.bounds.x);}
  const saved={...r.positions,omitted:{x:9999,y:7777,width:220,height:66}};assert.deepEqual(explodedMap(map,saved).positions.omitted,saved.omitted);
});
test('store recovers former Radial as Organic once, without rewriting records or overriding current layout work',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-organic-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new InvestigationStore(root),s=await store.create(),historic={positions:{core:box(0,0),old:box(700,-300)},camera:{x:14,y:19,scale:.4}};
  s.workspace={layout:'radial',mapPositions:historic.positions,mapCamera:historic.camera,layouts:{radial:historic}};await fs.writeFile(path.join(store.directory(s.id),'investigation.json'),JSON.stringify(s));const modern=cleanWorkspace({shapeVersion:3,layout:'radial',mapPositions:{core:box(-110,-33)},mapCamera:{x:44,y:55,scale:.9},layouts:{radial:{positions:{core:box(-110,-33)},camera:{x:44,y:55,scale:.9}}}});await fs.writeFile(path.join(store.directory(s.id),'workspace.json'),JSON.stringify({workspace:modern,draft:'Retain draft'}));const raw=await fs.readFile(path.join(store.directory(s.id),'investigation.json'),'utf8');const loaded=await store.read(s.id);assert.deepEqual(loaded.workspace.layouts.organic,historic);assert.deepEqual(loaded.workspace.layouts.radial,modern.layouts.radial);assert.equal(loaded.draft,'Retain draft');assert.equal(await fs.readFile(path.join(store.directory(s.id),'investigation.json'),'utf8'),raw);
  loaded.workspace.layouts.organic.positions.old.x=900;await store.updateWorkspace(s.id,{workspace:loaded.workspace});assert.equal((await store.read(s.id)).workspace.layouts.organic.positions.old.x,900);
});

test('Exploded distributes six recorded assemblies above, beside and below the centered subject',()=>{
 const nodes=new Map([['core',{id:'core',type:'root'}]]),children=new Map([['core',[]]]);for(let i=0;i<6;i++){const id=`part${i}`;nodes.set(id,{id,parent:'core',type:'result'});children.get('core').push(id);children.set(id,[]);for(let j=0;j<5;j++){const key=`${id}:${j}`;nodes.set(key,{id:key,parent:id,type:'finding'});children.get(id).push(key);}}
 const map={root:'core',nodes,children,edges:[]},r=explodedMap(map),parts=r.assemblies.filter(a=>a.id!=='core');assert.equal(parts.length,6);
 for(const side of [-1,1]){const family=parts.filter(a=>Math.sign(a.bounds.x+a.bounds.width/2)===side);assert.equal(family.length,3);assert.ok(family.some(a=>a.bounds.y+a.bounds.height<0));assert.ok(family.some(a=>a.bounds.y<0&&a.bounds.y+a.bounds.height>0));assert.ok(family.some(a=>a.bounds.y>0));}
});

test('Exploded keeps nested feature families together and spaces the perspective envelopes',()=>{
 const map=fixture(),{groups}=explodedGroups(map),r=explodedMap(map);assert.ok(groups.get('b').has('child'));assert.equal(groups.has('child'),false);const parts=r.assemblies.filter(a=>a.id!==map.root);for(let i=0;i<parts.length;i++)for(let j=i+1;j<parts.length;j++)assert.equal(intersects(explodedPlate(parts[i].bounds).bounds,explodedPlate(parts[j].bounds).bounds,20),false);
});
