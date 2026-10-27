import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {AgentSessionStore,validateRoute} from '../lib/agent-guide.mjs';
import {AgentControlStore,replaceControlFile} from '../lib/agent-control.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const node=(name,evidenceId)=>({name,displayLabel:name,displayQuestion:`How does ${name} work?`,evidenceBasis:'advertised',claimIndexes:[evidenceId]});
const raw=(name,action='investigate')=>({nodeId:`feature:${name.toLowerCase()}`,action,question:`How does ${name} work?`,why:'The retained source supports this area.',evidenceIds:[`e-${name.toLowerCase()}`]});
const direction=name=>({kind:'direction',reply:`I will explore ${name} next and keep existing findings.`,...raw(name)});
const question={kind:'question',reply:'The approved route has not finished. Public evidence does not establish the entire product.',nodeId:'',action:'reveal',question:'',evidenceIds:[]};

async function harness({turn, director=async()=>question, route=[raw('Export'),raw('History','reveal')]}={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-control-owned-'));
  let state={id:randomUUID(),title:'Owned product',status:'saved',messages:[{id:'discovery',role:'assistant',features:[node('Export',0),node('History',1),node('Pricing',2)],claims:['Export','History','Pricing'].map(name=>({evidenceId:`e-${name.toLowerCase()}`,text:`${name} is available.`}))}],evidence:['Export','History','Pricing'].map(name=>({id:`e-${name.toLowerCase()}`,title:name,locator:`https://example.test/${name.toLowerCase()}`,text:`${name} is available.`,evidenceStatus:'captured'}))};
  const store={directory:id=>path.join(root,id),read:async()=>structuredClone(state)};
  await fs.mkdir(store.directory(state.id));
  const control=new AgentControlStore(store),events=[],dispatch=[];
  const guide=new AgentSessionStore(store,{control,director,getConfig:async()=>({provider:'owned-fixture'}),onControl:async(id,c)=>events.push(structuredClone(c)),planner:async()=>validateRoute({steps:route},state),turn:async(snapshot,text,options)=>{
    dispatch.push(options.nodeId);
    if(turn)await turn(snapshot,text,options);
    snapshot.messages.push({id:`result-${dispatch.length}`,role:'assistant',branchFeatureName:options.branchFeatureName,findings:[{finding:'Owned saved finding.'}],claims:[{evidenceId:`e-${options.branchFeatureName.toLowerCase()}`}]});
    state=snapshot;return structuredClone(state);
  }});
  let session=await guide.propose(state.id,'Understand the saved product',null);session=await guide.approve(state.id,session.route.map(s=>s.id));
  return {root,store,control,guide,events,dispatch,id:state.id,get state(){return state;},get session(){return session;},close:()=>fs.rm(root,{recursive:true,force:true})};
}

test('receipt persists immediately during held inspection; arbitrary semantic direction applies after saved result',async()=>{
  const started=deferred(),release=deferred(),pricing=deferred(),releasePricing=deferred();let calls=0;
  const h=await harness({turn:async(_state,_text,options)=>{if(options.nodeId==='feature:export'){started.resolve();await release.promise;}if(options.nodeId==='feature:pricing'){pricing.resolve();await releasePricing.promise;}},director:async(_config,input)=>{calls++;assert.equal(input.message.text,'The money side is what I care about; take that thread next.');assert.ok(input.state.messages.some(m=>m.id==='result-1'));return direction('Pricing');}});
  try{
    const run=h.guide.run(h.id);await started.promise;
    const receipt=await h.guide.submitMessage(h.id,{id:'money-direction',text:'The money side is what I care about; take that thread next.'});
    assert.equal(receipt.messages[0].status,'queued');assert.equal(calls,0);assert.equal(h.state.messages.length,1);
    release.resolve();await pricing.promise;
    let current;const deadline=Date.now()+5000;do{current=await h.control.read(h.id);if(current.messages.find(m=>m.id==='money-direction').status==='applied')break;await new Promise(r=>setTimeout(r,10));}while(Date.now()<deadline);assert.equal(current.messages.find(m=>m.id==='money-direction').status,'applied');
    assert.deepEqual(h.dispatch,['feature:export','feature:pricing']);assert.equal(h.state.messages.length,2);
    releasePricing.resolve();const result=await run;assert.equal(result.completedInvestigations,2);assert.equal(result.planCalls,1);assert.equal(result.investigationId,h.id);assert.equal(h.state.messages.length,3);
  }finally{release.resolve();releasePricing.resolve();await h.close();}
});

test('duplicate receipts are idempotent and altered duplicate identity is rejected',async()=>{
  const h=await harness();try{const a=await h.guide.submitMessage(h.id,{id:'same',text:'Explain this result.'}),b=await h.guide.submitMessage(h.id,{id:'same',text:'Explain this result.'});assert.equal(a.revision,b.revision);assert.equal(b.messages.length,1);await assert.rejects(()=>h.guide.submitMessage(h.id,{id:'same',text:'Different text'}),/identity is already used/);}finally{await h.close();}
});

test('Stop while inspection is held preserves receipt and prevents queued semantic work or another dispatch',async()=>{
  const started=deferred(),release=deferred();let calls=0;
  const h=await harness({turn:async()=>{started.resolve();await release.promise;},director:async()=>{calls++;return direction('Pricing');}});
  try{const run=h.guide.run(h.id);await started.promise;await h.guide.submitMessage(h.id,{id:'later',text:'Investigate pricing next.'});await h.guide.stop();release.resolve();const result=await run;assert.equal(result.status,'stopped');assert.equal(calls,0);assert.deepEqual(h.dispatch,['feature:export']);assert.equal((await h.control.read(h.id)).messages[0].status,'not-applied');assert.equal(h.state.messages.length,2);}finally{release.resolve();await h.close();}
});

test('held idle semantic call does not block receipt; Stop aborts it and rejects late route mutation',async()=>{
  const started=deferred(),release=deferred();let observedSignal;
  const h=await harness({director:async(_config,_input,_dir,signal)=>{observedSignal=signal;started.resolve();await release.promise;return direction('Pricing');}});
  try{await h.guide.submitMessage(h.id,{id:'first',text:'Take the money thread.'});const processing=h.guide.processMessages(h.id);await started.promise;
    const second=await h.guide.submitMessage(h.id,{id:'second',text:'Then show history.'});assert.equal(second.messages.find(m=>m.id==='second').status,'queued');
    await h.guide.stop();assert.equal(observedSignal.aborted,true);release.resolve();await processing;
    const control=await h.control.read(h.id);assert.ok(control.messages.filter(m=>m.role==='user').every(m=>m.status==='not-applied'));assert.equal((await h.guide.read(h.id)).route.length,2);assert.equal(h.dispatch.length,0);
  }finally{release.resolve();await h.close();}
});

test('a stopped-state question answers from the same record without any inspection or route reset',async()=>{
  const h=await harness();try{const session=await h.guide.read(h.id);session.status='stopped';session.stopReason='Stopped by you.';await h.guide.write(h.id,session);await h.guide.submitMessage(h.id,{id:'why',text:'Is that everything, or could you not access the rest?'});await h.guide.processMessages(h.id);const control=await h.control.read(h.id);assert.equal(control.messages[0].status,'answered');assert.match(control.messages[1].text,/Public evidence/);assert.equal(h.dispatch.length,0);assert.equal((await h.guide.read(h.id)).status,'stopped');assert.equal((await h.guide.read(h.id)).planCalls,1);}finally{await h.close();}
});

test('a message received during the final step is processed before completion exits the run loop',async()=>{
  const started=deferred(),release=deferred();
  const h=await harness({route:[raw('Export')],turn:async(_state,_text,options)=>{if(options.nodeId==='feature:export'){started.resolve();await release.promise;}},director:async()=>direction('Pricing')});
  try{const run=h.guide.run(h.id);await started.promise;await h.guide.submitMessage(h.id,{id:'at-end',text:'Explore pricing next.'});release.resolve();const result=await run;assert.equal(result.status,'complete');assert.deepEqual(h.dispatch,['feature:export','feature:pricing']);assert.equal((await h.control.read(h.id)).messages[0].status,'applied');}finally{release.resolve();await h.close();}
});

test('ready directions keep receipt order instead of later idle messages replacing a prepared step',async()=>{
  let calls=0;const h=await harness({director:async()=>direction(++calls===1?'Pricing':'History')});
  try{await h.guide.submitMessage(h.id,{id:'one',text:'Pricing next.'});await h.guide.processMessages(h.id);await h.guide.submitMessage(h.id,{id:'two',text:'Then history.'});await h.guide.processMessages(h.id);assert.equal(calls,2);assert.equal((await h.guide.read(h.id)).route[0].nodeId,'feature:pricing');await h.guide.run(h.id);assert.deepEqual(h.dispatch,['feature:pricing','feature:history','feature:export']);const control=await h.control.read(h.id);assert.equal(control.messages.find(m=>m.id==='one').status,'applied');assert.equal(control.messages.find(m=>m.id==='two').status,'applied');}finally{await h.close();}
});

test('questions remain answerable while a direction awaits explicit Resume',async()=>{
  let calls=0;const h=await harness({director:async()=>++calls===1?direction('Pricing'):question});
  try{await h.guide.submitMessage(h.id,{id:'ready',text:'Pricing next.'});await h.guide.processMessages(h.id);await h.guide.submitMessage(h.id,{id:'question',text:'Why did you stop?'});await h.guide.processMessages(h.id);const control=await h.control.read(h.id);assert.equal(control.messages.find(m=>m.id==='ready').status,'applying');assert.equal(control.messages.find(m=>m.id==='question').status,'answered');assert.equal(h.dispatch.length,0);}finally{await h.close();}
});

test('later direction for the same prepared node explicitly supersedes the old message',async()=>{
  const h=await harness({director:async()=>direction('Pricing')});try{await h.guide.submitMessage(h.id,{id:'old',text:'Pricing next.'});await h.guide.processMessages(h.id);await h.guide.submitMessage(h.id,{id:'new',text:'Actually focus on its annual pricing.'});await h.guide.processMessages(h.id);const control=await h.control.read(h.id);assert.equal(control.messages.find(m=>m.id==='old').status,'not-applied');assert.equal(control.messages.find(m=>m.id==='old').supersededBy,'new');await h.guide.run(h.id);assert.equal((await h.control.read(h.id)).messages.find(m=>m.id==='new').status,'applied');assert.equal(h.dispatch.filter(id=>id==='feature:pricing').length,1);}finally{await h.close();}
});

test('budget exhaustion neither highlights nor applies a new inspection direction',async()=>{
  const h=await harness({director:async()=>direction('Pricing')});try{const session=await h.guide.read(h.id);session.completedInvestigations=3;await h.guide.write(h.id,session);await h.guide.submitMessage(h.id,{id:'over-budget',text:'Explore pricing.'});const updates=[];const result=await h.guide.run(h.id,{onUpdate:async s=>updates.push(structuredClone(s))});assert.equal(result.status,'paused');assert.equal(h.dispatch.length,0);assert.ok(!updates.some(s=>s.currentNode));const message=(await h.control.read(h.id)).messages[0];assert.equal(message.status,'needs-clarification');assert.equal(message.nodeId,undefined);}finally{await h.close();}
});

test('Stop during started update prevents actual dispatch and invalidated prepared direction cannot resume',async()=>{
  const h=await harness({director:async()=>direction('Pricing')});try{await h.guide.submitMessage(h.id,{id:'prepared',text:'Explore pricing.'});await h.guide.processMessages(h.id);const result=await h.guide.run(h.id,{onUpdate:async s=>{if(s.currentNode)await h.guide.stop();}});assert.equal(result.status,'stopped');assert.equal(h.dispatch.length,0);assert.equal((await h.control.read(h.id)).messages[0].status,'not-applied');result.status='paused';await h.guide.write(h.id,result);await h.guide.run(h.id);assert.ok(!h.dispatch.includes('feature:pricing'));}finally{await h.close();}
});

test('reopen retains text and marks interrupted pending messages inactive without a provider call',async()=>{
  const h=await harness();try{await h.guide.submitMessage(h.id,{id:'queued',text:'Keep this direction.'});await h.control.next(h.id);let calls=0;const reopened=new AgentSessionStore(h.store,{director:async()=>{calls++;return question;}});const control=await reopened.readControl(h.id);assert.equal(control.messages[0].text,'Keep this direction.');assert.equal(control.messages[0].status,'needs-clarification');assert.match(control.messages[0].reason,/app closed/);assert.equal(calls,0);assert.equal(h.dispatch.length,0);}finally{await h.close();}
});

test('an applied direction paused for setup resumes the same pending step instead of skipping it',async()=>{
  const h=await harness({director:async()=>direction('Pricing')});let first=true;
  const original=h.guide.turn;h.guide.turn=async(snapshot,text,options)=>{if(first){first=false;return {...snapshot,preflight:{status:'blocked'}};}return original(snapshot,text,options);};
  try{await h.guide.submitMessage(h.id,{id:'setup-direction',text:'Explore pricing.'});await h.guide.processMessages(h.id);let session=await h.guide.run(h.id);assert.equal(session.status,'paused');assert.equal(session.route[0].status,'pending');assert.equal((await h.control.read(h.id)).messages[0].status,'applied');session=await h.guide.run(h.id);assert.equal(session.route[0].status,'done');assert.ok(h.dispatch.includes('feature:pricing'));assert.equal(session.completedInvestigations,2);}finally{await h.close();}
});

test('first control read during a live run is not later mistaken for an interrupted app',async()=>{
  const started=deferred(),release=deferred();const h=await harness({turn:async()=>{started.resolve();await release.promise;}});
  try{const run=h.guide.run(h.id);await started.promise;await h.guide.readControl(h.id);await h.guide.submitMessage(h.id,{id:'live-question',text:'What are you doing?'});release.resolve();await run;await h.guide.submitMessage(h.id,{id:'next-question',text:'Explain what you found.'});const control=await h.control.read(h.id);assert.ok(!control.messages.some(m=>/app closed/.test(m.reason||'')));}finally{release.resolve();await h.close();}
});

test('Pause requested during semantic processing stops before the prepared next dispatch',async()=>{
  const started=deferred(),release=deferred();const h=await harness({director:async()=>{started.resolve();await release.promise;return direction('Pricing');}});
  try{await h.guide.submitMessage(h.id,{id:'pause-boundary',text:'Pricing next.'});const run=h.guide.run(h.id);await started.promise;h.guide.pause();release.resolve();const session=await run;assert.equal(session.status,'paused');assert.equal(h.dispatch.length,0);assert.equal((await h.control.read(h.id)).messages[0].status,'applying');}finally{release.resolve();await h.close();}
});

test('abort-signal Stop holds queued work while retaining applied history and later questions cannot revive it',async()=>{
  const started=deferred(),release=deferred(),seen=[];
  const h=await harness({director:async(_config,input)=>{seen.push(input.message.id);return input.message.id==='prepare'?direction('Pricing'):input.message.id==='old-queued'?direction('History'):question;},turn:async(_state,_text,options)=>{if(options.nodeId==='feature:pricing'){started.resolve();await release.promise;}}});
  try{
    await h.guide.submitMessage(h.id,{id:'prepare',text:'Pricing next.'});await h.guide.processMessages(h.id);
    const controller=new AbortController(),run=h.guide.run(h.id,{signal:controller.signal});await started.promise;
    await h.guide.submitMessage(h.id,{id:'old-queued',text:'Then inspect history.'});controller.abort();release.resolve();
    const stopped=await run;assert.equal(stopped.status,'stopped');
    let control=await h.control.read(h.id);assert.equal(control.messages.find(m=>m.id==='prepare').status,'applied');assert.equal(control.messages.find(m=>m.id==='old-queued').status,'not-applied');assert.match(control.messages.find(m=>m.id==='old-queued').reason,/Stopped/);
    await h.guide.submitMessage(h.id,{id:'later-question',text:'Why did you stop?'});await h.guide.processMessages(h.id);
    control=await h.control.read(h.id);assert.equal(control.messages.find(m=>m.id==='later-question').status,'answered');assert.deepEqual(seen,['prepare','later-question']);assert.deepEqual(h.dispatch,['feature:pricing']);
  }finally{release.resolve();await h.close();}
});

test('atomic control replacement retries Windows sharing failures without deleting the previous valid record',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-control-atomic-'));const file=path.join(root,'agent-control.json');
  try{
    await fs.writeFile(file,JSON.stringify({revision:1,retained:'original'}));let calls=0;const delays=[];
    await replaceControlFile(file,{revision:2,retained:'updated'},{rename:async(from,to)=>{calls++;assert.equal(JSON.parse(await fs.readFile(to,'utf8')).revision,1);if(calls<3)throw Object.assign(Error('Owned Windows sharing fixture'),{code:calls===1?'EPERM':'EBUSY'});await fs.rename(from,to);},wait:async ms=>delays.push(ms)});
    assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),{revision:2,retained:'updated'});assert.deepEqual(delays,[20,40]);assert.deepEqual(await fs.readdir(root),['agent-control.json']);
    let failures=0;await assert.rejects(()=>replaceControlFile(file,{revision:3},{rename:async()=>{failures++;throw Object.assign(Error('Persistent owned sharing failure'),{code:'EPERM'});},wait:async()=>{}}),/Persistent owned sharing failure/);
    assert.equal(failures,6);assert.equal(JSON.parse(await fs.readFile(file,'utf8')).revision,2);assert.deepEqual(await fs.readdir(root),['agent-control.json']);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('Stop releases a held semantic processor and its late reply cannot cancel a new-generation question',async()=>{
  const started=deferred(),release=deferred();const seen=[];
  const h=await harness({director:async(_config,input)=>{seen.push(input.message.id);if(input.message.id==='old-thinking'){started.resolve();await release.promise;return direction('Pricing');}return question;}});
  try{
    await h.guide.submitMessage(h.id,{id:'old-thinking',text:'Take pricing next.'});const old=h.guide.processMessages(h.id);await started.promise;
    await h.guide.stop(h.id);
    await Promise.race([old,new Promise((_resolve,reject)=>setTimeout(()=>reject(Error('Cancelled semantic processor remained held.')),1000))]);
    await h.guide.submitMessage(h.id,{id:'new-question',text:'Why did you stop?'});await h.guide.processMessages(h.id);
    let control=await h.control.read(h.id);assert.equal(control.messages.find(m=>m.id==='old-thinking').status,'not-applied');assert.equal(control.messages.find(m=>m.id==='new-question').status,'answered');const revision=control.revision;
    release.resolve();await new Promise(resolve=>setTimeout(resolve,20));control=await h.control.read(h.id);
    assert.equal(control.revision,revision);assert.equal(control.messages.find(m=>m.id==='new-question').status,'answered');assert.deepEqual(seen,['old-thinking','new-question']);assert.equal(h.dispatch.length,0);
  }finally{release.resolve();await h.close();}
});

test('late stopped-run cleanup does not hold questions submitted in the new control generation',async()=>{
  const started=deferred(),release=deferred();const seen=[];
  const h=await harness({turn:async()=>{started.resolve();await release.promise;},director:async(_config,input)=>{seen.push(input.message.id);return question;}});
  try{
    const controller=new AbortController(),run=h.guide.run(h.id,{signal:controller.signal});await started.promise;
    await h.guide.submitMessage(h.id,{id:'cancelled-queue',text:'Inspect history later.'});controller.abort();await h.guide.stop(h.id);
    await h.guide.submitMessage(h.id,{id:'new-after-stop',text:'Explain why we stopped.'});release.resolve();await run;
    assert.equal((await h.control.read(h.id)).messages.find(m=>m.id==='new-after-stop').status,'queued');
    await h.guide.processMessages(h.id);const control=await h.control.read(h.id);assert.equal(control.messages.find(m=>m.id==='new-after-stop').status,'answered');assert.equal(control.messages.find(m=>m.id==='cancelled-queue').status,'not-applied');assert.deepEqual(seen,['new-after-stop']);assert.deepEqual(h.dispatch,['feature:export']);
  }finally{release.resolve();await h.close();}
});
