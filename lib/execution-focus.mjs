// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Frame the activity and its controls without moving any graph anchors.
export function executionFocusCamera(node,area,currentScale=1){
  if(!node||!area)return null;
  const fit=Math.min((area.width-48)/(node.width+44),(area.height-56)/(node.height+32));
  // Do not shrink an executing node into an unreadable sliver beside a full reader.
  if(!Number.isFinite(fit)||fit<.8)return null;
  const scale=Math.min(2.5,Math.max(2,currentScale),fit);
  return {x:area.x+area.width/2-(node.x+node.width/2)*scale,y:area.y+area.height/2-(node.y+node.height/2)*scale,scale};
}
