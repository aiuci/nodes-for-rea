// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {responseUnderstanding,findingUnderstanding} from '../lib/evidence-view.mjs';
import {inventoryCoverage} from '../lib/discovery-inventory.mjs';
import {coveragePlan} from '../lib/coverage-plan.mjs';
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const short=(text,length=140)=>text?.length>length?text.slice(0,length-1).trimEnd()+'…':text||'';
// Describes the saved record's explicit proposal claims, not a new evidence class.
const proposalLabel=view=>view?.recordedFinding?.proposalClaimIndexes?.length
  ?view.recordedFinding.proposalClaimIndexes.length===view.directSupport.claimIndexes.length?'Recorded proposal':'Saved statement with proposed behavior':null;
const button=(text,run)=>{const node=el('button',text,'text-button');node.type='button';node.onclick=run;return node;};

// Extractive display text only. Do not invent hypotheses or resolve a question.
export function readingStatement(state,item){
  const view=item?.understanding;if(view?.scope.kind!=='finding')return '';
  const raw=(view.recordedFinding.finding||'').replace(/\s+/g,' ').trim();
  if(view.resolution.state==='unresolved'){
    const question=view.recordedFinding.question||'';
    if(/\bpreserv\w*\b.*\bidentity\b/i.test(question))return 'Identity continuity unverified.';
    if(/^Is the operation order established\?$/i.test(question))return 'Operation order unverified.';
    return raw?`Unresolved: ${raw}`:'Answer not established in this saved inspection.';
  }
  const proposal=proposalLabel(view);if(proposal)return `${proposal}: ${raw||'No proposal text recorded.'}`;
  if(view.category.key==='unknown')return raw?`Unverified: ${raw}`:'No supported finding recorded.';
  if(view.category.key==='inferred')return `Interpretation: ${raw}`;
  const sources=view.directSupport.evidenceIds.map(id=>state.evidence?.find(e=>e.id===id));
  const staticOnly=sources.length&&sources.every(source=>source?.evidenceStatus==='static');
  // Conservative, target-neutral shortening of an explicit type/list statement.
  // The original passage remains in the reader; negated/ambiguous text falls back.
  const typeList=raw.match(/^The (?:executable|application|code) contains a generic ([\w:]+) identity and a list specialized for \1 objects(?:,|\.)/);
  if(staticOnly&&typeList)return `Static ${typeList[1]} type and list`;
  if(staticOnly&&/^A fresh cross-reference lookup returned an incoming address\b/.test(raw))return 'Static code reference found.';
  // Remove only a neutral lead-in, retaining the original substantive wording.
  const excerpt=raw.replace(/^The (?:executable|application|code) contains (?:a generic )?/,'');
  return `${staticOnly&&!/^Static\b/i.test(excerpt)?'Static: ':''}${excerpt||raw}`;
}

export function coverageHeading(state){
  const coverage=inventoryCoverage(state),review=coveragePlan(state);
  const recordedInventory=(state.messages||[]).some(m=>m.role==='assistant'&&Array.isArray(m.features));
  const unit=n=>n===1?'feature':'features';
  return coverage.totalFeatures||recordedInventory?`${coverage.discovered} ${unit(coverage.discovered)} discovered · ${coverage.investigated} ${unit(coverage.investigated)} investigated${coverage.candidates?` · ${coverage.candidates} candidates`:''}${review.total?` · ${review.reviewed}/${review.total} features reviewed`:''} · Total coverage unknown`:'Feature inventory not recorded here · Total coverage unknown';
}

export function retainedMapSummary(state,shown){
  const responses=(state.messages||[]).filter(m=>m.role==='assistant'&&m.findings?.length),views=responses.map(m=>responseUnderstanding(state,m));
  const findings=views.reduce((n,v)=>n+v.counts.findingRows-v.counts.unresolvedQuestionRows,0),unresolved=views.reduce((n,v)=>n+v.counts.unresolvedQuestionRows,0);
  return `${findings} saved finding${findings===1?'':'s'} · ${unresolved} unresolved question${unresolved===1?'':'s'} · ${shown} nodes shown · Lines show investigation branches, not evidence support`;
}

