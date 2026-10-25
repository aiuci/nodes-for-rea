// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import path from 'node:path';
import {preflightScope} from './preflight.mjs';
import {directoryIdentity,classifyTarget} from './targets.mjs';
import {inventoryDirectory,identifyTargets} from './sources.mjs';
export async function investigationSetupContext(state,explicit,{classify=classifyTarget}={}){
 const recovery=state?.attempts?.findLast(a=>a.targetRecovery?.selected&&!a.targetRecovery.continuedAt)?.targetRecovery;
 const pending=state?.preflight?.request;
 let targets=explicit?[explicit]:recovery?[recovery.selected.path]:state?.preflight?.status==='blocked'&&state.preflight.targets?.length?state.preflight.targets:state?.targets?.length?state.targets:identifyTargets(state?.draft||'');
 const resolved=[];for(const t of targets){const locator=typeof t==='string'?t:t.root||t.locator;try{const target=/^https?:/i.test(locator)?{kind:'website',locator}:await classify(locator);if(target.kind==='repository'){Object.assign(target,await inventoryDirectory(target.root));target.identity=await directoryIdentity(target.root,(target.files||[]).slice(0,12));}resolved.push(target);}catch{resolved.push({kind:'unresolved',locator});}}
 const scope=preflightScope({incomingTargets:resolved}),label=resolved.length===1?(resolved[0].root?path.basename(resolved[0].root):resolved[0].locator?.split(/[\\/]/).filter(Boolean).at(-1)):resolved.length?`${resolved.length} selected targets`:'No application selected';
 return {...scope,targets:resolved,label,kind:scope.unresolvedTargets.length?'unresolved':resolved.length?'target':'basic',investigationId:state?.id||null,request:(!explicit||[...(state?.preflight?.targets||[]).map(t=>t.root),recovery?.selected?.path].includes(explicit))?pending||null:null};
}
