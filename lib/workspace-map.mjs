// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {withoutDeletedNodes} from './node-deletion.mjs';
import {featureRecords} from './workspace.mjs';
import {productsFor,originsFor} from './collection.mjs';
import {findingSupport} from './outcomes.mjs';
import {findingCategory} from './finding-category.mjs';
import {responseUnderstanding,findingUnderstanding} from './evidence-view.mjs';
import {recoveryFor,recoveryTitle,targetSelection,targetSelectionMessage,applicationFilename} from './target-recovery-state.mjs';

export const featureKey=name=>`feature:${name.trim().toLowerCase()}`;
export const PREFLIGHT_NODE_ID='utility:preflight';
export function preflightUtilityPoint(positions={}){
  if(positions[PREFLIGHT_NODE_ID])return {...positions[PREFLIGHT_NODE_ID]};
  const root=positions.core||{x:0,y:0,width:220,height:66},point={x:root.x,y:root.y+(root.height||66)+80,width:220,height:66};
  while(Object.values(positions).some(other=>point.x<other.x+(other.width||220)+24&&point.x+point.width+24>other.x&&point.y<other.y+(other.height||66)+24&&point.y+point.height+24>other.y))point.y+=110;
  return point;
}
export function isConnectionBoundary(message){
  return message?.continuation?.status==='blocked'&&!message.features?.length&&!message.claims?.length&&(message.inspectionErrors||[]).some(error=>typeof error==='string'&&/^REA (?:connection|inspection):/i.test(error)&&/could not start|server exited|not configured|missing|unavailable|GHIDRA_INSTALL_DIR|JAVA_HOME|reinstall|dependenc|cannot find|not found|does not exist|select a local REA executable|configure the local REA MCP registration/i.test(error));
}
export function savedDirections(message){return [...new Set([message.recommendation,...(message.directions||[])].filter(t=>typeof t==='string'&&t.trim()))];}
// Legacy responses sometimes put evidence policy into the directions array.
// Retain its identity and wording, but never offer that policy as an operation.
export function isVerificationConstraint(text){return /^(?:keep|leave|treat|consider|mark|regard)\b.*\b(?:unverified|unproven|unconfirmed|unknown)\b/i.test(String(text||'').trim())||/^(?:do not|don't|never)\s+(?:infer|claim|assume|imply|present)\b/i.test(String(text||'').trim());}
export function runnableDirections(message){return savedDirections(message).filter(text=>!isVerificationConstraint(text));}

// One cumulative projection. View and selection are deliberately not inputs.
export function workspaceMap(state){
  const nodes=new Map(),edges=[],records=featureRecords(state),answers=(state.messages||[]).filter(m=>m.role==='assistant');
  const add=node=>nodes.set(node.id,node);
  add({id:'core',type:'root',title:answers.findLast(m=>m.features?.length)?.title||recoveryTitle(state)||'Investigation',summary:'Sources, focus areas and saved work',parent:null});
  for(const product of productsFor(state))add({id:`source:${product.id}`,type:'source',title:`Target · ${product.name}`,summary:product.locators.join('\n'),product,parent:'core'});
  for(const message of answers.filter(m=>m.features?.length))add({id:`turn:${message.id}`,type:'discovery',title:message.title||'Feature discovery',summary:`${message.features.length} discovered features`,message,parent:message.recoveredAttemptId&&(state.attempts||[]).some(a=>a.id===message.recoveredAttemptId&&!a.resultId)?`attempt:${message.recoveredAttemptId}`:'core'});
  for(const record of records){
    const first=answers.find(m=>m.features?.some(f=>featureKey(f.name)===record.id));
    const source=originsFor(state,record.message,record.row).map(o=>`source:${o.productId}`).find(id=>nodes.has(id));
    const owner=first?.id||record.message?.id,discovery=owner&&nodes.has(`turn:${owner}`)?`turn:${owner}`:'core';
    const investigated=record.status==='investigated'||answers.some(m=>!m.features?.length&&(m.branchFeatureName||m.focus?.featureName)?.trim().toLowerCase()===record.row.name.trim().toLowerCase());
    add({...record,type:'feature',investigated,summary:record.row.displayQuestion||record.row.investigate||'',parent:record.row.parentName?featureKey(record.row.parentName):source||discovery});
  }
  const lastByBranch=new Map();
  for(const message of answers){
    const id=`turn:${message.id}`,branch=message.branchFeatureName||message.focus?.featureName||'',key=branch?featureKey(branch):'core';
    const understanding=responseUnderstanding(state,message);
    if(!message.features?.length){
      const explicit=message.parentNodeId||message.parentResultId&&`turn:${message.parentResultId}`||message.auditScope?.sourceMessageIds?.[0]&&`turn:${message.auditScope.sourceMessageIds[0]}`;
      const recovered=message.recoveredAttemptId&&(state.attempts||[]).some(a=>a.id===message.recoveredAttemptId&&!a.resultId)?`attempt:${message.recoveredAttemptId}`:null;
      const parent=recovered|| (explicit&&nodes.has(explicit)?explicit:lastByBranch.get(key)|| (nodes.has(key)?key:'core'));
      add({id,type:'result',blocked:isConnectionBoundary(message),title:isConnectionBoundary(message)?'Inspection blocked':message.findings?.[0]?.question||`Saved response · ${message.title||message.focus?.displayLabel||branch||'Investigation'}`,summary:message.overview||message.understanding||message.text||'Saved findings',message,parent,legacyOrder:!explicit&&lastByBranch.has(key)});
      lastByBranch.set(key,id);
    }
    if(nodes.has(id))nodes.get(id).understanding=understanding;
    for(const [index,finding]of (message.findings||[]).entries())add({id:`finding:${message.id}:${index}`,type:'finding',title:finding.question||'Finding',summary:finding.finding,message,finding,category:findingCategory(state,message,finding),supported:findingSupport(state,message,finding),understanding:findingUnderstanding(state,message,finding,{response:understanding}),parent:id});
    for(const [index,text]of savedDirections(message).entries()){const constraint=isVerificationConstraint(text);add({id:`direction:${message.id}:${index}`,type:constraint?'constraint':'direction',title:constraint?'Verification constraint':text,summary:constraint?text:'Available investigation · runs only when chosen',message,request:constraint?undefined:text,parent:id});}
    if(message.auditScope?.sourceMessageIds?.length===2)for(const sourceId of message.auditScope.sourceMessageIds)edges.push({from:`turn:${sourceId}`,to:id,relation:'compares'});
  }
  const retainedAttempts=(state.attempts||[]).filter((a,i,all)=>targetSelection(a)||!a.recovery||!a.recovery.resolvedAt&&!all.slice(i+1).some(b=>b.recovery&&(b.nodeId||'core')===(a.nodeId||'core')));
  for(const saved of retainedAttempts)if(!saved.resultId){const attempt=saved.status==='running'&&state.status!=='inspecting'?{...saved,status:'stopped',reason:saved.reason||'The previous session ended before this attempt completed.'}:saved;add({id:`attempt:${attempt.id}`,type:'attempt',title:attempt.status==='blocked'?'Inspection blocked':`${attempt.branchFeatureName?'Investigation':'Discovery'} attempt · ${recoveryFor(attempt)?.productName||attempt.productName||attempt.question||'Application'}`,summary:attempt.reason||attempt.status,attempt,parent:nodes.has(attempt.nodeId)?attempt.nodeId:nodes.has(featureKey(attempt.branchFeatureName||''))?featureKey(attempt.branchFeatureName):'core'});}
  for(const node of nodes.values())if(node.type==='attempt'&&recoveryFor(node.attempt)){const r=recoveryFor(node.attempt),inspecting=!r.continuedAt&&r.status==='ready'&&state.status==='inspecting';node.title=r.selected&&!r.continuedAt&&state.preflight?.status==='blocked'?'Inspection blocked · '+applicationFilename(r.selected):r.continuedAt?'Application selected':inspecting?`Inspecting… · ${applicationFilename(r.selected)}`:`Choose application · ${r.productName||'Application'}`;node.summary=r.continuedAt?'Inspection continued with the selected application':inspecting?'Inspection is in progress':targetSelectionMessage(node.attempt);}
  if(state.preflight&&typeof state.preflight==='object')add({id:PREFLIGHT_NODE_ID,type:'utility',utility:'preflight',title:state.preflight.status==='ready'?'Inspection prerequisites checked':'Inspection setup needed',summary:'REA prerequisites · AI response checked separately',preflight:state.preflight,parent:'core'});
  // Invalid legacy parents and cycles never make a node unreachable.
  for(const node of nodes.values()){
    if(node.id==='core')continue;
    const seen=new Set([node.id]);let at=node;
    while(at?.parent&&nodes.has(at.parent)&&!seen.has(at.parent)){seen.add(at.parent);at=nodes.get(at.parent);}
    if(!nodes.has(node.parent)||at?.parent&&seen.has(at.parent))node.parent='core';
    edges.push({from:node.parent,to:node.id,relation:node.legacyOrder?'previous saved step':'branches'});
  }
  const children=new Map();for(const node of nodes.values())if(node.parent){const ids=children.get(node.parent)||[];ids.push(node.id);children.set(node.parent,ids);}
  return withoutDeletedNodes({root:'core',nodes,edges,children},state.workspace?.deletedNodes);
}

export function descendants(map,id){const found=new Set(),queue=[...(map.children.get(id)||[])];while(queue.length){const next=queue.shift();if(found.has(next))continue;found.add(next);queue.push(...(map.children.get(next)||[]));}return found;}
export function branchStats(map,id){
  const ids=new Set([id,...descendants(map,id)]),nodes=[...ids].map(key=>map.nodes.get(key)).filter(Boolean),features=nodes.filter(n=>n.type==='feature');
  const discovered=features.filter(n=>!['proposed','inferred'].includes(n.row?.evidenceBasis)),proposed=features.filter(n=>n.row?.evidenceBasis==='proposed').length,inferred=features.filter(n=>n.row?.evidenceBasis==='inferred').length;
  const findings=nodes.filter(n=>n.type==='finding');
  return {discovered:discovered.length,investigated:discovered.filter(n=>n.investigated).length,proposed,inferred,candidates:proposed+inferred,totalFeatures:features.length,attempts:nodes.filter(n=>['result','attempt'].includes(n.type)&&!n.blocked).length,findings:findings.filter(n=>n.supported).length,openQuestions:findings.filter(n=>n.finding?.change==='gap'||!n.supported).length,observedFindings:findings.filter(n=>n.category?.key==='observed').length,inferredFindings:findings.filter(n=>n.category?.key==='inferred').length,unknownFindings:findings.filter(n=>n.category?.key==='unknown').length,total:nodes.length};
}
export function visibleMap(map,{hidden=[],collapsed=[]}={}){
  const blocked=new Set(hidden),folded=new Set(collapsed),nodes=new Map(),queue=[map.root];
  while(queue.length){const id=queue.shift();if(blocked.has(id)&&id!==map.root||nodes.has(id))continue;const node=map.nodes.get(id);if(!node)continue;nodes.set(id,node);if(!folded.has(id))queue.push(...(map.children.get(id)||[]));}
  return {nodes,edges:map.edges.filter(e=>nodes.has(e.from)&&nodes.has(e.to)),omitted:map.nodes.size-nodes.size};
}

// Append placement; existing anchors survive growth, hide, collapse and selection.
export function growLayout(map,saved={}){
  const positions={};for(const [id,p]of Object.entries(saved))if(map.nodes.has(id))positions[id]={x:p.x,y:p.y,width:p.width||230,height:p.height||110};
  positions[map.root]||={x:32,y:32,width:230,height:110};
  const overlaps=p=>Object.values(positions).some(q=>p.x<q.x+q.width+24&&p.x+p.width+24>q.x&&p.y<q.y+q.height+24&&p.y+p.height+24>q.y);
  const queue=[map.root],seen=new Set();
  while(queue.length){const id=queue.shift();if(seen.has(id))continue;seen.add(id);const parent=positions[id],children=map.children.get(id)||[],rows=Math.max(1,Math.ceil(Math.sqrt(children.length)));
    for(const [index,child]of children.entries())if(!positions[child]){
      let p={x:parent.x+300+Math.floor(index/rows)*280,y:parent.y+(index%rows)*140,width:230,height:110};
      while(overlaps(p))p.y+=140;positions[child]=p;
    }
    queue.push(...children);
  }
  return positions;
}

export function validateMapOrigin(state,parentResultId,parentNodeId){
  if(!parentResultId&&!parentNodeId)return null;
  const message=state.messages.find(m=>m.id===parentResultId&&m.role==='assistant');if(!message)throw new Error('The originating result is unavailable.');
  const id=parentNodeId||`turn:${message.id}`,map=workspaceMap(state),node=map.nodes.get(id);
  if(!node||node.message?.id!==message.id)throw new Error('The originating node does not belong to this result.');
  return {message,nodeId:id};
}

export function serializeWorkspaceMap(state){const map=workspaceMap(state);return {version:1,root:map.root,nodes:[...map.nodes.values()].map(({id,type,title,summary,parent,message,row,finding,request,legacyOrder,investigated,status,sourceKind,attempt,supported,utility})=>({id,type,title,summary,parent,messageId:message?.id,featureName:row?.name,finding,request,legacyOrder,investigated,status,sourceKind,attempt,supported,utility})),edges:map.edges,positions:state.workspace?.mapPositions||{},camera:state.workspace?.mapCamera||null,layout:state.workspace?.layout||'horizontal',layouts:state.workspace?.layouts||{},panel:state.workspace?.panel||null,outline:!!state.workspace?.outline,outlineFollow:state.workspace?.outlineFollow!==false,outlineExpanded:state.workspace?.outlineExpanded||[],outlineWidth:state.workspace?.outlineWidth||245,processMap:!!state.workspace?.processMap,reader:state.workspace?.reader||null,deletedNodes:state.workspace?.deletedNodes||[],hidden:state.workspace?.hidden||[],collapsed:state.workspace?.collapsed||[]};}
