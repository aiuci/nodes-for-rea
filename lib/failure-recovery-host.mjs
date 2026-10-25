// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {createHash} from 'node:crypto';
import {explainFailure,failedAttempt,failureHistory} from './failure-recovery.mjs';
import {aiRecoverySeal} from './ai-checkpoint.mjs';
export const configFingerprint=config=>createHash('sha256').update(JSON.stringify(config)).digest('hex');
export function recordFailure(attempt,error,config){
 const recovery=attempt.recovery||{};attempt.recovery={...recovery,...explainFailure(attempt),status:attempt.status==='stopped'?'interrupted':'failed',history:[...(recovery.history||[]),{at:new Date().toISOString(),event:attempt.status==='stopped'?'interrupted':'failed',error:String(error.message||error)}],failedConfig:configFingerprint(config)};
 const knownCodes=new Set(['STAGE_TIMEOUT','REA_INVALID_OUTPUT','REA_TRUNCATED_OUTPUT','TARGET_CHANGED_DURING_INSPECTION','EVIDENCE_ID_CONFLICT','ENOSPC','EACCES','EPERM','ENOENT','ECONNRESET','ETIMEDOUT']);
 const details={};for(const key of ['operation','timeoutMs','receivedBytes','expectedSha256','observedSha256']){
  const value=error.data?.[key];if(['timeoutMs','receivedBytes'].includes(key)){if(Number.isFinite(value)&&value>=0)details[key]=value;}
  else if(key==='operation'){if(typeof value==='string'&&/^[a-zA-Z0-9_.:/-]{1,120}$/.test(value))details[key]=value;}
  else if(typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value))details[key]=value;
 }
 const suppliedStage=attempt.stage?.name||error.data?.stage;
 attempt.diagnostic={runId:attempt.id||null,stage:typeof suppliedStage==='string'&&/^[a-zA-Z0-9 _.-]{1,100}$/.test(suppliedStage)?suppliedStage:'investigation',faultType:knownCodes.has(error.code)?error.code:attempt.recovery.category,recoveryOutcome:attempt.resultId?'completed-result-linked':typeof attempt.question==='string'&&attempt.question.trim()?'request-retained-in-attempt':'no-saved-request',details};
}
export function resolveFailure(attempt,{now=new Date().toISOString(),resultId=attempt.resultId}={}){
 if(!attempt.recovery||attempt.recovery.resolvedAt)return;
 attempt.recovery.status='resolved';attempt.recovery.resolvedAt=now;
 attempt.recovery.history??=[];attempt.recovery.history.push({at:now,event:'completed',resultId});
}
export async function diagnoseFailure(state,attempt,{check,config,now=Date.now()}={}){
 if(!failedAttempt(attempt))throw Error('This attempt no longer needs recovery.');
 if(attempt.status==='running'){attempt.status='interrupted';attempt.finishedAt=new Date(now).toISOString();attempt.reason||='The previous session ended before a result was saved.';}
 const explanation=explainFailure(attempt);let checks;
 try{checks=await check();}catch(error){checks={ready:false,summary:'Readiness checks could not complete.',detail:String(error.message||error)};}
 const fingerprint=configFingerprint(config),signature=explanation.category+':'+fingerprint+':'+configFingerprint({question:attempt.question,nodeId:attempt.nodeId});
 const repeats=(state.recoveryRetries||{})[signature]||0;
 const canRetry=!!checks.ready&&repeats<1&&!['unknown','permission','rate-limit','quota'].includes(explanation.category)&&!attempt.aiRecovery&&!attempt.targetRecovery;
 attempt.recovery={...attempt.recovery,...explanation,status:'diagnosed',history:[...failureHistory(attempt),{at:new Date(now).toISOString(),event:'diagnosed',outcome:checks.summary}],diagnostic:{at:new Date(now).toISOString(),checks,canRetry,signature,fingerprint,seal:aiRecoverySeal(state),used:false}};
 return attempt.recovery;
}
export function consumeRecovery(state,attempt,config,{now=Date.now()}={}){
 const d=attempt?.recovery?.diagnostic;
 if(!failedAttempt(attempt)||!d?.canRetry||d.used||now-Date.parse(d.at)>600000||d.seal!==aiRecoverySeal(state)||d.fingerprint!==configFingerprint(config))throw Error('Run Diagnose again before retrying. The check must be current and the saved investigation unchanged.');
 if((state.recoveryRetries?.[d.signature]||0)>=1)throw Error('This configuration has already been retried. Correct the cause before another attempt.');
 state.recoveryRetries||={};state.recoveryRetries[d.signature]=(state.recoveryRetries[d.signature]||0)+1;d.used=true;attempt.recovery.history.push({at:new Date(now).toISOString(),event:'retry-approved'});
}
export function recoveryReadiness({attempt,config,ai,engine}){
 const needsModelProof=['configuration','authentication','connection'].includes(explainFailure(attempt).category);
 const modelVerified=Date.parse(config.recoveryVerification||'')>Date.parse(attempt.finishedAt||attempt.startedAt||0);
 const nativeNeeded=explainFailure(attempt).category==='native-tool'||engine.diagnostic?.requirements?.includes('native');
 const ready=(!needsModelProof||modelVerified)&&!!ai.configured&&engine.ready&&(!nativeNeeded||engine.cards.find(c=>c.id==='native')?.state==='ready'&&engine.diagnostic?.verification?.state==='ready');
 return {ready,summary:ready?'Required readiness checks passed. Review saved outcomes before approving one retry.':needsModelProof&&!modelVerified?'Verify the corrected AI connection using the response test in Setup’s advanced settings, then Diagnose again. That explicit test uses your AI service.':'Setup still needs attention. Open Setup and resolve the unavailable connection or analysis tool.',detail:engine.cards.map(c=>`${c.label}: ${c.state}. ${c.reason||c.detail}`).join('\n')};
}
