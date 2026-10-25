// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {renderUserError,clearUserError,feedbackHeading} from './user-feedback.js';
import {renderSetupDiagnostic} from './setup-diagnostics.js';
import {sizeNodeContent} from './node-content-size.js';
import {nodeMenu as showNodeMenu,previewAction,comparisonPicker,guard as actionGuard} from './flywheel-actions.js';
import {applicationFeatureStep} from '../lib/saved-step-state.mjs';
import {renderSavedStep} from './saved-step-panel.js';
import {renderReading,comparisonOrigins} from './reading-destinations.js';
import {appendFindingCategory,appendCategoryKey,categoryBadge} from './finding-category.js';
import {claimCategory} from '../lib/finding-category.mjs';
import {MIN_STEPS,MAX_STEPS,normalizeStepLimit} from '../lib/auto-deepen.mjs';
import {installMagneticControls,presetFocus} from './magnetic-controls.js';
import {installWorkspaceUndo} from './workspace-undo.js';
import {renderFailureRecovery} from './failure-recovery.js';
import {syncSelectedHeadline} from './selected-headline.js';
import {installCanvasNavigation} from './canvas-navigation.js';
import {renderAiRecovery} from './ai-recovery.js';
import {refreshOutlineHierarchy} from './outline-hierarchy.js';
import {cancelBranchEffects} from './branch-effects.js';
import {frameAddedNodes} from './map-reconciliation.js';
import {recordedParts} from '../lib/recorded-parts.mjs';
import {syncOrbitGuideStroke,drawArrangementGuides} from './arrangement-guides.js';
import {orbitHierarchyRoute} from '../lib/additional-layouts.mjs';
import {syncBulkDelete} from './bulk-delete.js';
import {GraphView} from './graph-view.js';
import {installLayoutButtons,syncLayoutButtons} from './layout-buttons.js';
import {installWorkspaceMenu} from './workspace-menu.js';
import {executionGraph} from '../lib/execution-graph.mjs';
import {productsFor, originsFor} from '../lib/collection.mjs';
import {VIEWS, cleanWorkspace, featureRecords, topicGroups, evidenceLabel} from '../lib/workspace.mjs';
import {appendDelivery} from './delivery.js';
import {sampleLoopingJeremysSpectrum,assignLoopingNodeSpectrum} from '../lib/jeremys-spectrum.mjs';
import {themeColor,themeWireStops,themeWireContour,BUILTIN_THEMES} from '../lib/theme-system.mjs';
import {themeMotion} from './theme-motion.js';
import {layoutWireStyle} from '../lib/camera-wire-style.mjs';
import {layoutMap,switchLayout} from '../lib/map-layouts.mjs';
import {packMap,orientPositions} from '../lib/adaptive-layout.mjs';
import {tidyWorkspace,keepNodePosition} from './tidy-controls.js';
import {installPanelLayout} from './panel-layout.js';
import {installOutlineLayout} from './outline-layout.js';
import {drawOutline,refreshOutlinePaths} from './outline-view.js';
import {inventoryRecords,inventoryCoverage} from '../lib/discovery-inventory.mjs';
import {workspaceMap,isVerificationConstraint,runnableDirections,savedDirections,branchStats,PREFLIGHT_NODE_ID,isConnectionBoundary,preflightUtilityPoint} from '../lib/workspace-map.mjs';
import {reportConnector} from '../lib/report-connector.mjs';
import {existingRadial,presentRadial,wireContextActions} from './radial-menu.js';
import {featureOutcome,resultOutcome} from '../lib/outcomes.mjs';
import {drawGrowingMap,drawGrowingWires,openMapNode,hiddenBranches,hideBranch,collapseBranch,revealMapPath} from './growing-map.js';
import {settleAppearingNodes,cancelNodeSettling} from './node-settling.js';
import {growthRoute} from '../lib/result-growth.mjs';
import {wireHitsNode,connectionPorts} from '../lib/map-routing.mjs';
import {radialHierarchyRoute,circularHierarchyRoute} from '../lib/radial-tidy.mjs';
import {spiralHierarchyRoute,isSpiralPoint} from '../lib/shape-arrangements.mjs';
import {installResultReveal,beginResultGrowth,collectResultGrowth,syncResultGrowth} from './result-reveal.js';
import {renderTargetRecovery} from './target-recovery.js';
import {recoveryTitle} from '../lib/target-recovery-state.mjs';
import {selectedManagedScopes} from '../lib/inspection-scope.mjs';
import {WIRE_STYLES,linearWirePath,linearWireHitsNode} from '../lib/wire-style.mjs';
import {executionFocusCamera} from '../lib/execution-focus.mjs';
import {installMapImageExport} from './map-image-export.js';
import {coveragePlan} from '../lib/coverage-plan.mjs';
import {needsTreeUpgrade} from '../lib/tree-layout.mjs';
import {showCoverage} from './coverage.js';

const $ = id => document.getElementById(id);
const el = (tag, text, cls) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const button=(text, action, cls='')=>{const n=el('button',text,cls);n.type='button';n.onclick=action;return n;};
const svg=(tag,attrs={})=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
const symbol=title=>/draw|pen|draft/i.test(title)?'\uE70F':/export|download|save/i.test(title)?'\uE74E':/layer|workflow|pattern/i.test(title)?'\uE81E':/history|session|restore/i.test(title)?'\uE81C':/share|collab|team/i.test(title)?'\uE716':/search|find/i.test(title)?'\uE721':'\uE8A5';

export class WorkspaceView {
  constructor(actions) {
    this.actions=actions;this.legacy=new GraphView(actions);this.legacyMode=false;this.ws=cleanWorkspace();this.records=[];this.groups=[];this.points=new Map();this.camera={x:0,y:0,scale:1};this.ready=false;
    this.legacy.askFollowUp=data=>{if(this.busy)return;this.view('evidence');this.reveal(`turn:${data.message.id}`);this.ask();};
    $('workspace-canvas').append($('welcome'),$('node-workbench'));
    $('node-workbench').append($('workspace-inspector'));
    this.nodeOpen=false;this.askOpen=false;
    $('node-close').onclick=()=>{if(this.ws.reader)this.closeReader();this.nodeOpen=false;this.askOpen=false;this.draw();this.persist();};$('reader-return').onclick=()=>this.closeReader();
    $('draft-resume').onclick=()=>this.resumeDraft();
    document.querySelector('header nav').prepend(document.querySelector('.graph-search-wrap'));
    $('file-export-items').append($('export-investigation'),$('export-graph'),$('export-kept'));
    $('welcome-start').onclick=()=>{this.openRoot();$('message').focus();};$('welcome-folder').onclick=()=>{this.openRoot();$('folder').click();};
    this.sidebarToggle=$('workspace-list-toggle');$('workspace-map-tools').setAttribute('role','toolbar');$('workspace-map-tools').setAttribute('aria-label','Canvas tools');$('workspace-surface').prepend($('workspace-map-tools'));

    $('coverage-open').after($('workspace-whole'));
    installWorkspaceMenu();
    installMapImageExport(this);
    $('graph-search').placeholder='Find a node…';$('graph-search').oninput=()=>{if(this.legacyMode)return this.legacy.search();this.ws.search=$('graph-search').value;this.search();this.persist();};
    installLayoutButtons(layout=>this.changeLayout(layout));
    document.addEventListener('nodes-appearance-change',()=>{
      if(!this.ready||!this.map||this.legacyMode)return;
      cancelBranchEffects(this);cancelNodeSettling(this);this.radialMenu?.close(false,true);this.cancelFocusMotion();
      for(const a of $('workspace-canvas').getAnimations({subtree:true}))if(a.id?.startsWith('rea-growth-'))a.finish();
      for(const n of document.querySelectorAll('#map-nodes [data-node-id],.outline-row'))n.style.setProperty('--topic',this.color(n.dataset.nodeId));
      refreshOutlineHierarchy(this);
      $('node-workbench').style.setProperty('--topic',this.color(this.selectedRecord()?.id||'core'));
      drawGrowingWires(this);drawArrangementGuides(this);syncOrbitGuideStroke(this);this.connectWorkbench();
    });
    $('workspace-whole').onclick=()=>{this.saveCamera();this.ws.processMap=!this.ws.processMap;this.nodeOpen=false;this.draw();if(!frameAddedNodes(this))this.fit();this.persist();};$('workspace-fit').onclick=()=>tidyWorkspace(this);$('workspace-zoom-in').onclick=()=>this.zoom(this.camera.scale*1.15);$('workspace-zoom-out').onclick=()=>this.zoom(this.camera.scale/1.15);
    for(const [id,label,name,key,after]of [
      ['workspace-dots','Dots','Dotted connections','dottedLines'],
      ['workspace-wires','Wires','Show connections','wiresVisible']
    ]){const toggle=button(label,()=>{cancelBranchEffects(this);this.ws[key]=!this.ws[key];this.syncMapAppearance();after?.();this.persist();});toggle.id=id;toggle.setAttribute('aria-label',name);toggle.setAttribute('aria-controls',id==='workspace-dots'||id==='workspace-wires'?'map-wires':'map-nodes');$('workspace-navigation').firstElementChild.append(toggle);}
    const styles=el('div',undefined,'wire-style-control');styles.setAttribute('role','group');styles.setAttribute('aria-label','Line style');
    for(const value of WIRE_STYLES){const label=value==='spline'?'Lines':value[0].toUpperCase()+value.slice(1),style=button(label,()=>{cancelBranchEffects(this);this.ws.wireStyle=value;this.syncMapAppearance();drawGrowingWires(this);this.connectWorkbench();this.persist();});style.id=`workspace-wire-${value}`;style.dataset.wireStyle=value;style.setAttribute('aria-label',label);style.setAttribute('aria-controls','map-wires node-connection');styles.append(style);}
    $('workspace-navigation').firstElementChild.append(styles);
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>{cancelNodeSettling(this);this.cancelFocusMotion();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancelFocusMotion();});
    const fit=button('Fit',()=>this.fit());fit.id='workspace-camera-fit';fit.title='Fit the current map without moving nodes (F)';$('workspace-zoom-in').after(fit);
    for(const [id,text,run]of [['workspace-hidden','Show hidden',()=>hiddenBranches(this)],['workspace-expand','Expand all',()=>{this.ws.collapsed=[];this.draw();frameAddedNodes(this);this.persist();}]]){const n=button(text,run);n.id=id;n.hidden=true;$('workspace-navigation').firstElementChild.append(n);}
    $('workspace-list-toggle').onclick=()=>{this.ws.outline=!this.ws.outline;this.ws.list=false;this.draw();this.persist();this.sidebarToggle.focus({preventScroll:true});};
    $('guided-deepen').onclick=()=>{if(this.legacyMode)return this.legacy.followNextThree();const record=this.selectedRecord();if(record){this.actions.autoThree();this.start(record);}else this.actions.notify('Choose a feature before following its next directions.');};
    $('legacy-view').onclick=()=>{this.saveCamera();this.legacyMode=true;document.body.classList.add('legacy-view');$('node-settings').open=false;this.legacy.update(this.state,this.busy);$('graph-sources').click();};
    $('coverage-open').onclick=()=>this.coverage();$('workspace-subtitle').onclick=()=>this.coverage();
    $('graph-overview').onclick=()=>this.overview();
    this.outlineLayout=installOutlineLayout(this);this.panelLayout=installPanelLayout(this);this.installMap();
    new ResizeObserver(()=>{
      if(!this.ready||this.legacyMode)return;
      // Completion can resize the chrome. Let the finite reveal finish before
      // rebuilding its DOM; an actual interaction still cancels immediately.
      if(this.branchEffects?.size){
        if(!this.revealResizePending){this.revealResizePending=true;Promise.allSettled([...this.branchEffects.keys()].map(a=>a.finished)).then(()=>{this.revealResizePending=false;if(this.ready&&!this.legacyMode)this.refreshViewport();});}
      }else this.refreshViewport();
    }).observe($('workspace-canvas'));
    installResultReveal(this);
    const arrangeActions=el('div');arrangeActions.id='workspace-arrange-actions';arrangeActions.setAttribute('role','group');arrangeActions.setAttribute('aria-label','Map arrangement');arrangeActions.append($('workspace-fit'));$('workspace-heading').append(arrangeActions);

