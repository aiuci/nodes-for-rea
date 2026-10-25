// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Browser-safe delivery projection. It never performs inspection or changes saved history.
const list=value=>Array.isArray(value)?value:[];
const unique=items=>[...new Set(items.filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()))];
const bullets=items=>items.map(item=>`- ${item}`).join('\n');
const section=(heading,body)=>body?`## ${heading}\n\n${body}`:'';
const branch=message=>message.branchFeatureName||message.focus?.featureName||'';

function requestFor(state,message){
  const position=list(state.messages).findIndex(item=>item.id===message.id);
  return list(state.messages).slice(0,position<0?undefined:position).findLast(item=>item.role==='user')?.text||'';
}

function evidenceFor(state,claims){
  const ids=new Set(claims.map(claim=>claim.evidenceId).filter(Boolean));
  return list(state.evidence).filter(evidence=>ids.has(evidence.id));
}

/** Only evidence already attributed to this checkpoint and its selected branch. */
export function deliveryScopeEvidenceIds(state,message){
  const messages=list(state.messages),position=messages.findIndex(item=>item.id===message.id),name=branch(message);
  const prior=position<0?[message]:messages.slice(0,position+1),ids=new Set(list(message.claims).map(claim=>claim.evidenceId).filter(Boolean));
  if(name)for(const item of prior.filter(item=>item.role==='assistant')){
    if(branch(item)===name)for(const claim of list(item.claims))if(claim.evidenceId)ids.add(claim.evidenceId);
    for(const feature of list(item.features).filter(feature=>feature.name===name))for(const index of list(feature.claimIndexes))if(item.claims?.[index]?.evidenceId)ids.add(item.claims[index].evidenceId);
  }
  for(const source of message.auditScope?.sources||[]){if(source.contextEvidenceId)ids.add(source.contextEvidenceId);for(const receipt of source.receiptMap||[])ids.add(receipt.receiptId);}
  return [...ids];
}

function generatedAsset(state,message){
  const saved=message.finalAsset;
  if(!saved||!['title','form','tldr','comprehensive'].every(key=>typeof saved[key]==='string'&&saved[key].trim())||!Array.isArray(saved.supportingClaims)||!Array.isArray(saved.claimIndexes))return null;
  const allowed=new Set(deliveryScopeEvidenceIds(state,message)),evidence=new Map(list(state.evidence).map(source=>[source.id,source]));
  const supportingClaims=[];
  for(const claim of saved.supportingClaims){
    if(!claim||typeof claim.text!=='string'||!claim.text.trim()||!['observed','inferred','proposed'].includes(claim.state))return null;
    if(claim.state==='proposed'&&!claim.evidenceId&&!claim.quote){supportingClaims.push(claim);continue;}
    const source=evidence.get(claim.evidenceId);
    if(!allowed.has(claim.evidenceId)||!source||typeof claim.quote!=='string'||!claim.quote.trim())return null;
    const inText=typeof source.text==='string'&&source.text.includes(claim.quote),inLimit=list(source.limitations).includes(claim.quote);
    if(!inText&&!inLimit)return null;
    supportingClaims.push({...claim,quoteOrigin:inText?'source':'inspection-limit'});
  }
  if(saved.claimIndexes.some(index=>!Number.isInteger(index)||index<0||index>=supportingClaims.length))return null;
  if(supportingClaims.some(claim=>claim.state!=='proposed')&&!saved.claimIndexes.length)return null;
  return {...saved,supportingClaims};
}

export function verificationFor(state,message){
  const ids=new Set([message.id]),generated=generatedAsset(state,message),name=branch(message),messages=list(state.messages),position=messages.findIndex(item=>item.id===message.id);
  const allowed=new Set(messages.slice(0,position<0?0:position+1).filter(item=>item.role==='assistant'&&(item.id===message.id||(name&&(branch(item)===name||list(item.features).some(feature=>feature.name===name))))).map(item=>item.id));
  for(const id of list(generated?.sourceMessageIds))if(allowed.has(id))ids.add(id);
  return list(state.verificationRuns).filter(run=>ids.has(run.messageId));
}