// Display only: the recorded workflow/status/count contracts remain unchanged.
export function responseDisplayLabel(state,message,{understanding=responseUnderstanding(state,message),blocked=false}={}){
  return blocked?'Inspection blocked':understanding.workflow.recordedStatus==='blocked'?'Saved response · further work blocked':understanding.counts.unresolvedQuestionRows?'Saved response · questions remain':understanding.counts.findingRows?'Saved response · evidence retained':'Saved response · no findings recorded';
}

export function nodeContextText(item){
  const view=item?.understanding;if(!view)return null;
  const finding=view.scope.kind==='finding',gap=finding&&view.resolution.state==='unresolved',knowledge=finding?view.parentContext.knowledge:view.knowledge;
  const own=finding?view.recordedFinding.finding:null,first=knowledge.items[0]?.finding;
  return {scope:gap?'parent-response':finding?'finding':'response',compact:gap?'Unresolved · parent response context':finding?(proposalLabel(view)||(view.category.key==='unknown'?'Unverified statement':view.category.label+' finding')):view.compact,knowledge:gap?`Parent: ${short(first||'No supported saved finding is available.')}`:finding?short(own||'No finding statement recorded.'):short(first||'No supported saved finding is available.'),next:view.nextRecordedAction?`${gap?'Unresolved · next: ':'Next: '}${short(view.nextRecordedAction)}`:gap?'Unresolved · no next step recorded':'No next step recorded',description:[view.summary,gap?view.parentContext.summary:'',gap?view.parentContext.qualification:'',finding&&!gap?own||'':first?`${gap?'Parent response context: ':''}${first}`:'',view.nextRecordedAction?`Next recorded: ${view.nextRecordedAction}`:''].filter(Boolean).join('\n')};
}

export function appendNodeContext(card,item){
  if(!['result','finding'].includes(item.type))return;
  const text=nodeContextText(item);if(!text)return;
  const context=el('div',undefined,'node-evidence-context');context.dataset.evidenceScope=text.scope;context.setAttribute('aria-label',text.description);context.title=text.description;
  context.append(el('span',text.compact,'node-evidence-compact'));
  const detail=el('span',undefined,'node-evidence-detail');detail.append(el('span',text.knowledge,'node-evidence-knowledge'),el('span',text.next,'node-evidence-next'));context.append(detail);card.append(context);
}

// Captions use the existing inter-node space, never participate in title sizing
// or change map geometry. Dense manual arrangements can withhold a caption;
// the same information stays in Outline and the existing reading destinations.
export function syncNodeContexts(view,{place=false}={}){
  const canvas=document.getElementById('workspace-canvas');if(!canvas)return;canvas.dataset.evidenceDetail=String((view.camera?.scale||1)>=.85);
  if(!place)return;
  const rectangles=[...view.points].map(([id,p])=>({id,left:p.x,top:p.y,right:p.x+p.width,bottom:p.y+p.height})),placed=[];
  const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  for(const context of document.querySelectorAll('#map-nodes .node-evidence-context')){
    const card=context.parentElement,p=view.points.get(card.dataset.nodeId);if(!p)continue;
    context.hidden=false;let found=false;
    for(const above of [false,true]){
      const rect={left:p.x,top:above?p.y-25:p.y+p.height+1,right:p.x+p.width,bottom:above?p.y-1:p.y+p.height+25};
      if(rectangles.some(other=>other.id!==card.dataset.nodeId&&overlaps(rect,other))||placed.some(other=>overlaps(rect,other)))continue;
      context.dataset.placement=above?'above':'below';placed.push(rect);found=true;break;
    }
    context.hidden=!found;
  }
}

export function appendResponseUnderstanding(view,panel,message){
  const understanding=responseUnderstanding(view.state,message),section=el('section',undefined,'response-understanding');section.dataset.messageId=message.id;
  section.append(el('p',understanding.summary));
  const details=el('details');details.append(el('summary','Scope and interpretation'),el('p',understanding.resolution.detail),el('p',`Recorded workflow: ${understanding.workflow.recordedStatus||'not recorded'}. This describes the saved pass, not proof that every question is resolved.`));for(const text of understanding.limitations)details.append(el('p',text));section.append(details);panel.append(section);return understanding;
}

