// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {themeMotion} from './theme-motion.js';
import {cancelBranchEffects,travelBranchLight,landBranchGlow} from './branch-effects.js';
import {descendants} from '../lib/workspace-map.mjs';
import {resultOutcome} from '../lib/outcomes.mjs';
import {settleNode} from './node-settling.js';
import {frameMapNodes} from '../lib/map-reconciliation.mjs';
const $=id=>document.getElementById(id),card=id=>[...$('map-nodes').children].find(n=>n.dataset.nodeId===id);
const attention=view=>JSON.stringify({node:view.ws.inspected||'core',layout:view.ws.layout,camera:view.camera,reader:view.ws.reader?.nodeId||'',hidden:view.ws.hidden,collapsed:view.ws.collapsed,outline:view.ws.outline,interaction:view.growthInteraction||0});
const recent=record=>!record.seenAt||Date.now()<record.seenAt+60000;
const members=(view,record)=>[...new Set([record.nodeId,...descendants(view.map,record.nodeId),...(record.addedIds||[]).filter(id=>view.map.nodes.has(id))])];
function outcome(view,id){const n=view.map.nodes.get(id);if(n?.attempt)return `${n.attempt.status} attempt`;if(n?.type==='discovery')return 'Feature map updated';const o=resultOutcome(view.state,n?.message);return o.findings?`${o.findings} supported finding${o.findings===1?'':'s'}${o.status==='blocked'?' · further work blocked':''}`:o.status==='blocked'?'Blocked attempt':'Answer saved';}
function openPath(view,id){const ancestors=new Set([id]);for(let n=view.map.nodes.get(id);n?.parent&&!ancestors.has(n.parent);n=view.map.nodes.get(n.parent))ancestors.add(n.parent);view.ws.hidden=view.ws.hidden.filter(key=>!ancestors.has(key));view.ws.collapsed=view.ws.collapsed.filter(key=>!ancestors.has(key));}
export function installResultReveal(view){
  const show=document.createElement('button');show.id='show-new-results';show.type='button';show.hidden=true;show.onclick=()=>{const r=[...(view.ws.growth||[])].reverse().find(r=>!r.seenAt&&view.map.nodes.has(r.nodeId));if(r)showResultGrowth(view,r.nodeId);};$('workspace-navigation').append(show);
  const status=document.createElement('span');status.id='result-growth-status';status.className='sr-only';status.setAttribute('role','status');status.setAttribute('aria-live','polite');$('workspace-navigation').append(status);
  for(const type of ['pointerdown','wheel','keydown'])$('workspace-canvas').addEventListener(type,()=>{cancelBranchEffects(view);view.growthInteraction=(view.growthInteraction||0)+1;},{capture:true,passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelBranchEffects(view);});
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>{cancelBranchEffects(view);for(const a of $('workspace-canvas').getAnimations({subtree:true}))if(a.id?.startsWith('rea-growth-'))a.cancel();for(const n of $('map-nodes').children){n.classList.remove('growth-awaiting');n.inert=false;}});
}
export function beginResultGrowth(view,origin){if(view.navigation?.autoFollow===false)return;view.growthRun={origin,attention:attention(view)};}
export function collectResultGrowth(view,previous,switched){
  if(switched){cancelBranchEffects(view);clearTimeout(view.growthRevealTimer);clearTimeout(view.growthBadgeTimer);view.growthPending=new Set();view.growthAuto=new Map();view.growthRun=null;return;}
  if(!previous||previous.nodes.size<=1)return;
  const roots=[...view.map.nodes.values()].filter(n=>!previous.nodes.has(n.id)&&(['result','discovery'].includes(n.type)||n.type==='attempt'&&n.attempt.status!=='running'));
  if(!roots.length)return;
  const watching=view.growthRun&&(view.ws.inspected||'core')===view.growthRun.origin&&attention(view)===view.growthRun.attention;
  view.growthPending??=new Set();view.growthAuto??=new Map();
  for(const n of roots){if(view.ws.growth.some(r=>r.nodeId===n.id))continue;const addedIds=[...view.map.nodes.values()].filter(v=>!previous.nodes.has(v.id)&&v.message?.id===n.message?.id&&v.message).map(v=>v.id);view.ws.growth.push({nodeId:n.id,originId:n.parent||'core',addedIds,createdAt:Date.now(),seenAt:null});view.growthPending.add(n.id);if(watching){openPath(view,n.id);view.growthAuto.set(n.id,{origin:view.growthRun.origin,attention:attention(view)});}}
  view.ws.growth=view.ws.growth.slice(-50);queueMicrotask(()=>view.persist());
  view.ws.growthRoots=[...new Set([...view.ws.growthRoots,...roots.map(n=>n.id)])];
}
export function acknowledgeResultGrowth(view,id){
  for(const r of view.ws.growth||[])if(!r.seenAt&&members(view,r).includes(id))r.seenAt=Date.now();
}
export function syncResultGrowth(view){
  const records=(view.ws.growth||[]).filter(r=>view.map.nodes.has(r.nodeId)),pending=records.filter(r=>!r.seenAt&&!view.growthAuto?.has(r.nodeId)),show=$('show-new-results');
  show.hidden=!pending.length;show.textContent=`Show new results${pending.length>1?` (${pending.length})`:''}`;
  if(pending.length){const latest=pending.at(-1);show.title=`${outcome(view,latest.nodeId)} from ${view.map.nodes.get(latest.originId)?.title||'this investigation'}`;if(view.map.nodes.get(latest.nodeId)?.attempt||resultOutcome(view.state,view.map.nodes.get(latest.nodeId)?.message).status==='blocked')show.textContent=`Show new outcome${pending.length>1?` (${pending.length})`:''}`;}
  for(const n of $('map-nodes').children){n.classList.remove('new-investigation-work','growth-awaiting');n.querySelector('.new-result-badge')?.remove();}for(const p of $('map-wires').querySelectorAll('path'))p.classList.remove('growth-awaiting');
  const recentRoots=new Set(records.filter(recent).map(r=>r.nodeId));for(const badge of $('workspace-outline').querySelectorAll('.outline-new'))if(!recentRoots.has(badge.parentElement.dataset.nodeId))badge.remove();
  for(const r of records.filter(recent)){
    for(const id of members(view,r))card(id)?.classList.add('new-investigation-work');
    const node=card(r.nodeId);if(node){const badge=document.createElement('small');badge.className='new-result-badge';badge.textContent='New';badge.title=`${outcome(view,r.nodeId)} · From ${view.map.nodes.get(r.originId)?.title||'this investigation'}`;node.append(badge);}
  }
  if(!(themeMotion().scale===0))for(const id of view.growthPending||[]){const record=records.find(r=>r.nodeId===id);if(record)for(const key of members(view,record)){const n=card(key);if(n){n.classList.add('growth-awaiting');n.inert=true;}for(const p of $('map-wires').querySelectorAll('path'))if(p.dataset.to===key)p.classList.add('growth-awaiting');}}
  clearTimeout(view.growthBadgeTimer);const expiry=records.filter(r=>r.seenAt&&recent(r)).map(r=>r.seenAt+60000-Date.now());if(expiry.length)view.growthBadgeTimer=setTimeout(()=>syncResultGrowth(view),Math.max(1,Math.min(...expiry)));
  if(view.growthPending?.size){clearTimeout(view.growthRevealTimer);view.growthRevealTimer=setTimeout(()=>revealPending(view),40);}
}
function frameResult(view,id){
  const root=view.points.get(id),record=view.ws.growth.find(r=>r.nodeId===id);if(!root)return;
  let originId=record?.originId;while(originId&&!view.points.has(originId))originId=view.map.nodes.get(originId)?.parent;
  const area=view.mapArea();
  const ids=record?members(view,record):[id],target=frameMapNodes(view.points,ids,area,{originId});if(target)view.animateCamera(target);
}
function revealPending(view){
  const motion=themeMotion(),roots=[...(view.growthPending||[])];view.growthPending?.clear();const reduced=(themeMotion().scale===0);
  for(const id of roots){
    const r=view.ws.growth.find(r=>r.nodeId===id);if(!r)continue;const auto=view.growthAuto?.get(id);view.growthAuto?.delete(id);
    if(auto&&(view.ws.inspected||'core')===auto.origin&&attention(view)===auto.attention){r.seenAt=Date.now();frameResult(view,id);}
    $('result-growth-status').textContent=`${outcome(view,id)} from ${view.map.nodes.get(r.originId)?.title||'this investigation'}.`;
    const root=card(id);if(!root)continue;const area=$('workspace-canvas').getBoundingClientRect(),b=root.getBoundingClientRect();
    if(!auto&&(b.right<area.left||b.left>area.right||b.bottom<area.top||b.top>area.bottom))continue;
    if(reduced)continue;
    const wire=[...$('map-wires').querySelectorAll('path')].find(p=>p.dataset.growthRoot===id);
    if(wire&&view.ws.wiresVisible!==false){const length=wire.getTotalLength();const a=wire.animate([{strokeDasharray:`${length} ${length}`,strokeDashoffset:length},{strokeDasharray:`${length} ${length}`,strokeDashoffset:0}],{duration:motion.travel,easing:motion.easing});a.id='rea-growth-arc';}
    const item=view.map.nodes.get(id),quiet=!!item?.attempt||resultOutcome(view.state,item?.message).status==='blocked';
    travelBranchLight(view,wire,{quiet});
    const ids=members(view,r);let index=0;
    for(const key of ids){const n=card(key);if(!n)continue;n.inert=false;const bounds=n.getBoundingClientRect();if(index>=24||!auto&&key!==id&&(bounds.right<area.left||bounds.left>area.right||bounds.bottom<area.top||bounds.top>area.bottom))continue;
      const order=index++,delay=(view.ws.wiresVisible!==false?motion.travel:0)+(order?140*motion.scale:0)+Math.min(order,8)*55*motion.scale;
      if(order&&view.ws.wiresVisible!==false)for(const p of $('map-wires').querySelectorAll('path'))if(p.dataset.to===key){const a=p.animate([{opacity:0},{opacity:1}],{duration:160*motion.scale,delay:delay-70*motion.scale,fill:'backwards'});a.id='rea-growth-child-wire';}
      const a=n.animate([{opacity:0},{opacity:1}],{duration:180*motion.scale,delay,fill:'backwards',easing:motion.easing});a.id='rea-growth-node';n.inert=true;a.finished.catch(()=>{}).finally(()=>n.inert=false);
      if(order<8)settleNode(view,n,{delay});
      if(order<6&&(!quiet||order===0))landBranchGlow(view,n,{delay,primary:order===0,quiet});
    }
  }
  for(const n of $('map-nodes').children)if(n.classList.contains('growth-awaiting')){n.classList.remove('growth-awaiting');if(!n.getAnimations().some(a=>a.id==='rea-growth-node'))n.inert=false;}
  syncResultGrowth(view);view.persist();
}
export function showResultGrowth(view,id){
  openPath(view,id);acknowledgeResultGrowth(view,id);view.ws.reader=null;view.ws.inspected=id;view.nodeOpen=false;view.askOpen=false;view.growthPending??=new Set();view.growthPending.add(id);view.draw();frameResult(view,id);view.actions.inspected?.(view.selectedRecord(),false);view.persist();
}
