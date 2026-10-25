// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {inventoryRecords,inventoryCoverage} from './discovery-inventory.mjs';

export const PRICE_AS_OF='2026-10-21';
const claude='https://platform.claude.com/docs/en/about-claude/pricing';
// Standard, uncached API USD per million tokens; comparison only, not routing.
export const MODEL_PRICES=Object.freeze([
 {id:'gpt-6-luna',name:'GPT-6 Luna',tier:'Budget',input:0.10,output:0.50,longInput:0.20,longOutput:0.75,threshold:272000,source:'https://developers.openai.com/api/docs/models/gpt-6-luna'},
 {id:'gpt-6.1-sol',name:'GPT-6.1 Sol',tier:'Mid-range',input:2,output:10,longInput:4,longOutput:15,threshold:272000,source:'https://developers.openai.com/api/docs/models/gpt-6.1-sol'},
 {id:'gpt-6-astra',name:'GPT-6 Astra',tier:'Premium',input:10,output:50,longInput:20,longOutput:75,threshold:272000,source:'https://developers.openai.com/api/docs/models/gpt-6-astra'},
 {id:'claude-haiku-5-5',name:'Claude Haiku 5.5',tier:'Budget',input:0.10,output:0.50,longInput:0.50,longOutput:2.50,threshold:100000,source:claude},
 {id:'claude-sonnet-5-5',name:'Claude Sonnet 5.5',tier:'Mid-range',input:2,output:10,source:claude},
 {id:'claude-opus-5-5',name:'Claude Opus 5.5',tier:'Premium',input:4,output:20,source:claude}
].map(Object.freeze));

