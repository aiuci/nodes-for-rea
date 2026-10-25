import test from 'node:test';
import assert from 'node:assert/strict';
import {outlineRows,revealOutlinePaths} from '../lib/outline-state.mjs';
import {cleanWorkspace} from '../lib/workspace.mjs';
const fixture=()=>({root:'core',nodes:new Map([['core',{id:'core'}],['branch',{id:'branch',parent:'core'}],['result',{id:'result',parent:'branch'}],['finding',{id:'finding',parent:'result'}],['other',{id:'other',parent:'core'}]]),children:new Map([['core',['branch','other']],['branch',['result']],['result',['finding']]])});
test('new sidebar paths reveal through folded ancestors without changing map folds or hiding work',()=>{
  const map=fixture(),workspace=cleanWorkspace({collapsed:['branch','result'],hidden:['finding']});assert.deepEqual(outlineRows(map,workspace).map(n=>n.id),['core','branch','other']);
  assert.equal(revealOutlinePaths(workspace,map,['result','finding']),true);assert.deepEqual(workspace.collapsed,['branch','result']);assert.deepEqual(workspace.hidden,['finding']);assert.equal(outlineRows(map,workspace).length,5);assert.equal(revealOutlinePaths(workspace,map,['finding']),false);
});
test('sidebar projection stays complete despite a stale global search query, while explicit folds still work',()=>{
  const map=fixture(),workspace=cleanWorkspace({search:'unrelated',collapsed:['branch']});assert.equal(outlineRows(map,workspace).length,3);revealOutlinePaths(workspace,map,['finding']);assert.equal(outlineRows(map,workspace).length,5);workspace.outlineExpanded=[];assert.equal(outlineRows(map,workspace).length,3);
});
test('follow defaults on, explicit off and sidebar reveals survive sanitization independently of reader return',()=>{
  assert.equal(cleanWorkspace().outlineFollow,true);const w=cleanWorkspace({outlineFollow:false,outlineExpanded:['branch','branch',null],reader:{nodeId:'result',returnContext:{inspected:'branch',outline:true}}});assert.equal(w.outlineFollow,false);assert.deepEqual(w.outlineExpanded,['branch']);assert.equal(Object.hasOwn(w.reader.returnContext,'outlineFollow'),false);
});