export function appendFindingContext(view,panel,message,finding){
  if(finding.change!=='gap'){const recorded=findingUnderstanding(view.state,message,finding),proposal=proposalLabel(recorded);if(proposal)panel.append(el('p',proposal+' — proposed behavior, not an established observation. The recorded classification and evidence links remain available in this reader.','recorded-proposal-context'));return;}
  const understanding=findingUnderstanding(view.state,message,finding),context=el('details',undefined,'finding-parent-context');context.dataset.evidenceScope='parent-response';context.open=view.ws.inspected===`finding:${message.id}:${understanding.scope.findingIndex}`;
  context.append(el('summary','Unresolved · context from the parent response'),el('p',understanding.parentContext.qualification));
  if(!understanding.directSupport.claimIndexes.length)context.append(el('small','No claim-specific evidence is linked to this question.'));
  for(const item of understanding.parentContext.knowledge.items){const row=el('p');row.append(el('strong',item.category.label+': '),document.createTextNode(item.finding));context.append(row,button('Read '+(item.question||'saved context finding'),()=>view.openReader(item.nodeId,'evidence')));}
  if(understanding.parentContext.knowledge.omitted)context.append(el('small',`${understanding.parentContext.knowledge.omitted} more saved findings are available in the parent response.`));
  if(understanding.nextRecordedAction)context.append(el('p','Next recorded: '+understanding.nextRecordedAction));
  context.append(button('Read full parent response and receipts',()=>view.openReader(`turn:${message.id}`,'evidence')));panel.append(context);
}

export function appendNativeMetadata(view,panel,source){
  const investigationId=view.state.id;
  const details=el('details',undefined,'retained-evidence-metadata'),summary=el('summary','Native receipt metadata'),body=el('div');details.append(summary,body);details.dataset.evidenceId=source.id;details.dataset.metadataState='unloaded';
  let loaded=false,pending=false;
  details.addEventListener('toggle',async()=>{
    if(!details.open||loaded||pending)return;pending=true;details.dataset.metadataState='loading';body.replaceChildren(el('p','Reading the retained receipt…'));
    try{
      const metadata=await window.investigation.evidenceMetadata(investigationId,source.id);loaded=true;details.dataset.metadataState='ready';body.replaceChildren();
      body.append(el('p',metadata.integrity.localBytes==='sha256-matches-recorded-snapshot'?'Local snapshot bytes match their recorded SHA-256. This does not authenticate the native semantic ID, producer or conclusion.':'Local snapshot integrity is unverified. Native semantic identity is not authenticated.'));
      if(metadata.source.contentRedacted||metadata.source.originalSha256)body.append(el('p','Redacted derivative: these bytes differ from the referenced original. Native compatibility and semantic identity are not established.','material-limit'));
      else body.append(el('p','Originality was not recorded here; structure recognition does not establish an original canonical record.'));
      body.append(el('p',metadata.engineVersion.detail));
      if(metadata.reason)body.append(el('p',metadata.reason,'material-limit'));
      if(metadata.canonicalEvidence){body.append(el('h4',metadata.canonicalEvidence.layer),el('p','Retained metadata from '+metadata.canonicalEvidence.originPath),el('pre',JSON.stringify(metadata.canonicalEvidence.fields,null,2)));for(const warning of metadata.canonicalEvidence.shapeWarnings)body.append(el('p',warning,'material-limit'));if(metadata.canonicalEvidence.missingFields.length)body.append(el('small','Not recorded in this structure: '+metadata.canonicalEvidence.missingFields.join(', ')));}
      for(const graph of metadata.javascriptGraphs||[])body.append(el('h4',graph.layer),el('p','Fact state, confidence and authority retain their separate native meanings.'),el('pre',JSON.stringify(graph,null,2)));
      for(const limit of metadata.limitations)body.append(el('p',limit));for(const omission of metadata.omissions)body.append(el('p',omission.path+': '+omission.reason));
      body.append(button('Read saved snapshot',()=>view.snapshot(source)));
    }catch(error){details.dataset.metadataState='error';body.replaceChildren(el('p',error.message||String(error),'material-limit'),button('Retry native metadata',()=>{details.open=false;queueMicrotask(()=>details.open=true);}));}
    finally{pending=false;}
  });panel.append(details);
}