function supported(state,claim){const source=(state.evidence||[]).find(e=>e.id===claim?.evidenceId);return !!(claim&&claim.state!=='proposed'&&claim.quote?.trim()&&claim.quoteOrigin!=='inspection-limit'&&source&&!source.stale&&source.evidenceStatus!=='inspection-failed'&&source.text?.includes(claim.quote));}
export function coveragePlan(state){
 const inventory=inventoryRecords(state),records=inventory.filter(r=>!['proposed','inferred'].includes(r.row.evidenceBasis));
 const steps=records.map(record=>{
  const latest=(state.messages||[]).findLast(m=>record.resultIds.includes(m.id)),claims=latest?.claims||[],findings=latest?.findings||[];
  const hasSupport=claims.some(c=>supported(state,c)),gaps=findings.some(f=>f.change==='gap'||!(f.claimIndexes||[]).some(i=>supported(state,claims[i])))||(latest?.openQuestions||[]).some(q=>typeof q==='string'&&q.trim());
  const complete=latest?.continuation?.status==='complete'&&hasSupport&&!gaps&&claims.filter(c=>c.state!=='proposed').every(c=>supported(state,c));
  const blocked=latest?.continuation?.status==='blocked',status=complete?'reviewed':blocked?'blocked':latest?'follow-up':'untouched';
  return {id:record.id,name:record.title,record,status,action:latest?'deeper':'inspect',reason:complete?'Latest answer is complete and source-supported.':blocked?(latest.continuation.reason||'Different evidence or access is needed.'):latest?(latest.continuation?.uncertainty||latest.continuation?.nextEvidence||'Resolve remaining gaps and check the support for this answer.'):'Investigate this discovered area and retain a supported answer.'};
 });
 const coverage=inventoryCoverage(state),reviewed=steps.filter(s=>s.status==='reviewed').length;
 return {total:records.length,reviewed,investigated:coverage.investigated,candidates:coverage.candidates,blocked:steps.filter(s=>s.status==='blocked').length,steps,actionable:steps.filter(s=>['untouched','follow-up'].includes(s.status)),knownAreasReviewed:records.length>0&&reviewed===records.length,wholeApplicationComplete:false,boundaries:coverage.boundaries,questions:(state.openQuestions||[]).filter(q=>typeof q==='string'&&q.trim())};
}
export function budgetDefaults(state){
 // This is an editable planning proxy, not the provider's tokenizer or exact prompt.
 const text=(state.evidence||[]).reduce((n,e)=>n+String(e.text||'').length,0)+JSON.stringify((state.messages||[]).slice(-14)).length+JSON.stringify(inventoryRecords(state).map(r=>r.row)).length+12000;
 return {inputPerCall:Math.min(2000000,Math.max(4000,Math.ceil(text/4/100)*100)),answerPerCall:2000,callsPerStep:2,lowReasoning:1000,highReasoning:12000,contingency:50,customInput:1,customOutput:5};
}
function number(value,name,max,{min=0,integer=true}={}){if(value===''||value===null||value===undefined)throw Error(`Enter ${name}.`);const n=Number(value);if(!Number.isFinite(n)||n<min||n>max||integer&&!Number.isInteger(n))throw Error(`${name} must be ${integer?'a whole number':'a number'} from ${min.toLocaleString()} to ${max.toLocaleString()}.`);return n;}
export function calculateBudget(value){
 const steps=number(value.steps,'Selected steps',100000),callsPerStep=number(value.callsPerStep,'AI requests per step',20,{min:1}),inputPerCall=number(value.inputPerCall,'Input tokens per request',2000000),answerPerCall=number(value.answerPerCall,'Answer tokens per request',1000000),low=number(value.lowReasoning,'Low reasoning tokens',1000000),high=number(value.highReasoning,'High reasoning tokens',1000000),contingency=number(value.contingency,'Extra allowance percent',300),customInput=number(value.customInput,'Custom input rate',10000,{integer:false}),customOutput=number(value.customOutput,'Custom output rate',10000,{integer:false});
 if(high<low)throw Error('High reasoning allowance must be at least the low allowance.');
 const calls=steps*callsPerStep,allowance=1+contingency/100,scenario=reasoning=>{const input=calls*inputPerCall,output=calls*(answerPerCall+reasoning);return {input,output,tokens:input+output,withAllowance:Math.ceil((input+output)*allowance)};};
 const lower=scenario(low),upper=scenario(high);
 const rows=[...MODEL_PRICES,{id:'custom',name:'Your custom rates',tier:'Custom',input:customInput,output:customOutput}].map(model=>{
  const long=model.threshold&&inputPerCall>model.threshold,inputRate=long?model.longInput:model.input,outputRate=long?model.longOutput:model.output;
  const upperLong=model.threshold&&inputPerCall*allowance>model.threshold,upperInputRate=upperLong?model.longInput:model.input,upperOutputRate=upperLong?model.longOutput:model.output;
  const cost=s=>{const min=(s.input*inputRate+s.output*outputRate)/1000000;return {min,max:(s.input*upperInputRate+s.output*upperOutputRate)*allowance/1000000};};
  return {...model,inputRate,outputRate,longContext:!!long,upperLongContext:!!upperLong,low:cost(lower),high:cost(upper)};
 });
 return {steps,calls,low:lower,high:upper,rows,contingency};
}
export function summarizeUsage(rows){
 let measured=0,input=0,output=0,cachedInput=0;
 for(const row of rows){const u=row?.usage;if(!u)continue;const i=u.input_tokens??u.prompt_tokens,o=u.output_tokens??u.completion_tokens,valid=v=>Number.isSafeInteger(v)&&v>=0;
  const read=u.cache_read_input_tokens??0,write=u.cache_creation_input_tokens??0,cached=u.cached_input_tokens??u.input_tokens_details?.cached_tokens??u.prompt_tokens_details?.cached_tokens??read;
  if(![i,o,read,write,cached].every(valid))continue;
  measured++;input+=i+(row.provider==='claude'?read+write:0);output+=o;cachedInput+=cached;
 }
 return {logged:rows.length,measured,unknown:rows.length-measured,input:measured?input:null,output:measured?output:null,cachedInput:measured?cachedInput:null};
}