function verificationSummary(runs){
  if(!runs.length)return ['No independent behavioral check is recorded for this result.'];
  return runs.map(run=>{
    const cases=list(run.cases),passed=cases.filter(item=>item.status==='passed').length,failed=cases.filter(item=>item.status==='failed').length,untested=cases.filter(item=>item.status==='untested').length;
    const source=typeof run.expectationSource==='string'?run.expectationSource:run.expectationSource?.description;
    return `${run.scope||'Recorded check'}: ${run.status||'unknown'} (${passed} passed, ${failed} failed, ${untested} untested).${source?` Expected behavior: ${source}.`:''} Passing checks apply only to this recorded scope.`;
  });
}

function materialSourceLimits(evidence){
  const material=[];
  for(const source of evidence){
    const coverage=source.sourceCoverage;
    if(coverage&&(coverage.partial===true||coverage.truncated===true||coverage.complete===false||coverage.incomplete===true))material.push('Supporting evidence has partial or truncated coverage; conclusions apply only to the retained inspected portion.');
    for(const limit of list(source.limitations)){
      if(typeof limit!=='string')continue;
      // Preserve actual failures elsewhere; these are provider-wide operating details,
      // not failures or unknowns established by this particular investigation.
      if(/session serves operations only after|imported Program and temporary project|cancelling an active Ghidra request|default-space addresses|Java bridge serializes|Windows Ghidra P0 accepts|Windows bridge uses|Windows sessions require|dossier combines Ghidra|synthetic Ghidra entry-point references/i.test(limit))continue;
      if(/(?:unresolved|targetless).*(?:flow|call)|(?:flow|call).*targetless|dossier incoming edges omit/i.test(limit)){material.push('Some indirect or unresolved reference edges are not represented; the inspected call/reference graph may be incomplete.');continue;}
      if(/(?:pseudocode|assembly).*(?:not original source|not.*original source)/i.test(limit)){material.push('Recovered pseudocode is a decompiler representation, not original source.');continue;}
      if(/static REA inspection.*not.*executed/i.test(limit)){material.push('Static inspection describes implementation; it does not establish executed behavior.');continue;}
      material.push(limit);
    }
  }
  return unique(material);
}

function boundariesFor(state,message,evidence,runs,{concise=false}={}){
  const kinds=new Set(evidence.map(item=>item.evidenceStatus||(['page'].includes(item.kind)?'description':item.kind==='file'?'static':'unknown')));
  const boundaries=[message.caveat,...list(message.inspectionErrors),...(concise?materialSourceLimits(evidence):evidence.flatMap(item=>list(item.limitations))),...runs.flatMap(run=>list(run.limitations))];
  if(kinds.has('static'))boundaries.push('Static inspection describes implementation; it does not establish executed behavior.');
  if(kinds.has('description'))boundaries.push('Public descriptions establish advertised capabilities, not verified implementation or effectiveness.');
  if(kinds.has('runtime-observed'))boundaries.push('Runtime observations cover only the recorded conditions; broader behavior remains untested.');
  if(evidence.some(item=>item.sourceCoverage&&(item.sourceCoverage.partial===true||item.sourceCoverage.truncated===true||item.sourceCoverage.complete===false||item.sourceCoverage.incomplete===true)))boundaries.push('Supporting evidence has partial or truncated coverage; conclusions apply only to the retained inspected portion.');
  if(evidence.some(item=>item.stale||item.applicability==='changed'))boundaries.push('The target has changed since some supporting evidence was captured. Recheck applicability before reusing this result.');
  if(evidence.some(item=>item.applicability==='unknown'))boundaries.push('Current target applicability is unknown for some supporting evidence.');
  if(message.continuation?.status==='blocked')boundaries.push(message.continuation.reason);
  if(!evidence.length)boundaries.push('This result has no retained source references; treat unsupported design content as a proposal.');
  return unique(boundaries);
}

