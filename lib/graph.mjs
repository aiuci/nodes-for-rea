// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {productsFor,originsFor,productForEvidence,keptKey} from './collection.mjs';
import {savedDirections} from './workspace-map.mjs';

export const featureId=name=>`feature:${name.trim().toLowerCase()}`;
// The graph is a projection of saved records. Edges describe recorded relationships,
// not model-invented dependencies or proof that a source claim is true.
export function investigationGraph(state){
  const nodes=new Map(),edges=[],edgeKeys=new Set();
  const link=(from,to,relation)=>{if(!nodes.has(from)||!nodes.has(to)||from===to)return;const key=`${from}\0${to}\0${relation}`;if(edgeKeys.has(key))return;edgeKeys.add(key);edges.push({from,to,relation});};
  const add=(node,parent,relation)=>{if(!nodes.has(node.id))nodes.set(node.id,{...node,parent:parent||null});if(parent)link(parent,node.id,relation);return nodes.get(node.id);};
  const root=`investigation:${state.id}`;
  add({id:root,type:'investigation',title:state.title||'New investigation',summary:state.understanding||'Sources, features and discoveries in one connected map.'});
  const products=productsFor(state);
  for(const product of products)add({id:`source:${product.id}`,type:'source',title:product.name,summary:product.locators.join('\n'),product},root,'investigates');
  // Retain every map identity while showing the latest wording for a repeated feature.
  for(const message of state.messages.filter(message=>message.role==='assistant'&&message.features?.length)){
    for(const row of message.features){
      const origins=originsFor(state,message,row),parent=origins.map(origin=>`source:${origin.productId}`).find(id=>nodes.has(id))||root;
      const node=add({id:featureId(row.name),type:'feature',title:row.displayLabel||row.name,summary:row.displayQuestion||row.investigate,message,row,kept:state.keptFeatures?.some(feature=>feature.key===keptKey(row))||false},parent,'describes');
      Object.assign(node,{title:row.displayLabel||row.name,summary:row.displayQuestion||row.investigate,message,row,kept:state.keptFeatures?.some(feature=>feature.key===keptKey(row))||false});
      for(const origin of origins)link(`source:${origin.productId}`,node.id,'describes');
    }
  }
  let previous=null;const lastByFocus=new Map();
  const answers=state.messages.filter(message=>message.role==='assistant');
  for(const message of answers){
    const discovery=!!message.features?.length,featureName=message.branchFeatureName||message.focus?.featureName,focus=featureName?featureId(featureName):null;
    const continuation=!discovery&&(focus?lastByFocus.get(focus):previous&&!previous.discovery?previous:null);
    const origin=message.parentNodeId||message.parentResultId&&`turn:${message.parentResultId}`;
    if(origin?.startsWith('direction:')&&!nodes.has(origin)){const source=state.messages.find(m=>m.id===message.parentResultId),index=Number(origin.slice(origin.lastIndexOf(':')+1)),text=source&&savedDirections(source)[index];if(text)add({id:origin,type:'recommendation',title:text,summary:'Selected investigation direction',message:source},`turn:${source.id}`,'recommends');}
    const parent=discovery?root:nodes.has(origin)?origin:continuation?.id||(nodes.has(focus)?focus:root);
    const branchLevel=discovery?0:(continuation?.branchLevel||0)+1;
    const turn=add({id:`turn:${message.id}`,type:'checkpoint',title:discovery?'Discovery':`Investigation ${branchLevel}`,summary:message.overview||message.understanding||message.text,message,discovery,branchLevel},parent,continuation?'continues':'examines');
    const index=state.messages.indexOf(message),request=state.messages.slice(0,index).findLast(entry=>entry.role==='user')?.text;
    turn.request=request;
    for(const [findingIndex,finding]of (message.findings||[]).entries()){
      const findingNode=add({id:`finding:${message.id}:${findingIndex}`,type:'finding',title:finding.question,summary:finding.finding,message,finding},turn.id,'finds');
      for(const claimIndex of finding.claimIndexes||[]){const claim=message.claims?.[claimIndex];if(claim)add({id:`claim:${message.id}:${claimIndex}`,type:'claim',title:claim.state==='inferred'?'Inference':claim.state==='proposed'?'Proposed design':'Source claim',summary:claim.text,message,claim},findingNode.id,'supported by');}
    }
    for(const [claimIndex,claim]of (message.claims||[]).entries()){
      const claimNode=nodes.get(`claim:${message.id}:${claimIndex}`)||add({id:`claim:${message.id}:${claimIndex}`,type:'claim',title:claim.state==='inferred'?'Inference':claim.state==='proposed'?'Proposed design':'Source claim',summary:claim.text,message,claim},turn.id,'records');
      const evidence=state.evidence.find(evidence=>evidence.id===claim.evidenceId);
      if(evidence){const evidenceNode=add({id:`evidence:${evidence.id}`,type:'evidence',title:evidence.title||evidence.locator,summary:evidence.locator,evidence},claimNode.id,'quotes');link(`source:${productForEvidence(state,evidence)?.id}`,evidenceNode.id,'has snapshot');}
    }
    for(const row of message.features||[])for(const claimIndex of row.claimIndexes||[])link(featureId(row.name),`claim:${message.id}:${claimIndex}`,'supported by');
    if(message.recommendation)add({id:`recommendation:${message.id}`,type:'recommendation',title:message.recommendation,summary:message.recommendationReason||'Recommended next investigation',message,latest:message===answers.at(-1)},turn.id,'recommends');
    previous=turn;if(!discovery&&focus)lastByFocus.set(focus,turn);
  }
  // Sources that have not yet supported a claim still remain inspectable.
  for(const evidence of state.evidence){
    if(nodes.has(`evidence:${evidence.id}`))continue;
    const source=`source:${productForEvidence(state,evidence)?.id}`,parent=nodes.has(source)?source:root;
    const archive=add({id:`snapshots:${parent}`,type:'snapshots',title:'Other source snapshots',summary:'Captured material not quoted in the saved findings.'},parent,'retains');
    add({id:`evidence:${evidence.id}`,type:'evidence',title:evidence.title||evidence.locator,summary:evidence.locator,evidence},archive.id,'captured');
  }
  for(const attempt of state.attempts||[])if(!attempt.resultId){const parent=nodes.has(attempt.nodeId)?attempt.nodeId:nodes.has(featureId(attempt.branchFeatureName||''))?featureId(attempt.branchFeatureName):root;add({id:`attempt:${attempt.id}`,type:'attempt',title:attempt.question,summary:attempt.reason||attempt.status,attempt},parent,'attempted');}
  return {root,nodes,edges,latest:answers.at(-1)?`turn:${answers.at(-1).id}`:root};
}

