import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {cleanPanelLayout,panelRectangle,availableMapArea} from '../lib/panel-layout.mjs';
import {cleanWorkspace} from '../lib/workspace.mjs';
import {serializeWorkspaceMap} from '../lib/workspace-map.mjs';
import {InvestigationStore} from '../lib/investigation.mjs';
import {exportInvestigation,importInvestigation} from '../lib/archive.mjs';

test('panel preferences sanitize invalid data while preserving valid geometry',()=>{
  assert.deepEqual(cleanPanelLayout(null),{dock:'floating',floating:null,bottomHeight:320});assert.equal(cleanPanelLayout({dock:'unknown',floating:{x:NaN}}).floating,null);
  const saved={dock:'bottom',bottomHeight:440,floating:{x:22,y:33,width:600,height:500}};assert.deepEqual(cleanWorkspace({panel:saved}).panel,saved);assert.deepEqual(cleanPanelLayout(saved),saved);
  const bad=cleanPanelLayout({dock:'bottom',bottomHeight:Infinity,floating:{x:-20,y:1e8,width:-5,height:1e8}});assert.equal(bad.bottomHeight,320);assert.equal(bad.floating.x,0);assert.equal(bad.floating.height,4000);
});
test('Expand keeps a sanitized restorable floating size through workspace persistence',()=>{const prior={x:40,y:50,width:420,height:300},panel={dock:'floating',floating:{x:8,y:8,width:1400,height:700},bottomHeight:320,expandedFrom:prior};assert.deepEqual(cleanWorkspace({panel}).panel.expandedFrom,prior);assert.deepEqual(cleanPanelLayout(cleanPanelLayout(panel)).expandedFrom,prior);assert.equal(cleanPanelLayout({expandedFrom:{x:NaN}}).expandedFrom,undefined);});
test('floating panels remain reachable after viewport shrink without overwriting saved geometry',()=>{
  const pref={floating:{x:950,y:600,width:700,height:650}},before=structuredClone(pref);
  for(const viewport of [{width:1400,height:900},{width:320,height:400},{width:180,height:200}]){const r=panelRectangle(pref,viewport);assert.ok(r.x>=0&&r.y>=0);assert.ok(r.x+r.width<=viewport.width&&r.y+r.height<=viewport.height);}
  assert.deepEqual(pref,before);assert.equal(panelRectangle(pref,{width:1800,height:1400}).x,950);
});
test('bottom panel resizes upward with its lower edge anchored and leaves map height',()=>{
  const viewport={width:1200,height:800},short=panelRectangle({dock:'bottom',bottomHeight:280},viewport),tall=panelRectangle({dock:'bottom',bottomHeight:500},viewport);assert.equal(short.y+short.height,tall.y+tall.height);assert.equal(short.width,1184);assert.ok(tall.y<short.y);const area=availableMapArea(viewport,tall,'bottom');assert.equal(area.width,1200);assert.ok(area.height<tall.y);
});
test('map fitting chooses a usable region beside left or right floating panels',()=>{
  const v={width:1200,height:700};assert.deepEqual(availableMapArea(v,null),{x:0,y:0,...v});
  const left=availableMapArea(v,{x:8,y:24,width:350,height:650}),right=availableMapArea(v,{x:830,y:24,width:350,height:650});assert.ok(left.x>350);assert.equal(right.x,0);assert.ok(right.width<=830);
});
test('panel dock and geometry survive saved reopen and portable export/import with draft and evidence intact',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-panel-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new InvestigationStore(path.join(root,'data')),state=await store.create();state.messages=[{id:'a',role:'assistant',overview:'Saved result',findings:[]}];await store.save(state);
  const panel={dock:'bottom',bottomHeight:440,floating:{x:120,y:80,width:640,height:500}};await store.updateWorkspace(state.id,{workspace:{...state.workspace,panel},draft:'Keep this question',draftContext:{featureName:'Export',messageId:'a',nodeId:'turn:a'}});const read=await store.read(state.id);assert.deepEqual(read.workspace.panel,panel);assert.deepEqual(serializeWorkspaceMap(read).panel,panel);
  await fs.mkdir(path.join(root,'exports'));const folder=await exportInvestigation(store,state.id,path.join(root,'exports'),{}),imported=await importInvestigation(new InvestigationStore(path.join(root,'imported')),folder);assert.deepEqual(imported.state.workspace.panel,panel);assert.equal(imported.state.draft,'Keep this question');assert.equal(imported.state.draftContext.nodeId,'turn:a');assert.deepEqual(imported.state.messages,read.messages);assert.deepEqual(imported.state.evidence,read.evidence);
});
