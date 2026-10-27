// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {createHash,randomUUID} from 'node:crypto';
import {workspaceMap,runnableDirections,featureKey} from './workspace-map.mjs';
import {coveragePlan} from './coverage-plan.mjs';

const stamp=()=>new Date().toISOString();
const text=value=>typeof value==='string'?value.trim():'';
const prerequisiteText=value=>typeof value==='string'?text(value):text(value?.reason);
const key=value=>text(value).toLowerCase().replace(/\s+/g,' ');
const identity=(nodeId,question)=>`followup:${createHash('sha256').update(JSON.stringify([nodeId,key(question)])).digest('hex').slice(0,24)}`;
const outcomes=new Set(['suggested','saved','queued','active','completed','blocked']);

// Only retained questions, directions and observed coverage records supply paths.
// Derivation is deterministic and never calls a provider or starts inspection.
export function deriveFollowUps(state,coverage,{existing=[]}={}){
  const map=workspaceMap(state),sources=new Set((state.evidence||[]).filter(e=>!e.stale&&e.evidenceStatus!=='inspection-failed').map(e=>e.id)),candidates=[],seen=new Set();
  const add=({question,nodeId='core',why,origin,evidenceIds=[],prerequisite=''})=>{
    question=text(question).slice(0,2000);if(!question||!map.nodes.has(nodeId))return;
    const semantic=key(question);if(seen.has(semantic))return;
    const refs=[...new Set(evidenceIds.filter(id=>sources.has(id)))];
    // A retained open question is grounding in its own right; inferred gaps
    // still require an actual saved node and its retained source references.
    if(!refs.length&&origin.kind!=='open-question')return;
    seen.add(semantic);const generatedId=identity(nodeId,question),prior=existing.find(f=>f.id===generatedId||key(f.question)===semantic),id=prior?.id||generatedId;
    if(prior&&['queued','active','completed'].includes(prior.status))return;
    candidates.push({id,title:question.slice(0,140),question,why,relationship:text(state.purpose?.current)||text(state.title)||'Current investigation',origin:{...origin,nodeId,evidenceIds:refs},prerequisite:prerequisiteText(prerequisite),status:prior?.status||'suggested',...(prior?.savedAt?{savedAt:prior.savedAt}:{})});
  };
  const answers=(state.messages||[]).filter(m=>m.role==='assistant');
  for(const message of [...answers].reverse()){
    const branch=message.branchFeatureName||message.focus?.featureName,nodeId=branch&&map.nodes.has(featureKey(branch))?featureKey(branch):`turn:${message.id}`,evidenceIds=(message.claims||[]).map(c=>c.evidenceId).filter(Boolean);
    for(const question of message.openQuestions||[])add({question,nodeId,why:'This question remains open in the retained findings.',origin:{kind:'open-question',messageId:message.id},evidenceIds,prerequisite:message.continuation?.status==='blocked'?message.continuation.reason:''});
    for(const question of runnableDirections({...message,recommendation:''}))add({question,nodeId,why:message.continuation?.nextEvidence||'This inspection direction was retained with the source findings.',origin:{kind:'direction',messageId:message.id},evidenceIds,prerequisite:message.continuation?.status==='blocked'?message.continuation.reason:''});
  }
  for(const question of state.openQuestions||[])add({question,nodeId:'core',why:'This retained question remains unresolved in the investigation.',origin:{kind:'open-question'},evidenceIds:[]});
  for(const area of coverage?.areas||[]){
    if(!['unexplored','blocked','uncertain','untouched','follow-up','access-limited'].includes(area.status))continue;
    add({question:area.question||`Investigate ${area.label||area.title||area.name||'this area'}`,nodeId:area.nodeId||area.id,why:area.reason||'The coverage record retains an unexplored path.',origin:{kind:'coverage',areaId:area.id},evidenceIds:area.evidenceIds||[],prerequisite:area.prerequisite||(['blocked','access-limited'].includes(area.status)?area.reason:'')});
  }
  for(const step of coveragePlan(state).actionable)add({question:step.record?.row?.displayQuestion||step.record?.row?.investigate||`Investigate ${step.name}`,nodeId:step.id,why:step.reason,origin:{kind:'coverage',areaId:step.id},evidenceIds:(step.record?.message?.claims||[]).map(c=>c.evidenceId).filter(Boolean)});
  return candidates.slice(0,3);
}

