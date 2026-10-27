// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {visibleMap} from '../lib/workspace-map.mjs';
import {executionFocusCamera} from '../lib/execution-focus.mjs';
// WorkspaceView's module imports initialize DOM-only legacy UI. Exercise its
// actual method body with the actual path helper and visibility projection.
const growing=await fs.readFile(new URL('../ui/growing-map.js',import.meta.url),'utf8');
const workspace=await fs.readFile(new URL('../ui/workspace-view.js',import.meta.url),'utf8');
const revealMapPath=new Function('return '+growing.match(/export (function revealMapPath[^\r\n]+)/)[1])();
const method=workspace.slice(workspace.indexOf('  focusExecutionNode(id,options={}){'),workspace.indexOf('  focusMapNode(id){'));
const focus=new Function('revealMapPath','executionFocusCamera','return ({'+method+'}).focusExecutionNode;')(revealMapPath,executionFocusCamera);
function fixture({hidden=[],collapsed=[]}={}){
 const entries=[['core',{id:'core',type:'root'}],['parent',{id:'parent',type:'feature',parent:'core'}],['active',{id:'active',type:'feature',parent:'parent'}],['child',{id:'child',type:'finding',parent:'active'}],['other',{id:'other',type:'feature',parent:'core'}]];
 const map={root:'core',nodes:new Map(entries),children:new Map([['core',['parent','other']],['parent',['active']],['active',['child']],['child',[]],['other',[]]]),edges:[{from:'core',to:'parent'},{from:'parent',to:'active'},{from:'active',to:'child'},{from:'core',to:'other'}]},positions=Object.fromEntries(entries.map(([id],index)=>[id,{x:index*20,y:index*20,width:220,height:66}]));let draws=0,animations=0;
 const view={map,ws:{hidden:[...hidden],collapsed:[...collapsed],expanded:['parent','active'],inspected:'other',mapPositions:structuredClone(positions)},state:{draft:'Keep typed draft',draftContext:{nodeId:'other'}},camera:{x:100,y:100,scale:1},mapArea:()=>({x:0,y:0,width:1000,height:800}),points:new Map(),draw(){draws++;this.points=new Map([...visibleMap(map,this.ws).nodes.keys()].map(id=>[id,this.ws.mapPositions[id]]));},animateCamera(){animations++;return Promise.resolve(true);}};view.draw();draws=0;
 return {view,get draws(){return draws;},get animations(){return animations;}};
}
test('already-readable collapsed active node keeps its children folded without redraw or camera motion',async()=>{
 const f=fixture({collapsed:['active']}),before=structuredClone({ws:f.view.ws,state:f.view.state,camera:f.view.camera}),visible=[...visibleMap(f.view.map,f.view.ws).nodes.keys()];assert.equal(await focus.call(f.view,'active',{idleReturn:true,duration:4000}),true);assert.deepEqual([...visibleMap(f.view.map,f.view.ws).nodes.keys()],visible);assert.deepEqual({ws:f.view.ws,state:f.view.state,camera:f.view.camera},before);assert.equal(f.draws,0);assert.equal(f.animations,0);
});
test('idle reveal opens necessary hidden/collapsed ancestors and unhides active while keeping its children folded',async()=>{
 const f=fixture({hidden:['parent','active','other'],collapsed:['parent','active','other']}),before=structuredClone({positions:f.view.ws.mapPositions,selection:f.view.ws.inspected,draft:f.view.state});assert.equal(visibleMap(f.view.map,f.view.ws).nodes.has('active'),false);assert.equal(await focus.call(f.view,'active',{idleReturn:true,duration:4000}),true);const shown=visibleMap(f.view.map,f.view.ws);assert.equal(shown.nodes.has('active'),true);assert.equal(shown.nodes.has('child'),false);assert.equal(shown.nodes.has('other'),false);assert.deepEqual(f.view.ws.collapsed,['active','other']);assert.deepEqual(f.view.ws.hidden,['other']);assert.deepEqual({positions:f.view.ws.mapPositions,selection:f.view.ws.inspected,draft:f.view.state},before);assert.equal(f.draws,1);assert.equal(f.animations,0);
});
test('ordinary explicit path reveal retains its established target-unfolding behavior',()=>{
 const f=fixture({hidden:['parent','active'],collapsed:['parent','active']});revealMapPath(f.view,'active');assert.equal(visibleMap(f.view.map,f.view.ws).nodes.has('child'),true);assert.deepEqual(f.view.ws.hidden,[]);assert.deepEqual(f.view.ws.collapsed,[]);
});
