// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Compact runtime policy distilled from the user's REA wrapper guidance.
export const investigationGuidance=`Investigate only as far as useful understanding requires.
PURPOSE: Infer the intended workflow, question and constraints from the first request, current focus and latest instruction. Use harmless assumptions; ask only when a missing requirement materially changes the answer. A focused mechanism needs narrow tracing; requirements discovery may need bounded breadth. Help beginners reason through workflow consequences and give developers precise mechanisms and constraints.
BEHAVIOR: Trace relevant inputs, prior state, contextual rules, outputs, dependencies and meaningful exceptions beneath the interface. Examine identity and relationships: what survives copying, editing, deletion, transfer and export, and what fails when a dependency disappears. Use those distinctions to reveal requirements; preserve unresolved consequential choices. Do not enumerate unrelated edge cases or reconstruct an entire app for a narrow question.
EVIDENCE: Separate observed behavior, mechanisms supported by code, inferred engineering rationale and proposed adaptations. Static code is not observed execution; advertised claims are not verified behavior. Do not invent private server internals or infer the original team's intent as fact. Explain inaccessible evidence and conditional conclusions. Learn useful behavior and tradeoffs; choose an independent implementation suited to the user's needs.
JUDGMENT: Before each read, name the uncertainty, how it could change the answer, and proportionate available evidence that could resolve it. Reuse retained evidence when sufficient. Read nothing when the answer is already supported or decisive evidence is inaccessible. Continue only for a material, resolvable uncertainty. Otherwise finish with the supported conclusion or explain the evidence boundary. A depth setting is a maximum, not a quota to fill.
ECONOMY: Prefer relevant excerpts, source indexes and previously checked findings; avoid unchanged rereads, duplicate plans, repeated long answers, speculative branches and raw dumps. Preserve exact quotes, source identity, defining mechanisms, important conditions and limits. Planning excerpts are partial: synthesis receives fuller retained text; never treat an omitted passage as proof of absence. A shorter prompt or answer alone does not prove lower total token cost.
DELIVERY: Give the useful conclusion, mechanism, evidence, material conditions and remaining uncertainty in the existing concise result format. Use diagrams or demonstrations only when useful, and distinguish checks actually run from proposals. Repeated recommendations need a changed finding supported by genuinely new evidence or a resolved question. A new capture ID, paraphrased answer, listing reread or inspection limitation is not progress. When a walkthrough or private workflow is unavailable, state what evidence is needed and stop instead of recommending the same unavailable check. Recommend the next step only when it improves the user's objective. Stay within the existing targets, tools and authorization; explain the value of optional dependencies before proposing them.`;
const text={type:'string',maxLength:240};
export const planJudgmentSchema={type:'object',properties:{purpose:text,uncertainty:text,impact:text,decision:{type:'string',enum:['inspect','answer','boundary']},reason:text},required:['purpose','uncertainty','impact','decision','reason'],additionalProperties:false};
export const continuationSchema={type:'object',properties:{status:{type:'string',enum:['continue','complete','blocked']},uncertainty:text,impact:text,nextEvidence:text,reason:text},required:['status','uncertainty','impact','nextEvidence','reason'],additionalProperties:false};
export function continuationErrors(value){
  if(value===undefined)return []; // Existing saved records and injected reasoning remain compatible.
  if(!value||!['continue','complete','blocked'].includes(value.status))return ['Continuation must be continue, complete or blocked.'];
  const errors=[];if(!value.reason?.trim())errors.push('Explain the continuation or stopping reason.');
  if(value.status==='continue'&&['uncertainty','impact','nextEvidence'].some(key=>!value[key]?.trim()))errors.push('Continuation requires a named uncertainty, its material impact and available next evidence.');return errors;
}
export function plannedReads(plan){
  if(plan.judgment){if(!['inspect','answer','boundary'].includes(plan.judgment.decision))throw new Error('The inspection plan did not give a valid decision.');if(plan.judgment.decision!=='inspect')return [];if(['purpose','uncertainty','impact','reason'].some(key=>!plan.judgment[key]?.trim()))throw new Error('The inspection plan must name a useful uncertainty before requesting more reads.');}
  const seen=new Set();return (plan.reads||[]).filter(read=>{const key=JSON.stringify([read.kind,read.target,read.sectionId||'',read.operation||'',read.argumentsJson||'']);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,3);
}
const normalized=value=>String(value||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const directionWords=value=>new Set(normalized(value).split(' ').filter(word=>word&&!['a','an','the','of','to','for','and','how','what','inspect','investigate','explore','examine','review','walkthrough'].includes(word)));
function similarDirection(a,b){const left=directionWords(a),right=directionWords(b);if(!left.size||!right.size)return false;const common=[...left].filter(word=>right.has(word)).length;return common/Math.max(left.size,right.size)>=.8;}
function supportKeys(answer,evidence){
  const sources=new Map(evidence.map(source=>[source.id,source]));return (answer?.claims||[]).map(claim=>{
    const source=sources.get(claim.evidenceId);if(!claim.quote?.trim()||claim.quoteOrigin==='inspection-limit'||source?.limitations?.includes(claim.quote))return null;
    let origin=source?.productId||source?.locator||'';try{const url=new URL(origin);for(const key of ['hl','lang','locale','utm_source','utm_medium','utm_campaign'])url.searchParams.delete(key);origin=url.href;}catch{}
    return JSON.stringify([origin,source?.kind==='file'?'code':'source',normalized(claim.quote)]);
  });
}
export function progressBoundary(answer,previous,{evidence=[],judgment}={}){
  if(judgment?.decision==='boundary')return {status:'blocked',reason:judgment.reason||'The evidence needed for this question is unavailable.'};
  if(!previous||!similarDirection(answer?.recommendation,previous.recommendation))return null;
  const branch=value=>normalized(value?.branchFeatureName||value?.focus?.featureName);if(branch(answer)&&branch(previous)&&branch(answer)!==branch(previous))return null;
  const previousSupport=new Set(supportKeys(previous,evidence).filter(Boolean)),support=supportKeys(answer,evidence),findings=answer.findings||[];
  const novel=key=>key&&!previousSupport.has(key),validIndexes=row=>(row.claimIndexes||[]).filter(index=>Number.isInteger(index)&&index>=0&&index<support.length&&support[index]);
  const groundedAdvance=findings.length?findings.some(row=>['new','updated'].includes(row.change)&&validIndexes(row).some(index=>novel(support[index]))):support.some(novel);
  const resolvedGap=findings.some(row=>['new','updated'].includes(row.change)&&!/(?:undocumented|unknown|unresolved|unavailable|does not (?:document|show|reveal|explain|establish)|no (?:supplied |available |new )?evidence)/i.test(row.finding||'')&&validIndexes(row).length&&(previous.findings||[]).some(old=>old.change==='gap'&&similarDirection(row.question,old.question)));
  if(groundedAdvance||resolvedGap)return null;
  if(previousSupport.size||findings.length&&findings.every(row=>['gap','unchanged'].includes(row.change)))return {status:'blocked',reason:'The same direction is repeating without new supporting evidence or a resolved question. The missing behavior needs different evidence.'};
  return null;
}
export function autoDeepenBoundary(answer,previous,options={}){
  const decision=answer?.continuation;
  if(decision?.status==='complete')return `Enough understanding: ${decision.reason}`;
  if(decision?.status==='blocked')return `Evidence boundary: ${decision.reason}`;
  if(decision&&continuationErrors(decision).length)return 'The next useful uncertainty needs clarification.';
  const progress=progressBoundary(answer,previous,options);if(progress)return `Evidence boundary: ${progress.reason}`;
  const signature=value=>JSON.stringify([value?.recommendation?.trim().toLowerCase(),value?.answer||value?.text||'',value?.understanding||'',value?.findings||[],(value?.claims||[]).map(({text,state,quote})=>({text,state,quote}))]);
  if(previous&&answer?.recommendation?.trim()&&signature(answer)===signature(previous))return 'No new understanding was added by repeating this direction.';
  return '';
}
