import test from 'node:test';
import assert from 'node:assert/strict';
import {ReaInvestigation,deliveryReference,reaEvidenceRecord} from '../lib/rea-engine.mjs';
import {productForEvidence,productsFor} from '../lib/collection.mjs';
import {mechanismErrors} from '../lib/mechanisms.mjs';
import {inventoryRecords} from '../lib/discovery-inventory.mjs';
import {Investigator} from '../lib/investigation.mjs';
const id='ev_'+'a'.repeat(64),target={kind:'artifact',targetType:'native',locator:'C:/ProgramData/Example',root:'C:/Program Files/Example/app.exe',identity:{path:'C:/Program Files/Example/app.exe',sha256:'b'.repeat(64)}};
const failure={error:{code:'resource_constraint',message:'Completed but delivery too large',details:{resource:'transport',reported_limits:{evidence_reference:{kind:'retained-evidence',evidence_id:id}}}}};
test('transport receipt registers and checkpoints retained analysis before reporting delivery failure',async()=>{
 const saved=[],state={targets:[target],evidence:[],activity:[]},rea=new ReaInvestigation({},state,'C:/owned/state',{addEvidence:async e=>{saved.push(e);state.evidence.push(e);return e;}});let checkpoints=0;
 rea.client={callTool:async()=>({isError:true,content:[{type:'text',text:JSON.stringify(failure)}]})};rea.checkpoint=async()=>{checkpoints++;};
 await assert.rejects(rea.invoke('list_strings',{},target),/Completed but delivery/);
 assert.equal(checkpoints,1);assert.equal(saved[0].evidenceStatus,'inspection-failed');assert.equal(saved[0].reaParentEvidenceId,id);assert.ok(rea.known.has(id));
 assert.doesNotThrow(()=>rea.validateArguments('inspect_analysis_view',{source:{kind:'retained-evidence',evidence_id:id},view:{kind:'summary'}},target));
 assert.throws(()=>rea.validateArguments('inspect_analysis_view',{source:{kind:'retained-evidence',evidence_id:id}}, {...target,root:'C:/other.exe',locator:'C:/other.exe'}),/different selected target/);
});
test('historical transport receipt is available without rewriting the raw snapshot; arbitrary IDs are rejected',()=>{
 const text=JSON.stringify(failure),source={locator:target.root,text,evidenceStatus:'inspection-failed'},rea=new ReaInvestigation({},{targets:[target],evidence:[source]},'C:/owned');
 assert.ok(rea.known.has(id));assert.equal(source.text,text);assert.equal(deliveryReference({error:{...failure.error,code:'other'}}),'');
 const unavailable=new ReaInvestigation({},{targets:[target],evidence:[source],reaUnretainedEvidenceIds:[id]},'C:/owned');assert.ok(!unavailable.known.has(id));
});
test('large native inventories use real supported filters, never invented paging parameters',async()=>{
 const state={targets:[target],evidence:[{operation:'binary_overview',locator:target.root,text:JSON.stringify({string_count:18726,procedure_count:16923})}]},rea=new ReaInvestigation({},state,'C:/owned');
 assert.throws(()=>rea.validateArguments('list_strings',{},target),/search_strings/);assert.throws(()=>rea.validateArguments('list_procedures',{},target),/search_procedures/);
 assert.doesNotThrow(()=>rea.validateArguments('list_strings',{address:'0x1234'},target));assert.doesNotThrow(()=>rea.validateArguments('search_strings',{pattern:'Memory',mode:'literal'},target));
 rea.client={tools:[{name:'list_strings',inputSchema:{type:'object',properties:{address:{type:'string'}}}},{name:'list_procedures',inputSchema:{type:'object'}},{name:'search_strings',inputSchema:{type:'object'}}],sessionStatus:async()=>({})};
 const operations=(await rea.catalog())[0].operations;assert.deepEqual(operations.find(t=>t.name==='list_strings').inputSchema.required,['address']);assert.ok(!operations.some(t=>t.name==='list_procedures'));
});
test('confirmed recovered artifact evidence retains its product attribution without matching neighbouring products',()=>{
 const state={targets:[target],evidence:[],messages:[]},evidence={locator:target.root,targetIdentity:target.identity};assert.equal(productForEvidence(state,evidence).id,productsFor(state)[0].id);
 assert.equal(productForEvidence(state,{...evidence,locator:'C:/Program Files/Other/app.exe'}),undefined);
});
test('failed diagnostics remain boundaries and cannot supply mechanism inventory capabilities',()=>{
 const source={id:'failed',text:'Tool failed with a native symbol error',evidenceStatus:'inspection-failed'},inventory={mechanisms:[{id:'m',name:'Native symbol discovery',role:'core',references:[{evidenceId:source.id,quote:source.text}]}]};
 assert.ok(mechanismErrors(inventory,[source]).some(e=>/failed-inspection/.test(e)));assert.equal(inventoryRecords({evidence:[source],messages:[],mechanismInventory:inventory}).length,0);
});
test('direct backend submission cannot execute a historical verification constraint',async()=>{
 const state={targets:[],evidence:[],messages:[{id:'answer',role:'assistant',directions:['Keep runtime behavior unverified.'],features:[]}],attempts:[]},investigator=new Investigator({save:async()=>{throw new Error('Unexpected mutation');}});
 await assert.rejects(investigator.turn(state,'Keep runtime behavior unverified.',{parentResultId:'answer',parentNodeId:'direction:answer:0'}),/verification constraint/);assert.equal(state.attempts.length,0);
});
test('a successful MCP envelope with unavailable producer coverage is retained as a failed inspection, not an empty product',async()=>{
 const state={targets:[target],evidence:[],activity:[]},rea=new ReaInvestigation({},state,'C:/owned',{addEvidence:async e=>{state.evidence.push(e);return e;}});rea.client={callTool:async()=>({structuredContent:{evidence_id:id,normalized_result:{coverage:{status:'complete-within-view',total:0},summary:{coverage:{state:'unavailable',issues:[{detail:'Managed metadata exceeds the 67108864 byte representation budget'}]}}}}})};rea.checkpoint=async()=>{};
 await assert.rejects(rea.invoke('inspect_managed_members',{},target),/67108864/);assert.equal(state.evidence[0].evidenceStatus,'inspection-failed');assert.equal(state.evidence[0].sourceCoverage.state,'unavailable');assert.ok(state.evidence[0].raw.includes('complete-within-view'));
});
