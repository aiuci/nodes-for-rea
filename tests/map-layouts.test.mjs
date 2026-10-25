import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LAYOUTS,cleanWorkspace,workspacePatch} from '../lib/workspace.mjs';
import {layoutMap,switchLayout} from '../lib/map-layouts.mjs';
import {workspaceMap,visibleMap,branchStats,serializeWorkspaceMap} from '../lib/workspace-map.mjs';
import {InvestigationStore} from '../lib/investigation.mjs';
import {exportInvestigation,importInvestigation} from '../lib/archive.mjs';

function fixture(count=80) {
  const features=[{name:'Export'},...Array.from({length:count},(_,i)=>({name:`Format ${i}`,parentName:'Export'})),{name:'History'}];
  return {title:'Known inventory',targets:[],evidence:[],messages:[{id:'discovery',role:'assistant',features},{id:'a',role:'assistant',branchFeatureName:'Format 0',findings:[{question:'Supported?',finding:'Source description only.'}]}]};
}
function overlaps(a,b) {return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}

test('all arrangements preserve every node identity and place a large inventory without overlapping cards',()=>{
  const state=fixture(),before=structuredClone(state),map=workspaceMap(state),geometries=[];
  for(const layout of LAYOUTS) {
    const points=layoutMap(map,layout);assert.deepEqual(new Set(Object.keys(points)),new Set(map.nodes.keys()));
    const entries=Object.entries(points);
    for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++)assert.equal(overlaps(entries[i][1],entries[j][1]),false,`${layout}: ${entries[i][0]} / ${entries[j][0]}`);
    for(const p of Object.values(points)){assert.equal(p.width,220);assert.equal(p.height,66);assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));}
    geometries.push(JSON.stringify(points));
  }
  assert.equal(new Set(geometries.slice(0,4)).size,4);assert.deepEqual(state,before);
});
test('horizontal and vertical arrangements respect parent depth and options signature shares geometry',()=>{
  const map=workspaceMap(fixture(5)),horizontal=layoutMap(map,'horizontal'),vertical=layoutMap(map,{layout:'vertical',positions:{}});
  for(const node of map.nodes.values())if(node.parent){assert.ok(horizontal[node.id].x>horizontal[node.parent].x);assert.ok(vertical[node.id].y>vertical[node.parent].y);}
  assert.deepEqual(vertical,layoutMap(map,'vertical'));
});
test('every layout keeps established and manually moved anchors when nodes arrive or branches fold',()=>{
  for(const layout of LAYOUTS) {
    const state=fixture(8),map=workspaceMap(state),first=layoutMap(map,layout);first['feature:format 0']={x:3000,y:-300,width:220,height:66};
    state.messages.push({id:'later',role:'assistant',features:[{name:'New format',parentName:'Export'}]});
    const grown=workspaceMap(state),next=layoutMap(grown,{layout,positions:first,collapsed:['feature:export'],hidden:['feature:history']});
    for(const [id,p]of Object.entries(first))assert.deepEqual(next[id],p,`${layout}: ${id}`);
    assert.ok(next['feature:new format']);assert.ok(next['feature:history']);
  }
});
test('layout switching restores each arrangement and camera without changing selection, drafts or visibility',()=>{
  const map=workspaceMap(fixture(5));let ws=cleanWorkspace({inspected:'feature:format 0',group:'feature:export',outline:true,mapInitialized:true,hidden:['feature:history'],collapsed:['feature:export'],mapPositions:layoutMap(map),mapCamera:{x:28,y:-17,scale:.7}});
  ws.mapPositions['feature:format 0'].x=2400;const original=structuredClone(ws.mapPositions);
  ws=switchLayout(ws,map,'vertical');ws.mapPositions['feature:format 0'].y=1900;ws.mapCamera={x:51,y:93,scale:.85};const vertical=structuredClone(ws.mapPositions);
  ws=switchLayout(ws,map,'horizontal');assert.deepEqual(ws.mapPositions,original);assert.deepEqual(ws.mapCamera,{x:28,y:-17,scale:.7});
  assert.equal(ws.inspected,'feature:format 0');assert.deepEqual(ws.hidden,['feature:history']);assert.deepEqual(ws.collapsed,['feature:export']);assert.equal(ws.outline,true);
  ws=switchLayout(ws,map,'vertical');assert.deepEqual(ws.mapPositions,vertical);assert.deepEqual(ws.mapCamera,{x:51,y:93,scale:.85});
  const patch=workspacePatch({workspace:ws,draft:'Keep PNG destination',draftContext:{featureName:'Format 1',messageId:'discovery',nodeId:'feature:format 1'}},fixture(5));
  assert.equal(patch.draftContext.featureName,'Format 1');assert.equal(patch.workspace.inspected,'feature:format 0');
});
test('branch counts describe known discoveries and investigation independently of folding and hiding',()=>{
  const map=workspaceMap(fixture(18)),counts=branchStats(map,'feature:export');
  assert.equal(counts.discovered,19);assert.equal(counts.investigated,1);assert.equal(counts.findings,0);assert.equal(counts.openQuestions,1);assert.equal(counts.attempts,1);
  const folded=visibleMap(map,{collapsed:['feature:export'],hidden:['feature:history']});assert.ok(folded.nodes.size<map.nodes.size);
  assert.deepEqual(branchStats(map,'feature:export'),counts);assert.equal(branchStats(map,'core').discovered,20);
});
test('proposed and inferred candidates remain reachable without inflating discovered feature counts',()=>{
  const state=fixture(2);state.messages[0].features.push({name:'Imagined',evidenceBasis:'proposed'},{name:'Likely',evidenceBasis:'inferred'});
  state.messages.push({id:'proposal',role:'assistant',branchFeatureName:'Imagined',findings:[]});
  const map=workspaceMap(state),counts=branchStats(map,'core');
  assert.equal(counts.discovered,4);assert.equal(counts.investigated,1);assert.equal(counts.proposed,1);assert.equal(counts.inferred,1);assert.equal(counts.candidates,2);assert.equal(counts.totalFeatures,6);
  assert.ok(visibleMap(map).nodes.has('feature:imagined'));assert.ok(visibleMap(map).nodes.has('feature:likely'));
});
test('workspace sanitization handles malformed layout/reader state and preserves legacy anchors',()=>{
  const legacy=cleanWorkspace({mapPositions:{core:{x:8,y:12,width:230,height:110}},mapCamera:{x:5,y:6,scale:.06}});
  assert.equal(legacy.layout,'horizontal');assert.deepEqual(legacy.layouts.horizontal.positions,legacy.mapPositions);assert.equal(legacy.mapCamera.scale,.06);
  const ws=cleanWorkspace({layout:'invented',layouts:{radial:{positions:{core:{x:Infinity,y:3},good:{x:3,y:5,width:99999,height:0}},camera:{x:Infinity,y:4,scale:100}}},reader:{nodeId:'turn:a',returnContext:{inspected:'feature:export',layout:'vertical',camera:{x:9,y:8,scale:.9},nodeOpen:true,askOpen:true,outline:true,scroll:72,hidden:['feature:history'],collapsed:['feature:export']}}});
  assert.equal(ws.layout,'horizontal');assert.equal(ws.layouts.radial.positions.core,undefined);assert.equal(ws.layouts.radial.positions.good.width,600);assert.equal(ws.layouts.radial.camera.x,0);assert.equal(ws.layouts.radial.camera.scale,2.5);
  assert.deepEqual(ws.reader.returnContext,{inspected:'feature:export',group:'',layout:'vertical',camera:{x:9,y:8,scale:.9},nodeOpen:true,askOpen:true,outline:true,processMap:false,inventoryLimit:8,scroll:72,hidden:['feature:history'],collapsed:['feature:export']});
  assert.equal(cleanWorkspace({processMap:true,layouts:{horizontal:{camera:{x:1,y:2,scale:1}}},mapCamera:null}).mapCamera,null);
  const restored=cleanWorkspace({processMap:true,depthLimit:1,inventoryLimit:16,reader:{nodeId:'turn:a',returnContext:{processMap:true,inventoryLimit:16}}});
  assert.equal(restored.processMap,true);assert.equal(restored.reader.returnContext.processMap,true);assert.equal(restored.depthLimit,1);
  assert.equal(restored.inventoryLimit,16);assert.equal(restored.reader.returnContext.inventoryLimit,16);assert.equal(cleanWorkspace({inventoryLimit:Infinity}).inventoryLimit,10000);
  assert.equal(cleanWorkspace({reader:[]}).reader,null);assert.doesNotThrow(()=>cleanWorkspace({trail:[null,5,{}],layouts:[],mapPositions:[]}));
});
test('layout, outline, reader context and independent draft survive stale saves, reopen and portable archive',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-layouts-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new InvestigationStore(path.join(root,'data')),state=await store.create();Object.assign(state,fixture(8));await store.save(state);const stale=structuredClone(state),map=workspaceMap(state);
  let ws=cleanWorkspace({mapPositions:layoutMap(map),mapCamera:{x:1,y:2,scale:.8},inspected:'feature:format 0',outline:true});
  ws=switchLayout(ws,map,'radial');ws.reader={nodeId:'turn:a',returnContext:{inspected:'feature:format 0',group:'feature:export',layout:'radial',camera:{x:44,y:-12,scale:.9},nodeOpen:true,askOpen:false,outline:true,scroll:120,collapsed:['feature:history']}};
  await store.updateWorkspace(state.id,{workspace:ws,draft:'Keep asking Format 1',draftContext:{featureName:'Format 1',messageId:'discovery',nodeId:'feature:format 1'}});stale.status='saved';await store.save(stale);
  const read=await store.read(state.id);assert.equal(read.workspace.layout,'radial');assert.equal(read.workspace.reader.nodeId,'turn:a');assert.equal(read.workspace.reader.returnContext.scroll,120);assert.equal(read.draftContext.featureName,'Format 1');
  await fs.mkdir(path.join(root,'exports'));const folder=await exportInvestigation(store,state.id,path.join(root,'exports'),{}),imported=await importInvestigation(new InvestigationStore(path.join(root,'imported')),folder);
  assert.deepEqual(imported.state.workspace,read.workspace);assert.equal(imported.state.draftContext.featureName,'Format 1');
  const exported=serializeWorkspaceMap(read);assert.equal(exported.layout,'radial');assert.ok(exported.layouts.horizontal);assert.equal(exported.reader.nodeId,'turn:a');assert.equal(exported.nodes.length,map.nodes.size);
});


