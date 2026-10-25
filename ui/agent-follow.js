// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Own only successful, current focus attempts. Failed/cancelled attempts are retryable.
export function createAgentFollow(view,{onError=()=>{}}={}){
  let key=null,token=0,pending=false,success=null,signature=null,enabled=true;
  const reset=(cancel=enabled)=>{token++;pending=false;success=null;signature=null;if(cancel)view.cancelFocusMotion?.();};
  const pause=()=>{enabled=false;reset(true);view.growthRun=null;};
  const resume=()=>{enabled=true;reset();};
  const update=async(session,id)=>{
    const next=session?.status==='running'&&session.investigationId===id?`${id}:${session.currentNode||''}`:null;
    if(next!==key){reset();key=next;}
    if(!next||!session.currentNode||!enabled||pending)return false;
    const nodeId=session.currentNode,point=view.points?.get(nodeId),area=view.mapArea?.();
    const geometry=JSON.stringify([view.ws?.layout,point,area]);
    if(success===key&&signature===geometry)return true;
    if(!view.map?.nodes.has(nodeId))return false;
    const attempt=++token;pending=true;
    try{
      view.runningNode=nodeId;view.ws.inspected=nodeId;view.draw();
      const focused=await view.focusExecutionNode(nodeId);
      if(attempt!==token||!enabled)return false;
      if(focused===true){success=key;signature=JSON.stringify([view.ws?.layout,view.points?.get(nodeId),view.mapArea?.()]);view.persist();view.beginGrowth?.(nodeId);return true;}
      return false;
    }catch(error){if(attempt===token)onError(error);return false;}
    finally{if(attempt===token)pending=false;}
  };
  return {update,pause,resume,reset,get enabled(){return enabled;}};
}
