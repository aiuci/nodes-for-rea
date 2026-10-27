import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {InvestigationStore,Investigator} from '../lib/investigation.mjs';
import {prepareApplicationRun,chargeApplication,grantApplicationWork,remainingApplicationTurns,applicationCandidates,admitApplicationComponent,concludeApplicationTurn} from '../lib/application-investigation.mjs';
import {planSchema,applicationAnswerSchema,contextFor} from '../lib/agent.mjs';
import {mechanismSchema} from '../lib/mechanisms.mjs';
import {buildDocument,parseDocument,installDocument} from '../lib/investigation-document.mjs';
import {prepareShare} from '../lib/document-sharing.mjs';
import {prepareTargetRecovery} from '../lib/target-recovery.mjs';
const roots=[];
async function fixture(mode='investigate',turns=1){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-application-'));roots.push(dir);const folder=path.join(dir,'application');await fs.mkdir(folder);const pe=Buffer.alloc(1024);pe.write('MZ');for(const name of ['Main.exe','Engine.dll','Unrelated.dll'])await fs.writeFile(path.join(folder,name),pe);const store=new InvestigationStore(path.join(dir,'data')),state=await store.create();await prepareApplicationRun(state,store,[folder],{applicationMode:mode,automation:{maxSteps:turns}});return {dir,folder,store,state};}
test('cumulative allowance survives selection/readiness/reopen and grants add rather than reset',async()=>{
 const {folder,store,state}=await fixture('investigate',2),id=state.applicationRun.id;
 await prepareApplicationRun(state,store,[folder],{applicationRunId:id,automation:{maxSteps:20}});assert.equal(state.applicationRun.limits.turns,2);
 await chargeApplication(state,store,'turns','owned-attempt');await chargeApplication(state,store,'reads','failed-read');await chargeApplication(state,store,'models','failed-reasoning');
 const reopened=await store.read(state.id);assert.deepEqual(reopened.applicationRun,state.applicationRun);assert.equal(remainingApplicationTurns(reopened.applicationRun),2); // one unstarted + one paused
 await prepareApplicationRun(reopened,store,[folder],{applicationRunId:id,automation:{maxSteps:20}});assert.equal(reopened.applicationRun.used.reads,1);assert.equal(reopened.applicationRun.limits.reads,6);
 grantApplicationWork(reopened.applicationRun,1);assert.equal(reopened.applicationRun.limits.reads,9);assert.equal(reopened.applicationRun.used.reads,1);assert.equal(reopened.applicationRun.grants[1].kind,'additional');
 for(let i=1;i<9;i++)await chargeApplication(reopened,store,'reads','repeated-work');await assert.rejects(chargeApplication(reopened,store,'reads','over-limit'),{code:'APPLICATION_ALLOWANCE'});
});
test('only evidence-linked in-folder components can be admitted; symlink replacement and outside paths rejected',async()=>{
 const {dir,folder,store,state}=await fixture();state.evidence.push({id:'lead',kind:'rea',text:'Engine.dll supplies document storage.',evidenceStatus:'static'});
 assert.deepEqual(applicationCandidates(state).map(c=>c.name),['Engine.dll']);
 await assert.rejects(admitApplicationComponent(state,path.join(folder,'Unrelated.dll')),/no admitted/);
 await assert.rejects(admitApplicationComponent(state,path.join(dir,'outside.dll')),/no admitted/);
 const module=await admitApplicationComponent(state,path.join(folder,'Engine.dll'));assert.equal(module.containerRoot,state.applicationRun.scope.root);assert.ok(module.admission.sha256);await store.save(state);
 const outside=path.join(dir,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'Main.exe'),Buffer.from('MZ'));
 const nested=path.join(folder,'nested');await fs.mkdir(nested);const file=path.join(nested,'Foreign.dll');await fs.writeFile(file,Buffer.from('MZ'));state.applicationRun.scope.components.push({path:file,name:'Foreign.dll'});state.evidence[0].text+=' Foreign.dll';
 await fs.unlink(file);await fs.rmdir(nested);await fs.symlink(outside,nested,'junction');await fs.writeFile(path.join(outside,'Foreign.dll'),Buffer.from('MZ'));
 await assert.rejects(admitApplicationComponent(state,file),/outside/);
});
test('completion requires question-relevant implementation support; inventory, unrelated evidence and wrapper gaps do not pass',async()=>{
 const {state}=await fixture();state.applicationRun.question='How are worksheet edits persisted?';state.applicationRun.activeTurn={status:'active'};state.applicationRun.used.turns=1;
 state.evidence=[{id:'listing',kind:'rea',operation:'search_strings',text:'Engine.dll'},{id:'implementation',kind:'rea',operation:'analyze_function',text:'Commit edits before replacing the document.'}];
 const answer=(id,question=state.applicationRun.question)=>({claims:[{state:'inferred',evidenceId:id,quote:'Commit edits before replacing the document.'}],applicationProgress:{question,decision:'answered',explanation:'The quoted commit-before-replace sequence explains how edits survive saving.',claimIndexes:[0],obstacleEvidenceIds:[]}});
 assert.equal(concludeApplicationTurn(state,answer('listing')).continuation.status,'continue');
 assert.equal(concludeApplicationTurn(state,answer('implementation','What color is the toolbar?')).continuation.status,'continue');
 assert.equal(concludeApplicationTurn(state,{applicationProgress:{question:state.applicationRun.question,decision:'boundary',explanation:'Folder context was lost.',obstacleEvidenceIds:[]}}).continuation.status,'continue');
 assert.equal(concludeApplicationTurn(state,answer('implementation')).continuation.status,'complete');
 assert.equal(concludeApplicationTurn(state,answer('implementation')).continuation.status,'continue','Repeating the same support is not new progress');
 state.evidence.push({id:'bad-argument',evidenceStatus:'inspection-failed',text:JSON.stringify({error:{code:'invalid_request'}})});
 assert.equal(concludeApplicationTurn(state,{applicationProgress:{question:state.applicationRun.question,decision:'boundary',explanation:'A guessed function name failed.',obstacleEvidenceIds:['bad-argument']}}).continuation.status,'continue');
 state.evidence.push({id:'missing-provider',evidenceStatus:'inspection-failed',text:JSON.stringify({error:{code:'provider_unavailable'}})});
 assert.equal(concludeApplicationTurn(state,{applicationProgress:{question:state.applicationRun.question,decision:'boundary',explanation:'The required static analysis provider is unavailable.',obstacleEvidenceIds:['missing-provider']}}).continuation.status,'blocked');
});
test('full document preserves allowance; shared copy omits private scope and dispatch allowance',async()=>{
 const {store,state}=await fixture();await chargeApplication(state,store,'turns','saved-attempt');await chargeApplication(state,store,'reads','saved-read');
 const document=parseDocument((await buildDocument(store,state.id)).data);assert.deepEqual(document.state.applicationRun,state.applicationRun);
 const reopened=await installDocument(store,document);assert.deepEqual(reopened.state.applicationRun.used,state.applicationRun.used);assert.equal(reopened.state.status,'ready');
 assert.equal(prepareShare(state).state.applicationRun,undefined);assert.ok(state.applicationRun);
});
const question='How does the application commit worksheet edits?';
const judgment={purpose:'Understand worksheet persistence',uncertainty:'Commit ordering',impact:'Whether edits survive document replacement',decision:'inspect',reason:'Trace storage rather than inventory.'};
function client(log){return {tools:['binary_overview','search_strings','analyze_function'].map(name=>({name,inputSchema:{type:'object',properties:{}}})),sessionStatus:async()=>({}),callTool:async(name,args)=>{log.push({name,args});if(name==='export_evidence_bundle'){await fs.writeFile(args.path,'{}');return {structuredContent:{saved:true}};}if(name==='import_evidence_bundle')return {structuredContent:{loaded:true}};return {structuredContent:name==='binary_overview'?{procedure_count:20,string_count:20}:name==='search_strings'?{detail:'Engine.dll implements worksheet commit.'}:name==='analyze_function'?{detail:'Commit edits before replacing the document.'}:{opened:true}};},close:async()=>{}};}
function reasoningFor(state,folder,{surface=false,hold}={}){let plans=0;return async(_config,schema,input,_directory,signal)=>{
 const payload=JSON.parse(input);
 if(schema===planSchema){plans++;if(hold&&!hold.used&&payload.remainingReads===2){hold.used=true;hold.ready();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('Owned Stop during adaptive planning')),{once:true}));}
  return {focus:question,judgment:plans>2?{...judgment,decision:'answer'}:judgment,reads:payload.remainingReads===undefined?[{kind:'rea',target:folder,operation:'search_strings',argumentsJson:'{}',reason:'Locate worksheet storage.'}]:payload.remainingReads===2?[{kind:'rea',target:path.join(folder,'Engine.dll'),operation:'analyze_function',argumentsJson:'{}',reason:'Trace the commit ordering in the referenced component.'}]:[]};
 }
 if(schema===mechanismSchema)return {mechanisms:[]};
 const source=state.evidence.findLast(e=>e.operation===(surface?'search_strings':'analyze_function'));
 return {title:'Owned application',answer:'The application commits edits before replacing the document.',understanding:'Commit precedes replacement.',recommendation:'Worksheet storage',features:[{name:'Worksheet storage',investigate:question,claimIndexes:[0],mechanismIds:[]}],findings:[],claims:[{state:'inferred',text:'Commit precedes replacement.',evidenceId:source.id,quote:surface?'Engine.dll implements worksheet commit.':'Commit edits before replacing the document.'}],continuation:{status:'complete',reason:'Owned supported result',uncertainty:'',impact:'',nextEvidence:''},...(schema===applicationAnswerSchema?{applicationProgress:{question:payload.context.applicationInvestigation.question,decision:'answered',explanation:'The implementation commits edited worksheet contents before replacing the saved document, explaining persistence ordering.',claimIndexes:[0],obstacleEvidenceIds:[]}}:{})};
 };}
