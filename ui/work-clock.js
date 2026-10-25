// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Shared by node investigation feedback and Agent goal planning.
export function createWorkClock(element,{now=Date.now,schedule=setInterval,unschedule=clearInterval}={}){
  let timer=null,startedAt=null;
  const tick=()=>{element.textContent=`${Math.max(0,Math.floor((now()-startedAt)/1000))}s`;};
  const stop=()=>{if(timer!==null){tick();unschedule(timer);timer=null;}};
  return {start(){if(timer!==null)return;startedAt=now();tick();timer=schedule(tick,1000);},stop,
    clear(){stop();startedAt=null;element.textContent='';},get running(){return timer!==null;},get startedAt(){return startedAt;}};
}
