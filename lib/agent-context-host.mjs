// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {AgentContextStore} from './agent-context.mjs';
export function installAgentContextHost({store,handle,dialog,getWindow,idle,nativeImage}){
  const contexts=new AgentContextStore(store,{normaliseImage:async bytes=>{
    let image=nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw Error('This image could not be decoded.');let size=image.getSize();
    if(Math.max(size.width,size.height)>2048){image=image.resize(size.width>=size.height?{width:2048,quality:'best'}:{height:2048,quality:'best'});size=image.getSize();}
    return {data:image.toPNG(),...size};
  }});
  handle('agent-context-read',async id=>contexts.public(await contexts.read(id)));
  handle('agent-context-update',async(id,operation,value)=>{if(operation!=='goal')idle();return contexts.update(id,operation,value);});
  handle('agent-context-paste',async(id,files)=>{idle();return contexts.update(id,'paste',files);});
  handle('agent-context-pick',async()=>{idle();const result=await dialog.showOpenDialog(getWindow(),{title:'Add goal context: source files or images',properties:['openFile','multiSelections']});return result.canceled?[]:result.filePaths;});
  return contexts;
}
