import test,{after} from 'node:test';
import os from 'node:os';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const load=name=>import(new URL('../lib/'+name,import.meta.url));
const {InvestigationStore,Investigator}=await load('investigation.mjs'),{planSchema}=await load('agent.mjs'),{ReaInvestigation}=await load('rea-engine.mjs'),{mechanismSchema}=await load('mechanisms.mjs'),{autoDeepenBoundary}=await load('guidance.mjs');
const ownedRoots=[],here=os.tmpdir(),raw='Owned implementation stores a stable value.\nOwned mechanism resolves a second detail.',sha=createHash('sha256').update(raw).digest('hex');
async function fixture(){const output=await fs.mkdtemp(path.join(here,'nodes-auto-deepen-'));ownedRoots.push(output);const store=new InvestigationStore(path.join(output,'data')),state=await store.create();state.messages=[{id:'inventory',role:'assistant',recommendation:'Feature A',features:[{name:'Feature A',investigate:'Inspect owned implementation',claimIndexes:[0]}],claims:[{text:'Owned implementation stores a stable value.',state:'observed',evidenceId:'owned',quote:'Owned implementation stores a stable value.'}]}];state.targets=[{kind:'repository',root:output,locator:output,files:['main.js']}];await fs.writeFile(path.join(output,'main.js'),raw);await store.addEvidence(state,{id:'owned',kind:'file',locator:path.join(output,'main.js'),sha256:sha,text:raw,raw});state.status='saved';await store.save(state);return {output,store,state};}
const answer=(status='complete')=>({answer:'Owned implementation stores a stable value.',understanding:'Owned stable value',recommendation:status==='continue'?'Inspect second detail':'',findings:[{question:'Stable value?',finding:'Stores a stable value.',change:'new',claimIndexes:[0]}],claims:[{text:'Stores a stable value.',state:'observed',evidenceId:'owned',quote:'Owned implementation stores a stable value.'}],continuation:{status,uncertainty:'Second detail',impact:'Understand mechanism',nextEvidence:'Owned source',reason:'Owned bounded answer'}});
const ready=async()=>({status:'ready',checks:[]});
const fakeClient=(state,log,{hold,failRead=false}={})=>({tools:[{name:'analyze_javascript_application',inputSchema:{type:'object',properties:{input_path:{type:'string'},source_paths:{type:'array',items:{type:'string'}}}}}],sessionStatus:async()=>({}),callTool:async(name,args,{signal}={})=>{log.push({name,args});if(name==='export_evidence_bundle'){await fs.writeFile(args.path,JSON.stringify({owned:true}));return {structuredContent:{exported:true}};}if(name==='analyze_javascript_application'){if(hold)await new Promise((resolve,reject)=>{hold.entered();signal.addEventListener('abort',()=>{hold.aborted=true;reject(Error('Owned read stopped'));},{once:true});});if(failRead)throw Error('Owned selected read unavailable');return {structuredContent:{result:{detail:'Owned read result'}}};}throw Error('Unknown owned operation');},close:async()=>{log.push({name:'close'});}});
test('actual turn uses multiple reasoning calls for one saved result and preserves original IDs, raw hash and reopen',async()=>{
 const {store,state}=await fixture(),original=structuredClone(state.messages[0]),calls=[];
 const investigator=new Investigator(store,{config:{reaEnabled:false},reasoning:async(_c,s)=>{calls.push(s===planSchema?'plan':s===mechanismSchema?'inventory':'answer');return s===planSchema?{reads:[]}:s===mechanismSchema?{mechanisms:[]}:answer();}});
 await investigator.turn(state,'Inspect owned implementation',{branchFeatureName:'Feature A',nodeId:'feature:feature a',preserveDraft:true});
 assert.deepEqual(calls,['plan','inventory','answer']);assert.equal(state.attempts.length,1);assert.equal(state.attempts[0].resultId,state.messages.at(-1).id);assert.equal(state.messages.at(-1).continuation.status,'complete');assert.deepEqual(state.messages[0],original);const reopened=await store.read(state.id);assert.deepEqual(reopened.messages,JSON.parse(JSON.stringify(state.messages)));assert.equal(createHash('sha256').update(await fs.readFile(reopened.evidence[0].snapshotPath)).digest('hex'),sha);
 const before=JSON.stringify(reopened.messages),attempts=reopened.attempts.length;await investigator.turn(reopened,'ignored',{resumeAiAttemptId:reopened.attempts[0].id});assert.equal(JSON.stringify(reopened.messages),before);assert.equal(reopened.attempts.length,attempts);assert.deepEqual(calls,['plan','inventory','answer']);
});
test('blocked readiness preserves exact request/destination with zero model calls, attempts, or new evidence',async()=>{
 const {store,state}=await fixture(),before=structuredClone(state.messages);let calls=0;
 await new Investigator(store,{config:{reaEnabled:true},preflight:async()=>({status:'blocked',checks:[]}),reasoning:async()=>{calls++;}}).turn(state,'Inspect owned implementation',{branchFeatureName:'Feature A',nodeId:'feature:feature a',preserveDraft:true});
 assert.equal(calls,0);assert.equal(state.attempts?.length||0,0);assert.deepEqual(state.messages,before);assert.equal(state.evidence.length,1);assert.equal(state.preflight.request.text,'Inspect owned implementation');assert.equal(state.preflight.request.branchFeatureName,'Feature A');
});
test('fatal real REA adapter connect failure blocks before reasoning and retains earlier research',async()=>{
 const {store,state}=await fixture(),before=structuredClone(state.messages);let calls=0,connects=0;
 await new Investigator(store,{config:{reaEnabled:true},preflight:ready,openClient:async()=>{connects++;throw Error('Owned catalog connection unavailable');},reasoning:async()=>{calls++;}}).turn(state,'Inspect owned implementation',{branchFeatureName:'Feature A'});
 assert.equal(connects,1);assert.equal(calls,0);assert.equal(state.preflight.status,'blocked');assert.deepEqual(state.messages.slice(0,before.length),before);assert.equal(state.messages.filter(m=>m.role==='assistant').length,1);assert.equal(state.attempts[0].status,'blocked');
});
test('real REA adapter read abort receives turn signal, retains failed-operation diagnostic and original evidence',async()=>{
 const {store,state}=await fixture(),log=[],controller=new AbortController();let entered;const started=new Promise(r=>entered=r),hold={entered,aborted:false};
 const investigator=new Investigator(store,{config:{reaEnabled:true},preflight:ready,openClient:async()=>fakeClient(state,log,{hold}),reasoning:async(_c,s)=>s===planSchema?{focus:'Feature A',reads:[{kind:'rea',target:state.targets[0].root,operation:'analyze_javascript_application',argumentsJson:JSON.stringify({source_paths:['main.js']}),reason:'Owned read'}]}:answer()});
 const running=investigator.turn(state,'Inspect owned implementation',{branchFeatureName:'Feature A',signal:controller.signal});await started;controller.abort();await assert.rejects(running,/Owned read stopped/);const saved=await store.read(state.id);assert.equal(hold.aborted,true);assert.equal(saved.status,'stopped');assert.equal(saved.messages.filter(m=>m.role==='assistant').length,1);assert.equal(saved.evidence[0].id,'owned');assert.ok(saved.evidence.some(e=>e.operationStatus==='failed'));assert.ok(log.some(e=>e.name==='close'));assert.equal(createHash('sha256').update(await fs.readFile(saved.evidence[0].snapshotPath)).digest('hex'),sha);
});
test('real adapter validates selected target and paths before invoking client; successful read and checkpoint are retained',async()=>{
 const {store,state}=await fixture(),log=[],rea=new ReaInvestigation({reaEnabled:true},state,store.directory(state.id),{openClient:async()=>fakeClient(state,log),addEvidence:e=>store.addEvidence(state,e),saveState:()=>store.save(state)});
 await assert.rejects(rea.read({kind:'rea',target:'unselected',operation:'analyze_javascript_application',argumentsJson:'{}'}),/not selected/);
 await assert.rejects(rea.read({kind:'rea',target:state.targets[0].root,operation:'analyze_javascript_application',argumentsJson:JSON.stringify({input_path:'foreign',source_paths:['main.js']})}),/paths must match/);assert.equal(log.length,0);
 const result=await rea.read({kind:'rea',target:state.targets[0].root,operation:'analyze_javascript_application',argumentsJson:JSON.stringify({source_paths:['main.js']})});assert.equal(result.operation,'analyze_javascript_application');assert.equal(result.parameters.input_path,state.targets[0].root);await rea.finish(e=>store.addEvidence(state,e));assert.ok(state.reaBundleEvidenceId);assert.ok(state.evidence.some(e=>e.kind==='rea-bundle'));
});
test('failed planned read permits one replan within three-read cap; retained evidence still supports bounded answer',async()=>{
 const {store,state}=await fixture(),log=[];let plans=0;
 const read=n=>({kind:'rea',target:state.targets[0].root,operation:'analyze_javascript_application',argumentsJson:JSON.stringify({source_paths:['main.js'],owned:n}),reason:'Owned failed read '+n});
 await new Investigator(store,{config:{reaEnabled:true},preflight:ready,openClient:async()=>fakeClient(state,log,{failRead:true}),reasoning:async(_c,s)=>s===planSchema?(plans++,{focus:'Feature A',reads:plans===1?[read(1),read(2),read(3),read(4)]:[read(1),read(5),read(6),read(7)]}):answer()}).turn(state,'Inspect owned implementation',{branchFeatureName:'Feature A'});
 assert.equal(plans,2);assert.equal(log.filter(e=>e.name==='analyze_javascript_application').length,3);assert.equal(state.status,'saved');assert.equal(state.messages.at(-1).claims[0].evidenceId,'owned');assert.equal(state.messages.at(-1).continuation.status,'complete');assert.equal(state.evidence[0].sha256,sha);
});
test('legacy continuation-less repetition and no-grounded-progress boundaries remain active',()=>{
 const old={recommendation:'Inspect storage persistence',answer:'Stable',claims:[{text:'Stable',quote:'Owned implementation stores a stable value.',evidenceId:'owned'}],findings:[{question:'Storage?',finding:'Stable',change:'new',claimIndexes:[0]}]},evidence=[{id:'owned',kind:'file',locator:'owned',text:raw}];
 assert.match(autoDeepenBoundary(structuredClone(old),old,{evidence}),/repeating|No new/);assert.match(autoDeepenBoundary({...old,answer:'Paraphrase',findings:[{...old.findings[0],change:'unchanged'}]},old,{evidence}),/repeating/);
 assert.match(autoDeepenBoundary({...old,continuation:{status:'complete',reason:'Resolved'}},old,{evidence}),/Enough understanding/);
});

after(async()=>{for(const root of ownedRoots){if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('nodes-auto-deepen-'))throw Error('Unexpected fixture cleanup target');await fs.rm(root,{recursive:true,force:true});}});
