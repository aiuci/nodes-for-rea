// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {graphLayout,revealPath,featureOverviewLayout,featureId} from '../lib/graph.mjs';
import {accordionLayout} from '../lib/accordion-layout.mjs';
import {directionLayout} from '../lib/direction-layout.mjs';
import {executionGraph} from '../lib/execution-graph.mjs';
import {originsFor} from '../lib/collection.mjs';
import {appendDelivery} from './delivery.js';
const $=id=>document.getElementById(id);
const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};

export class GraphView{
  constructor(actions){
    this.actions=actions;this.expanded=new Set();this.scale=1;this.camera={x:0,y:0};this.nodePositions=new Map();this.featurePositions=new Map();this.mode='features';this.limits=new Map();this.selected=null;this.seen=new Set();this.stateId=null;this.launching=false;this.hiddenDirections=new Set();this.accordionPositions=new Map();this.installAccordion();
    $('restore-hidden').onclick=()=>this.restoreDirections();$('guided-deepen').onclick=()=>this.followNextThree();
    $('graph-overview').onclick=()=>this.overview();$('graph-latest').onclick=()=>this.reveal(this.graph.latest);
    $('graph-sources').onclick=()=>{this.mode='graph';this.selected=null;this.expanded=new Set([this.graph.root]);this.draw();this.fit();};
    $('zoom-in').onclick=()=>this.zoom(this.scale*1.2);$('zoom-out').onclick=()=>this.zoom(this.scale/1.2);$('graph-fit').onclick=()=>this.fit();
    $('graph-fit-branch').onclick=()=>this.mode==='features'?this.fit():this.frameBranch(this.selected||this.graph.root);
    $('graph-arrange').onclick=()=>{this.accordionPositions.clear();(this.mode==='features'?this.featurePositions:this.nodePositions).clear();this.draw();this.fit();};
    $('graph-search').oninput=()=>this.search();
    $('graph-viewport').addEventListener('wheel',event=>{
      if(event.target.closest('.accordion-preview,.accordion-list'))return;event.preventDefault();const viewport=$('graph-viewport'),rect=viewport.getBoundingClientRect();
      if(event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY)){this.camera.x-=event.deltaX||event.deltaY;this.camera.y-=event.deltaX?event.deltaY:0;this.applyScale();}
      else this.zoom(this.scale*Math.exp(-event.deltaY*.0015),{x:event.clientX-rect.left,y:event.clientY-rect.top});
    },{passive:false});
    const viewport=$('graph-viewport');let drag;
    viewport.onpointerdown=event=>{
      if(event.target.closest('.accordion-preview,.accordion-list'))return;const grip=event.target.closest('.node-grip');
      if(event.button!==1&&(event.button!==0||(!grip&&event.target.closest('button,input,.node-card'))))return;
      this.closePreview();event.preventDefault();const id=event.button===0&&grip?.closest('.node-card').dataset.nodeId;
      const position=id&&this.layout.positions.get(id);drag={id,x:event.clientX,y:event.clientY,startX:position?.x??this.camera.x,startY:position?.y??this.camera.y};viewport.setPointerCapture(event.pointerId);viewport.classList.add(id?'moving-node':'panning');
    };
    viewport.onpointermove=event=>{
      if(!drag)return;
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(drag.id){const position=this.layout.positions.get(drag.id);position.x=drag.startX+dx/this.scale;position.y=drag.startY+dy/this.scale;const card=[...$('graph-nodes').children].find(card=>card.dataset.nodeId===drag.id);card.style.left=`${position.x}px`;card.style.top=`${position.y}px`;this.drawEdges();}
      else{this.camera.x=drag.startX+dx;this.camera.y=drag.startY+dy;this.applyScale();}
    };
    viewport.onpointerup=viewport.onpointercancel=()=>{if(drag?.id)this.savePositions();drag=null;viewport.classList.remove('panning','moving-node');};
    viewport.onauxclick=event=>{if(event.button===1)event.preventDefault();};
    viewport.onkeydown=event=>{
      if(event.target.matches('input,textarea')||event.target.closest('.accordion-preview'))return;
      if(event.key==='Escape'){this.selected=null;this.draw();$('graph-search').focus();}
      else if(event.key.toLowerCase()==='f'){event.preventDefault();this.fit();}
      else if(event.key==='+'||event.key==='='){event.preventDefault();this.zoom(this.scale*1.2);}
      else if(event.key==='-'){event.preventDefault();this.zoom(this.scale/1.2);}
    };
  }
  installAccordion(){
    this.previewPanel=node('section',undefined,'accordion-preview');this.previewPanel.hidden=true;this.previewPanel.setAttribute('aria-label','Earlier exploration');this.previewPanel.setAttribute('role','region');$('graph-viewport').append(this.previewPanel);
    const cancel=()=>clearTimeout(this.previewTimer);this.previewPanel.onpointerenter=cancel;this.previewPanel.onpointerleave=()=>this.leavePreview();this.previewPanel.onfocusin=cancel;this.previewPanel.onfocusout=()=>this.leavePreview();
    this.previewPanel.addEventListener('wheel',event=>{
      if(!this.preview)return;event.preventDefault();event.stopPropagation();clearTimeout(this.magnifyTimer);this.focusSettles=performance.now()+650;this.focusPointer=this.pointerCoordinates;
      const inner=this.previewPanel.querySelector('.is-spotlight .accordion-node-inner'),outer=this.previewPanel.querySelector('.accordion-preview-nodes'),unit=event.deltaMode===1?18:event.deltaMode===2?this.previewPanel.clientHeight:1;
      let remaining=event.deltaY*unit;for(const area of [inner,outer]){if(!area)continue;const before=area.scrollTop;area.scrollTop+=remaining;remaining-=area.scrollTop-before;if(Math.abs(remaining)<1)break;}
      if(inner)inner.scrollLeft+=event.deltaX*unit;
    },{passive:false,capture:true});
    document.addEventListener('pointermove',event=>{this.pointerCoordinates={x:event.clientX,y:event.clientY};});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&this.preview){event.preventDefault();event.stopImmediatePropagation();this.closePreview(true,true);}},{capture:true});
    document.addEventListener('pointerdown',event=>{if(this.preview&&!this.preview.pinned&&!event.target.closest('.accordion-preview,.accordion-group'))this.closePreview(false,true);});
    new ResizeObserver(()=>{if(this.preview)this.positionPreview();}).observe($('graph-viewport'));
  }
  groupButton(id){return [...document.querySelectorAll('.accordion-group')].find(button=>button.dataset.groupId===id);}
  leavePreview(){
    clearTimeout(this.previewTimer);this.previewTimer=setTimeout(()=>{const trigger=this.preview&&this.groupButton(this.preview.groupId);if(this.preview&&!this.preview.pinned&&!this.previewPanel.matches(':hover')&&!trigger?.matches(':hover'))this.closePreview(false,true);},260);
  }
  morphPreview(from,to){
    this.morphAnimation?.cancel();if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return null;
    const frame=box=>({left:`${box.left}px`,top:`${box.top}px`,width:`${box.width}px`,height:`${box.height}px`});
    return this.morphAnimation=this.previewPanel.animate([frame(from),frame(to)],{duration:450,easing:'cubic-bezier(.22,1,.36,1)'});
  }
  previewBox(){const rect=this.previewPanel.getBoundingClientRect(),viewport=$('graph-viewport').getBoundingClientRect();return {left:rect.left-viewport.left,top:rect.top-viewport.top,width:rect.width,height:rect.height};}
  closePreview(restoreFocus=false,animate=false){
    clearTimeout(this.previewTimer);clearTimeout(this.magnifyTimer);clearTimeout(this.groupHoverTimer);this.groupHoverTimer=null;const trigger=this.preview&&this.groupButton(this.preview.groupId),from=!this.previewPanel.hidden&&this.previewBox();if(restoreFocus&&this.preview)this.suppressedGroup=this.preview.groupId;this.preview=null;
    for(const button of document.querySelectorAll('.accordion-group')){button.setAttribute('aria-expanded','false');button.classList.remove('morphed-source');}
    const finish=()=>{this.previewPanel.hidden=true;this.previewPanel.replaceChildren();};this.morphAnimation?.cancel();
    if(animate&&from&&trigger){const viewport=$('graph-viewport').getBoundingClientRect(),rect=trigger.getBoundingClientRect(),animation=this.morphPreview(from,{left:rect.left-viewport.left,top:rect.top-viewport.top,width:rect.width,height:rect.height});if(animation){this.previewPanel.classList.add('is-collapsing');animation.onfinish=()=>{finish();this.previewPanel.classList.remove('is-collapsing');};}else finish();}else finish();
    if(restoreFocus)trigger?.focus({preventScroll:true});
  }
  positionPreview(){
    const viewport=$('graph-viewport'),rect=viewport.getBoundingClientRect(),trigger=this.groupButton(this.preview?.groupId)?.getBoundingClientRect();
    const width=Math.max(0,Math.min(780,rect.width-24)),height=Math.max(0,Math.min(560,rect.height-24));Object.assign(this.previewPanel.style,{width:`${width}px`,height:`${height}px`,maxHeight:`${height}px`});
    const left=Math.max(12,Math.min((trigger?.left??rect.left)-rect.left,rect.width-width-12)),top=Math.max(12,Math.min((trigger?.top??rect.top)-rect.top,rect.height-height-12));Object.assign(this.previewPanel.style,{left:`${left}px`,top:`${top}px`});
  }
  magnifyNode(id,explicit=false,pointer){
    if(!this.preview||this.preview.focusId===id)return;
    if(!explicit&&this.focusPointer&&pointer&&Math.hypot(pointer.x-this.focusPointer.x,pointer.y-this.focusPointer.y)<12)return;
    const articles=[...this.previewPanel.querySelectorAll('.accordion-node')],index=articles.findIndex(article=>article.dataset.nodeId===id);if(index<0)return;
    this.preview.focusId=id;this.focusSettles=performance.now()+650;this.focusPointer=pointer||this.pointerCoordinates;
    this.previewPanel.querySelector('.accordion-preview-nodes').dataset.focus=String(index);
    for(const article of articles){const active=article.dataset.nodeId===id;article.classList.toggle('is-spotlight',active);article.querySelector('.accordion-node-fold').inert=!active;article.querySelector('.accordion-magnify').textContent=active?'Focused':'Magnify';article.querySelector('.accordion-magnify').setAttribute('aria-expanded',String(active));}
  }
  queueMagnify(id,event){
    clearTimeout(this.magnifyTimer);const pointer={x:event.clientX,y:event.clientY};this.magnifyTimer=setTimeout(()=>{const article=[...this.previewPanel.querySelectorAll('.accordion-node')].find(article=>article.dataset.nodeId===id);if(article?.matches(':hover'))this.magnifyNode(id,false,pointer);},Math.max(140,(this.focusSettles||0)-performance.now()));
  }
  showPreview(groupId,pinned=false){
    clearTimeout(this.previewTimer);if(this.preview?.pinned&&!pinned)return;const group=this.layout.groups?.get(groupId);if(!group)return;
    if(this.preview?.groupId===groupId){this.preview.pinned||=pinned;this.previewPanel.querySelector('.accordion-pin').textContent=this.preview.pinned?'Pinned':'Pin';return;}
    const trigger=this.groupButton(groupId),origin=trigger?.getBoundingClientRect(),viewport=$('graph-viewport').getBoundingClientRect();this.closePreview();this.preview={groupId,pinned};this.focusPointer=null;const panel=this.previewPanel;panel.classList.remove('is-collapsing');panel.hidden=false;
    const heading=node('div',undefined,'accordion-preview-heading'),label=node('div');label.append(node('strong',`${group.label} · Steps ${group.start}–${group.end}`),node('small','Move across nodes to magnify · click Magnify to focus'));
    const pin=node('button',pinned?'Pinned':'Pin','accordion-pin');pin.onclick=()=>{this.preview.pinned=true;pin.textContent='Pinned';};const close=node('button','Collapse','accordion-close');close.onclick=()=>this.closePreview(true,true);heading.append(label,pin,close);panel.append(heading);
    const contents=node('div',undefined,'accordion-preview-nodes');
    for(const data of group.nodes){
      const step=this.layout.location.get(data.id).depth,article=node('article',undefined,'accordion-node');article.dataset.nodeId=data.id;article.onpointerenter=event=>{if(event.pointerType!=='touch')this.queueMagnify(data.id,event);};article.onpointerleave=()=>clearTimeout(this.magnifyTimer);article.classList.toggle('selected-node',this.selected===data.id);
      const kind=node('small',`Step ${step} · ${data.type==='result'?'Saved result':data.latest?'Recommended next · latest':'Recommended direction'}`),title=node('button',data.title,'node-title');if(data.type==='result'){title.title='Read saved findings';title.onclick=()=>this.inspect(data.id);}else{title.dataset.work='true';title.title='Run this recommended direction';title.onclick=()=>this.runRecommendation(data);}const magnify=node('button','Magnify','accordion-magnify');magnify.setAttribute('aria-label',`Magnify step ${step}`);magnify.setAttribute('aria-expanded','false');magnify.onclick=()=>{this.preview.pinned=true;this.previewPanel.querySelector('.accordion-pin').textContent='Pinned';this.magnifyNode(data.id,true);};article.append(kind,title,magnify);
      const controls=node('div',undefined,'accordion-node-controls'),inspect=node('button','Inspect');inspect.onclick=()=>this.inspect(data.id);const remove=node('button','Remove branch');remove.title='Remove from canvas; saved results are kept';remove.onclick=()=>this.removeDirection(data.id);controls.append(inspect,remove);
      if(this.layout.children.get(data.id)?.length){const expanded=this.expanded.has(data.id),toggle=node('button',expanded?'Collapse children':'Reveal children');toggle.setAttribute('aria-expanded',String(expanded));toggle.onclick=()=>{if(expanded)this.expanded.delete(data.id);else this.expanded.add(data.id);this.draw();};controls.append(toggle);}
      const fold=node('div',undefined,'accordion-node-fold'),inner=node('div',undefined,'accordion-node-inner');inner.append(controls);const body=node('div',undefined,'accordion-node-details');this.renderDetails(data,body);for(const details of body.querySelectorAll('details'))details.open=true;inner.append(body);
      const parent=this.graph.nodes.get(data.parent);if(parent){const link=node('button',`From: ${parent.title}`,'connection-link');link.onclick=()=>this.reveal(parent.id);inner.append(link);}
      for(const edge of this.graph.edges.filter(edge=>edge.from===data.id)){const next=this.graph.nodes.get(edge.to),link=node('button',`Continues to: ${next.title}`,'connection-link');link.onclick=()=>this.reveal(next.id);inner.append(link);}
      fold.append(inner);article.append(fold);contents.append(article);
    }
    panel.append(contents);this.groupButton(groupId)?.setAttribute('aria-expanded','true');trigger?.classList.add('morphed-source');this.positionPreview();this.magnifyNode(group.nodes.find(data=>data.id===this.selected)?.id||group.nodes[0].id,true);if(origin)this.morphPreview({left:origin.left-viewport.left,top:origin.top-viewport.top,width:origin.width,height:origin.height},this.previewBox());this.setBusy(this.busy);
  }
  drawHistory(history,position){
    const card=node('section',undefined,'node-card accordion-history');card.dataset.nodeId=history.id;Object.assign(card.style,{left:`${position.x}px`,top:`${position.y}px`,width:`${position.width}px`,height:`${position.height}px`});
    const label=node('div',undefined,'accordion-history-heading');label.append(node('strong',history.label),node('small','Earlier steps · hover or click'));card.append(label);
    const list=node('div',undefined,'accordion-list');for(const group of history.groups){const button=node('button',undefined,'accordion-group');button.dataset.groupId=group.id;button.setAttribute('aria-expanded','false');button.setAttribute('aria-label',`${history.label}, steps ${group.start} to ${group.end}. Preview earlier exploration`);button.append(node('strong',`Steps ${group.start}–${group.end}`),node('span',`${group.nodes[0].title} → ${group.nodes.at(-1).title}`));button.onpointerenter=()=>clearTimeout(this.previewTimer);button.onpointermove=event=>{if(event.pointerType==='touch'||this.suppressedGroup===group.id||this.preview?.pinned||this.preview?.groupId===group.id||this.groupHoverTimer)return;this.groupHoverTimer=setTimeout(()=>{this.groupHoverTimer=null;if(button.matches(':hover'))this.showPreview(group.id);},150);};button.onpointerleave=()=>{clearTimeout(this.groupHoverTimer);this.groupHoverTimer=null;if(this.suppressedGroup===group.id)this.suppressedGroup=null;this.leavePreview();};button.onfocusout=()=>this.leavePreview();button.onclick=()=>{if(this.preview?.groupId===group.id&&this.preview.pinned)this.closePreview(true,true);else this.showPreview(group.id,true);};list.append(button);}card.append(list);$('graph-nodes').append(card);
  }
  update(state,busy){
    const previousAnswer=this.lastAnswerId,latestAnswer=state.messages.findLast(message=>message.role==='assistant');this.lastAnswerId=latestAnswer?.id;
    this.state=state;this.busy=busy;this.graph=executionGraph(state);
    const previousMap=this.discovery?.id;this.discovery=state.messages.findLast(message=>message.role==='assistant'&&message.features?.length);
    const switched=this.stateId!==state.id;this.stateId=state.id;
    if(switched){this.closePreview();this.selected=null;this.mode=this.discovery?'features':'graph';this.scale=1;this.expanded=new Set([this.graph.root]);this.limits=new Map([[this.graph.root,6]]);this.loadPositions();this.seen=new Set(this.graph.nodes.keys());$('graph-search').value='';$('graph-search-results').replaceChildren();}
    const fresh=[...this.graph.nodes.keys()].filter(id=>!this.seen.has(id));
    const newDiscovery=this.discovery&&this.discovery.id!==previousMap;
    if(!switched&&newDiscovery){this.mode='features';this.featurePositions.clear();this.selected=null;}else if(!switched&&fresh.some(id=>id.startsWith('turn:'))){this.mode='graph';this.expanded=new Set([this.graph.root]);this.openPath(this.graph.latest);this.expanded.add(this.graph.latest);this.limits.set(this.graph.latest,6);this.selected=this.graph.latest;}
    const completedUpdate=latestAnswer&&!latestAnswer.features?.length&&!latestAnswer.recommendation?.trim();
    if(completedUpdate&&(switched||previousAnswer!==latestAnswer.id)){this.mode='graph';this.openPath(this.graph.latest);this.expanded.add(this.graph.latest);this.selected=this.graph.latest;}
    this.draw(new Set(fresh));this.seen=new Set(this.graph.nodes.keys());
    if(switched||newDiscovery)this.fit();else if(fresh.some(id=>id.startsWith('turn:')))this.frameBranch(this.graph.latest);
  }
  setBusy(value){this.busy=value;document.querySelectorAll('[data-work]').forEach(button=>button.disabled=value||this.launching);$('guided-deepen').disabled=value||this.launching;}
  overview(){this.mode=this.discovery?'features':'graph';this.selected=null;this.expanded=new Set([this.graph.root]);this.limits.set(this.graph.root,6);this.draw();this.fit();}
  openPath(id){let ancestor=this.graph.nodes.get(id);while(ancestor){this.hiddenDirections.delete(ancestor.id);ancestor=this.graph.nodes.get(ancestor.parent);}this.saveHidden();revealPath(this.graph,this.expanded,id);let child=this.graph.nodes.get(id);while(child?.parent){const siblings=[...this.graph.nodes.values()].filter(node=>node.parent===child.parent);this.limits.set(child.parent,Math.max(this.limits.get(child.parent)||6,siblings.findIndex(node=>node.id===child.id)+1));child=this.graph.nodes.get(child.parent);}}
  reveal(id){if(!this.graph.nodes.has(id))return;const previousGroup=this.mode==='graph'&&this.layout.groupForNode?.get(id);if(previousGroup){this.inspect(id);this.showPreview(previousGroup,true);this.magnifyNode(id,true);return;}this.mode='graph';this.expanded=new Set([this.graph.root]);this.openPath(id);this.expanded.add(id);if(!this.limits.has(id))this.limits.set(id,6);this.selected=id;this.draw();const group=this.layout.groupForNode?.get(id);if(group)this.showPreview(group,true);this.frameBranch(id);}
  featureBranch(data){return this.state.messages.findLast(message=>message.role==='assistant'&&!message.features?.length&&(message.branchFeatureName||message.focus?.featureName)===data.row.name);}
  async expandFeature(data){
    this.closePreview();this.inspect(data.id);
    if(this.busy||this.launching)return;this.launching=true;this.setBusy(this.busy);
    try{const previous=this.featureBranch(data);await this.actions.choose(data.message,data.row);await this.actions.submit(previous?.recommendation||`Explore ${data.title}`,data.row.name);}catch(error){this.actions.notify(error);}finally{this.launching=false;this.setBusy(this.busy);}
  }
  async runRecommendation(data){
    if(this.busy||this.launching||!data.message?.recommendation?.trim())return;
    this.closePreview();this.inspect(data.id);const text=data.message.recommendation;
    this.launching=true;this.setBusy(this.busy);
    try{
      const branch=data.message.branchFeatureName||data.message.focus?.featureName||(data.message.features?.length?text:null),feature=branch&&this.graph.nodes.get(featureId(branch));
      if(feature?.row){if(!this.graph.nodes.has(data.id))this.inspect(feature.id);await this.actions.choose(feature.message,feature.row);}
      await this.actions.submit(text,feature?.row?.name);
    }catch(error){this.actions.notify(error);}finally{this.launching=false;this.setBusy(this.busy);}
  }
  inspect(id){
    if(!this.graph.nodes.has(id))return;this.selected=id;
    for(const card of document.querySelectorAll('[data-node-id]'))card.classList.toggle('selected-node',card.dataset.nodeId===id);
    for(const row of document.querySelectorAll('.discovery-row'))row.classList.toggle('selected-row',featureId(row.dataset.featureName)===id);
    this.inspector();this.drawEdges();this.setBusy(this.busy);
  }
  saveHidden(){try{localStorage.setItem(`rea-hidden-directions:${this.stateId}`,JSON.stringify([...this.hiddenDirections]));}catch{}}
  visibleGraph(){const hidden=id=>{let data=this.graph.nodes.get(id);while(data){if(this.hiddenDirections.has(data.id))return true;data=this.graph.nodes.get(data.parent);}return false;};const nodes=new Map([...this.graph.nodes].filter(([id])=>!hidden(id)));return {...this.graph,nodes,edges:this.graph.edges.filter(edge=>nodes.has(edge.from)&&nodes.has(edge.to))};}
  removeDirection(id){if(!['recommendation','result'].includes(this.graph.nodes.get(id)?.type))return;this.hiddenDirections.add(id);this.saveHidden();this.selected=null;this.draw();this.actions.notify('Branch removed from canvas. Restore removed or its discovery port brings it back.');}
  restoreDirections(){
    const removed=new Set(this.hiddenDirections);this.hiddenDirections.clear();this.mode='graph';
    for(const data of this.graph.nodes.values()){let ancestor=data,belongs=false;while(ancestor){if(removed.has(ancestor.id)){belongs=true;break;}ancestor=this.graph.nodes.get(ancestor.parent);}if(belongs){this.openPath(data.id);this.expanded.add(data.id);this.selected=data.id;}}
    this.saveHidden();this.draw();if(this.selected)this.frameBranch(this.selected);else this.fit();
  }
  nextAction(){
    const selected=this.graph.nodes.get(this.selected);
    if(selected?.type==='result')return null;
    if(selected?.type==='recommendation')return selected;
    if(selected?.type==='feature'){const saved=this.featureBranch(selected);return saved&&!saved.recommendation?.trim()?null:selected;}
    const message=this.state.messages.findLast(message=>message.role==='assistant');
    return message?.recommendation?.trim()?{id:`turn:${message.id}`,type:'recommendation',message}:null;
  }
  async followNextThree(){const next=this.nextAction();if(!next||this.busy||this.launching)return;this.actions.autoThree();if(next.type==='feature')await this.expandFeature(next);else await this.runRecommendation(next);}
  draw(fresh=new Set()){
    const folding=fresh.size?[...$('graph-nodes').querySelectorAll('.type-recommendation,.type-result')].map(card=>({id:card.dataset.nodeId,rect:card.getBoundingClientRect(),card:card.cloneNode(true)})):[];const pinned=this.preview?.pinned?this.preview.groupId:null;this.closePreview();
    const featureMode=this.mode==='features'&&this.discovery,summary=$('discovery-summary');summary.hidden=!!this.discovery||!featureMode;$('conversation').classList.toggle('feature-overview',!!featureMode);
    if(featureMode){$('discovery-title').textContent=this.discovery.title||this.state.title;$('discovery-overview').textContent=this.discovery.overview||'';$('discovery-recommendation').textContent=this.discovery.recommendation?`Recommended: ${this.discovery.features.find(row=>row.name===this.discovery.recommendation)?.displayLabel||this.discovery.recommendation}`:'';$('discovery-recommendation').hidden=!this.discovery.recommendation;$('discovery-recommendation').onclick=()=>{const data=this.graph.nodes.get(featureId(this.discovery.recommendation));if(data)this.expandFeature(data);};}
    else if(!this.discovery&&this.state.messages.length){summary.hidden=false;$('discovery-title').textContent='Feature discovery is not complete';$('discovery-overview').textContent=this.busy?'Discovering capabilities from your sources…':'Your sources are saved. Finish discovery to see the app’s features as starting nodes.';$('discovery-recommendation').hidden=this.busy;$('discovery-recommendation').textContent='Finish discovery';$('discovery-recommendation').onclick=()=>this.actions.submit('Discover the features and capabilities of these sources.');}
    const canvasGraph=this.visibleGraph(),viewport=$('graph-viewport');this.layout=this.discovery?directionLayout(canvasGraph,featureMode?new Set():this.expanded,{positions:this.nodePositions}):graphLayout(canvasGraph,this.expanded,{positions:this.nodePositions,limits:this.limits});if(!featureMode)this.layout=accordionLayout(canvasGraph,this.layout,{positions:this.accordionPositions});const {positions,children}=this.layout;
    if(this.selected&&!positions.has(this.selected)&&!this.layout.groupForNode?.has(this.selected))this.selected=null;
    $('graph-nodes').replaceChildren();this.drawEdges();
    const related=new Set(this.selected?[this.selected,...this.graph.edges.filter(edge=>edge.from===this.selected||edge.to===this.selected).flatMap(edge=>[edge.from,edge.to])]:[]);
    for(const [id,position]of positions){
      if(this.layout.histories?.has(id)){this.drawHistory(this.layout.histories.get(id),position);continue;}const data=this.graph.nodes.get(id);if(this.discovery&&data.type==='feature')continue;if(this.discovery&&id===this.graph.root){this.drawDiscovery(position);continue;}const recommended=featureMode&&data.row?.name===this.discovery.recommendation,card=node('div',undefined,`node-card type-${data.type}${id===this.selected?' selected-node':''}${this.selected&&!related.has(id)?' dim-node':''}${fresh.has(id)?' revealed-node':''}${recommended?' recommended-feature':''}`);card.dataset.nodeId=id;card.style.left=`${position.x}px`;card.style.top=`${position.y}px`;
      const grip=node('button',data.kept?'Feature / kept':recommended?'Feature / recommended':data.type==='recommendation'?(data.latest?'Recommended next · latest':'Recommended next'):data.type==='result'?(data.message.continuation?.status==='blocked'?'Result · Evidence limit':'Result · Complete'):data.type==='feature'?'Feature':data.type==='investigation'?'Discovery':data.type,'node-grip');grip.setAttribute('aria-label',`Move ${data.title}`);grip.title='Drag to move. Arrow keys move 20 pixels; Shift moves 100.';grip.onkeydown=event=>{const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},direction=moves[event.key];if(!direction)return;event.preventDefault();event.stopPropagation();const distance=event.shiftKey?100:20;position.x+=direction[0]*distance;position.y+=direction[1]*distance;card.style.left=`${position.x}px`;card.style.top=`${position.y}px`;this.drawEdges();this.savePositions();};
      card.append(grip);
      const select=node('div',undefined,'node-select');select.tabIndex=0;select.setAttribute('role','group');select.setAttribute('aria-label',`Inspect ${data.title}`);
      select.append(node('button',data.title,'node-title'),node('span',data.summary||'Open to inspect','node-summary'));
      select.onclick=()=>this.inspect(id);select.onkeydown=event=>{if(event.target===select&&event.key==='Enter'){event.preventDefault();this.inspect(id);}};card.append(select);const title=select.querySelector('.node-title');title.dataset.work='true';title.onclick=event=>{event.stopPropagation();this.inspect(id);};
      if(['recommendation','result'].includes(data.type)){
        if(data.type==='result'){delete title.dataset.work;title.setAttribute('aria-label',`Read result: ${data.title}`);title.title='Read saved findings';const details=node('button','Read results','node-details');details.onclick=()=>this.inspect(id);card.append(details);const follow=node('button','Ask follow-up','result-follow-up');follow.dataset.work='true';follow.setAttribute('aria-label',`Ask a follow-up about ${data.title}`);follow.onclick=()=>this.askFollowUp(data);card.append(follow);}
        else{title.setAttribute('aria-label',`Investigate ${data.title}`);title.title='Run this recommended direction';title.onclick=event=>{event.stopPropagation();this.runRecommendation(data);};}
        const remove=node('button','×','remove-direction');remove.setAttribute('aria-label',`Remove ${data.title} from canvas`);remove.title='Remove this branch from canvas; saved results are kept';remove.onclick=()=>this.removeDirection(id);card.append(remove);
      }
      const count=children.get(id)?.length||0;card.classList.toggle('has-input',!!data.parent);card.classList.toggle('has-output',count>0);
      if(data.type==='feature'){
        const origins=originsFor(this.state,data.message,data.row).map(origin=>this.state.products?.find(product=>product.id===origin.productId)?.name||origin.productId);if(origins.length)select.insertBefore(node('span',origins.join(', '),'node-origin'),select.querySelector('.node-summary'));
        const controls=node('div',undefined,'feature-node-actions'),keepLabel=node('label',undefined,'node-keep-label'),checkbox=node('input');checkbox.type='checkbox';checkbox.checked=data.kept;checkbox.dataset.work='true';checkbox.setAttribute('aria-label',`Keep ${data.title} for my app`);checkbox.onchange=()=>Promise.resolve(this.actions.keep(data.message,data.row,checkbox.checked)).catch(error=>this.actions.notify(error));keepLabel.append(checkbox,document.createTextNode('Keep'));controls.append(keepLabel);
        title.dataset.work='true';title.setAttribute('aria-label',`Expand ${data.title}`);select.removeAttribute('aria-pressed');select.title='Click the title to investigate this feature.';title.onclick=event=>{event.stopPropagation();this.expandFeature(data);};card.append(controls);const details=node('button','Details','node-details');details.setAttribute('aria-label',`Inspect feature: ${data.title}`);details.onclick=()=>{this.selected=id;this.draw();this.ensureVisible(id);};card.append(details);
        const previous=this.featureBranch(data);if(previous){const view=node('button','View branch','view-feature-branch');view.setAttribute('aria-label',`View branch for ${data.title}`);view.onclick=()=>this.reveal(`turn:${previous.id}`);card.append(view);}
      }
      if(data.type==='investigation'){title.dataset.work='true';title.setAttribute('aria-label',data.title);title.onclick=()=>this.actions.submit('Rediscover the features and capabilities of these sources.');const details=node('button','Details','node-details');details.onclick=()=>{this.selected=id;this.draw();};card.append(details);}
      if(data.updates?.length){card.classList.add('has-result');select.querySelector('.node-summary').textContent=`Result: ${data.updates.at(-1).overview||data.updates.at(-1).understanding||'Saved findings — open Details'}`;}
      if(count&&!featureMode&&data.type!=='feature'){const expanded=this.expanded.has(id),limit=this.limits.get(id)||6,expand=node('button',expanded?'Collapse':`Reveal ${Math.min(count,6)}`, 'node-reveal');expand.setAttribute('aria-expanded',String(expanded));expand.setAttribute('aria-label',`${expanded?'Collapse':'Reveal'} children of ${data.title}`);expand.onclick=()=>{if(expanded)this.expanded.delete(id);else{this.expanded.add(id);this.limits.set(id,6);}this.draw();if(!expanded)this.frameBranch(id);this.focus(id);};card.append(expand);
        if(expanded&&count>limit){const more=node('button',`+${Math.min(6,count-limit)} more`,'node-more');more.setAttribute('aria-label',`Reveal more children of ${data.title}`);more.onclick=()=>{this.limits.set(id,limit+6);this.draw();this.frameBranch(id);this.focus(id);};card.append(more);}
      }
      $('graph-nodes').append(card);
    }
    $('graph-count').textContent=this.discovery?`${this.discovery.features.length} discovery features · ${this.state.messages.filter(message=>message.role==='assistant'&&!message.features?.length).length} saved explorations · ${[...positions.keys()].filter(id=>this.graph.nodes.get(id)?.type==='result').length} result nodes · ${[...positions.keys()].filter(id=>this.graph.nodes.get(id)?.type==='recommendation').length} next directions shown`:`${positions.size} directions shown`;
    $('restore-hidden').hidden=!this.hiddenDirections.size;$('restore-hidden').textContent=`Restore removed (${this.hiddenDirections.size})`;this.applyScale();this.inspector();if(pinned&&this.layout.groups?.has(pinned))this.showPreview(pinned,true);this.setBusy(this.busy);this.savePositions();this.animateFolding(folding);
  }
  animateFolding(previous){
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    requestAnimationFrame(()=>{const viewport=$('graph-viewport'),rect=viewport.getBoundingClientRect();for(const entry of previous){const group=this.layout.groupForNode?.get(entry.id),trigger=group&&this.groupButton(group);if(!trigger)continue;const target=trigger.getBoundingClientRect(),ghost=entry.card;ghost.className='accordion-morph-ghost';ghost.removeAttribute('data-node-id');ghost.setAttribute('aria-hidden','true');for(const button of ghost.querySelectorAll('button'))button.tabIndex=-1;Object.assign(ghost.style,{left:`${entry.rect.left-rect.left}px`,top:`${entry.rect.top-rect.top}px`,width:`${entry.rect.width}px`,height:`${entry.rect.height}px`});viewport.append(ghost);const animation=ghost.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${target.left-entry.rect.left}px,${target.top-entry.rect.top}px) scale(${target.width/entry.rect.width},${target.height/entry.rect.height})`,opacity:0}],{duration:450,easing:'cubic-bezier(.22,1,.36,1)'});animation.onfinish=()=>ghost.remove();animation.oncancel=()=>ghost.remove();}});
  }
  drawDiscovery(position){
    const card=node('section',undefined,'node-card discovery-block');card.dataset.nodeId=this.graph.root;Object.assign(card.style,{left:`${position.x}px`,top:`${position.y}px`,width:`${position.width}px`,height:`${position.height}px`});
    const grip=node('button','Discovery','node-grip');grip.setAttribute('aria-label','Move discovery');grip.title='Drag to move the discovery block';card.append(grip);
    const header=node('div',undefined,'discovery-block-heading');header.append(node('h1',this.discovery.title||this.state.title),node('p',this.discovery.overview||''));const latest=this.state.messages.findLast(message=>message.role==='assistant'),recommended=latest||this.discovery;if(recommended.recommendation){const guidance=node('p',undefined,'discovery-guidance');guidance.append(node('strong','Recommended next: '));const choice=node('button',this.discovery.features.find(row=>row.name===recommended.recommendation)?.displayLabel||recommended.recommendation,'recommendation-choice');choice.dataset.work='true';choice.onclick=()=>this.runRecommendation({id:`turn:${recommended.id}`,message:recommended});guidance.append(choice);header.append(guidance);}card.append(header);
    const table=node('table',undefined,'discovery-options'),head=node('thead'),labels=node('tr');for(const text of ['Explore','Found in','What we’d investigate',''])labels.append(node('th',text));head.append(labels);table.append(head);const body=node('tbody');
    for(const row of this.discovery.features){
      const data=this.graph.nodes.get(featureId(row.name)),tr=node('tr',undefined,'discovery-row');tr.dataset.featureName=row.name;const name=node('th'),title=node('button',row.displayLabel||row.name,'discovery-feature-title');title.dataset.work='true';title.setAttribute('aria-label',`Expand ${row.displayLabel||row.name}`);title.onclick=event=>{event.stopPropagation();this.expandFeature(data);};name.append(title);tr.onclick=event=>{if(!event.target.closest('button'))this.inspect(data.id);};tr.classList.toggle('selected-row',this.selected===data.id);
      const origins=originsFor(this.state,this.discovery,row).map(origin=>this.state.products?.find(product=>product.id===origin.productId)?.name||origin.productId);const source=node('td',origins.join(', ')),question=node('td');question.append(node('span',row.displayQuestion||row.investigate));
      const saved=this.featureBranch(data);if(saved){const results=node('button',`${saved.continuation?.status==='complete'?'Complete':saved.continuation?.status==='blocked'?'Evidence limit':'Saved'} · View results`,'feature-result');results.setAttribute('aria-label',`View saved results for ${data.title}`);results.title=saved.overview||saved.understanding||'Read this exploration';results.onclick=()=>this.inspectResult(data,saved);question.classList.add('has-saved-result');question.append(results);} 
      const portCell=node('td'),port=node('button','↗','branch-port'),previous=this.featureBranch(data);port.setAttribute('aria-label',previous?`View branch for ${data.title}`:`Explore ${data.title}`);port.title=previous?'Open saved branch':'Start this feature branch';port.dataset.work=previous?'false':'true';if(previous)delete port.dataset.work;port.onclick=()=>previous?this.reveal(this.graph.nodes.has(`turn:${previous.id}`)?`turn:${previous.id}`:data.id):this.expandFeature(data);port.classList.toggle('branch-built',!!previous);portCell.append(port);tr.append(name,source,question,portCell);body.append(tr);
    }
    table.append(body);card.append(table);card.onclick=event=>{if(!event.target.closest('button,.discovery-row'))this.inspect(this.graph.root);};$('graph-nodes').append(card);
  }
  async askFollowUp(data){if(this.busy||this.launching)return;const branch=data.message.branchFeatureName||data.message.focus?.featureName,feature=branch&&this.graph.nodes.get(featureId(branch));try{if(feature?.row)await this.actions.choose(feature.message,feature.row);this.inspect(data.id);$('message').focus();this.actions.notify('Ask a specific follow-up to branch from this result.');}catch(error){this.actions.notify(error);}}
  inspectResult(feature,message){const owner=[...this.graph.nodes.values()].find(data=>data.updates?.some(update=>update.id===message.id));if(owner&&['recommendation','result'].includes(owner.type))this.reveal(owner.id);else this.inspect(owner?.id||feature.id);}
  inspector(){
    const data=this.graph.nodes.get(this.selected),panel=$('node-inspector'),body=$('node-content');panel.hidden=false;const key=`${this.stateId}:${this.selected}`;if(this.inspectedKey!==key){panel.scrollTop=0;this.inspectedKey=key;}body.replaceChildren();$('guided-deepen').hidden=!this.nextAction();if(!data){$('node-kind').textContent='Information';$('node-title').textContent='Select a node';body.append(node('p','Click a feature row or a direction to see its results, recommendation and evidence here. Green titles start an investigation.'));return;}
    if(data.type==='result'){$('node-kind').textContent=data.message.continuation?.status==='blocked'?'Result · Evidence limit':'Result · Complete';$('node-title').textContent=data.title;this.renderDetails(data,body);return;}
    $('node-kind').textContent=data.type==='recommendation'?(data.latest?'Recommended next · latest':'Recommended next'):data.type;$('node-title').replaceChildren();const title=node('button',data.title,'detail-title-action');title.dataset.work='true';title.onclick=()=>data.type==='feature'?this.expandFeature(data):data.type==='recommendation'?this.runRecommendation(data):this.actions.submit('Rediscover the features and capabilities of these sources.');$('node-title').append(title);
    this.renderDetails(data,body);
  }
  renderDetails(data,body){
    this.renderUpdates(data,body);
    if(!data.updates?.length&&data.message?.role==='assistant'&&['investigation','checkpoint','result','recommendation'].includes(data.type))appendDelivery(body,this.state,data.message,{exportDelivery:this.actions.exportDelivery,notify:this.actions.notify});
    if(data.type==='recommendation'&&data.message.recommendationReason)body.append(node('p',data.message.recommendationReason));
    if(data.type==='recommendation')body.append(node('p','Recommended next — click the green title to investigate. Use Explore up to 3 steps for a guided sequence.','selection-guidance'));
    if(data.type==='feature'){const previous=this.featureBranch(data);if(!previous||previous.recommendation)body.append(node('h3','Recommended next'),node('p',previous?.recommendation||data.row.displayQuestion||data.row.investigate));}
    const branch=data.message?.branchFeatureName||data.message?.focus?.featureName;if(branch)body.append(node('small',`Feature branch: ${this.graph.nodes.get(featureId(branch))?.title||branch}`));
    if(data.summary&&!data.updates?.length)body.append(node('p',data.summary));
    const action=(text,callback,work=false,className='')=>{const button=node('button',text,`inspector-action ${className}`);if(work){button.dataset.work='true';button.disabled=this.busy;}button.onclick=()=>Promise.resolve(callback()).catch(error=>this.actions.notify(error));body.append(button);return button;};
    const childCount=this.layout.children.get(data.id)?.length||0,limit=this.limits.get(data.id)||6;
    if(this.expanded.has(data.id)&&childCount>limit)action(`Reveal next ${Math.min(6,childCount-limit)} nodes`,()=>{this.limits.set(data.id,limit+6);this.draw();this.frameBranch(data.id);});
    if(data.type==='feature'){
      body.append(node('small',data.row.evidenceBasis?`Evidence basis: ${data.row.evidenceBasis}`:'Saved feature'));
      action(data.kept?'Remove from my app':'Keep for my app',()=>this.actions.keep(data.message,data.row,!data.kept),true,'keep-node');
      for(const origin of data.row.origins||[]){body.append(node('h3',this.state.products?.find(product=>product.id===origin.productId)?.name||origin.productId),node('p',origin.description));}
      if(data.row.investigate)body.append(node('h3','Investigation question'),node('p',data.row.investigate));
      const evidenceDetails=node('details');evidenceDetails.append(node('summary','Feature evidence'));
      for(const index of data.row.claimIndexes||[]){const claim=data.message.claims?.[index];if(!claim)continue;evidenceDetails.append(node('p',claim.text));if(claim.quote)evidenceDetails.append(node('blockquote',claim.quote));const evidence=this.state.evidence.find(item=>item.id===claim.evidenceId);if(evidence){evidenceDetails.append(node('small',`${evidence.title||evidence.locator} · SHA-256 ${evidence.sha256}`));const source=node('button','Open source','connection-link');source.onclick=()=>Promise.resolve(this.actions.showSource(this.state.id,evidence.id)).catch(error=>this.actions.notify(error));evidenceDetails.append(source);}}body.append(evidenceDetails);
    }
    if(data.type==='checkpoint'){
      if(data.request)body.append(node('h3','Request'),node('p',data.request));
      if(data.message.recommendation){body.append(node('h3','Recommended next'));action(data.message.recommendation,()=>this.runRecommendation(data),true,'recommendation-choice');}
      const complete=node('details');complete.append(node('summary','Complete findings'),node('p',data.message.text||data.message.understanding||''));body.append(complete);
      if(data.message.caveat)body.append(node('h3','Limits'),node('p',data.message.caveat));
    }
    if(data.type==='claim'){
      if(data.claim.quote)body.append(node('h3','Exact source quotation'),node('blockquote',data.claim.quote));
      if(data.claim.quoteOrigin==='inspection-limit')body.append(node('p','This quotation records an inspection limitation.'));
    }
    if(data.type==='evidence'){
      body.append(node('small',`${data.evidence.kind} / ${new Date(data.evidence.capturedAt).toLocaleString()}`));
      action(data.evidence.kind==='file'?'Show saved snapshot':'Open source',()=>this.actions.showSource(this.state.id,data.evidence.id));
      body.append(node('h3','Snapshot hash'),node('small',data.evidence.sha256));for(const limit of data.evidence.limitations||[])body.append(node('p',limit));
    }
    if(data.type==='source')for(const locator of data.product.locators)body.append(node('small',locator));
    if(data.type==='investigation'){body.append(node('h3','Saved source snapshots'));for(const evidence of this.state.evidence){const source=node('button',evidence.title||evidence.locator,'connection-link');source.onclick=()=>Promise.resolve(this.actions.showSource(this.state.id,evidence.id)).catch(error=>this.actions.notify(error));body.append(source,node('small',evidence.sha256));}}
  }
  renderUpdates(data,body){
    for(const message of data.updates||[]){
      appendDelivery(body,this.state,message,{exportDelivery:this.actions.exportDelivery,notify:this.actions.notify});
      if(message.continuation){body.append(node('h3',message.continuation.status==='continue'?'Why go deeper':message.continuation.status==='complete'?'Exploration complete':'Evidence limit'),node('p',message.continuation.reason));if(message.continuation.uncertainty)body.append(node('p',message.continuation.uncertainty));if(message.continuation.nextEvidence)body.append(node('small',message.continuation.nextEvidence));}
      body.append(node('h3','Results'),node('p',message.overview||message.understanding||''));
      for(const finding of message.findings||[])body.append(node('h3',finding.question),node('p',finding.finding));
      const details=node('details');details.append(node('summary',`Evidence and complete findings (${message.claims?.length||0} claims)`),node('p',message.text||''));
      for(const claim of message.claims||[]){details.append(node('p',claim.text));if(claim.quote)details.append(node('blockquote',claim.quote));const evidence=this.state.evidence.find(item=>item.id===claim.evidenceId);if(evidence){details.append(node('small',`${evidence.title||evidence.locator} · SHA-256 ${evidence.sha256}`));const source=node('button','Open source','connection-link');source.onclick=()=>Promise.resolve(this.actions.showSource(this.state.id,evidence.id)).catch(error=>this.actions.notify(error));details.append(source);}}
      body.append(details);
    }
  }

  search(){
    const query=$('graph-search').value.trim().toLowerCase(),results=$('graph-search-results');results.replaceChildren();if(!query)return;
    const matches=[...this.graph.nodes.values()].filter(data=>`${data.title} ${data.summary}`.toLowerCase().includes(query));
    for(const data of matches.slice(0,24)){const button=node('button',`${data.type}: ${data.title}`);button.onclick=()=>{this.reveal(data.id);results.replaceChildren();};results.append(button);}
    if(!matches.length)results.append(node('p','No matching nodes.'));
  }
  focus(id){[...$('graph-nodes').children].find(element=>element.dataset.nodeId===id)?.querySelector('button')?.focus({preventScroll:true});}
  drawEdges(){
    $('graph-edges').replaceChildren();if(this.discovery){const root=this.layout.positions.get(this.graph.root);this.discovery.features.forEach((row,index)=>{const point=this.layout.positions.get(featureId(row.name));if(point){point.x=root.x+966;point.y=root.y+168+32+index*48+24-66;}});}
    const selectedGroup=this.layout.groupForNode?.get(this.selected),selected=selectedGroup?this.layout.groups.get(selectedGroup).historyId:this.selected;
    for(const edge of this.layout.edges||this.graph.edges){
      if(this.discovery&&edge.from===this.graph.root)continue;
      const from=this.layout.positions.get(edge.from),to=this.layout.positions.get(edge.to);if(!from||!to)continue;
      const forward=to.x>=from.x,sign=forward?1:-1,x1=from.x+(forward?from.width:0),y1=from.y+66,x2=to.x+(forward?0:to.width),y2=to.y+66;
      const svg=document.createElementNS('http://www.w3.org/2000/svg','path');svg.setAttribute('d',`M ${x1} ${y1} C ${x1+60*sign} ${y1}, ${x2-60*sign} ${y2}, ${x2} ${y2}`);
      svg.setAttribute('class',`graph-edge${this.graph.nodes.get(edge.to)?.parent!==edge.from&&!this.layout.histories?.has(edge.from)&&!this.layout.histories?.has(edge.to)?' cross-edge':''}${edge.from===selected||edge.to===selected?' active-edge':''}`);svg.dataset.from=edge.from;svg.dataset.to=edge.to;
      const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=edge.relation;svg.append(title);$('graph-edges').append(svg);
    }
  }
  loadPositions(){
    this.hiddenDirections=new Set();try{for(const id of JSON.parse(localStorage.getItem(`rea-hidden-directions:${this.stateId}`)||'[]'))if(['recommendation','result'].includes(this.graph.nodes.get(id)?.type))this.hiddenDirections.add(id);}catch{}
    this.accordionPositions=new Map();try{for(const [id,point]of JSON.parse(localStorage.getItem(`rea-accordion-positions:${this.stateId}`)||'[]'))if(Number.isFinite(point.x)&&Number.isFinite(point.y))this.accordionPositions.set(id,point);}catch{}
    this.nodePositions=new Map();
    try{for(const [id,point]of JSON.parse(localStorage.getItem(`rea-node-positions:${this.stateId}`)||'[]'))if(this.graph.nodes.has(id)&&Number.isFinite(point.x)&&Number.isFinite(point.y))this.nodePositions.set(id,{x:point.x,y:point.y,width:point.width||260,height:point.height||132});}catch{}
    this.featurePositions=new Map();try{for(const [id,point]of JSON.parse(localStorage.getItem(`rea-feature-positions:${this.stateId}:${this.discovery?.id}`)||'[]'))if(this.graph.nodes.has(id)&&Number.isFinite(point.x)&&Number.isFinite(point.y))this.featurePositions.set(id,{x:point.x,y:point.y,width:280,height:172});}catch{}
  }
  savePositions(){try{for(const [id,revision]of this.layout?.compacted||[]){const point=this.layout.positions.get(id);this.accordionPositions.set(id,{x:point.x,y:point.y,revision});}localStorage.setItem(`rea-accordion-positions:${this.stateId}`,JSON.stringify([...this.accordionPositions]));localStorage.setItem(`rea-node-positions:${this.stateId}`,JSON.stringify([...this.nodePositions]));localStorage.setItem(`rea-feature-positions:${this.stateId}:${this.discovery?.id}`,JSON.stringify([...this.featurePositions]));}catch{}}
  applyScale(){
    $('graph-world').style.transform=`translate(${this.camera.x}px,${this.camera.y}px) scale(${this.scale})`;$('zoom-value').textContent=`${Math.round(this.scale*100)}%`;
    const size=Math.max(12,24*this.scale);$('graph-viewport').style.backgroundSize=`${size}px ${size}px`;$('graph-viewport').style.backgroundPosition=`${this.camera.x}px ${this.camera.y}px`;
  }
  zoom(value,anchor){
    const viewport=$('graph-viewport');anchor||={x:viewport.clientWidth/2,y:viewport.clientHeight/2};
    const x=(anchor.x-this.camera.x)/this.scale,y=(anchor.y-this.camera.y)/this.scale;this.scale=Math.max(.01,Math.min(2.5,value));
    this.camera.x=anchor.x-x*this.scale;this.camera.y=anchor.y-y*this.scale;this.applyScale();
  }
  frameNodes(ids){
    const points=ids.map(id=>this.layout.positions.get(id)).filter(Boolean);if(!points.length)return;
    const minX=Math.min(...points.map(point=>point.x)),minY=Math.min(...points.map(point=>point.y)),maxX=Math.max(...points.map(point=>point.x+point.width)),maxY=Math.max(...points.map(point=>point.y+point.height)),viewport=$('graph-viewport');
    this.scale=Math.max(.01,Math.min(1,(viewport.clientWidth-48)/(maxX-minX),(viewport.clientHeight-48)/(maxY-minY)));
    this.camera.x=(viewport.clientWidth-(maxX-minX)*this.scale)/2-minX*this.scale;this.camera.y=(viewport.clientHeight-(maxY-minY)*this.scale)/2-minY*this.scale;this.applyScale();
  }
  frameBranch(id){
    const at=this.layout.location?.get(id),history=at&&this.layout.histories?.get(`history:${at.anchor}`);if(history){this.frameNodes([history.id,...[...this.layout.positions.keys()].filter(key=>this.layout.location.get(key)?.anchor===at.anchor)]);return;}
    const children=(this.layout.children.get(id)||[]).filter(child=>this.layout.positions.has(child)).slice(-6),parent=this.layout.positions.get(id);
    if(!parent)return;
    this.frameNodes([id,...children]);
  }
  ensureVisible(id){
    const group=this.layout.groupForNode?.get(id);if(group)id=this.layout.groups.get(group).historyId;
    const point=this.layout.positions.get(id),viewport=$('graph-viewport');if(!point)return;const margin=20,left=point.x*this.scale+this.camera.x,top=point.y*this.scale+this.camera.y,right=left+point.width*this.scale,bottom=top+point.height*this.scale;
    if(left<margin)this.camera.x+=margin-left;else if(right>viewport.clientWidth-margin)this.camera.x-=right-viewport.clientWidth+margin;
    if(top<margin)this.camera.y+=margin-top;else if(bottom>viewport.clientHeight-margin)this.camera.y-=bottom-viewport.clientHeight+margin;
    this.applyScale();
  }
  fit(){this.frameNodes([...this.layout.positions.keys()]);}
  pending(text){$('graph-running').hidden=false;$('graph-running').textContent=`Investigating: ${text}`;}
  finished(){$('graph-running').hidden=true;}
}
