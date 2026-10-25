// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Read-only evidence categories. A citation match is necessary, not a proof that
// the source entails the conclusion. Never promote old records by guessing.
const categories={
  observed:{key:'observed',label:'Observed',symbol:'✓'},
  inferred:{key:'inferred',label:'Inferred',symbol:'≈'},
  unknown:{key:'unknown',label:'Unknown',symbol:'?'}
};
const category=(key,detail)=>({...categories[key],detail});

export function claimCategory(claim,source){
  if(claim?.state==='proposed')return category('unknown','Proposal — a design idea, not an established finding.');
  if(!['observed','inferred'].includes(claim?.state))return category('unknown','This saved claim has no established evidence category.');
  if(!source)return category('unknown','The supporting source is unavailable.');
  if(source.evidenceStatus==='inspection-failed')return category('unknown','Inspection failed; this does not establish application behavior.');
  if(source.stale||['changed','unknown'].includes(source.applicability))return category('unknown','Historical evidence; its applicability to the current target is not established.');
  if(claim.quoteOrigin==='inspection-limit'||source.limitations?.includes(claim.quote)&&!source.text?.includes(claim.quote))return category('unknown','An inspection limitation describes what could not be established.');
  if(typeof claim.quote!=='string'||!claim.quote.trim()||!source.text?.includes(claim.quote))return category('unknown','The claim has no matching passage in the retained source.');
  if(source.evidenceStatus==='check-result'||source.kind==='host-process')return category('unknown','A prerequisite check does not establish the application’s implementation or behavior.');
  if(claim.state==='inferred')return category('inferred','Interpretation supported by evidence; verify before relying on it.');
  if(source.evidenceStatus==='runtime-observed')return category('observed','Behavior observed in the recorded runtime inspection.');
  const kind=source.kind==='comparison-receipt'?source.comparisonOrigin?.originalKind:source.kind;
  if(source.evidenceStatus==='static'||['rea','file'].includes(kind))return category('observed','Code or implementation inspected; runtime behavior is not verified by this alone.');
  return category('unknown','Source description only; implementation and runtime behavior have not been established.');
}

export function findingCategory(state,message,finding){
  if(finding?.change==='gap')return category('unknown','This question remains unresolved. Unknown does not mean absent.');
  const indexes=finding?.claimIndexes;
  if(!Array.isArray(indexes)||!indexes.length)return category('unknown','No claim-specific evidence is recorded for this finding.');
  const claims=indexes.map(index=>{
    const claim=Number.isInteger(index)&&index>=0?message?.claims?.[index]:null;
    return claimCategory(claim,state?.evidence?.find(source=>source.id===claim?.evidenceId));
  });
  // All cited support must be usable. One good citation cannot hide a missing,
  // stale or proposed claim; one inferred claim prevents an Observed badge.
  const unknown=claims.find(claim=>claim.key==='unknown');if(unknown)return unknown;
  if(claims.some(claim=>claim.key==='inferred'))return category('inferred','Includes an interpretation of the evidence; verify before relying on it.');
  return category('observed',[...new Set(claims.map(claim=>claim.detail))].join(' '));
}
