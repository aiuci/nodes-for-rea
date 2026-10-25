import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {sourceQuote} from '../lib/source-quote.mjs';
import {restoreMechanismQuotes,mechanismErrors,mechanismSchema} from '../lib/mechanisms.mjs';
import {validateClaims,planSchema} from '../lib/agent.mjs';
import {InvestigationStore,Investigator} from '../lib/investigation.mjs';
import {explainFailure} from '../lib/failure-recovery.mjs';
import {diagnoseFailure,consumeRecovery} from '../lib/failure-recovery-host.mjs';

test('reflowed quotes resolve to the original contiguous source, including CRLF and tabs',()=>{
  const original='Start and\r\nResume\tstay disabled.';
  assert.equal(sourceQuote(original,'Start and Resume stay disabled.'),original);
  assert.equal(sourceQuote('A\u00a0B','A B'),'A\u00a0B');
  assert.equal(sourceQuote('The value is a+b (x).','a+b (x).'),'a+b (x).');
});
test('quote recovery rejects paraphrases, omissions, punctuation changes and blank/missing sources',()=>{
  for(const quote of ['Start and Resume stay enabled.','Start … disabled.','start and Resume stay disabled.','Start and Resume stay disabled!','']){
    assert.equal(sourceQuote('Start and\nResume stay disabled.',quote),null);
  }
  assert.equal(sourceQuote(undefined,'Anything'),null);
});
test('inventory persists exact source whitespace without changing IDs or accepting fabricated references',()=>{
  const source={id:'a',text:'Start and\nResume stay disabled.'};
  const inventory={mechanisms:[{id:'resume',name:'Resume',references:[{evidenceId:'a',quote:'Start and Resume stay disabled.'}]}]};
  assert.equal(mechanismErrors(inventory,[source]).length,1);
  const restored=restoreMechanismQuotes(inventory,[source]);
  assert.equal(restored.mechanisms[0].references[0].quote,source.text);
  assert.equal(inventory.mechanisms[0].references[0].quote.includes('\n'),false);
  assert.deepEqual(mechanismErrors(restored,[source]),[]);
  assert.equal(mechanismErrors(restored,[{...source,evidenceStatus:'inspection-failed'}]).length,1);
  assert.equal(mechanismErrors(restoreMechanismQuotes(inventory,[]),[]).length,1);
});
test('claim validation preserves source line and exact quote; omitted words remain rejected',()=>{
  const source={id:'a',kind:'file',text:'Heading\nStart and\nResume stay disabled.'};
  const result=validateClaims({claims:[{state:'observed',evidenceId:'a',quote:'Start and Resume stay disabled.'},{state:'observed',evidenceId:'a',quote:'Start stays disabled.'}]},[source]);
  assert.equal(result.rejectedClaimCount,1);
  assert.equal(result.claims[0].quote,'Start and\nResume stay disabled.');
  assert.equal(result.claims[0].sourceLine,2);
});
test('reference validation failure has truthful recovery and one readiness-gated explicit retry',async()=>{
  const reason='The mechanism inventory contained unsupported references or omitted a named capability. Captured sources remain saved.';
  const attempt={id:'a',status:'failed',reason,question:'Discover capabilities',startedAt:new Date().toISOString()};
  assert.equal(explainFailure(attempt).category,'evidence-validation');
  const state={attempts:[attempt],messages:[],evidence:[],targets:[]},config={};
  await diagnoseFailure(state,attempt,{config,check:async()=>({ready:true,summary:'Ready'})});
  assert.equal(attempt.recovery.diagnostic.canRetry,true);
  consumeRecovery(state,attempt,config);
  assert.throws(()=>consumeRecovery(state,attempt,config),/Diagnose/);
});
test('discovery completes with reflowed inventory and answer quotes, without repair calls',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-quote-discovery-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new InvestigationStore(root),state=await store.create();
  const text='Start and\nResume stay disabled while the composer is unavailable.';
  await store.addEvidence(state,{id:'owned',kind:'file',text,raw:text,title:'Owned source'});
  let inventories=0,answers=0;
  const quote=text.replace('\n',' ');
  const reasoning=async(_config,schema)=>{
    if(schema===planSchema)return {focus:'Discover capabilities',reads:[]};
    if(schema===mechanismSchema){inventories++;return {candidateReview:[],mechanisms:[{id:'guard',name:'Composer guard',role:'core',summary:'Guards start and resume.',parts:[],references:[{evidenceId:'owned',quote}]}]};}
    answers++;
    return {answer:'The composer guard blocks starting while unavailable.',features:[{name:'Composer guard',displayLabel:'Composer guard',parentName:'',mechanismIds:['guard'],claimIndexes:[0]}],mechanismCoverage:[{mechanismId:'guard',featureNames:['Composer guard']}],claims:[{state:'observed',evidenceId:'owned',quote,text:'Start and Resume are guarded.'}],recommendation:'Composer guard',directions:[],openQuestions:[]};
  };
  await new Investigator(store,{config:{reaEnabled:false},reasoning}).turn(state,'Discover capabilities');
  assert.equal(state.status,'saved');
  assert.equal(inventories,1);assert.equal(answers,1);
  assert.equal(state.mechanismInventory.mechanisms[0].references[0].quote,text);
  const reopened=await store.read(state.id);
  assert.equal(reopened.messages.at(-1).claims[0].quote,text);
});