function evidenceMarkdown(evidence){
  return evidence.map(item=>`- ${item.id}: ${item.title||item.locator||item.operation||'Retained evidence'}${item.operation?` · ${item.operation}`:''}\n  ${item.locator||item.targetIdentity?.path||''}\n  SHA-256: ${item.targetIdentity?.sha256||item.sha256||'not recorded'}${item.reaEvidenceId?`\n  REA Evidence: ${item.reaEvidenceId}`:''}${item.capturedAt?`\n  Captured: ${item.capturedAt}`:''}${item.applicability?`\n  Applicability: ${item.applicability}`:''}`).join('\n');
}

function findingText(finding,claims){
  const refs=list(finding.claimIndexes).map(index=>claims[index]).filter(Boolean);
  const qualifier=finding.change==='gap'?'Unresolved: ':refs.length&&refs.every(claim=>claim.state==='proposed')?'Proposal: ':refs.some(claim=>claim.state==='inferred')?'Inference: ':'';
  return `${qualifier}${finding.question}: ${finding.finding}`;
}

/** Build one finished asset at two depths and separate evidence-grounded takeaways. */
export function buildDelivery(state,message){
  if(!message||message.role!=='assistant')throw new Error('Choose a saved assistant result.');
  const generated=generatedAsset(state,message),baseClaims=list(message.claims),claims=[...baseClaims];
  const seen=new Set(claims.map(claim=>JSON.stringify([claim.text,claim.state,claim.evidenceId,claim.quote])));
  for(const claim of generated?.supportingClaims||[]){const key=JSON.stringify([claim.text,claim.state,claim.evidenceId,claim.quote]);if(!seen.has(key)){claims.push(claim);seen.add(key);}}
  const evidence=evidenceFor(state,claims),runs=verificationFor(state,message),verification=verificationSummary(runs);
  const boundaries=boundariesFor(state,message,evidence,runs),briefBoundaries=boundariesFor(state,message,evidence,runs,{concise:true}),findings=list(message.findings);
  if(message.finalAsset&&!generated){const warning='The saved finished asset has unsupported references; the retained investigation answer is shown instead.';boundaries.push(warning);briefBoundaries.push(warning);}
  const unknowns=unique([...list(message.openQuestions),...findings.filter(item=>item.change==='gap').map(item=>`${item.question}: ${item.finding}`),...(message.continuation?.status==='blocked'?[message.continuation.uncertainty]:[])]);
  const proposed=claims.some(claim=>claim.state==='proposed'),inferred=claims.some(claim=>claim.state==='inferred');
  const status=unique([...boundaries,...verification,...(proposed?['Proposed content remains a proposal; this result does not authorize execution.']:[]),...(inferred?['Interpretations labeled as inferences remain distinct from observed evidence.']:[])]);
  const briefStatus=unique([...briefBoundaries,...verification,...(proposed?['Proposed content remains a proposal; this result does not authorize execution.']:[]),...(inferred?['Interpretations labeled as inferences remain distinct from observed evidence.']:[])]);
  const saved=generated;
  const title=(generated?saved.title:'')||message.title||'Investigation result',form=(generated?saved.form:'')||(message.features?.length?'Feature map':'Investigation answer');
  const brief=generated?saved.tldr:findings.length?bullets(findings.map(item=>findingText(item,claims))):message.overview||message.understanding||message.text||message.answer||'No answer text was retained.';
  const features=list(message.features).map(item=>`### ${item.displayLabel||item.name}\n\n${item.displayQuestion||item.investigate||''}`);
  const details=generated?saved.comprehensive:unique([message.text||message.answer,...findings.map(item=>`### ${item.question}\n\n${item.finding}`),...features]).join('\n\n')||brief;
  const limits=section('Evidence and limits',bullets(status));
  const open=section('Unresolved questions',bullets(unknowns));
  const tldr=[brief,section('Evidence and limits',bullets(briefStatus)),open].filter(Boolean).join('\n\n');
  const claimText=claims.map(claim=>`- ${claim.state==='inferred'?'Inference':claim.state==='proposed'?'Proposal':claim.quoteOrigin==='inspection-limit'?'Inspection limit':'Source-backed finding'}: ${claim.text}${claim.evidenceId?` [${claim.evidenceId}]`:''}${claim.quote?`\n\n> ${claim.quote.replaceAll('\n','\n> ')}`:''}`).join('\n\n');
  const checkText=runs.map(run=>`### ${run.scope||'Recorded check'}\n\n${JSON.stringify({id:run.id,createdAt:run.createdAt,status:run.status,expectationSource:run.expectationSource,evidenceIds:run.evidenceIds,cases:run.cases,limitations:run.limitations},null,2)}`).join('\n\n');
  const compared=section('Compared saved results',list(message.auditScope?.sources).map(source=>`- ${source.side}: ${source.investigationTitle||source.title||'Saved investigation'} / ${source.featureName||'Saved result'} (${source.investigationId}, result ${source.messageId}, ${source.resultCreatedAt||'date unknown'}). Context receipt: ${source.contextEvidenceId}. Saved evidence only; no new inspection or behavioral checks.`).join('\n'));
  const sourceChecks=section('Historical source checks',list(message.auditScope?.sources).flatMap(source=>list(source.recordedChecks).map(run=>`${source.side}: ${run.scope}: ${run.status}. ${list(run.cases).filter(c=>c.status==='passed').length} passed, ${list(run.cases).filter(c=>c.status==='failed').length} failed, ${list(run.cases).filter(c=>c.status==='untested').length} untested. ${list(run.limitations).join(' ')} Recorded on the source result; not performed by this comparison.`)).join('\n'));
  const comprehensive=[details,compared,limits,open,sourceChecks,section('Recorded behavioral checks',checkText),section('Evidence-linked findings',claimText),section('Retained evidence',evidenceMarkdown(evidence))].filter(Boolean).join('\n\n');
  const takeaways={
    established:unique(findings.filter(item=>item.change==='new').map(item=>findingText(item,claims))),
    changed:unique(findings.filter(item=>item.change==='updated').map(item=>findingText(item,claims))),
    unchanged:unique(findings.filter(item=>item.change==='unchanged').map(item=>findingText(item,claims))),
    unknowns,verification,
  };
  return {version:1,messageId:message.id,title,form,generated:!!generated,request:requestFor(state,message),branch:branch(message),asset:{tldr,comprehensive,markdown:`# TLDR\n\n${tldr}\n\n# COMPREHENSIVE\n\n${comprehensive}\n`},takeaways,evidenceIds:evidence.map(item=>item.id),boundaries:status};
}

