// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {findingCategory} from './finding-category.mjs';
import {findingSupport} from './outcomes.mjs';

// Recomputable display interpretation, never persisted over the saved answer.
export const EVIDENCE_VIEW_VERSION=1;
export const METADATA_PARSE_LIMIT=8*1024*1024;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const unique=values=>[...new Set(values)];
const plural=(count,singular,other=singular+'s')=>`${count} ${count===1?singular:other}`;
const excerpt=(value,limit)=>typeof value==='string'?value.length>limit?value.slice(0,limit-1).trimEnd()+'…':value:'';
const directReferences=(message,finding)=>{
  const claimIndexes=Array.isArray(finding?.claimIndexes)?[...finding.claimIndexes]:[];
  const claims=claimIndexes.filter(index=>Number.isInteger(index)&&index>=0).map(index=>message?.claims?.[index]).filter(Boolean);
  return {claimIndexes,evidenceIds:unique(claims.map(claim=>claim.evidenceId).filter(id=>typeof id==='string'&&id))};
};

export function responseUnderstanding(state,message){
  const rows=(message?.findings||[]).map((finding,index)=>({index,category:findingCategory(state,message,finding).key,gap:finding.change==='gap',quoteSupported:findingSupport(state,message,finding)}));
  const counts={findingRows:rows.length,observedFindingRows:rows.filter(row=>row.category==='observed'&&!row.gap).length,inferredFindingRows:rows.filter(row=>row.category==='inferred'&&!row.gap).length,unknownFindingRows:rows.filter(row=>row.category==='unknown').length,unresolvedQuestionRows:rows.filter(row=>row.gap).length,unverifiedFindingRows:rows.filter(row=>row.category==='unknown'&&!row.gap).length,quoteSupportedFindingRows:rows.filter(row=>row.quoteSupported).length};
  counts.supportingFindingRows=counts.observedFindingRows+counts.inferredFindingRows;
  const parts=[];
  if(counts.observedFindingRows)parts.push(plural(counts.observedFindingRows,'observed finding'));
  if(counts.inferredFindingRows)parts.push(plural(counts.inferredFindingRows,'inferred finding'));
  if(counts.unresolvedQuestionRows)parts.push(plural(counts.unresolvedQuestionRows,'unresolved question'));
  if(counts.unverifiedFindingRows)parts.push(plural(counts.unverifiedFindingRows,'unverified finding'));
  const compact=[plural(counts.supportingFindingRows,'supporting finding'),plural(counts.unresolvedQuestionRows,'unresolved question'),...(counts.unverifiedFindingRows?[plural(counts.unverifiedFindingRows,'unverified finding')]:[])].join(' · ');
  const eligible=rows.filter(row=>!row.gap&&['observed','inferred'].includes(row.category));
  const knowledge={scope:{kind:'response',messageId:message?.id||null},items:eligible.slice(0,8).map(row=>{const finding=message.findings[row.index];return {findingIndex:row.index,nodeId:`finding:${message.id}:${row.index}`,question:excerpt(finding.question,180),finding:excerpt(finding.finding,360),category:findingCategory(state,message,finding),...directReferences(message,finding),excerpted:(finding.question?.length||0)>180||(finding.finding?.length||0)>360};}),totalEligible:eligible.length,omitted:Math.max(0,eligible.length-8),qualification:'These are the saved finding statements and their Nodes categories, not new semantic verification or additional support links.'};
  return {projectionVersion:EVIDENCE_VIEW_VERSION,scope:{kind:'response',messageId:message?.id||null},counts,knowledge,nextRecordedAction:excerpt(message?.recommendation,280)||null,summary:parts.length?`In this saved response: ${parts.join(' · ')}.`:'No findings were recorded in this response.',compact:counts.findingRows?compact:'No findings recorded',workflow:{recordedStatus:message?.continuation?.status||null,reason:message?.continuation?.reason||null},resolution:{state:counts.unresolvedQuestionRows?'unresolved':'not-assessed',detail:counts.unresolvedQuestionRows?'Recorded gap rows remain unresolved. A completed workflow does not resolve them.':'Saved categories and quotation matches do not independently establish that the central question is resolved.'},rows,limitations:['Counts describe Nodes finding rows in this response, not canonical REA Evidence records or completeness.','Quote-supported rows can overlap unresolved question rows. A matching passage does not establish semantic entailment.']};
}