test('switching layouts through a folded projection preserves unseen manually positioned anchors',()=>{
  const map=workspaceMap(fixture(5));let ws=cleanWorkspace({layout:'manual',mapPositions:layoutMap(map,'manual'),mapCamera:{x:17,y:-42,scale:.9},collapsed:['feature:export']});
  const moved={x:4200,y:-870,width:220,height:66};ws.mapPositions['feature:format 2']=moved;
  const visible=visibleMap(map,ws),projection={...map,...visible,children:new Map([...map.children].map(([id,children])=>[id,children.filter(child=>visible.nodes.has(child))]))};
  ws=switchLayout(ws,projection,'horizontal');ws=switchLayout(ws,projection,'manual');
  assert.deepEqual(ws.mapPositions['feature:format 2'],moved);assert.deepEqual(ws.mapCamera,{x:17,y:-42,scale:.9});
  const restored=layoutMap(map,'manual',ws.mapPositions);assert.deepEqual(restored['feature:format 2'],moved);
});
test('legacy presentation migration marker survives store normalization and clears after recoverable manual backup',()=>{
  const legacy=cleanWorkspace({mapPositions:{core:{x:8,y:12,width:230,height:110}},mapCamera:{x:5,y:6,scale:.31}});
  assert.equal(legacy.legacyLayoutPending,true);assert.equal(cleanWorkspace(legacy).legacyLayoutPending,true);
  legacy.layouts.manual={positions:structuredClone(legacy.mapPositions),camera:legacy.mapCamera};legacy.layout='horizontal';legacy.mapPositions={};legacy.mapCamera=null;legacy.legacyLayoutPending=false;
  const migrated=cleanWorkspace(legacy);assert.equal(migrated.legacyLayoutPending,false);assert.equal(migrated.layouts.manual.positions.core.x,8);assert.equal(migrated.layouts.manual.camera.scale,.31);
  assert.equal(cleanWorkspace().legacyLayoutPending,false);
});
