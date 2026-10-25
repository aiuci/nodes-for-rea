import test from 'node:test';import assert from 'node:assert/strict';
import {activeSavedStep,applicationFeatureStep,savedStepState} from '../lib/saved-step-state.mjs';
const id='direction:old:0',spec={request:'Analyze the application bundle for user-facing workflows.'};
function view(){return {state:{id:'investigation',attempts:[]},runStatusOwner:{investigationId:'investigation',nodeId:id},stepRun:{phase:'preparing',dispatched:0,completed:0},starting:true,busy:false};}
test('pending, dispatched, cancellation and terminal states never imply an answer before it exists',()=>{
 const v=view();assert.equal(savedStepState(v,id,spec).state,'pending');v.starting=false;v.busy=true;assert.equal(savedStepState(v,id,spec).state,'pending');v.stepRun={phase:'current',dispatched:1,completed:0};assert.equal(savedStepState(v,id,spec).state,'running');v.stepRun.cancelled=true;assert.equal(savedStepState(v,id,spec).state,'stopping');v.busy=false;v.stepRun=null;v.state.attempts=[{nodeId:id,question:spec.request,status:'continue',resultId:'new'}];assert.equal(savedStepState(v,id,spec).state,'saved');
 for(const [status,expected]of [['failed','failed'],['blocked','blocked'],['stopped','stopped']]){v.state.attempts[0]={nodeId:id,question:spec.request,status};assert.equal(savedStepState(v,id,spec).state,expected);}
});
test('another selected node or investigation cannot claim the active operation',()=>{const v=view();assert.equal(activeSavedStep(v,'direction:other:0'),false);v.state.id='different';assert.equal(activeSavedStep(v,id),false);assert.equal(savedStepState(v,id,spec).state,'idle');});
test('Explore features requires application-code provenance and feature/workflow intent',()=>{
 const state={targets:[{inspectionTarget:{targetType:'javascript'}}],evidence:[{id:'manifest',kind:'artifact-manifest'}]},item={message:{claims:[{state:'observed',evidenceId:'manifest',quote:'"framework": "electron"'}]}};
 assert.equal(applicationFeatureStep(state,item,spec),true);assert.equal(applicationFeatureStep(state,item,{request:'Trace allocation addresses'}),false);assert.equal(applicationFeatureStep({...state,evidence:[]},item,spec),false);assert.equal(applicationFeatureStep(state,{message:{claims:[{...item.message.claims[0],state:'inferred'}]}},spec),false);assert.equal(applicationFeatureStep({...state,targets:[]},item,spec),false);
});
test('a failed repeat overrides an earlier saved step without rewriting records',()=>{const v=view();v.starting=false;v.lastStepOutcome={...v.runStatusOwner,request:spec.request,status:'failed'};const before=JSON.stringify(v.state);assert.equal(savedStepState(v,id,spec).state,'failed');assert.equal(JSON.stringify(v.state),before);v.lastStepOutcome.nodeId='another';assert.equal(savedStepState(v,id,spec).state,'idle');});
