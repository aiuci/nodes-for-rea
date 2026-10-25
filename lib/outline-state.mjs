// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Sidebar disclosure may reveal new/selected paths without changing map folds.
export function revealOutlinePaths(workspace,map,ids){
  const expanded=new Set(workspace.outlineExpanded||[]),folded=new Set(workspace.collapsed||[]);let changed=false;
  for(const id of ids){const seen=new Set([id]);let parent=map.nodes.get(id)?.parent;while(parent&&!seen.has(parent)){seen.add(parent);if(folded.has(parent)&&!expanded.has(parent)){expanded.add(parent);changed=true;}parent=map.nodes.get(parent)?.parent;}}
  if(changed)workspace.outlineExpanded=[...expanded];return changed;
}
export function outlineRows(map,workspace){
  const rows=[],seen=new Set(),expanded=new Set(workspace.outlineExpanded||[]),collapsed=new Set(workspace.collapsed||[]);
  const append=(id,depth)=>{if(seen.has(id)||!map.nodes.has(id))return;seen.add(id);const children=map.children.get(id)||[],folded=collapsed.has(id)&&!expanded.has(id);rows.push({id,depth,children,folded});if(!folded)for(const child of children)append(child,depth+1);};append(map.root||'core',0);return rows;
}
