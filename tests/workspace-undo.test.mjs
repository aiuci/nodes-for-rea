import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceUndo,WORKSPACE_EDIT_FIELDS} from '../lib/workspace-undo.mjs';
import {controlPanelHeight} from '../lib/magnetic-controls.mjs';
const snapshot=(x=0)=>({workspace:{layout:'manual',mapPositions:{a:{x,y:0}},layouts:{manual:{positions:{a:{x,y:0}},camera:{x:0,y:0,scale:1}}},hidden:[],collapsed:[]},camera:{x:0,y:0,scale:1},controls:{dock:['navigation']},theme:'reference',navigation:{autoFollow:false,minimap:false}});
test('workspace history reverses independent move, visibility and appearance edits in order and redoes them',()=>{
 const h=createWorkspaceUndo(),a=snapshot(),b=snapshot(40),c=structuredClone(b);c.workspace.hidden=['a'];const d=structuredClone(c);d.theme='sunburst';h.reset(a);h.observe(b);h.observe(c);h.observe(d);assert.equal(h.count,3);
 assert.deepEqual(h.undo(),c);assert.deepEqual(h.undo(),b);assert.deepEqual(h.undo(),a);assert.equal(h.canUndo,false);assert.deepEqual(h.redo(),b);assert.deepEqual(h.redo(),c);assert.deepEqual(h.redo(),d);
});
test('camera-only navigation does not create undo entries; a fresh edit discards redo',()=>{
 const h=createWorkspaceUndo(),a=snapshot();h.reset(a);const pan=structuredClone(a);pan.camera.x=400;pan.workspace.layouts.manual.camera.x=400;assert.equal(h.observe(pan),false);assert.equal(h.canUndo,false);
 const moved=snapshot(20);h.observe(moved);assert.deepEqual(h.undo(),pan);assert.ok(h.canRedo);h.observe(snapshot(80));assert.equal(h.canRedo,false);
});
test('one synchronous layout command can merge its intermediate arrangement saves; journal is bounded and isolated',()=>{
 const h=createWorkspaceUndo({limit:2});h.reset(snapshot());const a=snapshot(10);h.observe(a);a.workspace.mapPositions.a.x=999;h.observe(snapshot(20),{merge:true});assert.equal(h.count,1);assert.equal(h.undo().workspace.mapPositions.a.x,0);h.redo();h.observe(snapshot(30));h.observe(snapshot(40));assert.equal(h.count,2);h.reset(snapshot(100));assert.equal(h.canUndo,false);assert.equal(h.canRedo,false);
});
test('journal field contract excludes research, provider work, document binding and drafts',()=>{
 for(const key of ['messages','evidence','targets','attempts','draft','draftContext','document','id','recommendation'])assert.ok(!WORKSPACE_EDIT_FIELDS.includes(key));
});
test('dock minimum preserves natural content and padding, grows freely within viewport and clamps saved undersized preferences',()=>{
 assert.equal(controlPanelHeight(20,110,400),110);assert.equal(controlPanelHeight(250,110,400),250);assert.equal(controlPanelHeight(500,110,400),400);assert.equal(controlPanelHeight(80,80,400),104);assert.equal(controlPanelHeight(20,200,90),90);
});
