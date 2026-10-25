import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultControls,cleanControls,controlLeaves,detachControl,snapControlGroup,redockControlGroup,redockAllControls,controlTreeSize,placeControlRect,controlRectsOverlap,nearestControlSnap} from '../lib/magnetic-controls.mjs';
test('dock defaults and corrupted preferences retain each real module exactly once',()=>{
 assert.deepEqual(cleanControls(null),defaultControls());
 const state=cleanControls({version:1,dock:['navigation','fake','themes'],groups:[{tree:{axis:'x',children:['themes','layouts','navigation']},x:NaN}]});
 assert.deepEqual([...state.dock,...state.groups.flatMap(g=>controlLeaves(g.tree))].sort(),['layouts','navigation','themes']);
 assert.equal(state.groups[0].x,8);assert.deepEqual(cleanControls(JSON.parse(JSON.stringify(state))),state);
});
test('all four magnetic directions preserve order, group ownership and source state',()=>{
 for(const side of ['left','right','top','bottom']){
  const first=detachControl(defaultControls(),'navigation',{x:20,y:30}),second=detachControl(first.state,'themes',{x:500,y:30}),before=structuredClone(second.state);
  const result=snapControlGroup(second.state,second.groupId,'navigation',side),tree=result.groups[0].tree;
  assert.equal(tree.axis,['left','right'].includes(side)?'x':'y');assert.deepEqual(controlLeaves(tree),['left','top'].includes(side)?['themes','navigation']:['navigation','themes']);assert.equal(result.groups.length,1);assert.deepEqual(second.state,before);
  const detached=detachControl(result,'themes',{x:200,y:100});assert.equal(detached.state.groups.length,2);assert.deepEqual(detached.state.groups.map(g=>controlLeaves(g.tree)).flat().sort(),['navigation','themes']);
 }
});
test('nested docking measures orientation and redocks modules without duplication',()=>{
 let a=detachControl(defaultControls(),'navigation'),b=detachControl(a.state,'themes'),c=detachControl(b.state,'layouts');let state=snapControlGroup(c.state,b.groupId,'navigation','bottom');state=snapControlGroup(state,c.groupId,'themes','right');
 const g=state.groups[0],size=controlTreeSize(g.tree,{navigation:{width:100,height:40},themes:{width:120,height:40},layouts:{width:200,height:80}});
 assert.deepEqual(size,{width:326,height:126});const docked=redockControlGroup(state,g.id);assert.deepEqual(docked.groups,[]);assert.equal(new Set(docked.dock).size,3);assert.equal(redockAllControls(c.state).dock.length,3);
});
test('snap previews require a nearby valid edge and distinguish all four sides',()=>{
 const target={module:'themes',x:200,y:200,width:100,height:40};
 for(const [side,x,y]of [['left',94,200],['right',306,200],['top',200,154],['bottom',200,246]])assert.equal(nearestControlSnap({x,y,width:100,height:40},[target]).side,side);
 assert.equal(nearestControlSnap({x:0,y:0,width:100,height:40},[target]),null);
});
test('shared collision geometry keeps preferred rectangles inside a resized viewport',()=>{
 const viewport={width:390,height:400},occupied=[{x:8,y:8,width:200,height:70}],placed=placeControlRect({x:800,y:-200},{width:160,height:60},viewport,occupied);
 assert.ok(placed.x>=8&&placed.y>=8&&placed.x+placed.width<=382&&placed.y+placed.height<=392);assert.equal(controlRectsOverlap(placed,occupied[0]),false);
});