export function findingUnderstanding(state,message,finding,{response=responseUnderstanding(state,message)}={}){
  const category=findingCategory(state,message,finding),references=directReferences(message,finding);
  const unresolved=finding?.change==='gap',index=(message?.findings||[]).indexOf(finding);
  return {projectionVersion:EVIDENCE_VIEW_VERSION,scope:{kind:'finding',messageId:message?.id||null,findingIndex:index>=0?index:null},recordedFinding:{proposalClaimIndexes:references.claimIndexes.filter(index=>message?.claims?.[index]?.state==='proposed'),question:excerpt(finding?.question,180),finding:excerpt(finding?.finding,360),excerpted:(finding?.question?.length||0)>180||(finding?.finding?.length||0)>360},category,resolution:{state:unresolved?'unresolved':'not-assessed',detail:unresolved?'This recorded question remains unresolved. Unknown does not mean absent.':'This is a saved finding; its Nodes category does not independently verify the conclusion.'},directSupport:{...references,quoteSupported:findingSupport(state,message,finding),qualification:'Only this row’s recorded claim references are direct links. Quote matching is not semantic entailment.'},parentContext:{scope:response.scope,counts:{...response.counts},summary:response.summary,knowledge:structuredClone(response.knowledge),qualification:'Other finding rows in the parent response are context, not additional claim-specific support for this question.'},summary:unresolved?`Unresolved · parent response has ${plural(response.counts.supportingFindingRows,'supporting finding')}.`:category.detail,workflow:{...response.workflow},nextRecordedAction:response.nextRecordedAction};
}

function retainedShape(value,path='$',depth=0,parseBudget={remaining:METADATA_PARSE_LIMIT}){
  if(!object(value)||depth>4)return null;
  if(typeof value.evidence_id==='string')return {record:value,path,transport:'direct-json'};
  if(object(value.result)&&typeof value.result.evidence_id==='string')return {record:value.result,path:path+'.result',transport:'session-result'};
  if(object(value.structuredContent)){
    const found=retainedShape(value.structuredContent,path+'.structuredContent',depth+1,parseBudget);
    if(found)return {...found,transport:'mcp-structuredContent'};
  }
  if(Array.isArray(value.content))for(const [index,block]of value.content.slice(0,16).entries()){
    if(block?.type!=='text'||typeof block.text!=='string')continue;
    if(block.text.length>parseBudget.remaining)continue;
    parseBudget.remaining-=block.text.length;
    try{const parsed=JSON.parse(block.text),found=retainedShape(parsed,`${path}.content[${index}].text(JSON)`,depth+1,parseBudget);if(found)return {...found,transport:'mcp-text'};}catch{}
  }
  return null;
}

