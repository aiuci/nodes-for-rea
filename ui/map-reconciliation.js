// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {reconcileMap,frameMapNodes} from '../lib/map-reconciliation.mjs';

export function reconcilePresentation(view,map,visible,saved,positions){
  view.mapMembership??=new Map();const key=`${view.state.id}:${view.ws.layout}`;
  if(!view.mapMembership.has(key))view.mapMembership.set(key,new Set([...visible.nodes.keys()].filter(id=>saved[id])));
  const previous=view.mapMembership.get(key),added=[...visible.nodes.keys()].filter(id=>!previous.has(id));
  view.lastMapAdditions=[];
  if(view.ws.reader)return positions; // Reconcile once, after exact reader return.
  const shown={...map,...visible,children:new Map([...map.children].map(([id,ids])=>[id,ids.filter(id=>visible.nodes.has(id))]))};
  // A first empty arrangement is already composed by layoutMap.
  const result=previous.size?reconcileMap(shown,view.ws.layout,positions,{previous,locked:view.ws.placedNodes[view.ws.layout],collapsed:view.ws.collapsed,growthRoots:view.ws.growthRoots}):{positions,added,moved:[]};
  view.mapMembership.set(key,new Set(visible.nodes.keys()));view.lastMapAdditions=result.added;
  if(result.moved.length){
    const routed=view.ws.tidiedLayouts.includes(view.ws.layout),snapshot={layout:view.ws.layout,positions:structuredClone(saved),camera:{...view.camera},routed};
    view.ws.arrangeUndo=snapshot;view.ws.layoutBackups[view.ws.layout]??={positions:structuredClone(saved),camera:{...view.camera}};
    if(!routed)view.ws.tidiedLayouts.push(view.ws.layout);
    // Background completion keeps the inspected node at its prior screen position.
    const id=view.ws.inspected||'core',old=saved[id],next=result.positions[id];
    if(view.busy&&!view.growthAuto?.size&&old&&next){view.camera.x+=(old.x-next.x)*view.camera.scale;view.camera.y+=(old.y-next.y)*view.camera.scale;}
    queueMicrotask(()=>{view.saveCamera();view.persist();});
  }
  return result.positions;
}

export function frameAddedNodes(view,ids=[],{originId,animate=true}={}){
  const target=frameMapNodes(view.points,[...(view.lastMapAdditions||[]),...ids],view.mapArea(),{originId});if(!target)return false;
  if(animate)view.animateCamera(target);else{view.camera=target;view.applyCamera();view.saveCamera();}
  return true;
}
