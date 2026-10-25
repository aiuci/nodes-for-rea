import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDelivery,attachDelivery,deliveryMarkdown,takeawaysMarkdown} from '../lib/delivery.mjs';

function fixture(){
  const message={id:'answer',role:'assistant',title:'Rounding',text:'The inspected implementation rounds ties to even.',caveat:'Only the inspected rounding function is covered.',focus:{featureName:'Rounding'},findings:[{question:'Tie rule',finding:'Ties select the even integer.',change:'new',claimIndexes:[0]},{question:'Locale',finding:'Locale handling remains unknown.',change:'gap',claimIndexes:[]}],claims:[{text:'Ties select the even integer.',state:'observed',evidenceId:'code',quote:'roundEven(input)'}],openQuestions:['How is locale selected?']};
  return {message,state:{id:'owned-fixture',messages:[{id:'request',role:'user',text:'Explain how rounding works.'},message],evidence:[{id:'code',kind:'rea',evidenceStatus:'static',title:'Rounding function',operation:'analyze_function',sha256:'snapshot-hash',reaEvidenceId:'rea-1',targetIdentity:{path:'owned-fixture.exe',sha256:'target-hash'},text:'roundEven(input)',limitations:['The caller is outside this inspection.']}]}};
}

test('both depths retain material boundaries and unknowns without upgrading static evidence',()=>{
  const {state,message}=fixture(),result=buildDelivery(state,message);
  for(const depth of ['tldr','comprehensive']){assert.match(result.asset[depth],/Only the inspected rounding function/);assert.match(result.asset[depth],/does not establish executed behavior/);assert.match(result.asset[depth],/No independent behavioral check/);assert.match(result.asset[depth],/How is locale selected/);assert.match(result.asset[depth],/caller is outside/);}
  assert.deepEqual(result.evidenceIds,['code']);assert.equal(result.branch,'Rounding');assert.equal(result.request,'Explain how rounding works.');
  assert.match(result.asset.markdown,/^# TLDR\n/);assert.match(result.asset.markdown,/\n# COMPREHENSIVE\n/);
  assert.match(result.asset.comprehensive,/target-hash/);assert.match(result.asset.comprehensive,/rea-1/);
});

test('retained outputs do not leak later branch findings or unrelated evidence',()=>{
  const {state,message}=fixture();state.messages.push({id:'later-request',role:'user',text:'Inspect export.'},{id:'later-answer',role:'assistant',openQuestions:['Later secret question'],text:'Later answer'});state.openQuestions=['Later secret question'];state.evidence.push({id:'later',text:'Unrelated later text'});
  const result=buildDelivery(state,message);assert.doesNotMatch(result.asset.markdown,/Later secret|Unrelated later/);assert.equal(result.request,'Explain how rounding works.');
});

test('takeaways report actual finding changes without inventing corrected beliefs',()=>{
  const {state,message}=fixture(),result=buildDelivery(state,message);
  assert.equal(result.takeaways.changed.length,0);assert.equal(result.takeaways.established.length,1);
  assert.match(takeawaysMarkdown(result),/No corrected belief is explicitly recorded/);
  message.findings.push({question:'Tie detail',finding:'Only signed input is handled.',change:'updated'});
  assert.equal(buildDelivery(state,message).takeaways.changed.length,1);
});

test('saved delivery survives JSON persistence and current applicability remains visible',()=>{
  const {state,message}=fixture();attachDelivery(state,message);const reopened=JSON.parse(JSON.stringify(state));
  assert.deepEqual(reopened.messages.at(-1).delivery,message.delivery);
  reopened.evidence[0].stale=true;reopened.evidence[0].applicability='changed';
  assert.match(buildDelivery(reopened,reopened.messages.at(-1)).asset.tldr,/target has changed/);
});

test('verification is scoped to exact answer and preserves failed and untested cases',()=>{
  const {state,message}=fixture();state.verificationRuns=[{messageId:'other-answer',scope:'Unrelated passing check',status:'passed',cases:[]},{messageId:'answer',scope:'Positive integer ties only',status:'failed',expectationSource:'owned independent manifest',cases:[{status:'passed'},{status:'failed'},{status:'untested'}],limitations:['Negative values were not checked.']}];
  const result=buildDelivery(state,message);for(const depth of ['tldr','comprehensive']){assert.match(result.asset[depth],/1 passed, 1 failed, 1 untested/);assert.match(result.asset[depth],/Positive integer ties only/);assert.match(result.asset[depth],/Negative values were not checked/);assert.doesNotMatch(result.asset[depth],/Unrelated passing check/);assert.doesNotMatch(result.asset[depth],/No independent behavioral check/);}
});

test('export selects exact artifact and rejects accidental unknown formats',()=>{
  const {state,message}=fixture();assert.doesNotMatch(deliveryMarkdown(state,message),/# Investigation takeaways/);assert.match(deliveryMarkdown(state,message,{kind:'takeaways'}),/^# Investigation takeaways/);assert.match(deliveryMarkdown(state,message,{kind:'bundle'}),/# TLDR[\s\S]*# Investigation takeaways/);assert.throws(()=>deliveryMarkdown(state,message,{kind:'pdf'}));assert.throws(()=>buildDelivery(state,{role:'user'}));
});

test('source-free proposals and legacy saved answers remain honest',()=>{
  const state={messages:[],evidence:[]},message={id:'legacy',role:'assistant',text:'Consider adding a queue.',claims:[{state:'proposed',text:'Add a queue.'}]};
  const result=buildDelivery(state,message);assert.match(result.asset.tldr,/Consider adding a queue/);assert.match(result.asset.tldr,/does not authorize execution/);assert.match(result.asset.tldr,/no retained source references/);
});

test('comprehensive exports retain check inputs, expectations and actual results',()=>{
  const {state,message}=fixture();state.verificationRuns=[{id:'owned-run',messageId:'answer',scope:'Tie case',status:'failed',expectationSource:'Independent oracle',cases:[{id:'tie',input:2.5,expected:2,actual:3,status:'failed'}],evidenceIds:['code']}];
  const result=buildDelivery(state,message);assert.match(result.asset.comprehensive,/"input": 2.5/);assert.match(result.asset.comprehensive,/"expected": 2/);assert.match(result.asset.comprehensive,/"actual": 3/);assert.match(result.asset.comprehensive,/"status": "failed"/);
});

test('generated support uses its own indexes, exact quotes and earlier same-branch evidence',()=>{
  const {state,message}=fixture();state.evidence.push({id:'earlier',kind:'file',title:'Caller',text:'const signed = true;',sha256:'earlier-hash',applicability:'changed'});
  state.messages.unshift({id:'earlier-result',role:'assistant',branchFeatureName:'Rounding',claims:[{state:'observed',text:'Signed input.',evidenceId:'earlier',quote:'const signed = true;'}]});
  message.finalAsset={title:'Rounding specification',form:'Behavior specification',tldr:'Signed inputs use ties-to-even.',comprehensive:'## Behavior\n\nTie inputs select the even integer.',supportingClaims:[{state:'observed',text:'The caller supplies signed input.',evidenceId:'earlier',quote:'const signed = true;'},...message.claims],claimIndexes:[1,0]};
  const result=buildDelivery(state,message);assert.equal(result.generated,true);assert.equal(result.form,'Behavior specification');assert.match(result.asset.tldr,/Signed inputs use ties-to-even/);assert.deepEqual(result.evidenceIds,['code','earlier']);assert.match(result.asset.comprehensive,/The caller supplies signed input/);assert.match(result.asset.comprehensive,/const signed = true/);
  for(const depth of ['tldr','comprehensive']){assert.match(result.asset[depth],/target has changed/);assert.match(result.asset[depth],/No independent behavioral check/);}
});

test('invalid generated references, quotes and unrelated branch support fall back safely',()=>{
  for(const failure of ['quote','branch','index','missing']){
    const {state,message}=fixture();state.evidence.push({id:'other',kind:'file',text:'Other branch evidence.'});state.messages.unshift({id:'other-result',role:'assistant',branchFeatureName:'Export',claims:[{state:'observed',evidenceId:'other',quote:'Other branch evidence.'}]});
    const claim=failure==='branch'?{state:'observed',text:'Unrelated',evidenceId:'other',quote:'Other branch evidence.'}:{...message.claims[0],...(failure==='quote'?{quote:'Invented quote'}:{})};
    message.finalAsset={title:'Generated',form:'Specification',tldr:'UNSUPPORTED GENERATED BODY',comprehensive:'UNSUPPORTED GENERATED DETAIL',supportingClaims:[claim],claimIndexes:[failure==='index'?2:0]};if(failure==='missing')delete message.finalAsset.supportingClaims;
    const result=buildDelivery(state,message);assert.equal(result.generated,false);assert.doesNotMatch(result.asset.markdown,/UNSUPPORTED GENERATED/);assert.match(result.asset.markdown,/saved finished asset has unsupported references/);assert.doesNotMatch(result.asset.markdown,/Other branch evidence/);
  }
});

test('source-free generated proposals retain proposal and execution boundaries',()=>{
  const state={messages:[],evidence:[]},message={id:'proposal',role:'assistant',text:'An initial idea.',claims:[],finalAsset:{title:'Queue proposal',form:'Design proposal',tldr:'Add a queue.',comprehensive:'A queue could retain pending work.',supportingClaims:[{text:'Add a queue.',state:'proposed',evidenceId:'',quote:''}],claimIndexes:[0]}};
  const result=buildDelivery(state,message);assert.equal(result.generated,true);assert.match(result.asset.tldr,/does not authorize execution/);assert.match(result.asset.comprehensive,/Proposal: Add a queue/);
});

test('generated verification provenance includes only selected branch source checkpoints',()=>{
  const {state,message}=fixture();state.messages.unshift({id:'prior',role:'assistant',branchFeatureName:'Rounding',claims:message.claims},{id:'unrelated',role:'assistant',branchFeatureName:'Export',claims:[]});
  message.finalAsset={title:'Specification',form:'Behavior specification',tldr:'Ties select even.',comprehensive:'Ties select even.',supportingClaims:message.claims,claimIndexes:[0],sourceMessageIds:['prior','unrelated']};
  state.verificationRuns=[{id:'same-branch',messageId:'prior',scope:'Selected branch finite case',status:'passed',cases:[]},{id:'other-branch',messageId:'unrelated',scope:'Unrelated check must not leak',status:'passed',cases:[]}];
  const result=buildDelivery(state,message);assert.match(result.asset.tldr,/Selected branch finite case/);assert.doesNotMatch(result.asset.markdown,/Unrelated check must not leak/);
});

test('TLDR keeps material trust limits while provider operating details stay comprehensive',()=>{
  const {state,message}=fixture();state.evidence[0].sourceCoverage={partial:true};state.evidence[0].limitations.push(
    'The Windows bridge uses authenticated IPv4 loopback; the endpoint file contains no bearer token.',
    'Default-space addresses use lowercase 0x-prefixed hexadecimal.',
    'The imported Program and temporary project are ephemeral and deleted on close.',
    'Unresolved computed or indirect flows without target addresses are not represented as reference edges.',
    'Pseudocode and assembly are Ghidra-specific representations, not original source or Hopper-equivalent text.',
    'The remote backend is unavailable; its result cannot be inspected.'
  );message.inspectionErrors=['A requested function could not be inspected.'];
  const result=buildDelivery(state,message);
  assert.doesNotMatch(result.asset.tldr,/bearer token|Default-space|temporary project/);assert.match(result.asset.comprehensive,/bearer token/);assert.match(result.asset.comprehensive,/Default-space/);assert.match(result.asset.comprehensive,/temporary project/);
  for(const depth of ['tldr','comprehensive']){assert.match(result.asset[depth],/caller is outside/);assert.match(result.asset[depth],/remote backend is unavailable/);assert.match(result.asset[depth],/function could not be inspected/);assert.match(result.asset[depth],/not original source/);assert.match(result.asset[depth],/partial or truncated coverage/);}
  assert.match(result.asset.tldr,/partial or truncated coverage/);assert.match(result.asset.tldr,/call\/reference graph may be incomplete/);
});