export class AgentFollowUpStore{
  constructor(control,store){this.control=control;this.store=store;}
  async refresh(id){const state=await this.store.read(id);return this.control.mutate(id,control=>{control.followUpSuggestions=deriveFollowUps(state,control.coverage,{existing:control.followUps});});}
  async save(id,followUpId){
    const state=await this.store.read(id);
    return this.control.mutate(id,control=>{
      const saved=control.followUps.find(f=>f.id===followUpId);if(saved){if(saved.savedAt)return false;saved.savedAt=stamp();saved.updatedAt=stamp();return;}
      const item=deriveFollowUps(state,control.coverage,{existing:control.followUps}).find(f=>f.id===followUpId);
      if(!item)throw Error('This next path is no longer available. Refresh Agent Control.');
      control.followUps.push({...item,status:'saved',savedAt:stamp(),updatedAt:stamp()});
      control.followUpSuggestions=deriveFollowUps(state,control.coverage,{existing:control.followUps});
    });
  }
  async explore(id,followUpId,{messageId=randomUUID()}={}){
    const state=await this.store.read(id);let message,followUp;
    const control=await this.control.mutate(id,record=>{
      followUp=record.followUps.find(f=>f.id===followUpId);
      if(!followUp){followUp=deriveFollowUps(state,record.coverage,{existing:record.followUps}).find(f=>f.id===followUpId);if(!followUp)throw Error('This next path is no longer available. Refresh Agent Control.');record.followUps.push(followUp);}
      if(['queued','active'].includes(followUp.status)){message=record.messages.find(m=>m.id===followUp.messageId);return false;}
      if(followUp.status==='completed')throw Error('This saved path is already completed.');
      if(typeof messageId!=='string'||!/^[a-zA-Z0-9:_-]{1,180}$/.test(messageId))throw Error('Invalid next-path message identity.');
      if(record.messages.some(m=>m.id===messageId))throw Error('This message identity is already used.');
      message={id:messageId,role:'user',text:`Explore this saved path: ${followUp.question}${followUp.prerequisite?` Prerequisite to recheck before inspection: ${followUp.prerequisite}`:''}`,followUpId,status:'queued',createdAt:stamp()};
      record.messages.push(message);followUp.status='queued';followUp.messageId=messageId;followUp.updatedAt=stamp();delete followUp.continuationRequired;
      record.followUpSuggestions=deriveFollowUps(state,record.coverage,{existing:record.followUps});
    });
    return {control,message,followUp:structuredClone(followUp)};
  }
  sync(id,{session}={}){return this.control.mutate(id,control=>{
    let changed=false;
    for(const item of control.followUps){
      // Completion is terminal. Imported/interrupted paths remain inert until
      // Explore explicitly creates a new linked direction and clears this latch.
      if(!outcomes.has(item.status)||!item.messageId||item.status==='completed'||item.continuationRequired)continue;
      const message=control.messages.find(m=>m.id===item.messageId),step=session?.route?.find(s=>s.directionMessageId===item.messageId);let status=item.status;
      if(step?.status==='done')status='completed';
      else if(message?.status==='applied'){
        const dispatched=session?.status==='running'&&step&&step===session.route[session.cursor]&&session.currentNode===step.nodeId&&!['done','skipped'].includes(step.status);
        status=dispatched?'active':session?.status==='stopped'?'blocked':'saved';
        if(!dispatched&&(!step||session?.status==='stopped')){item.continuationRequired=true;changed=true;}
      }
      else if(message&&['not-applied','needs-clarification'].includes(message.status))status='blocked';
      else if(message&&['queued','applying'].includes(message.status))status='queued';
      if(item.status!==status){item.status=status;item.updatedAt=stamp();if(status==='blocked')item.reason=message.reason||session?.stopReason||'Review the conversation before explicitly continuing.';if(status==='saved')item.reason=item.continuationRequired?'Historical work is inactive. Explicitly explore this path to continue.':'Paused before completion. Resume the current route explicitly before new work.';changed=true;}
    }
    return changed||false;
  });}
  async listSaved(){
    const rows=[];
    for(const item of await this.store.list()){
      const control=await this.control.read(item.id);
      for(const followUp of control.followUps)if(followUp.savedAt&&followUp.status!=='completed')rows.push({investigationId:item.id,investigationTitle:item.title||item.name||'Investigation',nodeId:followUp.origin?.nodeId||'core',followUp:structuredClone(followUp),requiresPrerequisiteRecheck:!!followUp.prerequisite});
    }
    return rows.sort((a,b)=>(b.followUp.savedAt||'').localeCompare(a.followUp.savedAt||''));
  }
}
