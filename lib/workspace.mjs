// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {normalizeStepLimit} from './auto-deepen.mjs';
// UI projections never change saved investigation/evidence identities.
import {inventoryRecords} from './discovery-inventory.mjs';
import {cleanPanelLayout} from './panel-layout.mjs';
import {cleanOutlineWidth} from './outline-layout.mjs';
import {cleanWireStyle} from './wire-style.mjs';
export const VIEWS = ['overview', 'explore', 'evidence'];
export const LAYOUTS = ['horizontal', 'vertical', 'compact', 'radial', 'spiral', 'wisp', 'organic', 'shattered', 'exploded', 'manual','bloom','constellation','river','orbit','honeycomb','tree','grid'];
const text = (value, limit = 500) => typeof value === 'string' ? value.slice(0, limit) : '';
const strings = value => Array.isArray(value) ? [...new Set(value.filter(v => typeof v === 'string').map(v => v.slice(0, 500)))].slice(0, 10000) : [];
const finite = (v, fallback = 0) => Number.isFinite(v) && Math.abs(v) < 1e7 ? v : fallback;
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const safeKey = key => key !== '__proto__' && key !== 'constructor' && key !== 'prototype';
export function cleanCamera(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {x:finite(value.x),y:finite(value.y),scale:Math.max(.025,Math.min(2.5,finite(value.scale,1)))};
}
export function cleanPositions(value) {
  const positions = {};
  for (const [id,p] of Object.entries(object(value)).slice(0,10000)) if(safeKey(id)&&p&&Number.isFinite(p.x)&&Number.isFinite(p.y)) {
    positions[id.slice(0,500)]={x:finite(p.x),y:finite(p.y),width:Math.max(32,Math.min(600,finite(p.width,230))),height:Math.max(24,Math.min(600,finite(p.height,110)))};
  }
  return positions;
}
function cleanReturnContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {inspected:text(value.inspected),group:text(value.group),layout:LAYOUTS.includes(value.layout)?value.layout:'horizontal',camera:cleanCamera(value.camera),
    nodeOpen:!!value.nodeOpen,askOpen:!!value.askOpen,outline:!!value.outline,processMap:!!value.processMap,inventoryLimit:Math.max(1,Math.min(10000,Math.floor(Number(value.inventoryLimit)||8))),scroll:Math.max(0,finite(value.scroll)),
    hidden:strings(value.hidden),collapsed:strings(value.collapsed)};
}
export function cleanWorkspace(value = {}) {
  if(!value||typeof value!=='object'||Array.isArray(value))value={};
  const result = {version: 1, activeView: VIEWS.includes(value.activeView) ? value.activeView : 'overview',
    inspected: text(value.inspected), group: text(value.group), pins: strings(value.pins).slice(0, 2),
    deletedNodes:strings(value.deletedNodes).filter(id=>id!=='core'),deleteUndo:value.deleteUndo&&Array.isArray(value.deleteUndo.deletedNodes)?{deletedNodes:strings(value.deleteUndo.deletedNodes).filter(id=>id!=='core')}:null,
    expanded: strings(value.expanded), hidden:strings(value.hidden), collapsed:strings(value.collapsed), mapPositions:{}, mapCamera:null,
    riverVersion:value.riverVersion===1?1:0,treeVersion:value.treeVersion===1?1:0,orbitVersion:value.orbitVersion===1?1:0,explodedVersion:value.explodedVersion===1?1:0,layout:LAYOUTS.includes(value.layout)?value.layout:'horizontal',layouts:{},arrangeUndo:null,outline:!!value.outline,processMap:!!value.processMap,inventoryLimit:Math.max(1,Math.min(10000,Math.floor(Number(value.inventoryLimit)||8))),mapInitialized:!!value.mapInitialized,legacyLayoutPending:!!value.legacyLayoutPending||(!Object.hasOwn(value,'layouts')&&Object.keys(object(value.mapPositions)).length>0),reader:null,
    outlineFollow:value.outlineFollow!==false,outlineExpanded:strings(value.outlineExpanded),outlineWidth:cleanOutlineWidth(value.outlineWidth),panel:cleanPanelLayout(value.panel),dottedLines:value.dottedLines===true,wiresVisible:value.wiresVisible!==false,circuitMode:value.circuitMode===true,wireStyle:cleanWireStyle(value.wireStyle,value.circuitMode),bounceNodes:value.bounceNodes===true,list: !!value.list, listGroup: text(value.listGroup), pages: {}, spectrumVersion:value.spectrumVersion===2?2:1, spectrum: {}, cameras: {},
    trail: Array.isArray(value.trail) ? value.trail.slice(-30).map(v => ({view: VIEWS.includes(v?.view) ? v.view : 'overview', inspected: text(v?.inspected), group: text(v?.group),...cleanReturnContext(v)})) : [],
    search: text(value.search, 500), autoDeepen: !!value.autoDeepen,
    depthLimit: normalizeStepLimit(value.depthLimit)};
  result.growth=Array.isArray(value.growth)?value.growth.filter(v=>v&&typeof v.nodeId==='string'&&v.nodeId.length<=500&&Number.isFinite(v.createdAt)&&v.createdAt>0).slice(-50).map(v=>({nodeId:text(v.nodeId),originId:text(v.originId),addedIds:strings(v.addedIds),createdAt:v.createdAt,seenAt:Number.isFinite(v.seenAt)&&v.seenAt>0?v.seenAt:null})):[];
  result.growthRoots=strings([...(Array.isArray(value.growthRoots)?value.growthRoots:[]),...result.growth.map(r=>r.nodeId)]);
  result.placedNodes={};for(const layout of LAYOUTS)result.placedNodes[layout]=strings(value.placedNodes?.[layout]);
  result.tidiedLayouts=strings(value.tidiedLayouts).filter(layout=>LAYOUTS.includes(layout));
  for (const [id, page] of Object.entries(value.pages || {}).slice(0, 10000)) if (Number.isSafeInteger(page) && page >= 0) result.pages[id.slice(0, 500)] = Math.min(10000, page);
  for (const [id, t] of Object.entries(value.spectrum || {}).slice(0, 10000)) if (Number.isFinite(t) && t >= 0 && t <= 1) result.spectrum[id.slice(0, 500)] = t;
  for(const layout of LAYOUTS) {
    const saved=object(value.layouts?.[layout]);
    if(value.layouts?.[layout])result.layouts[layout]={positions:cleanPositions(saved.positions),camera:cleanCamera(saved.camera)};
  }
  // Legacy aliases remain the active arrangement so existing saves and exports work.
  result.mapPositions=cleanPositions(value.mapPositions??result.layouts[result.layout]?.positions);
  result.mapCamera=cleanCamera(Object.hasOwn(value,'mapCamera')?value.mapCamera:result.layouts[result.layout]?.camera);
  result.layouts[result.layout]={positions:result.mapPositions,camera:result.mapCamera};
  result.shapeVersion=3;result.layoutBackups={};
  for(const layout of LAYOUTS)if(value.layoutBackups?.[layout])result.layoutBackups[layout]={positions:cleanPositions(value.layoutBackups[layout].positions),camera:cleanCamera(value.layoutBackups[layout].camera)};
  // The user identified the former Spiral composition as Wisp. Rename that
  // exact saved arrangement once, including its camera; keep a prior Wisp backup.
  if(value.shapeVersion!==3&&result.layouts.spiral){
    if(result.layouts.wisp)result.layoutBackups.wisp=structuredClone(result.layouts.wisp);
    result.layouts.wisp=structuredClone(result.layouts.spiral);delete result.layouts.spiral;
    result.placedNodes.wisp=[...result.placedNodes.spiral];result.placedNodes.spiral=[];
    result.tidiedLayouts=result.tidiedLayouts.filter(layout=>layout!=='spiral');
    if(result.layout==='spiral'||result.layout==='wisp'){result.layout='wisp';result.mapPositions=result.layouts.wisp.positions;result.mapCamera=result.layouts.wisp.camera;}
  }else if(value.shapeVersion!==3&&!result.layouts.wisp&&result.layouts.radial)result.layouts.wisp=structuredClone(result.layouts.radial);
  if(value.arrangeUndo&&LAYOUTS.includes(value.arrangeUndo.layout))result.arrangeUndo={layout:value.arrangeUndo.layout,positions:cleanPositions(value.arrangeUndo.positions),camera:cleanCamera(value.arrangeUndo.camera),routed:value.arrangeUndo.routed===true};
  if(value.reader&&typeof value.reader==='object'&&text(value.reader.nodeId))result.reader={nodeId:text(value.reader.nodeId),destination:['summary','latest','evidence','history'].includes(value.reader.destination)?value.reader.destination:'summary',returnContext:cleanReturnContext(value.reader.returnContext)};
  if(value.shapeVersion!==3&&value.layouts?.spiral){if(result.reader?.returnContext?.layout==='spiral')result.reader.returnContext.layout='wisp';for(const at of result.trail)if(at.layout==='spiral')at.layout='wisp';if(result.arrangeUndo?.layout==='spiral')result.arrangeUndo.layout='wisp';}
  for (const view of VIEWS) {
    const camera = value.cameras?.[view];
    if (camera) result.cameras[view] = {x: finite(camera.x), y: finite(camera.y), scale: Math.min(2.5, Math.max(.2, finite(camera.scale, 1))), scroll: Math.max(0, finite(camera.scroll))};
  }
  return result;
}
export function cleanDraftContext(value, state) {
  if (!value || typeof value !== 'object') return null;
  const featureName = text(value.featureName), messageId = text(value.messageId);
  // Preserve unresolved legacy scope rather than quietly sending it elsewhere.
  const row = state?.messages?.find(m => m.id === messageId)?.features?.find(f => f.name === featureName);
  return {featureName, messageId, label: text(value.label || row?.displayLabel || featureName), resultId: text(value.resultId), nodeId:text(value.nodeId), kind: featureName ? 'feature' : 'all'};
}
export function workspacePatch(input, state) {
  if (!input || typeof input !== 'object') throw new Error('Invalid workspace state.');
  const patch = {};
  if ('workspace' in input) patch.workspace = cleanWorkspace(input.workspace);
  if ('draft' in input) {
    if (typeof input.draft !== 'string' || input.draft.length > 18000) throw new Error('Enter a draft under 18,000 characters.');
    patch.draft = input.draft;
  }
  if ('draftContext' in input) patch.draftContext = cleanDraftContext(input.draftContext, state);
  if (patch.draft === '') patch.draftContext = null;
  return patch;
}
export function featureRecords(state) {
  return inventoryRecords(state);
}
export function topicGroups(records) {
  const roots = records.filter(r => !r.row.parentName || !records.some(other => other.row.name === r.row.parentName) || r.row.parentName === r.row.name);
  const groups = roots.map(root => ({...root, items: [root, ...records.filter(r => r.id !== root.id && r.row.parentName === root.row.name)]}));
  // Cycles, deep and malformed legacy parents remain reachable in their own group.
  for (const record of records) if (!groups.some(g => g.items.some(r => r.id === record.id))) groups.push({...record, items: [record]});
  return groups;
}
export function assignSpectrum(records, groups, previous = {}) {
  const result = {...previous};
  let next = Math.max(-.028, ...Object.values(result).filter(Number.isFinite));
  const step = Math.min(.08, .32 / Math.max(4, groups.length - 1));
  if(!Object.keys(result).length)next=-step;
  for (const group of groups) {
    if (!(group.id in result)) result[group.id] = Math.min(.48, next += step);
    for (const [index, item] of group.items.entries()) if (!(item.id in result)) result[item.id] = Math.min(.52, result[group.id] + index * .0007);
  }
  for (const record of records) if (!(record.id in result)) result[record.id] = Math.min(.52, next += .001);
  return result;
}
export function evidenceLabel(claim, source) {
  if (claim?.state === 'proposed') return 'Proposal';
  if (claim?.state === 'inferred') return 'Inference';
  if (!source) return 'Support unavailable';
  if (source.evidenceStatus === 'inspection-failed') return 'Inspection failed';
  if (source.evidenceStatus === 'check-result' || source.kind === 'host-process') return 'Declared check';
  if (source.evidenceStatus === 'runtime-observed') return 'Runtime observation';
  if (source.evidenceStatus === 'static' || source.kind === 'rea') return 'Static implementation evidence';
  if (source.kind === 'file' || source.kind === 'comparison-receipt' && source.comparisonOrigin?.originalKind === 'file') return 'Static source evidence';
  return 'Source description';
}
export function requestFeature(text, records) {
  if (!/^(?:explore|investigate|focus on|select|compare|ask about|tell me about)\b/i.test(text.trim())) return [];
  const normalized = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
  const matches = records.filter(record => [record.row.name, record.title].some(label => normalized.includes(` ${label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `)));
  return matches.filter(record => !matches.some(other => other !== record && other.title.toLowerCase().includes(record.title.toLowerCase())));
}