    this.navigation=installCanvasNavigation(this);
    document.addEventListener('nodes-preset-focus',()=>this.applyPresetFocus());
    const display=el('div');display.id='workspace-canvas-controls';display.setAttribute('role','group');display.setAttribute('aria-label','Canvas display');display.append(styles,$('workspace-dots'),$('workspace-wires'));document.querySelector('header .graph-search-wrap').before(display);$('workspace-subtitle').after($('workspace-count'));document.querySelector('#workspace-heading .workspace-view-tools').append($('workspace-save'));$('workspace-map-tools').hidden=true;installMagneticControls();
    this.workspaceUndo=installWorkspaceUndo(this);
    this.ready=true;
  }
  refreshViewport(){
    if(!this.ready||this.legacyMode||!this.state||!this.map)return;
    // Viewport resizing does not change graph data. Retain live node DOM,
    // keyboard focus, reading content and animations instead of rebuilding it.
    this.outlineLayout.apply();this.panelLayout.apply();
    const resized=sizeNodeContent(this);
    if(resized){drawGrowingWires(this);drawArrangementGuides(this);this.persist();}
    this.navigation?.draw();this.applyCamera();
  }
  get graph(){return this.legacy.graph;}
  get inspected(){return this.records.find(r=>r.id===this.ws.inspected);}
  get result(){const item=this.map?.nodes.get(this.ws.inspected);return item&& !['feature','source','root'].includes(item.type)?item.message:this.latestResult(this.inspected);}
  latestResult(record){return record&&this.state.messages.findLast(m=>m.role==='assistant'&&!m.features?.length&&(m.branchFeatureName||m.focus?.featureName||'').trim().toLowerCase()===record.row.name.trim().toLowerCase());}
  featureForResult(message){return message?.features?.length?null:this.records.find(r=>r.row.name.trim().toLowerCase()===(message?.branchFeatureName||message?.focus?.featureName||'').trim().toLowerCase());}
  selectedRecord(){let item=this.map?.nodes.get(this.ws.inspected);const seen=new Set();while(item&&!seen.has(item.id)){seen.add(item.id);const record=this.records.find(r=>r.id===item.id)||this.featureForResult(item.message);if(record)return record;item=this.map.nodes.get(item.parent);}return this.inspected||this.featureForResult(this.result);}
  activeGroup(){const record=this.selectedRecord();return this.groups.find(g=>g.id===this.ws.group)||this.groups.find(g=>g.items.some(r=>r.id===record?.id))||this.groups[0];}
  persist(){if(!this.state)return;this.workspaceUndo?.observe();this.state.workspace=this.ws;this.actions.workspace?.(this.ws);}
  saveCamera(){if(this.ws){this.ws.mapCamera={...this.camera};this.ws.layouts||={};this.ws.layouts[this.ws.layout||'horizontal']={positions:this.ws.mapPositions,camera:{...this.camera}};this.ws.cameras[this.ws.activeView]={...this.camera,scroll:$('node-workbench').scrollTop};}}
  location(){return {view:this.ws.activeView,inspected:this.ws.inspected,group:this.ws.group,layout:this.ws.layout,camera:{...this.camera},nodeOpen:this.nodeOpen,askOpen:this.askOpen,outline:this.ws.outline,inventoryLimit:this.ws.inventoryLimit,processMap:this.ws.processMap,hidden:[...this.ws.hidden],collapsed:[...this.ws.collapsed],scroll:$('node-workbench').scrollTop};}
  remember(){const at=this.location();if(JSON.stringify(this.ws.trail.at(-1))!==JSON.stringify(at))this.ws.trail.push(at);this.ws.trail=this.ws.trail.slice(-30);}
  back(){this.cancelFocusMotion();if(this.ws.reader){this.closeReader();return;}if(this.legacyMode){this.view('overview');return;}const at=this.ws.trail.pop();if(!at){this.overview();return;}Object.assign(this.ws,{activeView:at.view,inspected:at.inspected,group:at.group});if(at.layout)this.ws.layout=at.layout;if(at.camera)this.camera={...at.camera};this.nodeOpen=at.nodeOpen??!!at.inspected;this.askOpen=!!at.askOpen;if(at.inspected)revealMapPath(this,at.inspected);this.draw();this.saveCamera();this.persist();this.actions.inspected?.(this.selectedRecord(),false);}
  view(view){this.cancelFocusMotion();if(!VIEWS.includes(view))return;this.saveCamera();if(view!==this.ws.activeView||this.legacyMode)this.remember();this.legacyMode=false;document.body.classList.remove('legacy-view');this.ws.activeView=view;if(view==='evidence'&&this.selectedRecord())this.nodeOpen=true;this.draw();this.persist();}
  overview(){this.nodeOpen=false;this.ws.list=false;this.view('overview');}
  openRoot(){this.cancelFocusMotion();this.ws.inspected='';this.nodeOpen=true;this.askOpen=!this.state.draft?.trim()||!this.state.draftContext?.featureName;this.draw();this.persist();}
  ask(){this.nodeOpen=true;this.askOpen=true;this.draw();if(!$('composer').hidden)$('message').focus();}
  resumeDraft(){const record=this.records.find(r=>r.row.name.trim().toLowerCase()===(this.state.draftContext?.featureName||'').trim().toLowerCase());if(record){this.inspect(record);this.ask();}else if(!this.state.draftContext?.featureName)this.openRoot();else this.actions.notify('This draft’s node is unavailable. Move the draft explicitly to another node.');}
  inspect(record,view='explore'){openMapNode(this,record.id);this.ws.activeView=view;this.ws.group=this.groups.find(g=>g.items.some(r=>r.id===record.id))?.id||'';this.draw();this.persist();}
  reveal(id){if(this.legacyMode){this.legacyMode=false;document.body.classList.remove('legacy-view');}if(this.map.nodes.has(id)){openMapNode(this,id);this.ws.activeView='evidence';this.draw();this.persist();}}
  update(state,busy){
    this.suspendUndo=true;
    const previousMap=this.map;
    const switched=this.state?.id!==state.id,previous=this.state?.messages.findLast(m=>m.role==='assistant')?.id;if(switched){this.layoutUndo=null;this.headlineRequest=null;this.headlineDismissed=false;}
    if(switched){cancelNodeSettling(this);this.points.clear();this.bulkSelected=new Set();this.nodeSelectionMode=false;}
    this.state=state;this.busy=busy;this.legacy.update(state,busy);this.records=inventoryRecords(state);this.groups=topicGroups(this.records);this.map=workspaceMap(state);this.records=this.records.filter(r=>this.map.nodes.has(r.id));this.groups=topicGroups(this.records);collectResultGrowth(this,previousMap,switched);
    if(switched){this.cancelFocusMotion();this.radialMenu?.close(false,true);this.ws=cleanWorkspace(state.workspace);if(this.ws.legacyLayoutPending||(state.workspace&&!state.workspace.layouts)){this.ws.layouts.manual={positions:structuredClone(this.ws.mapPositions),camera:this.ws.mapCamera?{...this.ws.mapCamera}:null};this.ws.layout='horizontal';this.ws.activeView='explore';this.ws.mapPositions={};this.ws.mapCamera=null;this.ws.layouts.horizontal={positions:{},camera:null};this.ws.mapInitialized=false;this.ws.legacyLayoutPending=false;this.actions.notify('Your previous arrangement is available under Manual.');}if(!state.workspace&&state.selection?.featureName)this.ws.inspected=`feature:${state.selection.featureName.trim().toLowerCase()}`;this.camera=this.ws.mapCamera||{x:0,y:0,scale:1};this.legacyMode=false;document.body.classList.remove('legacy-view');$('graph-search').value=this.ws.search;this.nodeOpen=!!state.messages.length||!!state.draft?.trim()||!!this.ws.inspected;this.askOpen=!!state.draft?.trim();if(this.ws.reader)this.nodeOpen=true;$('auto-deepen').checked=this.ws.autoDeepen;$('depth-limit').value=this.ws.depthLimit;$('depth-value').textContent=this.ws.depthLimit;$('depth-options').hidden=!this.ws.autoDeepen;}
    if(switched){cancelAnimationFrame(this.readerRestoreFrame);this.readerRestore=this.ws.reader?{investigationId:state.id,nodeId:this.ws.reader.nodeId,scroll:this.ws.cameras[this.ws.activeView]?.scroll||0}:null;if(this.readerRestore){const restore=this.readerRestore;this.readerRestoreFrame=requestAnimationFrame(()=>{this.readerRestoreFrame=requestAnimationFrame(()=>{if(this.readerRestore===restore&&this.state.id===restore.investigationId&&this.ws.reader?.nodeId===restore.nodeId)$('node-workbench').scrollTop=restore.scroll;if(this.readerRestore===restore)this.readerRestore=null;});});}}
    refreshOutlinePaths(this,previousMap,switched);
    if(!this.ws.mapInitialized)this.ws.mapInitialized=true; // Known modules are never silently capped or folded.
    this.ws.spectrum=assignLoopingNodeSpectrum(this.map,this.ws.spectrumVersion===2?this.ws.spectrum:{});this.ws.spectrumVersion=2;
    this.placePreflightUtility();
    // Background completion extends the map without stealing selection, draft or reader.
    if(this.ws.inspected&&!this.map.nodes.has(this.ws.inspected)){this.ws.inspected='';this.actions.notify('The saved location is unavailable. Your draft and evidence remain saved.');}
    this.draw();this.setBusy(busy);if(switched&&!this.ws.mapCamera&&this.state.messages.length)this.fit();else if(!switched&&this.navigation?.autoFollow!==false&&previousMap?.nodes.size<=1&&this.lastMapAdditions?.length)frameAddedNodes(this,['core']);if(switched)this.persist();
    this.suspendUndo=false;this.workspaceUndo?.accept(state);
  }
  setBusy(busy){const changed=busy!==this.busy;if(changed)this.radialMenu?.close(false);this.busy=busy;this.legacy.setBusy(busy||this.fileBusy);document.querySelectorAll('#workspace-surface [data-work]').forEach(n=>n.disabled=busy||!!this.fileBusy||!!this.preparingNode||!!this.starting||n.dataset.unavailable==='true');document.querySelectorAll('.node-bookmark').forEach(n=>{const reason=actionGuard(this,'collection');n.disabled=!!reason;n.setAttribute('aria-description',reason||'Local collection membership; does not investigate or select this node.');});if(changed&&this.state)this.draw();}
  draw(){
    const canArrange=!this.ws.reader;
    if(!$('workspace-fit').classList.contains('direct-tool'))$('workspace-fit').textContent='Tidy map';$('workspace-fit').setAttribute('aria-label','Tidy map');$('workspace-fit').disabled=!canArrange;$('workspace-fit').title='';
    if(!this.state||!this.ready)return;
    if(this.legacyMode)return;
    this.syncMapAppearance();
    const view=this.ws.activeView,record=this.selectedRecord(),result=this.result,hasData=this.records.length||this.state.messages.length||!!this.state.preflight;
    VIEWS.forEach(v=>{$(`view-${v}`).setAttribute('aria-selected',String(v===view));$(`view-${v}`).tabIndex=v===view?0:-1;});
    $('workspace-surface').removeAttribute('aria-labelledby');$('workspace-surface').dataset.view=view;
    $('subject-name').textContent=this.state.title==='New investigation'?'':recoveryTitle(this.state);$('subject-name').title=this.state.title;
    $('workspace-title').textContent=!hasData?'What do you want to understand?':this.subject();
    const coverage=inventoryCoverage(this.state),review=coveragePlan(this.state);$('workspace-subtitle').textContent=!hasData?'Bring a website, application, or source folder.':`${coverage.discovered} discovered · ${coverage.investigated} investigated${coverage.candidates?` · ${coverage.candidates} candidates`:''} · ${review.reviewed}/${review.total} reviewed · Total coverage unknown`;$('workspace-subtitle').disabled=!hasData;$('workspace-subtitle').setAttribute('aria-label',`Coverage & cost: ${$('workspace-subtitle').textContent}`);
    document.body.classList.toggle('empty-workspace',!hasData);$('welcome').hidden=true;$('workspace-navigation').hidden=!hasData;$('workspace-arrange-actions').hidden=!hasData;
    if(!hasData&&this.nodeOpen)this.askOpen=true;
    $('node-workbench').hidden=!this.nodeOpen;$('workspace-inspector').hidden=!this.nodeOpen;
    $('workspace-surface').classList.remove('has-inspector');$('workspace-canvas').classList.toggle('node-open',this.nodeOpen);$('node-workbench').classList.toggle('starter',!hasData);
    this.ws.list=false;$('map-scene').hidden=false;$('workspace-list').hidden=true;$('workspace-outline').hidden=!this.ws.outline;$('workspace-surface').classList.toggle('has-outline',!!this.ws.outline);const sidebarLabel=this.ws.outline?'Hide sidebar':'Show sidebar';$('workspace-list-toggle').setAttribute('aria-label',sidebarLabel);$('workspace-list-toggle').title=sidebarLabel;$('workspace-list-toggle').setAttribute('aria-expanded',String(!!this.ws.outline));syncLayoutButtons(this.ws.layout||'horizontal');$('workspace-whole').setAttribute('aria-pressed',String(!!this.ws.processMap));
    const readerNode=this.ws.reader?.nodeId,readerScroll=readerNode?(this.readerRestore?.investigationId===this.state.id&&this.readerRestore?.nodeId===readerNode?this.readerRestore.scroll:this.drawnReaderNode===readerNode&&this.drawnInvestigationId===this.state.id?$('node-workbench').scrollTop:this.ws.cameras[this.ws.activeView]?.scroll||0):null;
    const previousNodes=new Set(this.points.keys());
    $('workspace-whole').textContent=this.ws.processMap?'Feature map':'Whole process';this.outlineLayout.apply();this.drawMap();const utilityCard=[...$('map-nodes').children].find(node=>node.dataset.nodeId===PREFLIGHT_NODE_ID);if(utilityCard){const caption=utilityCard.querySelector('.node-label small');if(caption)caption.textContent='Setup check · not research';const icon=utilityCard.querySelector('.node-symbol');if(icon)icon.textContent=this.state.preflight?.status==='ready'?'✓':'!';}syncBulkDelete(this);if(this.ws.outline)this.drawOutline();else{document.querySelector('.workspace-heading-copy').prepend(this.sidebarToggle);this.outlineWasOpen=false;cancelAnimationFrame(this.outlineFollowFrame);}
    $('node-workbench').classList.toggle('report-reader',!!this.ws.reader);$('reader-return').hidden=!this.ws.reader;
    this.renderInspector();this.panelLayout.apply();this.applyCamera();this.setBusy(this.busy);$('guided-deepen').hidden=true;settleAppearingNodes(this,previousNodes);syncResultGrowth(this);
    
    if(readerScroll!==null)$('node-workbench').scrollTop=readerScroll;this.drawnReaderNode=readerNode;this.drawnInvestigationId=this.state.id;
    this.navigation?.draw();
    this.actions.destination?.();
    this.upgradeComposedLayout();
  }
  upgradeComposedLayout(){
    const layout=this.ws.layout,key=layout==='exploded'?'explodedVersion':layout==='orbit'?'orbitVersion':layout==='tree'?'treeVersion':layout==='river'?'riverVersion':null;
    if(!key||this.ws[key]===1||this.ws.reader||this.busy||this.fileBusy||this.preparingNode)return;
    if(layout==='tree'&&!needsTreeUpgrade(this.ws))return;
    if(layout==='river'&&this.ws.placedNodes.river?.length)return;
    // Upgrade only this layout once. Undo may deliberately restore the old map,
    // so retain the version marker when Undo is used or the document reopens.
    this.ws[key]=1;
    this.ws.layoutBackups||={};this.ws.layoutBackups[layout]={positions:structuredClone(this.ws.mapPositions),camera:{...this.camera}};
    tidyWorkspace(this);
    if(layout==='tree'||layout==='river'){this.fit();this.saveCamera();this.persist();}
    this.actions.notify(`${layout==='tree'?'Tree now opens as connected branches':layout==='river'?'River now flows through connected branches':layout==='orbit'?'Orbit now uses clear circular tracks':'Exploded now opens from the center'}. Ctrl+Z restores your previous arrangement.`);
  }
  subject(){const products=productsFor(this.state),name=recoveryTitle(this.state);return this.state.messages.findLast(m=>m.features?.length)?.title||(products.length===1&&name&&name!=='New investigation'?name:products.map(p=>p.name).join(' + '))||name;}
  color(id){const theme=window.NodesTheme?.current||BUILTIN_THEMES[0];return id==='core'?theme.colors.muted:themeColor(this.ws.spectrum[id]??0,theme);}
  syncMapAppearance(){
    for(const control of document.querySelectorAll('[data-wire-style]'))control.setAttribute('aria-pressed',String(control.dataset.wireStyle===this.ws.wireStyle));
    $('map-wires').dataset.dots=String(!!this.ws.dottedLines);$('workspace-canvas').dataset.dots=String(!!this.ws.dottedLines);$('workspace-canvas').dataset.wires=String(this.ws.wiresVisible!==false);
    for(const [id,key]of [['workspace-dots','dottedLines'],['workspace-wires','wiresVisible']]){$(id).setAttribute('aria-pressed',String(!!this.ws[key]));$(id).title=$(id).commandHoverContent?.()??'';}
  }
  markDraft(node,id){const owner=this.state.draftContext?.featureName?`feature:${this.state.draftContext.featureName.trim().toLowerCase()}`:'core';if(this.state.draft?.trim()&&id===owner){node.append(el('small','Draft','node-draft-marker'));node.setAttribute('aria-description','An unfinished question is saved on this node.');}}
  clearMap(){cancelBranchEffects(this);this.points.clear();$('map-nodes').replaceChildren();$('map-wires').replaceChildren();this.defs=svg('defs');$('map-wires').append(this.defs);this.wireIndex=0;}
  mapNode(id,title,x,y,width=190,height=58,{count,quiet=false,selected=false,action,icon=true}={}){
    const n=button('',action||(()=>{}),`map-node${quiet?' quiet':''}${selected?' selected':''}`);n.dataset.nodeId=id;n.style.cssText=`left:${x}px;top:${y}px;width:${width}px;min-height:${height}px;--topic:${this.color(id)}`;n.setAttribute('aria-label',`${title}${count!==undefined?`, ${count} found`:''}`);if(icon){const glyph=el('span',symbol(title),'map-icon');glyph.setAttribute('aria-hidden','true');n.append(glyph);}n.append(el('span',title,'map-label'));if(count!==undefined)n.append(el('span',String(count),'map-count'));n.setAttribute('aria-pressed',String(selected));this.markDraft(n,id);$('map-nodes').append(n);this.points.set(id,{x,y,width,height});return n;
  }
  core(x,y){return this.mapNode('core',this.records.length?this.subject():'Add a source',x,y,210,60,{icon:false,selected:this.nodeOpen&&!this.selectedRecord(),action:()=>this.openRoot()});}
  mapWidth(){return Math.max(480,this.mapArea().width);}
  wire(from,to,{dashed=false}={}){
    const a=this.points.get(from),b=this.points.get(to);if(!a||!b)return;const ports=connectionPorts(a,b,{layout:this.ws.layout,comparison:dashed});
    const circuit=this.ws.wireStyle==='straight',linear=this.ws.wireStyle==='linear';
    let vertical=ports.vertical,x1=ports.start.x,y1=ports.start.y,x2=ports.end.x,y2=ports.end.y;
    const growth=!dashed&&this.growthArcIds?.has(to);let route=!dashed&&!growth&&this.ws.layout==='tree'?this.treeRoutes?.get(`${from}\0${to}`):undefined;
    const radial=!dashed&&['radial','wisp'].includes(this.ws.layout)&&this.ws.tidiedLayouts.includes(this.ws.layout);
    if(radial&&!growth&&this.points.has('core')){const core=this.points.get('core');route=this.ws.layout==='radial'?circularHierarchyRoute(a,b,core,{circuit}):null;if(route){x1=route.start.x;y1=route.start.y;x2=route.end.x;y2=route.end.y;}}
    if(this.ws.layout==='orbit'&&!dashed&&!growth&&!circuit&&this.points.has('core')){route=orbitHierarchyRoute(a,b,this.points.get('core'));x1=route.start.x;y1=route.start.y;x2=route.end.x;y2=route.end.y;}
    if(this.ws.layout==='spiral'&&!dashed&&!growth&&this.points.has('core')&&isSpiralPoint(a,this.points.get('core'))&&isSpiralPoint(b,this.points.get('core'))){route=spiralHierarchyRoute(a,b,this.points.get('core'),{circuit});x1=route.start.x;y1=route.start.y;x2=route.end.x;y2=route.end.y;}
    const obstacles=[...this.points].filter(([key])=>key!==from&&key!==to).map(([,p])=>p),localLayout=['vertical','compact','tree','river'].includes(this.ws.layout),reroute=growth||(linear?linearWireHitsNode({x:x1,y:y1},{x:x2,y:y2},obstacles,{vertical,points:route?.points}):!route&&(localLayout||(!dashed&&this.ws.layout!=='organic'&&this.ws.tidiedLayouts.includes(this.ws.layout)))&&wireHitsNode({x:x1,y:y1},{x:x2,y:y2},obstacles,{vertical,circuit}));
    if(reroute){this.growthRoutes??=new Map();const key=`${from}\0${to}\0${vertical}\0${dashed}\0${this.ws.wireStyle}`;route=this.growthRoutes.get(key);if(!route){route=growthRoute(a,b,obstacles,{vertical,circuit});this.growthRoutes.set(key,route);}x1=route.start.x;y1=route.start.y;x2=route.end.x;y2=route.end.y;}
    const id=`wire-${++this.wireIndex}`,gradient=svg('linearGradient',{id,gradientUnits:'userSpaceOnUse',x1,y1,x2,y2});for(const stop of themeWireStops(this.ws.spectrum[from]??0,this.ws.spectrum[to]??0,window.NodesTheme?.current||BUILTIN_THEMES[0],{sourceColor:this.color(from),targetColor:this.color(to)}))gradient.append(svg('stop',{offset:`${stop.offset*100}%`,'stop-color':stop.color}));for(const stop of gradient.children)stop.style.setProperty('--wire-color',stop.getAttribute('stop-color'));this.defs.append(gradient);
    const tension=({flowing:.68,balanced:.5,taut:.28})[window.NodesTheme?.current?.wire.curvature]||.5;
    const safeTension=!route&&!circuit&&!linear&&!wireHitsNode({x:x1,y:y1},{x:x2,y:y2},obstacles,{vertical,tension})?tension:.5;
    const d=linear?linearWirePath({x:x1,y:y1},{x:x2,y:y2},{vertical,points:route?.points}):route?.d||(circuit?(vertical?`M${x1} ${y1} V${(y1+y2)/2} H${x2} V${y2}`:`M${x1} ${y1} H${(x1+x2)/2} V${y2} H${x2}`):(vertical?`M${x1} ${y1} C${x1} ${y1+(y2-y1)*safeTension},${x2} ${y2-(y2-y1)*safeTension},${x2} ${y2}`:`M${x1} ${y1} C${x1+(x2-x1)*safeTension} ${y1},${x2-(x2-x1)*safeTension} ${y2},${x2} ${y2}`));
    if(window.NodesTheme?.current?.wire.finish==='chrome')$('map-wires').append(svg('path',{class:`map-wire-contour${dashed?' comparison-wire':''}${from===this.ws.inspected||to===this.ws.inspected?' orbit-related':''}`,d,fill:'none',stroke:themeWireContour(window.NodesTheme.current),'data-from':from,'data-to':to,'aria-hidden':'true',...(dashed?{'stroke-dasharray':'5 5'}:{})}));
    $('map-wires').append(svg('path',{class:`map-wire${dashed?' comparison-wire':''}${growth?' growth-wire':''}`,d,fill:'none',stroke:`url(#${id})`,'stroke-width':dashed?1.5:1.8,...(dashed?{'stroke-dasharray':'5 5'}:{}),...(growth?{'data-growth-root':to}:{})}));
  }
  drawMap(){drawGrowingMap(this);}
  drawList(){
    const list=$('workspace-list');list.replaceChildren();const query=this.ws.search.toLowerCase(),items=[...this.map.nodes.values()].filter(n=>`${n.title} ${n.summary}`.toLowerCase().includes(query));
    list.append(el('h2',`All saved work · ${items.length}${query?' matches':''}`));
    for(const item of items){const row=button('',()=>openMapNode(this,item.id),'feature-list-row');row.dataset.nodeId=item.id;row.style.setProperty('--topic',this.color(item.id));row.append(el('strong',item.title),el('span',item.summary),el('small',`${item.type}${this.ws.hidden.includes(item.id)?' · hidden':''}`));list.append(row);}
    $('workspace-count').textContent=`${items.length} of ${this.map.nodes.size} saved nodes · Hidden work is included in List`;
  }
  placePreflightUtility(){
    if(!this.map.nodes.has(PREFLIGHT_NODE_ID))return;
    this.mapMembership??=new Map();
    for(const [layout,entry]of Object.entries(this.ws.layouts||{})){
      const positions=layout===this.ws.layout?this.ws.mapPositions:entry.positions;
      if(!positions||!Object.keys(positions).length)continue;
      if(!positions[PREFLIGHT_NODE_ID])positions[PREFLIGHT_NODE_ID]=preflightUtilityPoint(positions);
      const key=`${this.state.id}:${layout}`;
      if(!this.mapMembership.has(key))this.mapMembership.set(key,new Set(Object.keys(positions).filter(id=>this.map.nodes.has(id))));
      else this.mapMembership.get(key).add(PREFLIGHT_NODE_ID);
    }
  }
  renderPreflight(panel,preflight=this.state.preflight){
    this.askOpen=false;$('node-root-tools').hidden=true;
    const target=preflight.targets?.map(t=>t.root||t.identity?.path).filter(Boolean),name=target?.length===1?target[0].split(/[\\/]/).at(-1):'your selected application';
    panel.append(feedbackHeading('Inspection needs attention','native-tool'),el('p',`${name}: your request and draft are preserved. Continue the application checks before retrying.`));
    const setup=button('Continue setup',()=>this.actions.openSetup?.(),'inspector-action');setup.id='preflight-continue-setup';setup.dataset.work='true';setup.disabled=this.busy||!this.actions.openSetup;panel.append(setup);
    const snapshot=el('details');snapshot.append(el('summary','Saved check details'),el('small','Previous prerequisite snapshot, not a completed investigation or current verification.','basis-label'));
    const labels={ready:'Ready',missing:'Setup needed',unavailable:'Unavailable',unknown:'Not checked','timed-out':'Timed out',timed_out:'Timed out',timeout:'Timed out',canceled:'Canceled',cancelled:'Canceled'},checks=el('ul'),optionalChecks=el('ul');
    for(const check of preflight.checks||[]){const row=el('li');row.append(el('strong',`${check.label||check.id}: ${labels[check.status||check.state]||'Not checked'}`));if(check.detail)row.append(el('p',check.detail));(check.required===false?optionalChecks:checks).append(row);}snapshot.append(checks);
    renderSetupDiagnostic(snapshot,preflight.diagnostic,{paths:()=>this.actions.openSetup?.(),disabled:this.busy});
    if(optionalChecks.children.length){const optional=el('details');optional.append(el('summary','Other inspection routes — optional for this request'),optionalChecks);snapshot.append(optional);}
    const diagnostics=(preflight.checks||[]).filter(check=>check.diagnostics!=null||check.diagnostic!=null);
    if(diagnostics.length){const details=el('details');details.append(el('summary','Technical diagnostics'));for(const check of diagnostics){const raw=check.diagnostics??check.diagnostic;details.append(el('h3',check.label||check.id),el('pre',typeof raw==='string'?raw:JSON.stringify(raw,null,2)));}snapshot.append(details);}
    if(preflight.checkedAt)snapshot.append(el('small',`Checked: ${new Date(preflight.checkedAt).toLocaleString()}`));panel.append(snapshot);
    if(preflight.request){const request=el('details');request.append(el('summary','Saved request'),el('p',preflight.request.text||''));if(preflight.request.branchFeatureName)request.append(el('p',`Feature: ${preflight.request.branchFeatureName}`));panel.append(request);}
  }
  renderConnectionBoundary(panel,message){
    if(!isConnectionBoundary(message))return false;
    panel.append(feedbackHeading('Inspection blocked','native-tool'),el('p','The inspection could not complete. This is a setup boundary, not proof that the application has no features.'));
    const setup=button('Open setup',()=>this.actions.openSetup?.(),'inspector-action');setup.disabled=this.busy||!this.actions.openSetup;setup.dataset.work='true';panel.append(setup);
    if(this.state.preflight?.status==='blocked'&&this.state.preflight.request){const retry=button('Recheck and retry saved request',()=>this.actions.retryPreflight?.(),'inspector-action');retry.disabled=this.busy||!this.actions.retryPreflight;retry.dataset.work='true';panel.append(retry);}
    const details=el('details');details.append(el('summary','Blocked inspection response and technical diagnostics'));const text=[message.overview,message.understanding,message.text,message.caveat,message.continuation?.reason,...(message.inspectionErrors||[])].filter(Boolean);for(const value of new Set(text))details.append(el('p',value));for(const finding of message.findings||[])details.append(el('h3',finding.question||'Recorded limitation'),el('p',finding.finding||''));panel.append(details);return true;
  }
  renderInspector(){
    const panel=$('workspace-inspector'),actions=$('node-actions');if(panel.hidden)return;const record=this.selectedRecord(),result=this.result,view=this.ws.activeView;panel.replaceChildren();actions.replaceChildren();
    const item=this.map.nodes.get(this.ws.inspected)||(!this.ws.inspected?this.map.nodes.get('core'):null);$('node-owner').textContent=item?.type==='direction'&&applicationFeatureStep(this.state,item,this.investigationFor(item.id))?'Explore features':item?.title||record?.title||(result?'Saved finding':this.state.messages.length?this.subject():'Add a source');$('node-owner').title=item?.title||'';$('node-root-tools').hidden=!!record||!!result||!this.state.messages.length;
    $('node-workbench').dataset.owner=this.ws.inspected||'core';$('node-workbench').style.setProperty('--topic',this.color(record?.id||'core'));
    if(item?.utility==='preflight'){this.renderPreflight(panel,item.preflight);return;}
    if(renderAiRecovery(panel,this,item)||renderTargetRecovery(panel,this,item)||renderFailureRecovery(panel,this,item)){$('node-owner').title=this.state.title;$('node-root-tools').hidden=true;return;}
    if(item?.blocked&&this.renderConnectionBoundary(panel,item.message))return;
    if(item?.type==='attempt'){panel.append(el('h2',item.attempt.productName||item.attempt.question),el('small',`${item.attempt.status} attempt`,'basis-label'),el('p',item.attempt.reason||'Inspection is in progress.'),el('p',`Subject: ${item.attempt.branchFeatureName||'Whole application'}`));if(item.attempt.productName){const details=el('details');details.append(el('summary','Original request'),el('p',item.attempt.question));panel.append(details);}if(item.attempt.purpose)panel.append(el('p',`Purpose: ${item.attempt.purpose}`));return;}
    if(item?.type==='constraint'){panel.append(el('h2','Verification constraint'),el('p',item.summary),el('p','This limits what the saved response establishes. It is not an inspection step.'));panel.append(button('Read saved response',()=>this.openReader(item.parent),'text-button'));return;}
    if(item?.type==='source'){panel.append(el('h2',item.product.name),el('small','Inspection target','basis-label'));const technical=el('details');technical.append(el('summary','Target location and inspection limits'),el('p',item.summary));for(const target of this.state.targets||[])if(item.product.locators.includes(target.locator)){if(target.containerRoot)technical.append(el('p',`Selected application: ${target.root}`));if(target.inspectionTarget)technical.append(el('p',`Implementation inspected: ${target.inspectionTarget.root}`),el('p',target.inspectionTarget.reason));for(const limit of target.limitations||[])technical.append(el('p',limit,'material-limit'));}panel.append(technical,el('p','Open this source’s menu to discover more. Reading this node does not inspect the application.'));return;}
    if(!record&&!result&&item?.type==='root'){const latest=this.state.messages.findLast(message=>message.role==='assistant');if(latest&&this.renderConnectionBoundary(panel,latest))return;}
    if(!record&&!result){$('node-workbench').insertBefore(panel,$('composer'));if(this.state.messages.length){const latestBoundary=this.state.messages.findLast(m=>m.role==='assistant');if(latestBoundary)this.renderInspectionBoundary(panel,latestBoundary);this.guidance(panel,'core');if(branchStats(this.map,'core').discovered)panel.append(el('p','Open a discovered feature to choose another path. Folding reveals saved work; ▶ starts an investigation.'));else{panel.append(el('p','No supported features have been discovered yet. Review the saved response or attempt for the available next action.'));const latest=this.state.messages.findLast(m=>m.role==='assistant');if(latest)panel.append(button('Read saved response',()=>this.openReader(`turn:${latest.id}`),'text-button'));}}else{panel.append(el('p','Paste a website or app path, add a folder, or describe what you want to understand.'));this.askOpen=true;}return;}
    if(item?.type==='direction')$('node-workbench').insertBefore(panel,$('composer'));else $('node-workbench').append(panel);
    if(record||result){const readingKey=this.ws.reader?.nodeId||this.ws.inspected;if(this.readingKey!==readingKey){this.readingKey=readingKey;this.readingDestination='summary';this.readingScroll={};}renderReading(this,panel,record,result);return;}
    const ask=button('Ask a question',()=>this.ask(),'node-ask');actions.append(ask);
    
    
    if(item&&item.id!=='core'){const hide=button('Hide branch',()=>hideBranch(this,item.id),'node-hide-action');actions.append(hide);}
    if(item&&this.map.children.get(item.id)?.length)actions.append(button(this.ws.collapsed.includes(item.id)?'Expand branch':'Collapse branch',()=>collapseBranch(this,item.id),'node-hide-action'));
    if(this.ws.reader||(result&&!this.inspected)||view==='evidence'){this.renderEvidence(panel,record,result);return;}
    if(!record)return;
    const current=featureOutcome(this.state,record.row.name);
    if(current.attempt)panel.append(el('small',current.label,'basis-label'),el('p',current.attempt.reason||'Inspection is in progress.','material-limit'));
    if(result){panel.append(el('small',resultOutcome(this.state,result).label,'basis-label'),el('h2',result.overview||result.understanding||result.text||'Saved answer'));if(result.caveat)panel.append(el('p',result.caveat,'material-limit'));panel.append(button('Read latest answer',()=>this.openReader(`turn:${result.id}`),'text-button'));}
    this.guidance(panel,item?.id||record.id);
    const descriptionPanel=result?el('details'):panel;if(result){descriptionPanel.append(el('summary','Original discovery and support'));panel.append(descriptionPanel);}
    const basis=record.row.evidenceBasis;descriptionPanel.append(el('span',basis==='inferred'?'Inference':basis==='proposed'?'Proposal':basis==='observed'?'Recorded evidence':'Source description','basis-label'));
    const claims=(record.row.claimIndexes||[]).map(i=>record.message.claims?.[i]).filter(Boolean);
    descriptionPanel.append(el('p',claims[0]?.text||record.row.displayQuestion||record.row.investigate||'No supporting description was retained.'));
    if(result)actions.append(button('Saved results',()=>this.reveal(`turn:${result.id}`),'node-results'));
    const more=el('details',undefined,'node-more');more.append(el('summary','More'));
    more.append(button(this.ws.pins.includes(record.id)?'Unpin comparison':'Pin for comparison',()=>this.pin(record),'inspector-action'));
    more.append(button('View support',()=>this.view('evidence'),'text-button'));
    const follow=button('Explore up to 3 steps',()=>{this.actions.autoThree();this.start(record);},'text-button');follow.dataset.work='true';more.append(follow);
    more.append(button('Add sources',()=>this.openRoot(),'text-button'));
    const kept=this.state.keptFeatures?.some(f=>f.name===record.row.name);const keep=button(kept?'Remove from my app':'Keep for my app',()=>this.actions.keep(record.message,record.row,!kept),'text-button');keep.dataset.work='true';more.append(keep);actions.append(more);
    const description=el('details');description.append(el('summary','Details and limits'),el('p',record.message.caveat||'Implementation and runtime behavior are established only by their recorded evidence.','material-limit'));descriptionPanel.append(description);
    const parts=recordedParts(this.state,record);if(parts.length){const detail=el('details');detail.append(el('summary','Recorded parts and support'));for(const part of parts){detail.append(el('h3',part.name),el('p',part.quote),el('small','Source-described detail; runtime behavior remains unverified.'));}descriptionPanel.append(detail);}
    for(const origin of originsFor(this.state,record.message,record.row)){const product=productsFor(this.state).find(p=>p.id===origin.productId);descriptionPanel.append(el('h3',product?.name||origin.productId),el('p',origin.description));}
    this.comparison(panel);
    if(result){const earlier=this.state.messages.filter(m=>m.id!==result.id&&m.role==='assistant'&&!m.features?.length&&(m.branchFeatureName||m.focus?.featureName||'').trim().toLowerCase()===record.row.name.trim().toLowerCase());if(earlier.length){const history=el('details');history.append(el('summary','Earlier results'));for(const message of earlier)history.append(button(message.recommendation||message.overview||'Saved result',()=>this.reveal(`turn:${message.id}`),'text-button'));panel.append(history);}}
  }
  renderEvidence(panel,record,result){
    if(result&&this.renderConnectionBoundary(panel,result))return;
    if(!record&&!result){panel.append(el('h2','No finding selected'),el('p','Choose a feature to read its retained sources. Viewing evidence does not start an investigation.'));return;}
    const heading=el('h2',result?.overview||record?.title||'Saved finding');if((result?.overview?.length||0)>150)heading.className='long-answer';panel.append(heading);
    if(result)this.renderInspectionBoundary(panel,result);
    comparisonOrigins(panel,result);
    if(result){if(result.caveat||result.continuation?.uncertainty)panel.append(el('p',result.caveat||result.continuation.uncertainty,'material-limit'));this.guidance(panel,this.ws.inspected);}
    const shown=new Set();
    if(result){for(const finding of result.findings||[]){const section=el('section',undefined,'finding-reading-row');section.append(el('h3',finding.question));appendFindingCategory(section,this.state,result,finding);section.append(el('p',finding.finding));for(const index of finding.claimIndexes||[]){const claim=result.claims?.[index];if(claim){this.support(section,claim);shown.add(index);}}panel.append(section);}if(result.findings?.length)appendCategoryKey(panel);}
    const message=result||record.message,claims=result?message.claims||[]:(record.row.claimIndexes||[]).map(i=>message.claims?.[i]).filter(Boolean);
    for(const [index,claim]of claims.entries())if(!result||!shown.has(index))this.support(panel,claim);
    if(!claims.length)panel.append(el('p','No source passage is linked to this selection. Its support remains unknown.','material-limit'));
    if(result){const request=el('details');request.append(el('summary','Question and investigation scope'));const index=this.state.messages.findIndex(m=>m.id===result.id),question=this.state.messages.slice(0,index).findLast(m=>m.role==='user');if(question)request.append(el('p',question.text));request.append(el('p',`Feature branch: ${result.branchFeatureName||result.focus?.featureName||'Whole investigation'}`));if(result.auditScope?.noNewInspection||result.newEvidenceCount===0)request.append(el('p','This step used retained evidence without fresh source inspection.'));const ids=new Set((result.claims||[]).map(c=>c.evidenceId));for(const operation of new Set(this.state.evidence.filter(e=>ids.has(e.id)&&e.operation).map(e=>e.operation)))request.append(el('small',`Supporting operation: ${operation}`));panel.append(request);const challenge=button('Check this finding',()=>this.actions.challenge?.(result,record),'inspector-action');panel.append(challenge);appendDelivery(panel,this.state,result,{exportDelivery:this.actions.exportDelivery,notify:this.actions.notify});}
    const limits=el('details');limits.append(el('summary','Evidence boundaries and open questions'));for(const text of [...new Set([...(message.openQuestions||[]),...(this.state.openQuestions||[]),...savedDirections(message).filter(isVerificationConstraint),message.continuation?.uncertainty].filter(Boolean))])limits.append(el('p',text));panel.append(limits);
  }
  renderInspectionBoundary(panel,message){
    const scopes=selectedManagedScopes(this.state,message);if(!scopes.length||message.continuation?.status!=='blocked'||branchStats(this.map,'core').discovered)return;
    const section=el('section',undefined,'inspection-boundary');section.append(el('h3','What was inspected'));
    section.append(el('p','This inspection covered only a selected part of the application. It has not established the product’s features.'));
    const detail=el('details');detail.append(el('summary','Inspection target and scope'));if(message.continuation?.reason)detail.append(el('p',message.continuation.reason));
    for(const target of this.state.targets||[]){detail.append(el('p',`Selected application: ${target.root||target.locator}`));if(target.inspectionTarget){detail.append(el('p',`Implementation inspected: ${target.inspectionTarget.root}`),el('p',target.inspectionTarget.reason));}}
    for(const scope of scopes){detail.append(el('p',`Recorded type filter: ${scope.types.join(', ')}`));for(const limit of scope.limitations)detail.append(el('p',limit));}
    section.append(detail,button('Add product documentation',()=>this.openRoot(),'text-button'));panel.append(section);
  }
  support(panel,claim){
    const source=this.state.evidence.find(e=>e.id===claim.evidenceId),section=el('section',undefined,'claim-support');section.append(categoryBadge(claimCategory(claim,source)),el('span',evidenceLabel(claim,source),'basis-label'),el('p',claim.text));
    if(claim.quote)section.append(el('blockquote',claim.quote));if(source){section.append(el('small',`${source.title||source.locator}${source.capturedAt?' · '+new Date(source.capturedAt).toLocaleString():''}`));if(source.stale||source.applicability==='changed')section.append(el('p','Historical evidence: target changed.','material-limit'));
      if(source.applicability==='unknown')section.append(el('p','Current applicability unknown.','material-limit'));
      const actions=el('div',undefined,'support-actions');actions.append(button('Read saved snapshot',()=>this.snapshot(source),'text-button'),button('Open source',()=>this.actions.showSource(this.state.id,source.id),'text-button'));section.append(actions);
      const technical=el('details');technical.append(el('summary','Operation and limitations'),el('pre',JSON.stringify({evidenceId:source.id,kind:source.kind,capturedAt:source.capturedAt,applicability:source.applicability||'unknown',operation:source.operation,parameters:source.parameters,sha256:source.sha256,reaEvidenceId:source.reaEvidenceId,locations:source.locations,comparisonOrigin:source.comparisonOrigin},null,2)));for(const limit of source.limitations||[])technical.append(el('p',limit));section.append(technical);
    }else if(claim.state!=='proposed')section.append(el('p','The referenced source is unavailable.','material-limit'));panel.append(section);
  }
  async snapshot(source){const dialog=el('dialog',undefined,'workspace-dialog');dialog.append(button('Close',()=>{dialog.close();dialog.remove();},'dialog-close'),el('h2',source.title||'Saved snapshot'));const content=el('div','Loading retained snapshot…');dialog.append(content);document.body.append(dialog);dialog.showModal();try{const snapshot=await window.investigation.snapshot(this.state.id,source.id);content.replaceChildren(el('pre',snapshot.text));if(snapshot.truncated)dialog.append(el('p','Preview capped at 250,000 characters. Open the source file for the complete snapshot.'));}catch(error){renderUserError(content,error,{title:'This saved snapshot could not be read',message:'The investigation remains open. Review the snapshot details, or open the original source file.',action:{label:'Open original source',run:()=>this.actions.showSource(this.state.id,source.id)}});}dialog.addEventListener('close',()=>dialog.remove(),{once:true});}
  coverage(){showCoverage(this);}
  pin(record){const blocked=actionGuard(this,'presentation');if(blocked){this.actions.notify(blocked);return;}if(!this.ws.pins.includes(record.id)&&this.ws.pins.length>=2){this.actions.notify('Two features are already pinned. Unpin one before pinning another. Compare can also choose any saved result directly.');return;}this.ws.pins=this.ws.pins.includes(record.id)?this.ws.pins.filter(id=>id!==record.id):[...this.ws.pins.slice(-1),record.id];this.draw();this.persist();}
  comparison(panel){if(!this.ws.pins.length)return;const section=el('section',undefined,'comparison');section.append(el('h3','Pinned comparison'));for(const id of this.ws.pins){const record=this.records.find(r=>r.id===id);if(!record)continue;const result=this.latestResult(record);section.append(button(record.title,()=>this.inspect(record),'text-button'),el('p',result?.overview||record.row.displayQuestion||'No saved findings yet'),el('small',result?.caveat||'Source description; implementation unknown'));}if(this.ws.pins.length===2){const compare=button('Compare two findings',()=>this.comparePicker(this.ws.pins[0]),'inspector-action');compare.disabled=this.busy||this.ws.pins.some(id=>!this.latestResult(this.records.find(r=>r.id===id)));compare.dataset.work='true';compare.dataset.unavailable=String(this.ws.pins.some(id=>!this.latestResult(this.records.find(r=>r.id===id))));section.append(compare);}panel.append(section);}
  mapArea(){return this.panelLayout?.area()||{x:0,y:0,width:$('workspace-canvas').clientWidth,height:$('workspace-canvas').clientHeight};}
  panelWidth(){return $('workspace-canvas').clientWidth-this.mapArea().width;}
  shownMap(){return this.visible?{...this.displayMap,...this.visible,children:new Map([...this.displayMap.children].map(([id,children])=>[id,children.filter(child=>this.visible.nodes.has(child))]))}:this.map;}
  bringTogether({remember=true,readable=false}={}){
    if(this.legacyMode||this.ws.reader||this.ws.placedNodes[this.ws.layout]?.length||this.ws.tidiedLayouts.includes(this.ws.layout)||!['horizontal','vertical','compact'].includes(this.ws.layout))return this.fit({readable});
    const area=this.mapArea(),positions=packMap(this.shownMap(),this.ws.layout,{width:area.width,height:area.height});if(!positions||!Object.keys(positions).length)return;
    if(remember)this.ws.arrangeUndo={layout:this.ws.layout,positions:structuredClone(this.ws.mapPositions),camera:{...this.camera}};
    this.ws.mapPositions={...this.ws.mapPositions,...positions};this.ws.layouts[this.ws.layout]={positions:this.ws.mapPositions,camera:{...this.camera}};this.draw();this.fit({readable});
  }
  undoArrangement(){const prior=this.ws.arrangeUndo;if(!prior||prior.layout!==this.ws.layout)return;this.cancelFocusMotion();this.ws.mapPositions={...this.ws.mapPositions,...structuredClone(prior.positions)};this.ws.layouts[this.ws.layout]={positions:this.ws.mapPositions,camera:prior.camera};this.camera=prior.camera?{...prior.camera}:this.camera;this.ws.tidiedLayouts=this.ws.tidiedLayouts.filter(layout=>layout!==this.ws.layout);if(prior.routed)this.ws.tidiedLayouts.push(this.ws.layout);this.ws.arrangeUndo=null;this.draw();this.saveCamera();this.persist();}
  undoLayout(){const previous=this.layoutUndo;if(!previous)return;this.layoutUndo=null;this.changeLayout(previous,{record:false});}
  orientPreset(){
    const layout=this.ws.layout,area=this.mapArea(),prior=this.ws.mapPositions;
    const result=orientPositions(this.shownMap(),layout,prior,{width:area.width,height:area.height,preserveRoot:!!this.ws.placedNodes[layout]?.includes(this.map.root),locked:this.ws.placedNodes[layout],collapsed:this.ws.collapsed});
    if(result.constrained){this.actions.notify('Kept positions or collapsed branches preserve this saved arrangement. Allow tidying or expand the branch to change its orientation.');return false;}
    if(!result.changed)return false;
    const snapshot={positions:structuredClone(prior),camera:{...this.camera}};
    this.ws.layoutBackups[layout]??=snapshot;
    this.ws.arrangeUndo={layout,...snapshot,routed:this.ws.tidiedLayouts.includes(layout)};
    this.ws.mapPositions=result.positions;this.ws.layouts[layout]={positions:result.positions,camera:this.ws.mapCamera};
    this.actions.notify(`${layout==='horizontal'?'Horizontal':'Vertical'} arrangement corrected. Ctrl+Z restores the previous positions.`);
    return true;
  }
  changeLayout(layout,{record=true}={}){
    if(layout===this.ws.layout){if(record&&this.orientPreset()){this.draw();this.persist();}this.applyPresetFocus();return;}if(record)this.layoutUndo=this.ws.layout;
    this.cancelFocusMotion();this.saveCamera();
    const from={...this.camera},shown=this.shownMap();
    this.ws=switchLayout(this.ws,shown,layout);const needsFit=!this.ws.mapCamera;
    this.camera=this.ws.mapCamera||{x:30,y:40,scale:1};if(record)this.orientPreset();this.draw();this.persist();
    if(needsFit)this.bringTogether({remember:false,readable:false});
    // Keep the user's place across both new and previously visited presets.
    // Reuse the same bounded focus motion as choosing a node in the Outline.
    this.applyPresetFocus(from);
  }
  applyPresetFocus(from){
    if(!this.ready||!this.state||this.cameraLocked)return;
    const selected=this.ws.inspected;
    if(presetFocus()==='node'&&selected&&this.points.has(selected)){if(from){this.camera=from;this.applyCamera();}this.focusMapNode(selected);}
    else this.fit();
  }
  openReader(id,destination='summary'){this.cancelFocusMotion();const item=this.map.nodes.get(id);if(!item?.message)return;const prior=this.location();if(!this.ws.reader)this.ws.reader={nodeId:id,destination,returnContext:prior};else{this.ws.reader.nodeId=id;this.ws.reader.destination=destination;}revealMapPath(this,id);this.ws.inspected=id;this.nodeOpen=true;this.askOpen=false;this.draw();this.ensureMapNode(id);$('node-workbench').scrollTop=0;this.persist();}
  closeReader(){this.cancelFocusMotion();const prior=this.ws.reader?.returnContext;this.ws.reader=null;if(prior){this.ws.inspected=prior.inspected||'';this.ws.group=prior.group||'';this.ws.layout=prior.layout||this.ws.layout;this.camera=prior.camera?{...prior.camera}:this.camera;this.ws.outline=!!prior.outline;this.ws.inventoryLimit=prior.inventoryLimit||8;this.ws.processMap=!!prior.processMap;if(prior.hidden)this.ws.hidden=[...prior.hidden];if(prior.collapsed)this.ws.collapsed=[...prior.collapsed];this.nodeOpen=!!prior.nodeOpen;this.askOpen=!!prior.askOpen;}this.draw();if(prior)$('node-workbench').scrollTop=prior.scroll||0;this.saveCamera();this.persist();this.actions.destination?.();}
  drawOutline(){drawOutline(this);}
  isCurrentDirection(item){const branch=(item.message?.branchFeatureName||item.message?.focus?.featureName||'').trim().toLowerCase();const latest=this.state.messages.findLast(m=>m.role==='assistant'&&(m.branchFeatureName||m.focus?.featureName||'').trim().toLowerCase()===branch);return item.request===item.message?.recommendation&&latest?.id===item.message?.id;}
  investigationFor(id){const item=this.map?.nodes.get(id);if(!item)return null;
    if(item.type==='root'){const current=this.state.messages.findLast(m=>m.role==='assistant');if(['complete','blocked'].includes(current?.continuation?.status))return null;if(current?.recommendation?.trim()){const text=current.recommendation.trim().toLowerCase(),record=this.featureForResult(current)||this.records.filter(r=>text===r.row.name.toLowerCase()||text.includes(r.row.name.toLowerCase())).sort((a,b)=>b.row.name.length-a.row.name.length)[0];if(record){const latest=this.latestResult(record);if(latest&&(!latest.recommendation?.trim()||['complete','blocked'].includes(latest.continuation?.status)))return null;const request=current.features?.length?(record.row.investigate?.trim()||record.row.displayQuestion?.trim()||(text!==record.row.name.toLowerCase()&&text!==record.title.toLowerCase()?current.recommendation.trim():'')):current.recommendation.trim();if(!request||isVerificationConstraint(request))return null;return {request,target:record.row.name,reason:current.recommendationReason||current.continuation?.uncertainty||'This is the suggested next investigation.',origin:current.features?.length?{}:{parentResultId:current.id,parentNodeId:`turn:${current.id}`}};}}return null;}
    // Browsing and individual evidence do not manufacture executable next steps.
    if(['discovery','source','finding','inventory','attempt','constraint','utility'].includes(item.type))return null;
    let ancestor=item,record=this.records.find(r=>r.id===id),seen=new Set();while(!record&&ancestor&&!seen.has(ancestor.id)){seen.add(ancestor.id);record=this.featureForResult(ancestor.message)||this.records.find(r=>r.id===ancestor.id);ancestor=this.map.nodes.get(ancestor.parent);}
    if(item.type==='direction'&&!record){const text=item.request?.toLowerCase()||'';record=this.records.filter(r=>text===r.row.name.toLowerCase()||text===r.title.toLowerCase()||text.includes(r.row.name.toLowerCase())).sort((a,b)=>b.row.name.length-a.row.name.length)[0];}
    const result=item.type==='feature'?this.latestResult(record):item.message;
    if(['complete','blocked'].includes(result?.continuation?.status))return null;
    if(item.type==='feature'&&result&&!result.recommendation?.trim())return null;
    const request=item.type==='direction'?(result?.features?.length&&record&&[record.row.name,record.title].some(name=>name.toLowerCase()===item.request?.trim().toLowerCase())?(record.row.investigate?.trim()||record.row.displayQuestion?.trim()):item.request):item.type==='feature'?(result?.recommendation||record?.row.investigate?.trim()||record?.row.displayQuestion?.trim()):result?.recommendation;
    if(!request?.trim()||isVerificationConstraint(request))return null;
    const origin=result?.id&&!result.features?.length&&this.state.messages.some(m=>m.id===result.id)?{parentResultId:result.id,parentNodeId:item.type==='feature'?`turn:${result.id}`:item.id}:item.type==='direction'&&result?.id?{parentResultId:result.id,parentNodeId:item.id}:{};
    return {request,target:record?.row.name||null,reason:result?.recommendationReason||result?.continuation?.uncertainty||(!result?record?.row.rationale||'Investigate the available sources to establish how this feature works.':'The preceding findings leave this question open.'),origin};
  }
  runNode(id,automation,resolved){const blocked=actionGuard(this);if(blocked){this.actions.notify(blocked);return;}automation||=this.ws.autoDeepen?{mode:'bounded',maxSteps:normalizeStepLimit(this.ws.depthLimit)}:{mode:'step',maxSteps:1};if(this.busy||this.preparingNode)return;const spec=resolved||this.investigationFor(id);if(!spec)return;this.runningNode=id;this.actions.submit(spec.request,spec.target,{...spec.origin,automation,nodeId:id});}
  guidance(panel,id){if(panel.querySelector('.inspection-boundary'))return;const item=this.map.nodes.get(id),fromReport=item?.type==='finding',spec=this.investigationFor(fromReport?item.parent:id),section=el('section',undefined,'node-guidance');if(!spec){const result=item?.type==='feature'?this.latestResult(this.records.find(r=>r.id===id)):item?.type==='root'?this.state.messages.findLast(m=>m.role==='assistant'):item?.message;const available=result&&result.continuation?.status!=='complete'?runnableDirections(result):[];section.append(el('small',result?.continuation?.status==='complete'?'Complete':result?.continuation?.status==='blocked'?'Blocked':available.length?'Inspection can continue':'No next step recorded','guidance-label'),el('p',result?.continuation?.reason||'No next inspection step was recorded.'));if(available.length){section.append(el('small','Available next inspection','guidance-label'));for(const text of available.slice(0,3)){const index=savedDirections(result).indexOf(text),directionId=`direction:${result.id}:${index}`;section.append(button(text,()=>openMapNode(this,directionId),'text-button'));}}panel.append(section);return;}renderSavedStep(this,panel,{id:fromReport?item.parent:id,spec,fromReport});}
  moreInventory(){this.ws.outline=true;this.ws.list=false;this.draw();this.persist();$('workspace-outline').scrollTop=0;}
  inventoryMenu(anchor,options={}){const id=anchor.closest('.growing-node')?.dataset.nodeId||'inventory:all';if(existingRadial(this,id,options))return;const menu=el('div',undefined,'node-context-menu');menu.append(el('strong','All discovered feature branches'));const add=(label,run)=>menu.append(button(label,()=>{this.radialMenu?.close(label==='Close menu');run();}));add('Browse all in Outline',()=>this.moreInventory());add('Reveal 8 more branches',()=>{this.ws.inventoryLimit=10000;this.draw();frameAddedNodes(this);this.persist();});add('Show all feature branches',()=>{this.ws.inventoryLimit=10000;this.draw();frameAddedNodes(this);this.persist();});add('Close menu',()=>{});presentRadial(this,id,anchor,menu,options);}
  nodeMenu(id,anchor,options={}){return showNodeMenu(this,id,anchor,options);}
  previewAction(id,action,anchor){return previewAction(this,id,action,anchor);}
  comparePicker(id,anchor){return comparisonPicker(this,id,anchor);}
  investigateAgain(id,record){if(this.busy)return;const item=this.map.nodes.get(id),message=item?.type==='feature'?this.latestResult(record):item?.message;this.runningNode=id;this.actions.submit(record.row.investigate?.trim()||record.row.displayQuestion?.trim()||`Investigate ${record.title}`,record.row.name,{...(message?.id&&!message.features?.length?{parentResultId:message.id,parentNodeId:item.type==='feature'?`turn:${message.id}`:id}:{}),nodeId:id,automation:{mode:'step',maxSteps:1}});}
  alternativesFor(id){const item=this.map.nodes.get(id);if(item?.type==='constraint')return [];const record=this.records.find(r=>r.id===id)||this.featureForResult(item?.message),message=item?.type==='feature'?this.latestResult(record):item?.message;return runnableDirections(message||{}).filter(text=>text!==message?.recommendation);}
  directionChoices(id,choices){const spec=this.investigationFor(id),item=this.map.nodes.get(id),record=this.records.find(r=>r.id===id)||this.featureForResult(item?.message),result=item?.type==='feature'?this.latestResult(record):item?.message,dialog=el('dialog',undefined,'workspace-dialog');dialog.append(button('Close',()=>dialog.close(),'dialog-close'),el('h2','Choose another investigation'),el('p',`Target: ${spec?.target||record?.row.name||'Whole application'}`));for(const request of choices)dialog.append(button(`▶ ${request}`,()=>{dialog.close();this.runningNode=id;this.actions.submit(request,spec?.target||record?.row.name||null,{...(result?.id?{parentResultId:result.id,parentNodeId:item.type==='feature'?`turn:${result.id}`:id}:{}),nodeId:id,automation:{mode:'step',maxSteps:1}});}));document.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove(),{once:true});}
  automation(id,mode){
    const spec=this.investigationFor(id),investigationId=this.state.id;if(!spec)return;
    const dialog=el('dialog',undefined,'workspace-dialog automation-dialog'),subject=this.map.nodes.get(id).title;
    dialog.append(el('h2',mode==='conclusion'?'Follow to a useful conclusion':mode==='path'?'Follow this investigation path':'Continue automatically'),el('p',`Selected scope: ${subject}`),el('p',`Feature branch: ${spec.target||'Whole investigation'}`),el('p',`Starting request: ${spec.request}`));
    if(spec.origin.parentResultId)dialog.append(el('p',`From saved result: ${spec.origin.parentResultId}`));
    const boundaries=el('details');boundaries.append(el('summary','Selected sources and inspection limits'));
    for(const target of this.state.targets||[])boundaries.append(el('p',target.locator||target.root||'Selected source'),...((target.limitations||[]).map(limit=>el('p',limit))));
    boundaries.append(el('p','Uses selected sources and retained evidence. Static inspection and evidence reasoning do not establish runtime behavior. Each step may use several AI requests and inspection operations; this maximum is not a cost or time limit.'));dialog.append(boundaries);
    const label=el('label','Maximum investigation steps'),input=el('input');input.type='number';input.min=String(MIN_STEPS);input.max=String(MAX_STEPS);input.step='1';input.required=true;input.value=String(normalizeStepLimit(this.ws.depthLimit));label.append(input);
    const preview=el('p'),update=()=>{input.setCustomValidity('');preview.textContent=`Up to ${normalizeStepLimit(input.value)} investigation steps on ${spec.target||subject}. Each step may use several AI requests and inspection operations. Stops early when answered, blocked, or no useful progress remains. Saved findings are kept.`;};input.oninput=update;update();
    dialog.append(label,preview,el('p','Pause after the current step or Stop from the active node. Stop requests local cancellation; remote work or billing may continue. A conclusion is not guaranteed.'));
    dialog.append(button('Start from this node',()=>{const value=Number(input.value);if(!input.value.trim()||!Number.isInteger(value)||value<MIN_STEPS||value>MAX_STEPS){input.setCustomValidity(`Enter a whole number from ${MIN_STEPS} to ${MAX_STEPS}.`);input.reportValidity();return;}if(!input.reportValidity())return;const blocked=actionGuard(this);if(blocked||this.state.id!==investigationId||JSON.stringify(this.investigationFor(id))!==JSON.stringify(spec)){preview.textContent=blocked||'The selected investigation or suggested step changed. Close and open Continue automatically again.';return;}dialog.close();this.runNode(id,{mode,maxSteps:normalizeStepLimit(value)},spec);},'primary'),button('Cancel',()=>dialog.close()));document.body.append(dialog);dialog.showModal();dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  }
  start(record){this.runNode(record.id,{mode:'bounded',maxSteps:this.ws.autoDeepen?this.ws.depthLimit:1});}
  search(){const query=this.ws.search.toLowerCase().trim(),results=$('graph-search-results');results.replaceChildren();if(!query){if(this.ws.outline)this.drawOutline();return;}const items=[...this.map.nodes.values()].filter(n=>`${n.title} ${n.summary}`.toLowerCase().includes(query));results.append(el('small',`${items.length} saved nodes`));for(const item of items)results.append(button(`${item.type==='feature'?'Feature':item.type==='result'?'Finding':item.type==='finding'?'Finding':item.type==='direction'?'Next step':'Node'} · ${item.type==='result'?item.summary:item.title}`,()=>{if(item.type==='feature'){this.inspect(this.records.find(r=>r.id===item.id));this.focusMapNode(item.id);}else openMapNode(this,item.id,{focus:true});results.replaceChildren();},'search-match'));if(this.ws.outline)this.drawOutline();}
  installMap(){const viewport=$('workspace-canvas');let drag;viewport.addEventListener('wheel',event=>{if(this.ws.list||event.target.closest('#workspace-list,#node-panel-frame'))return;event.preventDefault();this.cancelFocusMotion();if(!event.ctrlKey&&(event.shiftKey||Math.abs(event.deltaX)>Math.abs(event.deltaY))){this.camera.x-=event.deltaX||event.deltaY;this.camera.y-=event.deltaX?event.deltaY:0;this.applyCamera();}else{const box=viewport.getBoundingClientRect();this.zoom(this.camera.scale*Math.exp(-event.deltaY*.001),{x:event.clientX-box.left,y:event.clientY-box.top});}clearTimeout(this.cameraTimer);this.cameraTimer=setTimeout(()=>{this.saveCamera();this.persist();},120);},{passive:false});viewport.onpointerdown=event=>{if(this.ws.list||event.target.closest('#node-panel-frame,.node-context-menu,button,input,a,select,textarea,summary,label'))return;if(event.button!==0&&event.button!==1)return;this.cancelFocusMotion();drag={x:event.clientX,y:event.clientY,startX:this.camera.x,startY:this.camera.y};viewport.setPointerCapture(event.pointerId);};viewport.onpointermove=event=>{if(drag){this.camera.x=drag.startX+event.clientX-drag.x;this.camera.y=drag.startY+event.clientY-drag.y;this.applyCamera();}};viewport.onpointerup=viewport.onpointercancel=()=>{if(drag){drag=null;this.saveCamera();this.persist();}};$('node-workbench').onscroll=()=>{clearTimeout(this.scrollTimer);this.scrollTimer=setTimeout(()=>{this.saveCamera();this.persist();},120);};}
  applyCamera(){const scale=Math.max(.025,this.camera.scale||1);const strokeKey=`${this.ws.layout}:${scale}`;if(this.strokeScale!==strokeKey){this.strokeScale=strokeKey;$('map-wires').style.setProperty('--map-camera-scale',String(scale));this.wireFactor=layoutWireStyle(this.ws.layout,scale).factor;$('map-wires').style.setProperty('--map-wire-factor',String(this.wireFactor));this.wireCeiling=layoutWireStyle(this.ws.layout,scale).ceiling;$('map-wires').style.setProperty('--map-wire-ceiling',`${this.wireCeiling}px`);$('node-connection')?.style.setProperty('--map-wire-ceiling',`${this.wireCeiling}px`);$('node-connection')?.style.setProperty('--map-wire-factor',String(this.wireFactor));}syncOrbitGuideStroke(this);$('map-scene').style.transform=`translate(${this.camera.x}px,${this.camera.y}px) scale(${this.camera.scale})`;$('workspace-zoom').textContent=`${Math.round(this.camera.scale*100)}%`;this.connectWorkbench();this.navigation?.camera();syncSelectedHeadline(this);}
  connectWorkbench(){
    this.radialMenu?.sync();
    let link=$('node-connection');if(!link){link=svg('svg',{id:'node-connection','aria-hidden':'true'});link.style.setProperty('--map-wire-factor',String(this.wireFactor??1));link.style.setProperty('--map-wire-ceiling',`${this.wireCeiling??3}px`);$('workspace-canvas').append(link);}link.replaceChildren();if(!this.nodeOpen||this.ws.list||$('node-workbench').classList.contains('starter'))return;
    const id=this.ws.inspected||'core',point=this.points.get(id)||this.points.get(this.selectedRecord()?.id)||this.points.get(this.activeGroup()?.id)||this.points.get('core');if(!point)return;
    const canvas=$('workspace-canvas').getBoundingClientRect(),card=$('node-workbench').getBoundingClientRect();
    const target=[...document.querySelectorAll('#map-nodes [data-node-id],#map-nodes [data-feature-id]')].find(n=>(n.dataset.nodeId||n.dataset.featureId)===id),box=target?.getBoundingClientRect();
    const n=box?{x:box.left-canvas.left,y:box.top-canvas.top,width:box.width,height:box.height}:{x:this.camera.x+point.x*this.camera.scale,y:this.camera.y+point.y*this.camera.scale,width:point.width*this.camera.scale,height:point.height*this.camera.scale};
    const c={x:card.left-canvas.left,y:card.top-canvas.top,width:card.width,height:card.height};
    const pillBox=target?.querySelector('.node-local-controls')?.getBoundingClientRect();
    const pill=pillBox?{x:pillBox.left-canvas.left,y:pillBox.top-canvas.top,width:pillBox.width,height:pillBox.height}:null;
    const connection=reportConnector(n,c,{pill,dock:this.panelLayout.dock()});
    const d=this.ws.wireStyle==='linear'?linearWirePath(connection.start,connection.end,{points:connection.points}):this.ws.wireStyle==='straight'?connection.points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' '):connection.d;
    const owner=this.selectedRecord()?.id||'core',phase=this.ws.spectrum[owner]??0,defs=svg('defs'),gradient=svg('linearGradient',{id:'reader-wire-gradient',gradientUnits:'userSpaceOnUse',x1:connection.start.x,y1:connection.start.y,x2:connection.end.x,y2:connection.end.y});for(const stop of themeWireStops(phase,phase,window.NodesTheme?.current||BUILTIN_THEMES[0],{sourceColor:this.color(owner),targetColor:this.color(owner)}))gradient.append(svg('stop',{offset:`${stop.offset*100}%`,'stop-color':stop.color}));defs.append(gradient);link.append(defs);if(window.NodesTheme?.current?.wire.finish==='chrome')link.append(svg('path',{class:'map-wire-contour',d,fill:'none',stroke:themeWireContour(window.NodesTheme.current)}));link.append(svg('path',{d,fill:'none',stroke:'url(#reader-wire-gradient)','stroke-width':1.5}));
  }
  zoom(scale,anchor){this.cancelFocusMotion();const viewport=$('workspace-canvas');anchor||={x:viewport.clientWidth/2,y:viewport.clientHeight/2};const x=(anchor.x-this.camera.x)/this.camera.scale,y=(anchor.y-this.camera.y)/this.camera.scale;this.camera.scale=Math.max(.025,Math.min(2.5,scale));this.camera.x=anchor.x-x*this.camera.scale;this.camera.y=anchor.y-y*this.camera.scale;this.applyCamera();this.saveCamera();this.persist();}
  cancelFocusMotion(){if(this.focusFrame)cancelAnimationFrame(this.focusFrame);this.focusFrame=null;this.focusResolve?.(false);this.focusResolve=null;}
  focusExecutionNode(id){
    if(this.legacyMode||!this.map?.nodes.has(id))return Promise.resolve(false);
    this.radialMenu?.close(false,true);revealMapPath(this,id);
    for(let node=this.map.nodes.get(id);node;node=this.map.nodes.get(node.parent))if(node.type==='feature'&&!this.ws.expanded.includes(node.id))this.ws.expanded.push(node.id);
    this.draw();let at=this.map.nodes.get(id);while(at&&!this.points.has(at.id))at=this.map.nodes.get(at.parent);
    const target=executionFocusCamera(this.points.get(at?.id),this.mapArea(),this.camera.scale);
    return target?this.animateCamera(target):Promise.resolve(false);
  }
  focusMapNode(id){
    this.cancelFocusMotion();const p=this.points.get(id);if(!p)return;const area=this.mapArea();
    const scale=Math.max(.025,Math.min(1,(Math.max(32,area.width)-24)/p.width,(Math.max(32,area.height)-32)/p.height));
    this.animateCamera({x:area.x+area.width/2-(p.x+p.width/2)*scale,y:area.y+area.height/2-(p.y+p.height/2)*scale,scale});
  }
  animateCamera(target){
    if(this.cameraLocked)return Promise.resolve(false);
    this.navigation?.remember();this.cancelFocusMotion();const from={...this.camera},start=performance.now();
    return new Promise(resolve=>{
    this.focusResolve=resolve;
    const settle=()=>{this.camera=target;this.focusFrame=null;this.focusResolve=null;this.applyCamera();this.saveCamera();this.persist();resolve(true);};
    const motion=themeMotion();if(document.hidden||motion.scale===0){settle();return;}
    const frame=now=>{const t=Math.min(1,(now-start)/(280*motion.scale)),ease=1-(1-t)**3;this.camera={x:from.x+(target.x-from.x)*ease,y:from.y+(target.y-from.y)*ease,scale:from.scale+(target.scale-from.scale)*ease};this.applyCamera();if(t<1)this.focusFrame=requestAnimationFrame(frame);else settle();};this.focusFrame=requestAnimationFrame(frame);
    });
  }
  ensureMapNode(id){if(this.ws.list)return;const p=this.points.get(id);if(!p)return;const area=this.mapArea(),w=Math.max(32,area.width),h=Math.max(32,area.height),x=this.camera.x+p.x*this.camera.scale,y=this.camera.y+p.y*this.camera.scale;if(x<area.x||x+p.width*this.camera.scale>area.x+w||y<area.y||y+p.height*this.camera.scale>area.y+h){this.camera.x=area.x+w/2-(p.x+p.width/2)*this.camera.scale;this.camera.y=area.y+h/2-(p.y+p.height/2)*this.camera.scale;this.applyCamera();this.saveCamera();}}
  fit({readable=false}={}){this.cancelFocusMotion();if(this.legacyMode)return this.legacy.fit();const area=this.mapArea(),b=this.sceneBounds;if(!b)return;const width=b.maxX-b.minX,height=b.maxY-b.minY,w=Math.max(64,area.width),h=Math.max(64,area.height),fitScale=Math.max(.025,Math.min(1,(w-32)/width,(h-32)/height)),scale=readable?Math.max(.9,fitScale):fitScale;this.camera={x:area.x+(w-width*scale)/2-b.minX*scale,y:area.y+(h-height*scale)/2-b.minY*scale,scale};if(readable&&fitScale<.9){const at=this.points.get(this.ws.inspected)||this.points.get('core');if(at){this.camera.x=area.x+36-at.x*scale;this.camera.y=area.y+h/2-(at.y+at.height/2)*scale;}}this.applyCamera();this.saveCamera();this.persist();}

  pending(text){this.legacy.pending(text);this.runProgress||='Investigating…';$('activity').textContent=`Investigating: ${text}`;this.draw();}
  beginGrowth(origin){beginResultGrowth(this,origin);}
  finished(){this.legacy.finished();this.runProgress='';this.runPhase='';this.activityStartedAt=null;this.draw();}
  flush(){this.cancelFocusMotion();clearTimeout(this.cameraTimer);clearTimeout(this.scrollTimer);this.saveCamera();this.persist();}
}
