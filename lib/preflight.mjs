// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {probeReaConnection} from './rea-client.mjs';
import {engineReadiness} from './setup-readiness.mjs';
import {nativeCheckSummary,setupDiagnostic,sanitizedSetupDiagnostic} from './setup-diagnostics.mjs';

const states=new Set(['ready','missing','incompatible','unavailable','unknown','timed-out','canceled']);
const routes=['core','native','javascript','web','managed','sqlite','archive'];
const timestamp=()=>new Date().toISOString();
const boundedTimeout=value=>Math.max(10,Math.min(60000,Number.isFinite(value)?value:35000));

// Retain useful failure context without exposing bearer tokens or URL credentials.
// The result is diagnostic data; callers must render it as text, never instructions.
export function preflightDiagnostic(value){
  return String(value??'').slice(0,4000)
    .replace(/\b((?:Set-)?Cookie)\s*:\s*[^\r\n]+/gi,'$1: [redacted]')
    .replace(/\bAuthorization\s*:\s*(?:Basic|Bearer)\s+[^\s,;"']+/gi,'Authorization: [redacted]')
    .replace(/\bBearer\s+[^\s,;"']+/gi,'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g,'[redacted]')
    .replace(/((?:access[_-]?token|refresh[_-]?token|api[_-]?key|password|authorization|token)["']?\s*[:=]\s*["']?)[^\s,;"'&]+/gi,'$1[redacted]')
    .replace(/(https?:\/\/)[^\s/@]+@/gi,'$1[redacted]@');
}
const errorDiagnostic=error=>({name:preflightDiagnostic(error?.name||'Error'),code:preflightDiagnostic(error?.code||''),message:preflightDiagnostic(error?.message||'The prerequisite check did not finish.')});

/** Pure scope projection. Callers classify local paths first; suffixes cannot
 * distinguish a native EXE from a managed apphost. Only the action's relevant
 * retained targets should be supplied. Unresolved paths use core readiness and
 * leave target diagnosis to the existing recovery flow. */
export function preflightScope({incomingTargets=[],retainedTargets=[]}={}){
  const targets=[...incomingTargets,...retainedTargets],requirements=new Set(),unresolvedTargets=[],nativeTargets=[];
  if(targets.length)requirements.add('core');
  for(const original of targets){
    const target=original?.inspectionTarget?{...original,...original.inspectionTarget}:original;
    if(typeof target==='string'){
      if(/^https?:\/\//i.test(target))requirements.add('web');else unresolvedTargets.push(target);
      continue;
    }
    if(!target||typeof target!=='object'){unresolvedTargets.push('Unclassified target');continue;}
    if(target.kind==='website'){requirements.add('web');continue;}
    if(target.kind==='repository'){
      if(target.files?.some(file=>/\.[cm]?jsx?$/i.test(file)))requirements.add('javascript');
      continue;
    }
    const type=target.targetType;
    if(type==='javascript'||type==='javascript-file')requirements.add('javascript');
    else if(['native','managed','sqlite','archive'].includes(type)){requirements.add(type);if(type==='native')nativeTargets.push(target);}
    else unresolvedTargets.push(target.locator||target.root||'Unclassified target');
  }
  return {requiresEngine:requirements.has('core'),requirements:routes.filter(route=>requirements.has(route)),unresolvedTargets,nativeTargets};
}

function normalizeCheck(check,adapter,checkedAt){
  return {...(check?.setupRecord?{setupRecord:sanitizedSetupDiagnostic(check.setupRecord)}:{}),id:`${adapter.id}:${String(check?.id||'check').slice(0,80)}`,adapterId:adapter.id,label:String(check?.label||adapter.label||adapter.id).slice(0,160),status:states.has(check?.status)?check.status:'unknown',required:typeof check?.required==='boolean'?check.required:adapter.required!==false,detail:preflightDiagnostic(check?.detail||'The prerequisite status has not been established.'),diagnostic:check?.diagnostic?Object.fromEntries(Object.entries(check.diagnostic).slice(0,12).map(([key,value])=>[key,preflightDiagnostic(value)])):null,checkedAt};
}

async function boundedCheck(adapter,context,signal){
  const controller=new AbortController();let timeout,abortListener;
  const cancellation=new Promise(resolve=>{
    abortListener=()=>{controller.abort(signal?.reason);resolve({kind:'canceled'});};
    if(signal?.aborted)abortListener();else signal?.addEventListener('abort',abortListener,{once:true});
    timeout=setTimeout(()=>{controller.abort(new Error('Prerequisite check timed out.'));resolve({kind:'timed-out'});},boundedTimeout(adapter.timeoutMs));
  });
  const work=Promise.resolve().then(()=>{
    if(controller.signal.aborted)return {kind:signal?.aborted?'canceled':'timed-out'};
    return adapter.check(context,{signal:controller.signal});
  }).then(result=>result?.kind==='canceled'||result?.kind==='timed-out'?result:{kind:'result',result},error=>({kind:signal?.aborted?'canceled':controller.signal.aborted?'timed-out':'error',error}));
  try{return await Promise.race([work,cancellation]);}
  finally{clearTimeout(timeout);signal?.removeEventListener('abort',abortListener);}
}

/** Trusted adapters implement checks, not shell commands, repairs or installation.
 * Adapters must propagate the supplied signal to owned resources and clean up in
 * finally. The bound also returns safely if a broken adapter ignores cancellation. */
export async function runPreflight({adapters=[],context={},signal,onProgress=()=>{}}={}){
  const checks=[],ids=new Set();let canceled=!!signal?.aborted;
  if(adapters.length>16)checks.push(normalizeCheck({id:'limit',status:'unknown',required:true,detail:'There are too many prerequisite checks to complete safely.'},{id:'preflight',label:'Prerequisite check'},timestamp()));
  for(const adapter of adapters.slice(0,16)){
    const valid=adapter&&/^[a-z][a-z0-9-]{0,40}$/.test(adapter.id)&&typeof adapter.check==='function'&&!ids.has(adapter.id);
    if(!valid){checks.push(normalizeCheck({id:'adapter',status:'unknown',required:true,detail:'A prerequisite check could not be started. Reopen setup and retry.'},{id:'preflight',label:'Prerequisite check'},timestamp()));continue;}
    ids.add(adapter.id);try{onProgress({adapterId:adapter.id,status:'checking',label:adapter.label||adapter.id});}catch{}
    const outcome=await boundedCheck(adapter,context,signal),checkedAt=timestamp();
    if(outcome.kind==='result'){
      const rows=Array.isArray(outcome.result)?outcome.result:outcome.result?.checks;
      if(!Array.isArray(rows)||!rows.length)checks.push(normalizeCheck({id:'result',status:'unknown',detail:'The prerequisite check returned no confirmed status.'},adapter,checkedAt));
      else{for(const row of rows.slice(0,64))checks.push(normalizeCheck(row,adapter,checkedAt));if(rows.length>64)checks.push(normalizeCheck({id:'limit',status:'unknown',required:true,detail:'The prerequisite result exceeded its safe limit.'},adapter,checkedAt));}
    }else{
      canceled||=outcome.kind==='canceled';
      checks.push(normalizeCheck({id:'check',status:outcome.kind==='error'?'unavailable':outcome.kind,detail:outcome.kind==='canceled'?'The prerequisite check was canceled. Your request remains available.':outcome.kind==='timed-out'?'The prerequisite check took too long. Open setup and retry.':'The prerequisite check could not finish. Open setup and retry.',diagnostic:outcome.error?errorDiagnostic(outcome.error):null},adapter,checkedAt));
    }
    try{onProgress({adapterId:adapter.id,status:'checked',checks:checks.filter(check=>check.adapterId===adapter.id)});}catch{}
    if(canceled)break;
  }
  if(!checks.length)checks.push(normalizeCheck({id:'adapter',status:canceled?'canceled':'unknown',required:true,detail:canceled?'The prerequisite check was canceled.':'No prerequisite check was available. Reopen setup and retry.'},{id:'preflight',label:'Prerequisite check'},timestamp()));
  canceled||=!!signal?.aborted;
  const checkedAt=timestamp(),blocked=canceled||checks.some(check=>check.required&&check.status!=='ready');
  return {status:blocked?'blocked':'ready',diagnostic:checks.find(check=>check.setupRecord)?.setupRecord||null,checks,checkedAt,canceled,summary:blocked?(canceled?'Setup check canceled. Your request is preserved.':'A required prerequisite needs attention before investigation can continue.'):'Required prerequisites are ready.',limitations:['Readiness is not proof of target compatibility, successful inspection or model access.']};
}

function operationStatus(session,operation){
  const groups=[...(session?.toolAvailability||[]),...(session?.capabilities||[]).flatMap(item=>item.groups||[])];
  const evidence=groups.filter(group=>(group.names||group.operations||[]).some(item=>(typeof item==='string'?item:item?.name)===operation));
  const failure=evidence.find(item=>item.available===false&&item.reason!=='target_required');
  // Contradictory explicit availability must not silently pass a required route.
  if(failure)return {status:'unavailable',reason:failure.reason,remediation:failure.remediation};
  if(evidence.some(item=>item.available===true))return {status:'ready'};
  return {status:'unknown',reason:'The engine did not establish availability for this inspection route.'};
}

export function createReaAdapter(config={},options={}){
  const probe=options.probe||probeReaConnection,readiness=options.readiness||engineReadiness;
  return {id:'rea',label:'Inspection prerequisites',timeoutMs:options.timeoutMs??35000,required:true,async check(context,{signal}){
    const scope=context.scope||(context.requiresEngine!==undefined?context:preflightScope(context)),requirements=new Set(context.requirements||scope.requirements);
    if(!requirements.size&&!scope.requiresEngine)return [{id:'core',label:'Inspection engine',status:'unknown',required:false,detail:'Target inspection is not required for this action.'}];
    requirements.add('core');
    const engine=await probe(config,{signal});signal.throwIfAborted();
    const projected=readiness(engine),cards=new Map((projected.cards||[]).map(card=>[card.id,card]));
    const specifications=[['core','Inspection engine','engine-core'],['native','Native applications','native'],['javascript','JavaScript and Electron','javascript'],['web','Websites','web'],['managed','Managed applications',null,'inspect_managed_artifact'],['sqlite','SQLite databases',null,'inspect_sqlite_database'],['archive','Application archives',null,'inspect_artifact']];
    const core=cards.get('engine-core'),coreReady=engine?.available===true&&core?.state==='ready';
    const checks=specifications.map(([id,label,cardId,operation])=>{
      const card=cards.get(cardId),route=operation?operationStatus(engine?.session,operation):null;
      let status=id==='core'?(coreReady?'ready':engine?.available===false?'unavailable':'unknown'):coreReady?(card?.state||route?.status||'unknown'):'unknown';
      if(!states.has(status))status='unknown';
      // Tool-name advertisements alone are never used as provider evidence.
      return {id,label,status,required:requirements.has(id),detail:id==='core'?(coreReady?'The local inspection engine responded.':'The inspection engine needs attention. Open setup and recheck it.'):status==='ready'?`${label} inspection is available. Target compatibility is checked during inspection.`:requirements.has(id)?`${label} inspection is required for this target but is not ready. Open inspection setup and recheck.`:`${label} inspection is optional for this action.`,diagnostic:{reason:card?.reason||route?.reason||engine?.reason||'',remediation:card?.remediation||route?.remediation||''}};
    });
    if([...requirements].some(requirement=>!routes.includes(requirement)))checks.push({id:'route',label:'Inspection route',status:'unknown',required:true,detail:'The required inspection route has not been established.'});
    let verification={state:'unknown',code:'operation_unverified'};
    const verify=options.nativeSetupCheck||config.nativeSetupCheck;
    if(requirements.has('native')){
      const targets=scope.nativeTargets||context.nativeTargets||[],results=[];
      for(const target of targets)results.push(verify?await verify(target,engine.session):{state:'unknown',code:'operation_unverified'});
      const ready=results.length>0&&results.every(result=>result.state==='ready');verification=nativeCheckSummary(results);
      checks.push({id:'native-operation',label:'Native static inspection check',status:ready?'ready':'unknown',required:!options.inspectDuringInvestigation,detail:ready?'A recent explicit static overview passed for these exact targets and tool settings.':options.inspectDuringInvestigation?'The investigation will perform the real static inspection before asking the agent. No successful inspection is claimed yet.':'Open setup and explicitly verify a native static inspection for this target. No target or AI request has been executed by this prerequisite check.',diagnostic:{reason:ready?'':'operation_unverified',remediation:'Open setup, recheck prerequisites, then choose Verify native static inspection. Approve a separate saved-request retry afterward.'}});
    }
    checks[0].setupRecord=setupDiagnostic(projected,engine.session,{requirements:[...requirements],verification,policy:config.nativeSetupPolicy});
    return checks;
  }};
}
