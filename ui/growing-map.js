// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {bookmark} from './flywheel-actions.js';
import {normalizeStepLimit} from '../lib/auto-deepen.mjs';
import {visibleMap,descendants,branchStats} from '../lib/workspace-map.mjs';
import {layoutMap} from '../lib/map-layouts.mjs';
import {featureOutcome,resultOutcome} from '../lib/outcomes.mjs';
import {wireRadialTrigger,wireContextActions} from './radial-menu.js';
import {settleNode} from './node-settling.js';
import {acknowledgeResultGrowth} from './result-reveal.js';
import {keepNodePosition} from './tidy-controls.js';
import {treeHierarchyRoutes} from '../lib/tree-layout.mjs';
import {riverSpine} from '../lib/river-layout.mjs';
import {drawArrangementGuides} from './arrangement-guides.js';
import {ADDITIONAL_LAYOUTS} from '../lib/additional-layouts.mjs';
import {featurePresentation} from '../lib/map-reconciliation.mjs';
import {reconcilePresentation,frameAddedNodes} from './map-reconciliation.js';
import {nodeTypeIcon,installNodeKey} from './node-type-icon.js';
import {hideNodeTooltip} from './node-tooltip.js';
import {sizeNodeContent,observeNodeContent} from './node-content-size.js';
import {nodeStatus} from './node-status.js';
import {categoryBadge} from './finding-category.js';
const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const action=(text,title,run)=>{const n=node('button',text);n.type='button';n.title=title;n.setAttribute('aria-label',title);n.onclick=event=>{event.stopPropagation();run(event);};return n;};
export function drawGrowingMap(view){
  view.headlineLayoutDirty=true;
  installNodeKey();
  hideNodeTooltip();view.nodeContentObserver?.disconnect();
  view.clearMap();view.ws.layout||='horizontal';$('workspace-canvas').dataset.layout=view.ws.layout;view.ws.layouts||={};
  const saved=view.ws.layouts[view.ws.layout]?.positions||view.ws.mapPositions;
  const presentation=featurePresentation(view.map,view.ws);view.displayMap=presentation;
  const framed=visibleMap(presentation,view.ws);const firstPass=layoutMap({...presentation,...framed,children:new Map([...presentation.children].map(([id,children])=>[id,children.filter(child=>framed.nodes.has(child))]))},view.ws.layout,saved);
  const appended={...saved,...layoutMap(presentation,view.ws.layout,{...saved,...firstPass})};
  view.ws.mapPositions=reconcilePresentation(view,presentation,framed,saved,appended);
  view.ws.layouts[view.ws.layout]={positions:view.ws.mapPositions,camera:{...view.camera}};
  const visible=visibleMap(presentation,view.ws);view.visible=visible;const activeId=view.preparingNode||view.runningNode;let running=view.map.nodes.get(activeId);while(running&&!visible.nodes.has(running.id))running=view.map.nodes.get(running.parent);view.runningAnchor=running?.id||activeId;
  for(const item of visible.nodes.values()){
    const p=view.ws.mapPositions[item.id],card=node('article',undefined,`map-node growing-node node-${item.type}`);card.dataset.nodeId=item.id;if(item.type==='feature')card.dataset.featureId=item.id;
    const preparing=!!view.preparingNode,working=view.runningAnchor===item.id&&(view.busy||preparing);
    card.style.cssText=`left:${p.x}px;top:${p.y}px;width:${p.width}px;height:${p.height}px;--topic:${view.color(item.id)}`;card.classList.toggle('selected',view.ws.inspected===item.id);card.classList.toggle('running',working);card.classList.toggle('preparing',working&&preparing);card.setAttribute('aria-busy',String(working));
    if(working){const ring=node('span',undefined,'node-activity-ring');ring.setAttribute('aria-hidden','true');ring.style.animationDelay=`-${(performance.now()-(view.activityStartedAt||performance.now()))/1000}s`;card.append(ring);}
    const stats=branchStats(view.map,item.id),children=descendants(view.map,item.id),folded=view.ws.collapsed.includes(item.id),spec=view.investigationFor(item.id);
    const open=action('',`Open ${item.type==='feature'?'feature':item.type==='finding'?'finding':item.type==='direction'?'next step':'node'}: ${item.title}`,()=>item.type==='inventory'?view.moreInventory():openMapNode(view,item.id));open.className='growing-node-open';
    const label=node('span',undefined,'node-label');label.append(node('strong',item.title));
    const status=nodeStatus(view,item);open.dataset.nodeStatus=status;
    const stateLabel=node('small',working?(view.runPhase|| (preparing?'Preparing investigation…':'Investigating…')):status,working?'node-run-phase':'');stateLabel.hidden=true;label.append(stateLabel);open.append(label);
    if(item.type==='finding')label.append(categoryBadge(item.category,'map-finding-category'));
    card.append(nodeTypeIcon(item.type,()=>[status,working?stateLabel.textContent:''].filter((value,index,all)=>value&&all.indexOf(value)===index).join('\n'),status),open);
    const controls=node('div',undefined,'node-local-controls');
    if(children.size){const fold=action(folded?'›':'⌄',`${folded?'Expand':'Collapse'} ${item.title}`,()=>collapseBranch(view,item.id));fold.className='node-fold';fold.append(node('small',String(children.size)));card.append(fold);}
    if(working){
      if(view.busy||preparing){const stop=action('■',`Stop investigation on ${view.map.nodes.get(view.runningNode)?.title||item.title}`,()=>view.actions.stop?.());stop.className='node-play node-stop';controls.append(stop);}
      card.append(node('span',(view.runningAnchor!==activeId?`${view.map.nodes.get(activeId)?.title||'Branch'} · `:'')+(view.runProgress||(preparing?'Starting…':'Investigating…')),'node-run-status'));
    }else if(spec){const play=action('▶',`Run: ${spec.request} · Target: ${spec.target||'Whole application'}${view.ws.autoDeepen?` · Up to ${normalizeStepLimit(view.ws.depthLimit)} steps`:''}`,()=>view.runNode(item.id));play.className='node-play';play.dataset.work='true';play.disabled=!!view.busy||preparing;card.append(play);}
    const menu=action('⋯',`Actions for ${item.title}`,event=>item.type==='inventory'?view.inventoryMenu(event.currentTarget,{pin:true,focus:true}):view.nodeMenu(item.id,event.currentTarget,{pin:true,focus:true}));menu.className='node-menu-trigger';menu.addEventListener('pointerenter',hideNodeTooltip);menu.addEventListener('focus',hideNodeTooltip);controls.append(menu);if(item.type==='feature'){const record=view.records.find(r=>r.id===item.id);if(record)controls.insertBefore(bookmark(view,record),menu);}wireRadialTrigger(view,item.id,menu);
    wireContextActions(view,item.id,card);installDrag(view,card,item.id);card.append(controls);view.markDraft(card,item.id);$('map-nodes').append(card);view.points.set(item.id,p);
  }
  sizeNodeContent(view);drawGrowingWires(view);drawArrangementGuides(view);observeNodeContent(view,()=>{drawGrowingWires(view);drawArrangementGuides(view);});const values=[...view.points.values()];view.sceneBounds={minX:Math.min(0,...values.map(p=>p.x)),minY:Math.min(0,...values.map(p=>p.y)),maxX:Math.max(250,...values.map(p=>p.x+p.width)),maxY:Math.max(150,...values.map(p=>p.y+p.height))};
  if(view.ws.layout==='orbit'){const root=view.points.get(view.map.root);if(root){const x=root.x+root.width/2,y=root.y+root.height/2,r=Math.max(150,...values.map(p=>Math.hypot(p.x+p.width/2-x,p.y+p.height/2-y)))+30;view.sceneBounds={minX:Math.min(view.sceneBounds.minX,x-r),minY:Math.min(view.sceneBounds.minY,y-r),maxX:Math.max(view.sceneBounds.maxX,x+r),maxY:Math.max(view.sceneBounds.maxY,y+r)};}}
  const stats=branchStats(view.map,'core');$('workspace-count').textContent=`${stats.discovered} discovered · ${stats.attempts} attempts · ${stats.observedFindings} observed · ${stats.inferredFindings} inferred · ${stats.unknownFindings} unknown · ${(view.state.verificationRuns||[]).flatMap(run=>run.cases||[]).length} checks · ${visible.nodes.size} nodes shown`;
  $('workspace-hidden').hidden=!view.ws.hidden.length;$('workspace-hidden').setAttribute('aria-label',`Show hidden branches (${view.ws.hidden.length})`);if(!$('workspace-hidden').classList.contains('direct-tool'))$('workspace-hidden').textContent=`Restore hidden (${view.ws.hidden.length})`;$('workspace-expand').hidden=!view.ws.collapsed.length;
}
export function drawGrowingWires(view){const spine=view.ws.layout==='river'?riverSpine(view.shownMap()):[],riverEdges=new Set(spine.slice(1).map((id,i)=>`${spine[i]}\0${id}`));view.treeRoutes=view.ws.layout==='tree'?treeHierarchyRoutes(view.shownMap(),view.points):null;view.growthArcIds=new Set(view.ws.growthRoots||[]);view.growthOwnerIds=new Set([...view.growthArcIds].map(id=>view.map.nodes.get(id)?.message?.id).filter(Boolean));view.growthRootIds=new Set([...view.growthArcIds,...(view.ws.growth||[]).flatMap(r=>r.addedIds||[])]);const key=view.ws.layout+view.ws.wireStyle+JSON.stringify([...view.points]);if(key!==view.growthRouteKey){view.growthRouteKey=key;view.growthRoutes=new Map();}$('map-wires').replaceChildren();view.defs=document.createElementNS('http://www.w3.org/2000/svg','defs');$('map-wires').append(view.defs);view.wireIndex=0;for(const edge of view.visible.edges){view.wire(edge.from,edge.to,{dashed:edge.relation==='compares'});const path=$('map-wires').lastElementChild;if(path?.tagName==='path'){path.dataset.from=edge.from;path.dataset.to=edge.to;path.setAttribute('aria-label',edge.relation);path.classList.toggle('orbit-related',edge.from===view.ws.inspected||edge.to===view.ws.inspected);path.classList.toggle('river-main-wire',edge.relation!=='compares'&&riverEdges.has(`${edge.from}\0${edge.to}`));}}}
export function revealMapPath(view,id){let at=view.map.nodes.get(id);const path=new Set();while(at){path.add(at.id);at=view.map.nodes.get(at.parent);}view.ws.hidden=view.ws.hidden.filter(n=>!path.has(n));view.ws.collapsed=view.ws.collapsed.filter(n=>!path.has(n));}
export function openMapNode(view,id,{focus=false}={}){view.headlineRequest=id;view.headlineDismissed=false;view.cancelFocusMotion();view.radialMenu?.close(false);const item=view.map.nodes.get(id);if(!item)return;acknowledgeResultGrowth(view,id);if(['source','discovery'].includes(item.type))view.ws.processMap=true;revealMapPath(view,id);view.remember();view.ws.reader=null;view.ws.activeView='explore';if(item.type==='feature'&&!view.ws.expanded.includes(item.id))view.ws.expanded.push(item.id);view.ws.inspected=id==='core'?'':id;view.nodeOpen=true;view.askOpen=false;view.ws.list=false;if(item.type==='root'||item.type==='source')view.askOpen=!view.state.draft?.trim()||!view.state.draftContext?.featureName;view.draw();if(view.lastMapAdditions?.length)frameAddedNodes(view,[id],{originId:view.displayMap.nodes.get(id)?.parent});else if(focus)view.focusMapNode(id);else view.ensureMapNode(id);view.persist();view.actions.inspected?.(view.selectedRecord(),true);}
export function hideBranch(view,id){if(id==='core')return;if(!view.ws.hidden.includes(id))view.ws.hidden.push(id);if(id===view.ws.inspected||descendants(view.map,id).has(view.ws.inspected)){view.nodeOpen=false;view.askOpen=false;}view.draw();view.persist();}
export function collapseBranch(view,id){if(!view.ws.expanded.includes(id))view.ws.expanded.push(id);const folded=view.ws.collapsed.includes(id);view.ws.collapsed=folded?view.ws.collapsed.filter(n=>n!==id):[...view.ws.collapsed,id];if(!folded&&descendants(view.map,id).has(view.ws.inspected))view.nodeOpen=false;view.draw();if(folded)frameAddedNodes(view,[id]);view.persist();}
export function hiddenBranches(view){const dialog=node('dialog',undefined,'workspace-dialog'),close=action('Close','Close hidden branches',()=>dialog.close());close.className='dialog-close';dialog.append(close,node('h2','Hidden branches'),node('p','Hidden work is still saved. Restore a branch to put it back on the map.'));dialog.append(action('Restore all','Restore all hidden branches',()=>{view.ws.hidden=[];view.draw();view.persist();dialog.close();frameAddedNodes(view);}));for(const id of view.ws.hidden){const item=view.map.nodes.get(id);dialog.append(action(`Restore ${item?.title||id}`,`Restore ${item?.title||id}`,()=>{revealMapPath(view,id);view.draw();view.persist();dialog.close();frameAddedNodes(view,[id]);}));}document.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove(),{once:true});}
function installDrag(view,card,id){
  let drag,suppress=false;const open=card.querySelector('.growing-node-open');open.setAttribute('aria-description','Drag to move this node. Alt plus arrow keys moves it with the keyboard. '+(['radial','spiral','shattered','exploded',...ADDITIONAL_LAYOUTS].includes(view.ws.layout)?'Tidy recomposes this shape. Undo restores its prior arrangement.':'Moving keeps its position during tidying. Use Allow tidying in its menu to release it.'));
  const commit=()=>{if(!view.ws.expanded.includes(id))view.ws.expanded.push(id);keepNodePosition(view,id);view.ws.layouts[view.ws.layout].positions=view.ws.mapPositions;view.draw();view.persist();settleNode(view,[...$('map-nodes').children].find(card=>card.dataset.nodeId===id));};
  card.addEventListener('click',event=>{if(suppress){event.preventDefault();event.stopImmediatePropagation();suppress=false;}},true);
  card.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('.node-local-controls,.node-play,.node-fold,.node-type-icon'))return;hideNodeTooltip();event.stopPropagation();view.cancelFocusMotion();const p=view.ws.mapPositions[id];drag={x:event.clientX,y:event.clientY,startX:p.x,startY:p.y,pointerId:event.pointerId,moved:false};});
  card.addEventListener('pointermove',event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<6)return;event.preventDefault();event.stopPropagation();if(!drag.moved){drag.moved=true;card.setPointerCapture(event.pointerId);card.classList.add('node-dragging');}const p=view.ws.mapPositions[id];p.x=drag.startX+dx/view.camera.scale;p.y=drag.startY+dy/view.camera.scale;card.style.left=`${p.x}px`;card.style.top=`${p.y}px`;view.points.set(id,p);drawGrowingWires(view);view.connectWorkbench();});
  const finish=event=>{if(!drag)return;const moved=drag.moved;drag=null;card.classList.remove('node-dragging');if(card.hasPointerCapture(event.pointerId))card.releasePointerCapture(event.pointerId);if(moved){suppress=true;event.preventDefault();event.stopPropagation();if(event.type==='pointerup'){const stopClick=e=>{e.preventDefault();e.stopImmediatePropagation();};document.addEventListener('click',stopClick,{capture:true,once:true});setTimeout(()=>document.removeEventListener('click',stopClick,true),0);}commit();}};
  card.addEventListener('pointerup',finish);card.addEventListener('pointercancel',finish);
  open.addEventListener('keydown',event=>{if(!event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();const p=view.ws.mapPositions[id],step=event.shiftKey?40:10;p.x+=event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0;p.y+=event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0;commit();[...document.querySelectorAll('.growing-node')].find(n=>n.dataset.nodeId===id)?.querySelector('.growing-node-open')?.focus();});
}
