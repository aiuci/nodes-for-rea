import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {classifyTarget} from '../lib/targets.mjs';
import {establishPurpose,purposeContext} from '../lib/purpose.mjs';
import {contextFor,planSchema} from '../lib/agent.mjs';
import {mechanismSchema} from '../lib/mechanisms.mjs';
import {InvestigationStore,Investigator} from '../lib/investigation.mjs';
import {workspaceMap,branchStats} from '../lib/workspace-map.mjs';
import {resultOutcome,featureOutcome} from '../lib/outcomes.mjs';
import {exportInvestigation,importInvestigation} from '../lib/archive.mjs';
import {investigationGraph} from '../lib/graph.mjs';
async function owned(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-correction-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
const binary=Buffer.concat([Buffer.from('MZ'),Buffer.alloc(128)]);
test('installed folder selects main binary, excludes helpers, retains component inventory; source roots stay source',async t=>{
  const root=await owned(t),app=path.join(root,'Owned App');await fs.mkdir(app);await fs.writeFile(path.join(app,'OwnedApp.EXE'),binary);await fs.writeFile(path.join(app,'unins000.exe'),binary);await fs.writeFile(path.join(app,'engine.dll'),binary);
  const target=await classifyTarget(app);assert.equal(target.kind,'artifact');assert.equal(target.targetType,'native');assert.equal(target.locator,app);assert.equal(target.root,path.join(app,'OwnedApp.EXE'));assert.ok(target.artifactCandidates.includes('engine.dll'));assert.ok(!target.artifactCandidates.includes('unins000.exe'));
  await fs.writeFile(path.join(app,'package.json'),'{}');assert.equal((await classifyTarget(app)).kind,'repository');
});
test('ambiguous folders request a meaningful choice rather than inspecting an arbitrary binary',async t=>{
  const root=await owned(t);await fs.writeFile(path.join(root,'A.exe'),binary);await fs.writeFile(path.join(root,'B.exe'),binary);await assert.rejects(classifyTarget(root),/several possible applications.*A.exe, B.exe/);
});
test('packaged Electron folder uses ASAR and records remaining components as uninspected',async t=>{
  const root=await owned(t);await fs.mkdir(path.join(root,'resources'));await fs.writeFile(path.join(root,'resources','app.asar'),'owned fixture');await fs.writeFile(path.join(root,'Shell.exe'),binary);const target=await classifyTarget(root);assert.equal(target.targetType,'javascript');assert.match(target.root,/app.asar$/);assert.match(target.limitations.join(' '),/Other components have not been inspected/);
});
test('purpose survives path-only entry, explicit refinement, ordinary questions, browsing and planning window limits',()=>{
  const state={messages:[],targets:[],evidence:[]};establishPurpose(state,'C:\\Program Files\\Owned App');assert.equal(purposeContext(state).current,'');establishPurpose(state,'My goal is to improve our REA wrapper using this reference.');const goal=purposeContext(state).current;
  state.messages.push({role:'user',text:'C:\\Program Files\\Owned App'});establishPurpose(state,'How does export work?');assert.equal(purposeContext(state).current,goal);
  state.selection={featureName:'History'};for(let i=0;i<20;i++)state.messages.push({role:'assistant',overview:'Other work'});assert.equal(contextFor(state).purpose,goal);
  establishPurpose(state,'Our goal now is to investigate privacy boundaries.');assert.match(purposeContext(state).current,/privacy/);assert.equal(state.purpose.history.length,2);assert.match(state.purpose.initialRequest,/Program Files/);
});
test('supported limitations count as knowledge and open questions, blocked zero-support attempts do not count as findings',()=>{
  const source={id:'e',text:'Only public data is available.'},claim={state:'observed',evidenceId:'e',quote:source.text};const state={evidence:[source],messages:[{id:'d',role:'assistant',features:[{name:'Export'}]},{id:'a',role:'assistant',branchFeatureName:'Export',claims:[claim],findings:[{question:'Private behavior?',finding:'Public access cannot establish it.',change:'gap',claimIndexes:[0]}],continuation:{status:'blocked'}},{id:'b',role:'assistant',branchFeatureName:'Export',findings:[{question:'Still unknown?',finding:'Unknown',change:'gap',claimIndexes:[]}],continuation:{status:'blocked'}}]};
  assert.equal(resultOutcome(state,state.messages[1]).label,'Findings · further work blocked');assert.equal(resultOutcome(state,state.messages[2]).label,'Blocked attempt');const stats=branchStats(workspaceMap(state),'core');assert.equal(stats.findings,1);assert.equal(stats.openQuestions,2);assert.equal(stats.attempts,2);
});
test('failed planned read reconsiders same scope, uses alternative and saves origin/purpose',async t=>{
  const root=await owned(t),source=path.join(root,'source');await fs.mkdir(source);await fs.writeFile(path.join(source,'main.js'),'export const supported = true;');const store=new InvestigationStore(path.join(root,'saved')),state=await store.create();let plans=0;
  const reasoning=async(_config,schema,input)=>{
    const prompt=JSON.parse(input);if(schema===planSchema){plans++;if(plans===2){assert.equal(prompt.remainingReads,2);assert.match(prompt.failedReads[0].error,/absent/);assert.match(prompt.context.purpose,/understand/);}return {reads:[{kind:'file',target:plans===1?'missing.js':'main.js'}]};}
    if(schema===mechanismSchema)return {mechanisms:[]};return {answer:'The retained code declares supported.',claims:[{text:'The code declares supported.',state:'observed',evidenceId:state.evidence.at(-1).id,quote:'supported = true'}],findings:[],features:[],recommendation:'',continuation:{status:'complete',reason:'The source answers this question.'}};
  };
  await new Investigator(store,{reasoning,config:{reaEnabled:false}}).turn(state,`"${source}"\nI want to understand supported.`,{nodeId:'core'});assert.equal(plans,2);assert.equal(state.attempts.length,1);assert.equal(state.attempts[0].status,'complete');assert.equal(state.messages.at(-1).attemptId,state.attempts[0].id);assert.match(state.messages.at(-1).purpose,/understand/);assert.equal((await store.read(state.id)).attempts[0].resultId,state.messages.at(-1).id);
});
test('failed intake retains a reachable attempt without manufacturing an answer or Play path',async t=>{
  const root=await owned(t),store=new InvestigationStore(path.join(root,'saved')),state=await store.create();let called=false;await assert.rejects(new Investigator(store,{config:{reaEnabled:false},reasoning:async()=>{called=true;}}).turn(state,`"${path.join(root,'missing')}"`,{nodeId:'core'}));assert.equal(called,false);const saved=await store.read(state.id),map=workspaceMap(saved);assert.equal(saved.attempts[0].status,'failed');assert.ok(map.nodes.has(`attempt:${saved.attempts[0].id}`));assert.equal(branchStats(map,'core').attempts,1);assert.equal(branchStats(map,'core').findings,0);assert.equal(saved.messages.some(m=>m.role==='assistant'),false);
});
test('recovery never repeats a failed read or exceeds three inspection attempts',async t=>{
  const root=await owned(t),source=path.join(root,'src');await fs.mkdir(source);await fs.writeFile(path.join(source,'main.js'),'export const actual = true;');const store=new InvestigationStore(path.join(root,'saved')),state=await store.create();let plans=0;
  const reasoning=async(_config,schema,input)=>{
    if(schema===planSchema){plans++;const prompt=JSON.parse(input);if(plans===2)assert.equal(prompt.remainingReads,2);return {reads:['absent-a.js','absent-b.js','absent-c.js','absent-d.js'].map(target=>({kind:'file',target,...(plans===2?{sectionId:'',operation:'',argumentsJson:''}:{})}))};}
    if(schema===mechanismSchema)return {mechanisms:[]};return {answer:'Source retained; requested implementation was not found.',features:[],findings:[],claims:[{text:'The source declares actual.',state:'observed',evidenceId:state.evidence[0].id,quote:'actual = true'}],recommendation:'',continuation:{status:'blocked',reason:'The requested evidence is unavailable.'}};
  };
  await new Investigator(store,{reasoning,config:{reaEnabled:false}}).turn(state,`"${source}"\nUnderstand the requested implementation`);assert.equal(plans,2);assert.equal(state.messages.at(-1).inspectionErrors.length,3);assert.equal(state.attempts[0].status,'blocked');assert.equal(state.messages.at(-1).recommendation,'');
});
test('saved purpose history and failed-attempt provenance survive portable export and import',async t=>{
  const root=await owned(t),store=new InvestigationStore(path.join(root,'saved')),state=await store.create();establishPurpose(state,'My goal is to understand the application.');establishPurpose(state,'Our goal now is to improve our wrapper.');state.attempts=[{id:'a',nodeId:'core',question:'Inspect a blocked component',status:'failed',reason:'Access unavailable',purpose:state.purpose.current,branchFeatureName:''}];await store.save(state);assert.ok(investigationGraph(state).nodes.has('attempt:a'));const folder=await exportInvestigation(store,state.id,root,{}),copy=await importInvestigation(new InvestigationStore(path.join(root,'imported')),folder);assert.deepEqual(copy.state.purpose,state.purpose);assert.deepEqual(copy.state.attempts,state.attempts);const serialized=JSON.parse(await fs.readFile(path.join(folder,'workspace-map.json'),'utf8'));assert.equal(serialized.nodes.find(n=>n.id==='attempt:a').attempt.reason,'Access unavailable');
});
test('an interrupted session projects a stopped attempt consistently without changing its saved history',()=>{
  const state={status:'stopped',evidence:[],messages:[{id:'d',role:'assistant',features:[{name:'Export'}]}],attempts:[{id:'a',status:'running',branchFeatureName:'Export',nodeId:'feature:export'}]};assert.equal(featureOutcome(state,'Export').label,'Stopped attempt');assert.equal(workspaceMap(state).nodes.get('attempt:a').attempt.status,'stopped');assert.equal(state.attempts[0].status,'running');
});
