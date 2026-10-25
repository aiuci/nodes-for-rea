import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {workspaceMap,visibleMap,growLayout,validateMapOrigin,isVerificationConstraint,runnableDirections,savedDirections,branchStats,PREFLIGHT_NODE_ID,isConnectionBoundary,serializeWorkspaceMap,preflightUtilityPoint} from '../lib/workspace-map.mjs';
import {workspacePatch} from '../lib/workspace.mjs';
import {contextFor,planSchema} from '../lib/agent.mjs';
import {Investigator,InvestigationStore} from '../lib/investigation.mjs';
import {exportInvestigation,importInvestigation} from '../lib/archive.mjs';
import {investigationGraph} from '../lib/graph.mjs';
const feature=name=>({name,displayLabel:name,claimIndexes:[]});
function fixture(){return {id:'map',title:'Owned app',targets:[],evidence:[],messages:[{id:'discovery',role:'assistant',features:[feature('Export'),{...feature('PNG'),parentName:'Export'},feature('History')]},{id:'a',role:'assistant',branchFeatureName:'PNG',overview:'First PNG result',findings:[{question:'Validation?',finding:'Known rules',change:'new',claimIndexes:[]}],recommendation:'Inspect retries'},{id:'b',role:'assistant',branchFeatureName:'History',overview:'History result',findings:[{question:'Restore?',finding:'Unknown',change:'gap',claimIndexes:[]}]},{id:'c',role:'assistant',branchFeatureName:'PNG',parentResultId:'a',parentNodeId:'finding:a:0',overview:'A branch from the first finding',findings:[{question:'Retry?',finding:'Unknown',change:'gap',claimIndexes:[]}]}]};}
test('preflight is a connected utility, never discovered knowledge or an investigation result',()=>{
  const state=fixture(),baseline=workspaceMap(state),before=branchStats(baseline,'core');
  state.preflight={status:'blocked',checkedAt:'2026-10-19T12:00:00Z',checks:[{id:'ai',label:'AI connection',status:'missing',required:true,detail:'Connect your account.',diagnostic:'Owned diagnostic'}],request:{text:'Inspect the selected application.',branchFeatureName:null,options:{nodeId:'core'}}};
  const original=JSON.stringify(state),map=workspaceMap(state),node=map.nodes.get(PREFLIGHT_NODE_ID),stats=branchStats(map,'core');
  assert.equal(node.type,'utility');assert.equal(node.utility,'preflight');assert.equal(node.parent,'core');assert.equal(node.title,'Inspection setup needed');assert.equal(node.message,undefined);assert.equal(node.row,undefined);
  assert.ok(map.edges.some(edge=>edge.from==='core'&&edge.to===PREFLIGHT_NODE_ID));
  for(const key of ['discovered','investigated','proposed','inferred','attempts','findings','openQuestions'])assert.equal(stats[key],before[key],key);
  for(const [id,saved]of baseline.nodes)assert.deepEqual(map.nodes.get(id),saved,id);
  assert.equal(JSON.stringify(state),original);assert.equal(serializeWorkspaceMap(state).nodes.find(item=>item.id===PREFLIGHT_NODE_ID).utility,'preflight');
  state.preflight.status='ready';assert.equal(workspaceMap(state).nodes.get(PREFLIGHT_NODE_ID).title,'Inspection prerequisites checked');
  delete state.preflight;assert.equal(workspaceMap(state).nodes.has(PREFLIGHT_NODE_ID),false);
});
test('legacy setup boundary projection requires explicit dependency diagnostics and preserves supported results',()=>{
  const message={continuation:{status:'blocked'},inspectionErrors:['REA connection: Could not start local REA: executable missing.'],features:[],claims:[]};
  assert.equal(isConnectionBoundary(message),true);
  assert.equal(isConnectionBoundary({...message,inspectionErrors:['REA inspection: Select a local REA executable or scripts/rea.mjs in Connection, set INVESTIGATOR_REA, or configure the local REA MCP registration.']}),true);
  assert.equal(isConnectionBoundary({...message,inspectionErrors:['Page not found']}),false);
  assert.equal(isConnectionBoundary({...message,inspectionErrors:['REA inspection: No matching functions in selected scope.']}),false);
  assert.equal(isConnectionBoundary({...message,claims:[{evidenceId:'real'}]}),false);
  assert.equal(isConnectionBoundary({...message,features:[feature('Real feature')]}),false);
  assert.equal(isConnectionBoundary({...message,continuation:{status:'complete'}}),false);
});
test('setup utility append finds a free slot without modifying research anchors or a saved utility position',()=>{
  const positions={core:{x:-120,y:5,width:220,height:66},'feature:a':{x:-120,y:151,width:220,height:66},'feature:b':{x:-120,y:261,width:220,height:66}},before=structuredClone(positions);
  const point=preflightUtilityPoint(positions);
  assert.deepEqual(positions,before);
  for(const other of Object.values(positions))assert.ok(!(point.x<other.x+other.width+24&&point.x+point.width+24>other.x&&point.y<other.y+other.height+24&&point.y+point.height+24>other.y));
  positions[PREFLIGHT_NODE_ID]={x:900,y:-200,width:220,height:66};assert.deepEqual(preflightUtilityPoint(positions),positions[PREFLIGHT_NODE_ID]);
});
test('saved verification policy remains attributable without becoming a runnable direction or shifting later identities',()=>{
  const constraint='Keep runtime effects unverified unless a separate behavioral check is explicitly selected and run.';
  const message={id:'cpu',role:'assistant',title:'CPU-Z',features:[],findings:[],directions:['Search bounded domain terms in retained strings and procedure names.',constraint,'Trace supported clusters into callers.']};
  const state={id:'cpu',title:'CPU-Z',targets:[{kind:'folder',locator:'D:\\Apps\\CPU-Z',root:'D:\\Apps\\CPU-Z\\cpuz.exe'}],messages:[message],evidence:[],attempts:[{id:'old',status:'failed',question:'D:\\Apps\\CPU-Z',productName:'CPU-Z'}]};
  const original=JSON.stringify(state),map=workspaceMap(state),node=map.nodes.get('direction:cpu:1');
  assert.equal(node.type,'constraint');assert.equal(node.request,undefined);assert.equal(node.summary,constraint);assert.equal(node.parent,'turn:cpu');assert.equal(map.nodes.get('direction:cpu:2').request,message.directions[2]);assert.equal(savedDirections(message)[1],constraint);assert.deepEqual(runnableDirections(message),[message.directions[0],message.directions[2]]);
  assert.equal(map.nodes.get('turn:cpu').title,'Saved response · CPU-Z');assert.match([...map.nodes.values()].find(n=>n.type==='source').title,/^Target · /);assert.equal(map.nodes.get('attempt:old').title,'Discovery attempt · CPU-Z');assert.equal(JSON.stringify(state),original);
  assert.equal(validateMapOrigin(state,'cpu','direction:cpu:1').nodeId,'direction:cpu:1');
  assert.equal(isVerificationConstraint('Run the selected behavioral check for export.'),false);assert.equal(isVerificationConstraint('Trace the unverified export implementation.'),false);
});
test('one cumulative map retains all focus areas, results, findings and directions; explicit branches connect to their originating node',()=>{
  const state=fixture(),before=JSON.stringify(state),map=workspaceMap(state);
  for(const id of ['feature:export','feature:png','feature:history','turn:a','turn:b','turn:c','finding:a:0','finding:b:0','finding:c:0','direction:a:0'])assert.ok(map.nodes.has(id),id);
  assert.equal(map.nodes.get('feature:png').parent,'feature:export');assert.equal(map.nodes.get('turn:c').parent,'finding:a:0');assert.equal(visibleMap(map).nodes.size,map.nodes.size);assert.equal(JSON.stringify(state),before);
});
test('hide and collapse are explicit, reversible projections; siblings remain and all saved records survive',()=>{
  const map=workspaceMap(fixture()),folded=visibleMap(map,{collapsed:['feature:export']});assert.ok(folded.nodes.has('feature:export'));assert.ok(!folded.nodes.has('turn:a'));assert.ok(folded.nodes.has('turn:b'));
  const hidden=visibleMap(map,{hidden:['feature:export']});assert.ok(!hidden.nodes.has('feature:export'));assert.ok(hidden.nodes.has('turn:b'));assert.equal(visibleMap(map,{hidden:[],collapsed:[]}).nodes.size,map.nodes.size);
});
test('node positions remain fixed across appended discoveries, new findings, collapse and reopen',()=>{
  const state=fixture(),map=workspaceMap(state),first=growLayout(map),manual={...first,'turn:a':{...first['turn:a'],x:2200,y:-300}};
  state.messages.push({id:'later-map',role:'assistant',features:[feature('Settings')]},{id:'later',role:'assistant',branchFeatureName:'PNG',findings:[{question:'More?',finding:'New result'}]});
  const next=growLayout(workspaceMap(state),manual);for(const [id,p]of Object.entries(manual))assert.deepEqual(next[id],p,id);
  const restored=workspacePatch({workspace:{mapPositions:next,mapCamera:{x:25,y:62,scale:.06},hidden:['feature:history'],collapsed:['turn:a']}},state).workspace;assert.deepEqual(restored.mapPositions,next);assert.equal(restored.mapCamera.scale,.06);assert.deepEqual(restored.hidden,['feature:history']);assert.deepEqual(restored.collapsed,['turn:a']);
});
test('malformed legacy parent cycles and orphaned results stay reachable',()=>{
  const state={...fixture(),messages:[{id:'d',role:'assistant',features:[{name:'A',parentName:'B'},{name:'B',parentName:'A'}]},{id:'lost',role:'assistant',branchFeatureName:'Removed',findings:[{question:'Still saved?',finding:'Yes'}]}]};const map=workspaceMap(state);assert.equal(visibleMap(map).nodes.size,map.nodes.size);
});
test('origin validation rejects another result node and unavailable parents',()=>{const state=fixture();assert.equal(validateMapOrigin(state,'a','finding:a:0').nodeId,'finding:a:0');assert.throws(()=>validateMapOrigin(state,'a','finding:b:0'),/does not belong/);assert.throws(()=>validateMapOrigin(state,'missing'),/unavailable/);});
test('full evidence graph preserves branching from an older finding or an explicitly chosen direction',()=>{const state=fixture();state.messages.push({id:'direction-run',role:'assistant',branchFeatureName:'PNG',parentResultId:'a',parentNodeId:'direction:a:0',findings:[]});const graph=investigationGraph(state);assert.equal(graph.nodes.get('turn:c').parent,'finding:a:0');assert.equal(graph.nodes.get('turn:direction-run').parent,'direction:a:0');assert.ok(graph.nodes.has('direction:a:0'));});
test('portable export includes the entire cumulative map, hidden branches, anchors and explicit lineage; import restores it',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-map-export-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new InvestigationStore(path.join(root,'data')),state=await store.create();Object.assign(state,fixture(),{id:state.id});await store.save(state);const map=workspaceMap(state),positions=growLayout(map);await store.updateWorkspace(state.id,{workspace:{mapPositions:positions,hidden:['feature:history'],collapsed:['turn:a'],mapCamera:{x:44,y:55,scale:.4}}});const destination=path.join(root,'exports');await fs.mkdir(destination);const folder=await exportInvestigation(store,state.id,destination,{}),json=JSON.parse(await fs.readFile(path.join(folder,'workspace-map.json'),'utf8'));assert.equal(json.nodes.length,map.nodes.size);assert.equal(json.nodes.find(n=>n.id==='turn:c').parent,'finding:a:0');assert.ok(json.nodes.some(n=>n.id==='turn:b'));assert.deepEqual(json.hidden,['feature:history']);assert.deepEqual(json.positions,positions);const imported=await importInvestigation(new InvestigationStore(path.join(root,'import')),folder);assert.deepEqual(imported.state.workspace.mapPositions,positions);assert.deepEqual(imported.state.workspace.collapsed,['turn:a']);assert.equal(workspaceMap(imported.state).nodes.size,map.nodes.size);
});
test('an older originating result and its evidence remain in AI context outside the recent conversation window',()=>{
  const state=fixture();state.evidence=[{id:'old',kind:'file',text:'Old exact source',locator:'old'}];state.messages.find(m=>m.id==='a').claims=[{evidenceId:'old',quote:'Old exact source',text:'Old claim',state:'observed'}];
  for(let i=0;i<30;i++){state.messages.push({id:`noise${i}`,role:'assistant',overview:'Other work'});state.evidence.push({id:`new${i}`,kind:'file',text:`New source ${i}`,locator:`new${i}`});}state.messages.push({role:'user',text:'Branch from old finding',parentResultId:'a',parentNodeId:'finding:a:0'});
  const context=contextFor(state);assert.equal(context.originatingResult.id,'a');assert.equal(context.originatingResult.nodeId,'finding:a:0');assert.ok(context.evidence.some(e=>e.id==='old'));
});
test('actual investigator records origin metadata and rejects cross-branch requests without appending a request',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'rea-map-origin-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const store=new InvestigationStore(directory),state=await store.create();Object.assign(state,fixture(),{id:state.id,mechanismInventory:{mechanisms:[]},openQuestions:[]});await store.save(state);
  const reasoning=async(_config,schema,input)=>schema===planSchema?{reads:[],judgment:{decision:'answer',reason:'Saved evidence test',purpose:'Origin test',uncertainty:'',impact:''}}:{features:[],findings:[{question:'Scope?',finding:'No new source',change:'gap',claimIndexes:[]}],claims:[],answer:'No new source.',recommendation:'',continuation:{status:'blocked',reason:'No source',uncertainty:'No source',impact:'Unknown',nextEvidence:'Source'}};
  const investigator=new Investigator(store,{reasoning,config:{reaEnabled:false}});await investigator.turn(state,'Branch from the original PNG finding',{branchFeatureName:'PNG',parentResultId:'a',parentNodeId:'finding:a:0'});assert.equal(state.messages.at(-1).parentResultId,'a');assert.equal(state.messages.at(-1).parentNodeId,'finding:a:0');assert.equal(workspaceMap(state).nodes.get(`turn:${state.messages.at(-1).id}`).parent,'finding:a:0');
  const count=state.messages.length;await assert.rejects(()=>investigator.turn(state,'Other branch',{branchFeatureName:'History',parentResultId:'a'}),/different feature/);assert.equal(state.messages.length,count);const reopened=await store.read(state.id);assert.equal(reopened.messages.at(-1).parentResultId,'a');
});
