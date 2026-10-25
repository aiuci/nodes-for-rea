import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeStatus,nodeStatusMarker} from '../ui/node-status.js';

test('compact state markers flag consequential limitations without marking ordinary saved outcomes',()=>{
  assert.deepEqual(nodeStatusMarker('running attempt'),{symbol:'•',tone:'active'});
  for(const status of ['Findings · further work blocked','Blocked attempt','Failed attempt','stopped attempt','Evidence boundary · not runnable','Supported limitation'])assert.deepEqual(nodeStatusMarker(status),{symbol:'!',tone:'attention'},status);
  for(const status of ['Proposed · not discovered','Inferred · needs verification','Unverified finding','Open question'])assert.deepEqual(nodeStatusMarker(status),{symbol:'?',tone:'uncertain'},status);
  for(const status of ['Source','Supported finding','Supported findings','Question complete','Saved answer','Discovered · not investigated','Recommended next','Earlier suggestion','Feature map updated'])assert.equal(nodeStatusMarker(status),null,status);
});

test('shared disclosures preserve evidence wording and counts without changing the map or research',()=>{
  const nodes=new Map([['core',{id:'core',type:'root'}],['f',{id:'f',type:'feature',row:{name:'Candidate',evidenceBasis:'proposed'}}]]),view={map:{root:'core',nodes,children:new Map([['core',['f']]])},state:{messages:[],attempts:[]},ws:{growth:[]},isCurrentDirection:()=>true};
  const original=structuredClone(view.state),map=structuredClone(nodes);
  assert.equal(nodeStatus(view,nodes.get('core')),'Start here · 0 discovered');
  assert.equal(nodeStatus(view,nodes.get('f')),'Proposed · not discovered');
  assert.equal(nodeStatus(view,{id:'c',type:'constraint'}),'Evidence boundary · not runnable');
  assert.equal(nodeStatus(view,{id:'g',type:'finding',supported:false,finding:{change:'gap'}}),'Unknown');
  assert.equal(nodeStatus(view,{id:'g',type:'finding',supported:true,finding:{change:'gap'}}),'Unknown');
  assert.equal(nodeStatus(view,{id:'a',type:'attempt',attempt:{status:'stopped'}}),'stopped attempt');
  assert.deepEqual(view.state,original);assert.deepEqual(nodes,map);
});