test('actual Investigator adapts successful reads into relevant sibling implementation within one turn with automatic continuation off',async()=>{
 const {folder,store,state}=await fixture(),log=[];const inv=new Investigator(store,{config:{reaEnabled:true},preflight:async()=>({status:'ready',checks:[]}),openClient:async()=>client(log),reasoning:reasoningFor(state,folder)});
 await inv.turn(state,folder,{applicationRunId:state.applicationRun.id});assert.equal(state.status,'saved');assert.equal(state.applicationRun.status,'answered');assert.equal(state.applicationRun.question,question);assert.equal(state.applicationRun.used.turns,1);assert.equal(state.applicationRun.used.reads,2);assert.equal(state.targets.length,2);assert.ok(log.some(e=>e.name==='analyze_function'));assert.equal(state.messages.at(-1).continuation.status,'complete');assert.ok(contextFor(state).applicationInvestigation.scope.componentCount);
 await assert.rejects(inv.turn(state,question,{applicationRunId:state.applicationRun.id}),{code:'APPLICATION_ALLOWANCE'}).catch(error=>{throw error;});
});
test('Surface Pass uses fixed bounded reads and never admits siblings or claims substantive application completion',async()=>{
 const {folder,store,state}=await fixture('surface'),log=[];const inv=new Investigator(store,{config:{reaEnabled:true},preflight:async()=>({status:'ready',checks:[]}),openClient:async()=>client(log),reasoning:reasoningFor(state,folder,{surface:true})});
 await inv.turn(state,folder,{applicationRunId:state.applicationRun.id});assert.equal(state.applicationRun.status,'surface-saved');assert.equal(state.applicationRun.used.reads,1);assert.equal(state.targets.length,1);assert.ok(!log.some(e=>e.name==='analyze_function'));assert.match(state.messages.at(-1).continuation.reason,/Surface Pass/);
});
test('ambiguous folder selection and readiness recovery retain original scope, objective and untouched allowance',async()=>{
 const {folder,store,state}=await fixture();await fs.copyFile(path.join(folder,'Main.exe'),path.join(folder,'Other.exe'));const log=[];let ready=false;
 const inv=new Investigator(store,{config:{reaEnabled:true},preflight:async()=>({status:ready?'ready':'blocked',checks:[]}),openClient:async()=>client(log),reasoning:reasoningFor(state,folder)});
 await inv.turn(state,folder,{applicationRunId:state.applicationRun.id});assert.equal(state.status,'blocked');assert.equal(state.applicationRun.used.turns,0);const id=state.applicationRun.id;
 ready=true;await inv.turn(state,folder,{applicationRunId:id});assert.equal(state.status,'awaiting-selection');assert.equal(state.applicationRun.used.turns,0);const attempt=state.attempts.at(-1);const selected=attempt.targetRecovery.candidates.find(c=>c.path===path.join(folder,'Main.exe'));assert.ok(selected);
 const prepared=await prepareTargetRecovery(store,state.id,attempt.id,{choice:selected.path,diagnose:async()=>structuredClone(attempt.targetRecovery)});Object.assign(state,prepared);
 await inv.turn(state,folder,{recoveryAttemptId:attempt.id,applicationRunId:id});assert.equal(state.applicationRun.id,id);assert.equal(state.applicationRun.used.turns,1);assert.equal(state.applicationRun.used.reads,2);assert.equal(state.targets[0].containerRoot,state.applicationRun.scope.root);assert.ok(state.targets[0].artifactCandidates.includes('Engine.dll'));assert.ok(state.purpose.current);assert.equal(state.applicationRun.status,'answered');
});
test('Stop retains successful read and checkpoint; explicit resume reuses the paused turn without replenishment',async()=>{
 const {folder,store,state}=await fixture(),controller=new AbortController(),log=[];let ready;const started=new Promise(r=>ready=r),hold={ready};const inv=new Investigator(store,{config:{reaEnabled:true},preflight:async()=>({status:'ready',checks:[]}),openClient:async()=>client(log),reasoning:reasoningFor(state,folder,{hold})});
 const work=inv.turn(state,folder,{applicationRunId:state.applicationRun.id,signal:controller.signal});await started;controller.abort();await assert.rejects(work,/Owned Stop/);
 const paused=await store.read(state.id),attempt=paused.attempts.at(-1);assert.equal(paused.status,'stopped');assert.equal(paused.applicationRun.used.turns,1);assert.equal(paused.applicationRun.used.reads,1);assert.equal(paused.applicationRun.used.models,2);assert.equal(attempt.aiRecovery.canResume,true);const savedId=paused.evidence.find(e=>e.operation==='search_strings').id;
 inv.reasoning=reasoningFor(paused,folder);await inv.turn(paused,'ignored',{resumeAiAttemptId:attempt.id,applicationRunId:paused.applicationRun.id});
 assert.equal(paused.applicationRun.used.turns,1);assert.equal(paused.applicationRun.used.reads,2);assert.ok(paused.applicationRun.used.models>2);assert.equal(paused.applicationRun.grants.length,1);assert.equal(log.filter(e=>e.name==='search_strings').length,1);assert.ok(paused.evidence.some(e=>e.id===savedId));assert.equal(paused.applicationRun.status,'answered');
});
after(async()=>{for(const root of roots)await fs.rm(root,{recursive:true,force:true});});
