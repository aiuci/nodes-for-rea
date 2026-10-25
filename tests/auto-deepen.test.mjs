import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {normalizeStepLimit,createStepRun,stepProgress,resultSnapshot,newSavedResult}=await import('../lib/auto-deepen.mjs');
test('all supported limits; defensive numeric normalization; no coercion of other types',()=>{
 for(let i=1;i<=20;i++)assert.equal(normalizeStepLimit(i),i);
 for(const value of [undefined,null,'','  ','bad',NaN,Infinity,-Infinity,true,false,[],[7],{},()=>5])assert.equal(normalizeStepLimit(value),5,String(value));
 for(const [value,want]of [[0,1],[-2,1],[4.9,4],['19.9',19],[' 20 ',20],[99,20],[-.2,1]])assert.equal(normalizeStepLimit(value),want);
});
test('preparation consumes zero dispatches; new saved result counted only once, never old/blocked/idempotent',()=>{
 const run=createStepRun(20);run.current=1;assert.match(stepProgress(run),/^Preparing step 1 of at most 20 · 0 dispatched · 0 completed$/);
 const state={status:'saved',messages:[{id:'old',role:'assistant'}],attempts:[{resultId:'known'}]},before=resultSnapshot(state);
 for(const id of ['old','known'])assert.equal(newSavedResult({...state,messages:[{id,role:'assistant'}]},before),null);
 const next={...state,messages:[...state.messages,{id:'new',role:'assistant'}]};assert.equal(newSavedResult(next,before).id,'new');assert.equal(newSavedResult(next,resultSnapshot(next)),null);assert.equal(newSavedResult({...next,status:'blocked'},before),null);
 run.phase='current';run.dispatched=1;assert.match(stepProgress(run),/^Step 1.*1 dispatched · 0 completed$/);run.current=null;run.completed=1;assert.match(stepProgress(run,'Stopped by you.'),/^Stopped by you. · Maximum 20 · 1 dispatched · 1 completed$/);
});
test('installed workspace and global control agree with shared invariant while legacy depth10 survives',async()=>{
 const {cleanWorkspace}=await import('../lib/workspace.mjs');
 assert.equal(cleanWorkspace({}).depthLimit,5);assert.equal(cleanWorkspace({depthLimit:10}).depthLimit,10);assert.equal(cleanWorkspace({depthLimit:19.9}).depthLimit,19);assert.equal(cleanWorkspace({depthLimit:50}).depthLimit,20);
 const html=await fs.readFile(new URL('../ui/index.html',import.meta.url),'utf8');assert.match(html,/id="depth-limit" type="range" min="1" max="20" step="1" value="5"/);
});
