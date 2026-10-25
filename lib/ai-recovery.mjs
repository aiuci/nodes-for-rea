// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const quota=/insufficient_quota|billing_hard_limit_reached|enforced_spend_limit_reached|credit_balance_too_low|usage_limit_reached|exceeded your current quota|out of credits|monthly (?:spend|usage) (?:cap|limit)|reached your specified (?:workspace )?API usage limits/i;
function textOf(value,depth=0){
  if(depth>4||value==null)return '';if(typeof value==='string')return value.slice(0,12000);
  return ['message','error','code','type','name','result','details','error_code','providerError','cause'].map(key=>textOf(value[key],depth+1)).join(' ');
}
function header(headers,name){return headers?.get?.(name)??headers?.[name]??Object.entries(headers||{}).find(([key])=>key.toLowerCase()===name)?.[1];}
export function retryAfterMs(value,now=Date.now()){
  if(value==null||value==='')return null;const seconds=Number(value);if(Number.isFinite(seconds))return seconds>=0?Math.min(8640000000000000-now,seconds*1000):null;
  const date=Date.parse(String(value));return Number.isFinite(date)?Math.max(0,date-now):null;
}
export function classifyAiFailure(error,{now=Date.now()}={}){
  if(error?.aiFailure)return error.aiFailure;
  const text=textOf(error),status=Number(error?.status||error?.response?.status)||(/\b429\b/.test(text)?429:null);
  const category=/AI_NETWORK_BLOCKED|\bos error 10013\b|\bWSAEACCES\b|\bconnect EACCES\b|socket[^\n]*forbidden[^\n]*access permissions/i.test(text)?'network-blocked':quota.test(text)?'quota':status===429||/rate[_ -]limit(?:ed|_error)?|too many requests/i.test(text)?'rate-limit':
    status===408||status===504||/AI_TIMEOUT|ETIMEDOUT|TimeoutError|timed out|did not respond in time|UND_ERR_(?:CONNECT|HEADERS|BODY)_TIMEOUT/i.test(text)?'timeout':
    /AI_NETWORK_ERROR|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|UND_ERR_SOCKET|fetch failed|network (?:error|unavailable|connection)|connection (?:reset|closed|lost)/i.test(text)?'network':null;
  if(!category)return null;
  const delay=retryAfterMs(header(error?.headers,'retry-after')??error?.retryAfter,now);
  return {category,status,retryAt:delay===null?null:new Date(now+delay).toISOString(),upstreamRetriesExhausted:/exceeded retry limit|retry limit.*(?:exceeded|reached)/i.test(text)};
}
export class AiServiceError extends Error{
  constructor(info,{safeToRetry=false,attempts=1,cause}={}){
    const message={quota:'AI usage quota reached. Investigation paused. Check your account limits or choose another connection.','rate-limit':'AI temporarily rate-limited. Investigation paused. Retry available.',network:'AI connection interrupted. Investigation paused. Saved work is retained.','network-blocked':'Windows blocked your agent’s network connection. Investigation paused. Your evidence is saved.',timeout:'AI response timed out. Investigation paused. Saved work is retained.'};
    super(message[info.category]||'AI request paused. Saved work is retained.',{cause});
    this.name='AiServiceError';this.aiFailure={...info,safeToRetry,attempts};
  }
}
export function waitForRetry(ms,signal){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error('Investigation stopped.'));
    const cleanup=()=>signal?.removeEventListener('abort',abort),timer=setTimeout(()=>{cleanup();resolve();},ms);
    const abort=()=>{clearTimeout(timer);cleanup();reject(new Error('Investigation stopped.'));};signal?.addEventListener('abort',abort,{once:true});
  });
}
// Replay only one known reasoning request. Never retries a whole investigation,
// arbitrary tool, or a gateway that may execute its own agent-side actions.
export async function withAiRecovery(operation,{safeToRetry=false,signal,onRetry=async()=>{},onProgress=()=>{},now=Date.now,random=Math.random,wait=waitForRetry,maxAttempts=3,maxWaitMs=90000}={}){
  let waited=0;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    signal?.throwIfAborted();
    try{return await operation();}
    catch(error){
      if(signal?.aborted)throw error;const info=classifyAiFailure(error,{now:now()});if(!info)throw error;
      const delay=Math.max(Math.round(Math.min(30000,2000*2**(attempt-1))*(.5+Math.max(0,Math.min(1,random()))/2)),info.retryAt?Math.max(0,Date.parse(info.retryAt)-now()):0);
      if(info.category!=='rate-limit'||info.upstreamRetriesExhausted||!safeToRetry||attempt===maxAttempts||waited+delay>maxWaitMs)throw new AiServiceError(info,{safeToRetry,attempts:attempt,cause:error});
      const retryAt=new Date(now()+delay).toISOString();await onRetry({category:info.category,status:info.status,retryAt,attempt,nextAttempt:attempt+1,maxAttempts});
      onProgress(`AI temporarily rate-limited. Retrying this reasoning request in ${Math.ceil(delay/1000)} seconds (${attempt+1}/${maxAttempts}). Saved evidence is retained.`);
      await wait(delay,signal);waited+=delay;
    }
  }
}
