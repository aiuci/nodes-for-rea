// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {tidyMap} from '../lib/tidy-map.mjs';
import {ADDITIONAL_LAYOUTS} from '../lib/additional-layouts.mjs';

export function tidyWorkspace(view,{initial=false}={}){
  if(view.legacyMode||view.ws.reader&&!initial)return;
  view.cancelFocusMotion();view.radialMenu?.close(false);
  const result=tidyMap(view.shownMap(),view.ws.layout,view.ws.mapPositions,{locked:view.ws.placedNodes[view.ws.layout],collapsed:view.ws.collapsed,growthRoots:view.ws.growthRoots});
  const routed=view.ws.tidiedLayouts.includes(view.ws.layout);
  if(initial||['radial','spiral','shattered','exploded','bloom',...ADDITIONAL_LAYOUTS].includes(view.ws.layout)||(['wisp','organic'].includes(view.ws.layout)&&view.camera.scale<.9)||result.moved.length||!routed){
    if(!initial)view.ws.arrangeUndo={layout:view.ws.layout,positions:structuredClone(view.ws.mapPositions),camera:{...view.camera},routed};
    if(!routed)view.ws.tidiedLayouts.push(view.ws.layout);
    if(view.ws.layout==='exploded')view.ws.explodedVersion=1;
    if(view.ws.layout==='orbit')view.ws.orbitVersion=1;
    view.ws.mapPositions=result.positions;view.ws.layouts[view.ws.layout]={positions:result.positions,camera:{...view.camera}};
    view.draw();
    // Explicit Tidy changes geometry only; framing belongs to Fit. Keep the
    // optional initial-arrangement framing separate from the toolbar action.
    if(initial&&(['radial','spiral','shattered','exploded','bloom',...ADDITIONAL_LAYOUTS].includes(view.ws.layout)||(['wisp','organic'].includes(view.ws.layout)&&view.camera.scale<.9))){
      const area=view.mapArea(),root=view.points.get(['wisp','organic'].includes(view.ws.layout)?view.ws.inspected:view.map.root)||view.points.get(view.map.root),scale=Math.max(.9,Math.min(1.1,view.camera.scale));
      if(root){view.camera={x:area.x+area.width/2-(root.x+root.width/2)*scale,y:area.y+area.height/2-(root.y+root.height/2)*scale,scale};view.applyCamera();}
    }else if(initial)view.fit();
    view.saveCamera();view.persist();
  }
  if(!initial)view.actions.notify(result.constrained.length?'Map tidied. Kept or collapsed branches limit spacing. Allow tidying or expand a branch to make room.':result.moved.length?`Map tidied · ${result.moved.length} nodes moved`:routed?'Map is tidy.':'Connections tidied.');
}

export function keepNodePosition(view,id,keep=true){
  view.ws.placedNodes||={};const ids=view.ws.placedNodes[view.ws.layout]||[];
  view.ws.placedNodes[view.ws.layout]=keep?[...new Set([...ids,id])]:ids.filter(key=>key!==id);
}