export function featureOverviewLayout(graph,message,viewportWidth,viewportHeight,stored=new Map()){
  const ids=(message.features||[]).map(row=>featureId(row.name));let columns=1,best=0;
  for(let count=1;count<=ids.length;count++){const rows=Math.ceil(ids.length/count),scale=Math.min(1,Math.max(1,viewportWidth-48)/(count*280+(count-1)*24),Math.max(1,viewportHeight-48)/(rows*172+(rows-1)*24));if(scale>best){best=scale;columns=count;}}
  const positions=new Map();
  ids.forEach((id,index)=>{if(!stored.has(id))stored.set(id,{x:(index%columns)*304,y:Math.floor(index/columns)*196,width:280,height:172});positions.set(id,stored.get(id));});
  const children=new Map();for(const data of graph.nodes.values()){if(data.parent){const list=children.get(data.parent)||[];list.push(data.id);children.set(data.parent,list);}}
  return {positions,children};
}

export function graphLayout(graph,expanded,{positions:stored=new Map(),limits=new Map()}={}){
  const children=new Map();for(const node of graph.nodes.values()){if(node.parent){const list=children.get(node.parent)||[];list.push(node.id);children.set(node.parent,list);}}
  const positions=new Map(),size={width:260,height:132},padding=18;
  for(const [id,point]of stored){point.width=['feature','recommendation','result'].includes(graph.nodes.get(id)?.type)?280:260;point.height=['feature','recommendation','result'].includes(graph.nodes.get(id)?.type)?172:132;}
  if(!stored.has(graph.root))stored.set(graph.root,{x:40,y:40,...size});
  const overlaps=(a,b)=>a.x<b.x+b.width+padding&&a.x+a.width+padding>b.x&&a.y<b.y+b.height+padding&&a.y+a.height+padding>b.y;
  const queue=[graph.root];
  while(queue.length){
    const id=queue.shift(),parent=stored.get(id);positions.set(id,parent);
    if(!expanded.has(id))continue;
    const visible=(children.get(id)||[]).slice(0,limits.get(id)??Infinity),fresh=visible.filter(child=>!stored.has(child));
    if(fresh.length){
      // Small two-dimensional groups grow beside their parent. Previously placed
      // nodes stay anchored instead of being pushed by the leaf count of a tree.
      const rows=Math.min(3,Math.ceil(Math.sqrt(fresh.length))),columns=Math.ceil(fresh.length/rows),step=fresh.some(id=>['feature','recommendation','result'].includes(graph.nodes.get(id).type))?208:172;
      const baseX=parent.x+322,baseY=parent.y-(rows-1)*step/2;let candidates;
      for(let attempt=0;attempt<1000;attempt++){
        const ring=Math.ceil(attempt/4),direction=attempt%4;
        const x=baseX+(direction===0?ring*(columns*300+40):direction===3?-ring*(columns*300+40):0),y=baseY+(direction===1?-ring*rows*step:direction===2?ring*rows*step:0);
        candidates=fresh.map((child,index)=>({id:child,x:x+Math.floor(index/rows)*300,y:y+(index%rows)*step,...(['feature','recommendation','result'].includes(graph.nodes.get(child).type)?{width:280,height:172}:size)}));
        if(!candidates.some(candidate=>[...stored.values()].some(existing=>overlaps(candidate,existing))))break;
      }
      for(const {id,...position}of candidates)stored.set(id,position);
    }
    queue.push(...visible);
  }
  const values=[...positions.values()],minX=Math.min(...values.map(point=>point.x)),minY=Math.min(...values.map(point=>point.y)),maxX=Math.max(...values.map(point=>point.x+point.width)),maxY=Math.max(...values.map(point=>point.y+point.height));
  return {positions,children,bounds:{minX,minY,maxX,maxY},width:maxX-minX,height:maxY-minY};
}

export function revealPath(graph,expanded,id){
  const seen=new Set();let node=graph.nodes.get(id);
  while(node?.parent&&!seen.has(node.id)){seen.add(node.id);expanded.add(node.parent);node=graph.nodes.get(node.parent);}
}
