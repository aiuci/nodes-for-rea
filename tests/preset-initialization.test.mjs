import test from 'node:test';
import assert from 'node:assert/strict';
import {tidyWorkspace} from '../ui/tidy-controls.js';
import {layoutMap} from '../lib/map-layouts.mjs';
import {cleanWorkspace} from '../lib/workspace.mjs';

function fixture(layout='radial'){
  const nodes=new Map([['core',{id:'core',type:'root'}],['a',{id:'a',type:'feature',parent:'core'}],['b',{id:'b',type:'feature',parent:'core'}],['r',{id:'r',type:'result',parent:'a'}]]),children=new Map([['core',['a','b']],['a',['r']]]),map={root:'core',nodes,children};
  const positions=layoutMap(map,layout),camera={x:5,y:6,scale:.3},ws=cleanWorkspace({shapeVersion:3,layout,mapPositions:positions,mapCamera:camera,layouts:{[layout]:{positions,camera},manual:{positions:{core:{x:876,y:543,width:220,height:66}},camera:{x:9,y:8,scale:1.2}}}});
  const view={ws,camera:{...camera},map,points:new Map(Object.entries(positions)),notices:[],saves:0,shownMap:()=>map,cancelFocusMotion(){},radialMenu:null,mapArea:()=>({x:20,y:30,width:900,height:650}),draw(){this.points=new Map(Object.entries(this.ws.mapPositions));},applyCamera(){},saveCamera(){this.ws.mapCamera={...this.camera};},persist(){this.saves++;},fit(){this.fitCalled=true;},actions:{notify:text=>view.notices.push(text)}};
  return view;
}
test('virgin initialization reuses Tidy routing/framing without inventing Undo or altering other saved layouts',()=>{
  for(const layout of ['radial','orbit','river','honeycomb']){const view=fixture(layout),manual=structuredClone(view.ws.layouts.manual);tidyWorkspace(view,{initial:true});assert.ok(view.ws.tidiedLayouts.includes(layout));assert.equal(view.camera.scale,.9);assert.equal(view.ws.arrangeUndo,null);assert.deepEqual(view.notices,[]);assert.deepEqual(view.ws.layouts.manual,manual);assert.ok(view.saves>0);}
});
test('explicit Tidy retains Undo and notification behavior',()=>{
  const view=fixture(),before=structuredClone(view.ws.mapPositions);tidyWorkspace(view);assert.deepEqual(view.ws.arrangeUndo.positions,before);assert.equal(view.ws.arrangeUndo.layout,'radial');assert.equal(view.notices.length,1);
});
test('initializing a new preset beside a reader preserves ownership; explicit Tidy still refuses during reading',()=>{
  const view=fixture(),reader={nodeId:'r',returnContext:{layout:'manual',inspected:'a'}};view.ws.reader=structuredClone(reader);tidyWorkspace(view);assert.equal(view.saves,0);tidyWorkspace(view,{initial:true});assert.deepEqual(view.ws.reader,reader);assert.equal(view.camera.scale,.9);assert.equal(view.ws.arrangeUndo,null);
});
