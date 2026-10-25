// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {workspaceMap,descendants} from './workspace-map.mjs';
import {productsFor} from './collection.mjs';
import {scrubCredentials} from './document-privacy.mjs';
import {createHash} from 'node:crypto';
export function shareChoices(input={}){return {includeDraft:input.includeDraft===true,includeHidden:input.includeHidden===true,includeDeleted:input.includeDeleted===true,includeContext:input.includeContext!==false,includeLocalPaths:input.includeLocalPaths===true,excludedEvidence:[...new Set((input.excludedEvidence||[]).filter(x=>typeof x==='string'))].sort()};}

// One projection owns the structured request fields, including copies retained
// inside results. Factual prose/evidence can repeat context and are not rewritten.
function excludeRequestContext(state){
  delete state.purpose;
  delete state.designDecisions;
  if(state.preflight&&typeof state.preflight==='object')delete state.preflight.request;
  state.messages=state.messages.filter(message=>message.role==='assistant');
  for(const message of state.messages){
    delete message.purpose;
    delete message.designDecisions;
    if(message.behavior&&typeof message.behavior==='object')delete message.behavior.question;
    if(message.delivery&&typeof message.delivery==='object')delete message.delivery.request;
  }
  for(const feature of [...(state.keptFeatures||[]),...(state.removedKeptFeatures||[])])
    for(const checkpoint of feature.checkpoints||[])delete checkpoint.request;
  for(const attempt of state.attempts||[]){
    attempt.question='Question withheld from shared copy';
    attempt.purpose='';
  }
}
export function prepareShare(original,input={}){
  const choices=shareChoices(input),state=structuredClone(original),map=workspaceMap({...state,workspace:{...state.workspace,deletedNodes:[]}}),blocked=new Set(),owners=new Set(),excluded=new Set(choices.excludedEvidence);
  state.products=productsFor(state);
  for(const id of excluded)if(!state.evidence.some(e=>e.id===id))throw new Error('An excluded snapshot is no longer in this investigation.');
  if(!choices.includeHidden)for(const id of state.workspace?.hidden||[])for(const key of [id,...descendants(map,id)])blocked.add(key);
  if(!choices.includeDeleted)for(const id of state.workspace?.deletedNodes||[])for(const key of [id,...descendants(map,id)])blocked.add(key);
  // Exclusions use whole saved result boundaries. A result's prose, asset and
  // claims can repeat its children's text, so deleting only a graph card leaks it.
  for(const id of blocked){const node=map.nodes.get(id);if(node?.message?.id)owners.add(node.message.id);}
  for(const m of state.messages)if((m.claims||[]).some(c=>excluded.has(c.evidenceId))||(m.auditScope?.sources||[]).some(source=>excluded.has(source.contextEvidenceId)||(source.receiptMap||[]).some(r=>excluded.has(r.receiptId))))owners.add(m.id);
  let changed=true;while(changed){changed=false;for(const m of state.messages){if(owners.has(m.id))continue;const featureOwner=state.messages.find(x=>x.features?.some(f=>[m.branchFeatureName,m.focus?.featureName].filter(Boolean).some(name=>name.trim().toLowerCase()===f.name.trim().toLowerCase())));if(owners.has(m.parentResultId)||featureOwner&&owners.has(featureOwner.id)){owners.add(m.id);changed=true;}}}
  const removedRequests=new Set((state.attempts||[]).filter(a=>owners.has(a.resultId)||blocked.has(a.nodeId)||blocked.has(`attempt:${a.id}`)||owners.has(a.parentResultId)).map(a=>a.id));
  state.messages=state.messages.filter(m=>!owners.has(m.id)&&(!removedRequests.has(m.attemptId))&&!owners.has(m.parentResultId));
  state.attempts=(state.attempts||[]).filter(a=>!removedRequests.has(a.id)&&!owners.has(a.resultId));
  state.verificationRuns=(state.verificationRuns||[]).filter(r=>!owners.has(r.messageId)&&!owners.has(r.resultId));
  const hasExclusions=owners.size>0||excluded.size>0;
  if(hasExclusions){
    // Unattributed conversation and global summaries can repeat omitted records.
    state.messages=state.messages.filter(m=>m.role==='assistant');
    for(const key of ['understanding','recommendation','openQuestions','activity','mechanismInventory','keptFeatures','removedKeptFeatures','collectionCreatedAt','reaCapabilities','reaUnretainedEvidenceIds'])delete state[key];
    state.understanding='';state.recommendation='';state.openQuestions=[];state.activity=[];
    const referenced=new Set(state.messages.flatMap(m=>(m.claims||[]).map(c=>c.evidenceId)).filter(Boolean));
    for(const m of state.messages)for(const source of m.auditScope?.sources||[]){referenced.add(source.contextEvidenceId);for(const r of source.receiptMap||[])referenced.add(r.receiptId);}
    for(const e of state.evidence)if(!referenced.has(e.id))excluded.add(e.id);
    if(excluded.has(state.reaBundleEvidenceId))delete state.reaBundleEvidenceId;
  }
  if(!choices.includeContext)for(const e of state.evidence)if(e.kind==='comparison-context')excluded.add(e.id);
  for(const e of state.evidence)if(excluded.has(e.id)){e.text='';delete e.raw;delete e.locations;delete e.parameters;e.limitations=[...(e.limitations||[]),'Content excluded from the shared copy; original support is not bundled.'];}
  if(!choices.includeDraft){state.draft='';state.draftContext=null;}
  // Generated drafts retain unchecked prose, source quotes and older revisions.
  // Their contents cannot be safely split when a source or request is withheld.
  if(!choices.includeDraft||hasExclusions||!choices.includeContext)for(const attempt of state.attempts||[]){delete attempt.answerDraft;for(const event of attempt.stageHistory||[])delete event.detail;}
  if(!choices.includeContext)excludeRequestContext(state);
  const paths=new Set();if(!choices.includeLocalPaths){
    for(const attempt of original.attempts||[])for(const recovery of [attempt.targetRecovery,...(attempt.targetRecoveryHistory||[])].filter(Boolean))for(const p of [recovery.locator,recovery.originalLocator,recovery.selected?.path,...(recovery.candidates||[]).map(c=>c.path)])if(typeof p==='string')paths.add(p);
    for(const t of original.targets||[])for(const p of [t.locator,t.root,t.containerRoot,t.identity?.path,t.inspectionTarget?.root,t.inspectionTarget?.identity?.path,t.inspectionTarget?.declaration?.entryPoint,...(t.inspectionTarget?.declaration?.metadata||[]).map(m=>m.path)])if(typeof p==='string'&&!/^https?:/i.test(p))paths.add(p);
    const originPaths=value=>{if(!value||typeof value!=='object')return;for(const [key,v]of Object.entries(value)){if(typeof v==='string'&&['locator','path','root','containerRoot','entryPoint'].includes(key)&&v&&!/^https?:/i.test(v))paths.add(v);else if(v&&typeof v==='object')originPaths(v);}};
    for(const e of original.evidence||[])originPaths(e.comparisonOrigin);
    for(const e of original.evidence||[])if(e.kind==='comparison-context'){try{originPaths(JSON.parse(e.text));}catch{}}
    for(const e of original.evidence||[])for(const p of [e.locator,e.targetIdentity?.path])if(typeof p==='string'&&!/^https?:/i.test(p))paths.add(p);
  }
  // Context transcripts are JSON inside text; traverse them as data so nested
  // provenance paths and credential-shaped keys receive the same privacy rules.
  for(const e of state.evidence)if(e.kind==='comparison-context'&&e.text){try{e.text=JSON.stringify(scrubCredentials(JSON.parse(e.text),{paths:[...paths]}).value,null,2);}catch{e.text='Saved comparison context could not be safely projected into this shared copy.';excluded.add(e.id);}}
  let remaining=workspaceMap(state);const ids=new Set(remaining.nodes.keys());
  if(hasExclusions&&state.workspace){
    const w=state.workspace,filterPositions=p=>Object.fromEntries(Object.entries(p||{}).filter(([id])=>ids.has(id))),filterIds=items=>(items||[]).filter(id=>ids.has(id));
    w.mapPositions=filterPositions(w.mapPositions);for(const layout of Object.values(w.layouts||{}))layout.positions=filterPositions(layout.positions);
    w.spectrum=Object.fromEntries(Object.entries(w.spectrum||{}).filter(([id])=>ids.has(id)));
    for(const key of ['collapsed','hidden','expanded','outlineExpanded','growthRoots','deletedNodes'])w[key]=filterIds(w[key]);
    for(const [key,list]of Object.entries(w.placedNodes||{}))w.placedNodes[key]=filterIds(list);
    w.trail=[];w.growth=[];w.arrangeUndo=null;w.deleteUndo=null;if(!ids.has(w.inspected)){w.inspected='';w.reader=null;}if(w.reader&&!state.messages.some(m=>`turn:${m.id}`===w.reader.nodeId||m.id===w.reader.messageId))w.reader=null;
    state.selection=null;if(state.draftContext?.resultId&&owners.has(state.draftContext.resultId)){state.draft='';state.draftContext=null;}
  }
  // Some legacy source IDs literally encode the machine path. Privacy copies
  // alias those IDs consistently, including keys in positions and Spectrum.
  const aliases=new Map();if(paths.size)for(const p of state.products||[])if(!p.id.startsWith('private-source:')&&p.locators.some(s=>!/^https?:/i.test(s))){const alias=`private-source:${createHash('sha256').update(p.id).digest('hex').slice(0,24)}`;aliases.set(p.id,alias);aliases.set(`source:${p.id}`,`source:${alias}`);for(const target of state.targets)if(p.locators.includes(target.locator)){target.portableSourceId=alias;target.referenceWithheld=true;(target.limitations||=[]).push('Original source path withheld. Select an available target before new inspection.');}}
  const rewrite=v=>typeof v==='string'?aliases.get(v)||v:Array.isArray(v)?v.map(rewrite):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[aliases.get(k)||k,rewrite(x)])):v;
  const sharedState=rewrite(state);remaining=workspaceMap(sharedState);
  const summary={includedNodes:remaining.nodes.size,omittedNodes:Math.max(0,map.nodes.size-remaining.nodes.size),omittedResultRecords:owners.size,omittedEvidence:excluded.size,draftIncluded:!!state.draft?.trim(),contextIncluded:choices.includeContext,hiddenIncluded:choices.includeHidden,localPathsIncluded:choices.includeLocalPaths,privateSourceAliases:aliases.size/2,conservativeRecordExclusions:hasExclusions};
  return {state:sharedState,excludedEvidence:[...excluded],paths:[...paths].sort((a,b)=>b.length-a.length),summary,choices,preview:{...summary,purpose:choices.includeContext?state.purpose?.current||'No explicit purpose recorded.':'Purpose, request fields and design choices excluded. Findings and evidence may still contain context.',purposeRecord:choices.includeContext?state.purpose:null,draftText:choices.includeDraft?state.draft:'',designDecisions:state.designDecisions||[],draftCharacters:original.draft?.length||0,hiddenBranches:original.workspace?.hidden?.length||0,credentialRedactions:scrubCredentials(state).count,evidence:original.evidence.map(e=>({id:e.id,title:e.title||e.id,locator:e.locator,excluded:excluded.has(e.id),requiredByResults:original.messages.filter(m=>m.claims?.some(c=>c.evidenceId===e.id)).length})),externalTargets:(original.targets||[]).map(t=>t.locator)}};
}
