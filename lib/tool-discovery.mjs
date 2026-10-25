// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
// Bounded folder discovery only. A found directory is a candidate, never proof.
// The caller validates candidates through the selected REA engine before reuse.
export async function discoverToolCandidates(component,{settings={},env=process.env,overrideEnv={},toolsRoot,readDir=fs.readdir,stat=fs.stat}={}){
 const rows=[],seen=new Set(),add=(folder,source)=>{if(!folder||!path.isAbsolute(folder))return;const key=path.resolve(folder).toLowerCase();if(!seen.has(key)){seen.add(key);rows.push({path:path.resolve(folder),source});}};
 add(settings[component==='ghidra'?'ghidraPath':'javaHome'],'Saved Nodes path');add(overrideEnv[component==='ghidra'?'GHIDRA_INSTALL_DIR':'JAVA_HOME'],'Selected REA setting');add(env[component==='ghidra'?'GHIDRA_INSTALL_DIR':'JAVA_HOME'],'Environment setting');
 const roots=[toolsRoot,env.ProgramFiles,env['ProgramFiles(x86)'],env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Programs'),env.USERPROFILE&&path.join(env.USERPROFILE,'tools'),env.USERPROFILE&&path.join(env.USERPROFILE,'Downloads')].filter(Boolean);
 let visited=0;
 for(const root of roots){if(visited>=12)break;let entries;try{entries=await readDir(root,{withFileTypes:true});}catch{continue;}visited++;
  for(const entry of entries.slice(0,80)){if(!entry.isDirectory()||entry.isSymbolicLink?.())continue;const folder=path.join(root,entry.name),match=component==='ghidra'?/ghidra/i.test(entry.name):/jdk|temurin|adoptium|java/i.test(entry.name);if(!match)continue;
   add(folder,'Common installation folder');if(visited>=12)continue;let children;try{children=await readDir(folder,{withFileTypes:true});}catch{continue;}visited++;for(const child of children.slice(0,40))if(child.isDirectory()&&!child.isSymbolicLink?.()&&(component==='ghidra'?/ghidra/i:/jdk|temurin/i).test(child.name))add(path.join(folder,child.name),'Common installation folder');
  }
 }
 const valid=[];for(const row of rows.slice(0,12))try{if((await stat(row.path)).isDirectory())valid.push(row);}catch{}
 return valid;
}