/** Attach a reproducible snapshot before persistence. Fresh check status is projected on read. */
export function attachDelivery(state,message){const delivery=buildDelivery(state,message);message.delivery=delivery;return delivery;}

export function takeawaysMarkdown(delivery){
  const groups=[['Established in this result',delivery.takeaways.established],['Updated findings',delivery.takeaways.changed],['Unchanged findings',delivery.takeaways.unchanged],['Unresolved questions',delivery.takeaways.unknowns],['Verification',delivery.takeaways.verification]];
  return `# Investigation takeaways\n\n${groups.map(([heading,items])=>section(heading,items.length?bullets(items):heading==='Updated findings'?'No corrected belief is explicitly recorded in this result.':heading==='Established in this result'?'No new finding is explicitly marked in this result.':'None recorded.')).join('\n\n')}\n`;
}

export function deliveryMarkdown(state,message,{kind='asset'}={}){
  if(!['asset','takeaways','bundle'].includes(kind))throw new Error('Unknown delivery format.');
  const delivery=buildDelivery(state,message);
  if(kind==='takeaways')return takeawaysMarkdown(delivery);
  if(kind==='bundle')return `${delivery.asset.markdown}\n---\n\n${takeawaysMarkdown(delivery)}`;
  return delivery.asset.markdown;
}
