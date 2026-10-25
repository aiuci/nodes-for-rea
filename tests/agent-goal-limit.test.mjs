import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {AGENT_GOAL_LIMIT,checkedAgentGoal} from '../lib/agent-goal.mjs';
import {AgentContextStore} from '../lib/agent-context.mjs';
import {AgentSessionStore,validateRoute,planningPrompt} from '../lib/agent-guide.mjs';
import {appendGoalTranscript} from '../ui/goal-voice-core.js';

const longGoal='Investigate transcript retrieval, source provenance and repository mentions.\nKeep observed evidence distinct from inferences. 🎯 视频 café\n'.repeat(240);
test('expanded goal accepts multiline Unicode and exact boundary, rejects overlimit and invalid input',()=>{
  assert.ok(longGoal.length>1500);assert.equal(checkedAgentGoal(longGoal),longGoal);
  const boundary='🎯'.repeat(AGENT_GOAL_LIMIT/2);assert.equal(boundary.length,AGENT_GOAL_LIMIT);assert.equal(checkedAgentGoal(boundary),boundary);
  assert.throws(()=>checkedAgentGoal(boundary+'x'),new RegExp(AGENT_GOAL_LIMIT.toLocaleString('en-US')+'-character limit'));
  assert.throws(()=>checkedAgentGoal(' \n '),/Enter a goal/);
  for(const value of [null,{},10000])assert.throws(()=>checkedAgentGoal(value,{allowEmpty:true}),/text goal/);
  assert.equal(checkedAgentGoal('',{allowEmpty:true}),'');
});
test('draft save and reopen preserve long text; failed saves preserve last draft and other context',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-goal-limit-')),store={directory:id=>path.join(root,id)},id=randomUUID();
  try{
    const context=new AgentContextStore(store);await context.write(id,{version:1,goal:'Old draft',items:[],projectFolder:null,custom:'kept'});
    await context.update(id,'goal',longGoal);assert.equal((await new AgentContextStore(store).read(id)).goal,longGoal);
    const boundary='a'.repeat(AGENT_GOAL_LIMIT);await context.update(id,'goal',boundary);
    const file=path.join(store.directory(id),'agent-context/context.json'),before=await fs.readFile(file);
    await assert.rejects(context.update(id,'goal',boundary+'x'),new RegExp(AGENT_GOAL_LIMIT.toLocaleString('en-US')+'-character limit'));
    await assert.rejects(context.update(id,'goal',null),/text goal/);
    assert.deepEqual(await fs.readFile(file),before);
    assert.equal((await context.read(id)).custom,'kept');
    await context.update(id,'goal','Original short draft');assert.equal((await context.read(id)).goal,'Original short draft');
    await context.update(id,'goal','');assert.equal((await context.read(id)).goal,'');
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('long goal survives planning, saved proposal, reopened session and injected execution without changing scope',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-goal-run-')),id=randomUUID();
  let state={id,title:'Owned target',status:'saved',draft:'Ordinary composer kept',messages:[{id:'discovery',role:'assistant',features:[{name:'Alpha',investigate:'Inspect alpha',claimIndexes:[0]}],claims:[{evidenceId:'e1',text:'Alpha is advertised'}]}],evidence:[{id:'e1',title:'Owned source',locator:'https://example.test',text:'Alpha'}]},calls=0,executed=0;
  const store={directory:id=>path.join(root,id),read:async()=>structuredClone(state)};await fs.mkdir(store.directory(id));
  const route=s=>validateRoute({steps:[{nodeId:'feature:alpha',action:'investigate',question:'Inspect alpha',why:'Relevant retained evidence',evidenceIds:['e1']}]},s);
  const options={planner:async(_config,s,goal)=>{calls++;assert.equal(goal,longGoal);assert.ok(planningPrompt(s,goal,{}).includes(longGoal));return route(s);},turn:async(s,_question,opts)=>{executed++;assert.ok(opts.agentContext.text.includes(longGoal.trim()));assert.equal(opts.preserveDraft,undefined);s.messages.push({id:'new',role:'assistant',branchFeatureName:'Alpha',claims:[{evidenceId:'e1'}]});state=s;return s;}};
  try{
    let guide=new AgentSessionStore(store,options);let session=await guide.propose(id,longGoal,null);assert.equal(session.goal,longGoal.trim());assert.equal(executed,0);
    guide=new AgentSessionStore(store,options);assert.equal((await guide.read(id)).goal,longGoal.trim());
    await assert.rejects(guide.propose(id,'x'.repeat(AGENT_GOAL_LIMIT+1),null),new RegExp(AGENT_GOAL_LIMIT.toLocaleString('en-US')+'-character limit'));assert.equal(calls,1);assert.equal((await guide.read(id)).goal,longGoal.trim());
    await guide.approve(id,session.route.map(s=>s.id));session=await guide.run(id);assert.equal(executed,1);assert.equal(session.status,'complete');assert.equal(state.draft,'Ordinary composer kept');assert.equal(session.completedInvestigations,1);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('Agent Control dictation uses expanded bound and preserves complete overflow',()=>{
  const draft='x'.repeat(1500);assert.equal(appendGoalTranscript(draft,'spoken',AGENT_GOAL_LIMIT).value,draft+' spoken');
  const boundary='x'.repeat(AGENT_GOAL_LIMIT);assert.deepEqual(appendGoalTranscript(boundary,'complete spoken text',AGENT_GOAL_LIMIT),{value:boundary,remainder:'complete spoken text'});
});
