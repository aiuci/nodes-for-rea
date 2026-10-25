// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Recoverable deletion uses the existing workspace document, never a second store.
export function deletionPlan(map,selected,{busy=false,draft='',draftContext=null}={}){
  const ids=new Set(),visit=id=>{if(id===map.root||!map.nodes.has(id)||ids.has(id))return;ids.add(id);for(const child of map.children.get(id)||[])visit(child);};
  for(const id of selected)visit(id);
  const roots=[...new Set(selected)].filter(id=>ids.has(id)&&!ids.has(map.nodes.get(id)?.parent));
  const destination=draftContext?.nodeId|| (draftContext?.featureName?`feature:${draftContext.featureName.trim().toLowerCase()}`:draftContext?.resultId?`turn:${draftContext.resultId}`:'core');
  const blocked=busy?'Wait for the current investigation or file operation to finish.':draft.trim()&&ids.has(destination)?'Move or clear the draft attached to this branch before deleting it.':'';
  return {ids:[...ids],roots,blocked};
}
export function withoutDeletedNodes(map,deleted=[]){
  const excluded=new Set(deleted);excluded.delete(map.root);
  const queue=[...excluded];for(let i=0;i<queue.length;i++)for(const id of map.children.get(queue[i])||[])if(!excluded.has(id)){excluded.add(id);queue.push(id);}
  const nodes=new Map([...map.nodes].filter(([id])=>!excluded.has(id))),edges=map.edges.filter(e=>nodes.has(e.from)&&nodes.has(e.to)),children=new Map([...map.children].filter(([id])=>nodes.has(id)).map(([id,ids])=>[id,ids.filter(child=>nodes.has(child))]));
  return {...map,nodes,edges,children};
}