// This recognizes known structures; it is deliberately not REA's authenticated
// parseEvidence/import boundary. No dist imports or invented native IDs.
export function retainedEvidenceMetadata(raw,source={}){
  const omissions=[],limitations=['Metadata structure recognition does not authenticate a native semantic ID, producer, execution or conclusion.','Native source metadata applies to this receipt. A claim without a native subrecord reference is not linked to a particular graph fact.'];
  let budget=48000,items=0,omittedNotices=0;
  const omit=(path,reason)=>{if(omissions.length<64)omissions.push({path:path.slice(0,320),reason});else{omittedNotices++;omissions[63]={path:'$',reason:`Additional metadata omissions (${omittedNotices}) are not listed; complete content remains in the snapshot.`};}};
  function bounded(value,path,depth=0){
    if(++items>2000||budget<=0){omit(path,'Metadata display budget reached; original snapshot retained.');return '[display budget reached]';}
    if(typeof value==='string'){const remaining=Math.max(0,Math.min(4000,budget)),text=value.slice(0,remaining);budget-=text.length;if(text.length<value.length)omit(path,'Text preview shortened; original value retained in snapshot.');return text;}
    if(value===null||['number','boolean'].includes(typeof value))return value;
    if(depth>=8){omit(path,'Nested metadata depth capped; original retained.');return '[nested metadata retained in snapshot]';}
    if(Array.isArray(value)){if(value.length>32)omit(path,`Showing 32 of ${value.length} items.`);return value.slice(0,32).map((item,index)=>bounded(item,`${path}[${index}]`,depth+1));}
    if(object(value)){const entries=Object.entries(value),out=[];if(entries.length>48)omit(path,`Showing 48 of ${entries.length} fields.`);for(const [key,item]of entries.slice(0,48)){if(key.length>120||budget<key.length){omit(path,'A metadata field name exceeded the display budget; original retained.');continue;}budget-=key.length;out.push([key,bounded(item,`${path}.${key}`,depth+1)]);}return Object.fromEntries(out);}
    return null;
  }
  const sourceFields=['id','sha256','reaEvidenceId','kind','evidenceStatus','applicability','stale','targetIdentity','analysisProfile','operation','parameters','locations','limitations','contentRedacted','originalSha256','portableAttachment'];
  const projectedSource=Object.fromEntries(sourceFields.filter(key=>Object.hasOwn(source,key)).map(key=>[key,bounded(source[key],`NodesSource.${key}`)]));
  const base={projectionVersion:EVIDENCE_VIEW_VERSION,source:projectedSource,integrity:{localBytes:'not-checked-by-pure-projection',nativeSemanticIdentity:'not-authenticated'},engineVersion:{status:'not-established',detail:'No historical REA engine version is inferred from provider or analysis-profile versions.'},limitations,omissions};
  if(typeof raw==='string'&&raw.length>METADATA_PARSE_LIMIT)return {...base,status:'unavailable',reason:'Snapshot exceeds the 8 MiB metadata parsing limit. Read the original snapshot for complete retained content.'};
  let parsed;try{parsed=typeof raw==='string'?JSON.parse(raw):raw;}catch{return {...base,status:'unrecognized',reason:'The retained snapshot is not JSON in a recognized REA receipt structure.'};}
  const found=retainedShape(parsed);
  if(!found)return {...base,status:'unrecognized',reason:'No supported canonical Evidence receipt structure was recognized. The original snapshot remains available.'};
  const fields=['evidence_id','subject','provider','analysis_profile','predicate_type','operation','parameters','confidence','authority','environment','locations','evidence_links','relationship_coverage','limitations'];
  const canonical={layer:'REA canonical Evidence',originPath:found.path,fields:Object.fromEntries(fields.filter(key=>Object.hasOwn(found.record,key)).map(key=>[key,bounded(found.record[key],`${found.path}.${key}`)])),missingFields:fields.filter(key=>!Object.hasOwn(found.record,key))};
  canonical.shapeWarnings=[];
  const warn=(field,condition)=>{if(Object.hasOwn(found.record,field)&&!condition)canonical.shapeWarnings.push(`${field}: unexpected recorded value type or vocabulary; displayed without coercion.`);};
  warn('evidence_id',/^ev_[a-f0-9]{64}$/.test(found.record.evidence_id));
  warn('confidence',['observed','derived','inferred'].includes(found.record.confidence));
  for(const field of ['authority','operation','predicate_type'])warn(field,typeof found.record[field]==='string'&&!!found.record[field].trim());
  for(const field of ['provider','parameters'])warn(field,object(found.record[field]));
  for(const field of ['subject','analysis_profile','environment','relationship_coverage'])warn(field,found.record[field]===null||object(found.record[field]));
  for(const field of ['locations','evidence_links','limitations'])warn(field,Array.isArray(found.record[field]));
  const graphs=[];
  const normalized=found.record.normalized_result;
  const candidates=[{value:normalized,path:found.path+'.normalized_result'},{value:normalized?.graph,path:found.path+'.normalized_result.graph'}];
  for(const {value:graph,path}of candidates){
    if(!object(graph)||graph.schema!=='JavaScriptApplicationGraph')continue;
    const graphFields=['schema','graph_id','root_node_ids','coverage','limitations'];
    const projection={layer:'REA JavaScript Application Graph',originPath:path,fields:Object.fromEntries(graphFields.filter(key=>Object.hasOwn(graph,key)).map(key=>[key,bounded(graph[key],`${path}.${key}`)])),facts:[]};
    let encountered=0;
    const addFact=(value,originPath,identity)=>{encountered++;if(projection.facts.length>=32)return;projection.facts.push({originPath,...bounded(Object.fromEntries(Object.entries(identity).filter(([,value])=>value!==undefined)),originPath+'.identity'),evidence:bounded(value,originPath)});};
    for(const [nodeIndex,node]of (Array.isArray(graph.nodes)?graph.nodes:[]).entries())for(const [observationIndex,observation]of (Array.isArray(node?.observations)?node.observations:[]).entries())if(object(observation?.evidence))addFact(observation.evidence,`${path}.nodes[${nodeIndex}].observations[${observationIndex}].evidence`,{node_id:node.node_id,observation_id:observation.observation_id});
    for(const [edgeIndex,edge]of (Array.isArray(graph.edges)?graph.edges:[]).entries())if(object(edge?.evidence))addFact(edge.evidence,`${path}.edges[${edgeIndex}].evidence`,{edge_id:edge.edge_id,source_node_id:edge.source_node_id,target_node_id:edge.target_node_id,relation:edge.relation});
    projection.factCount=encountered;if(encountered>32)omit(path,`Showing metadata for 32 of ${encountered} graph facts; complete graph retained in snapshot.`);graphs.push(projection);
  }
  return {...base,status:'recognized',transport:found.transport,canonicalEvidence:canonical,javascriptGraphs:graphs,resultOrigins:{raw_result:Object.hasOwn(found.record,'raw_result')?found.path+'.raw_result':null,normalized_result:Object.hasOwn(found.record,'normalized_result')?found.path+'.normalized_result':null}};
}
