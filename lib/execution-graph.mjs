// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {investigationGraph,featureId} from './graph.mjs';
// Every exploration has a canvas node. Green recommendations run; completed results open their saved findings.
export function executionGraph(state){
  const full=investigationGraph(state),nodes=new Map(),edges=[];
  nodes.set(full.root,{...full.nodes.get(full.root),title:state.messages.some(message=>message.features?.length)?'Refresh feature discovery':'Discover features',summary:state.title,updates:[]});
  for(const data of full.nodes.values())if(data.type==='feature')nodes.set(data.id,{...data,parent:full.root,updates:[]});
  for(const message of state.messages.filter(message=>message.role==='assistant'&&!message.features?.length)){
    const original=full.nodes.get(`turn:${message.id}`);let parent=original.parent;
    while(parent&&!nodes.has(parent))parent=full.nodes.get(parent)?.parent;
    parent=parent||full.root;
    if(message.recommendation?.trim())nodes.set(original.id,{...original,type:'recommendation',title:message.recommendation,summary:message.overview||message.understanding||'',parent,updates:[message],latest:full.latest===original.id});
    else{const branch=message.branchFeatureName||message.focus?.featureName;nodes.set(original.id,{...original,type:'result',title:message.focus?.displayLabel||nodes.get(featureId(branch||''))?.title||message.title||'Exploration result',summary:message.overview||message.understanding||message.text||'Saved findings',parent,updates:[message],latest:full.latest===original.id});}
  }
  for(const data of nodes.values())if(data.parent)edges.push({from:data.parent,to:data.id,relation:'continues'});
  let latest=full.latest;while(latest&&!nodes.has(latest))latest=full.nodes.get(latest)?.parent;
  return {root:full.root,nodes,edges,latest:latest||full.root,full,discovery:state.messages.findLast(message=>message.features?.length)};
}
