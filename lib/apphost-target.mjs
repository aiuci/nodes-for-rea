// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
// Resolve only a locally declared .NET apphost companion, not arbitrary DLLs
// found nearby. All three declarations must agree and the DLL must be managed.
export async function apphostTarget(entry,{classify,identity}={}){
  if(entry.targetType!=='native'||path.extname(entry.root).toLowerCase()!=='.exe')return null;
  const folder=path.dirname(entry.root),base=path.parse(entry.root).name,assembly=base+'.dll';
  const runtimePath=path.join(folder,base+'.runtimeconfig.json'),depsPath=path.join(folder,base+'.deps.json');
  try{
    for(const [file,max]of [[runtimePath,128*1024],[depsPath,1024*1024],[entry.root,2*1024*1024]]){const stat=await fs.stat(file);if(!stat.isFile()||stat.size>max)return null;}
    const [runtimeRaw,depsRaw,binary]=await Promise.all([fs.readFile(runtimePath,'utf8'),fs.readFile(depsPath,'utf8'),fs.readFile(entry.root)]),runtime=JSON.parse(runtimeRaw),deps=JSON.parse(depsRaw);
    const runtimeTarget=deps.runtimeTarget?.name,declared=Object.values(deps.targets?.[runtimeTarget]||{}).some(item=>Object.hasOwn(item.runtime||{},assembly));
    if(!runtime.runtimeOptions?.tfm||!declared||!binary.includes(Buffer.from(assembly+'\0')))return null;
    const companion=await classify(path.join(folder,assembly));
    if(companion.targetType!=='managed'||path.dirname(companion.root).toLowerCase()!==folder.toLowerCase())return null;
    const metadata=await Promise.all([runtimePath,depsPath].map(identity));
    if(metadata.some(item=>path.dirname(item.path).toLowerCase()!==folder.toLowerCase()))return null;
    return {root:companion.root,targetType:'managed',identity:companion.identity,reason:'The launcher embeds this assembly name and its adjacent runtime/dependency manifests declare the same managed application.',declaration:{entryPoint:entry.root,assembly,runtimeTarget,framework:runtime.runtimeOptions.tfm,metadata}};
  }catch{return null;}
}
