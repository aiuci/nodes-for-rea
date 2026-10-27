// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {withAiRecovery,classifyAiFailure} from './ai-recovery.mjs';
import {runProcess,codexCommand,claudeCommand} from './runtime.mjs';
import {providerImageInput} from './provider-images.mjs';

export function assertSchema(value,schema,field='answer'){
  if(schema.enum&&!schema.enum.includes(value))throw new Error(`Invalid ${field}: unexpected choice.`);
  if(schema.type==='object'){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`Invalid ${field}: expected an object.`);
    for(const key of schema.required||[])if(!(key in value))throw new Error(`Invalid ${field}: missing ${key}.`);
    for(const [key,item]of Object.entries(value)){if(schema.additionalProperties===false&&!schema.properties?.[key])throw new Error(`Invalid ${field}: unexpected field ${key}.`);if(schema.properties?.[key])assertSchema(item,schema.properties[key],`${field}.${key}`);}
  }else if(schema.type==='array'){
    if(!Array.isArray(value))throw new Error(`Invalid ${field}: expected a list.`);for(const [index,item]of value.entries())assertSchema(item,schema.items,`${field}[${index}]`);
  }else if(schema.type==='integer'){if(!Number.isInteger(value))throw new Error(`Invalid ${field}: expected an integer.`);
  }else if(schema.type&&typeof value!==schema.type)throw new Error(`Invalid ${field}: expected ${schema.type}.`);
  if(typeof value==='string'&&schema.maxLength&&value.length>schema.maxLength)throw new Error(`Invalid ${field}: text is too long.`);
  return value;
}
export function gatewayBase(value){
  const url=new URL(value||'http://127.0.0.1:18789/v1');
  const host=url.hostname.replace(/^\[|\]$/g,''),privateHost=host==='localhost'||host==='::1'||/^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('Use a gateway HTTP(S) URL without embedded credentials or query parameters.');
  if(url.protocol==='http:'&&!privateHost)throw new Error('Use HTTPS for a gateway outside your private network.');
  url.pathname=url.pathname.replace(/\/chat\/completions\/?$/,'').replace(/\/$/,'')||'/v1';return url.href.replace(/\/$/,'');
}
async function runJSONOnce(config,schema,input,schemaPath,{directory,signal,onProgress=()=>{},images=[]}={}){
  await config.onApplicationModelAttempt?.();
  const imageInput=await providerImageInput(config.provider||'codex',input,images);input=imageInput.input;
  if(config.provider==='claude'){
    const command=claudeCommand(config,['--print','--output-format','json','--json-schema',JSON.stringify(schema),'--tools','','--safe-mode','--no-session-persistence',...imageInput.args,...(config.model?['--model',config.model]:[])]);
    let result;try{result=await runProcess(command.command,command.args,{cwd:directory,input,signal,timeout:240000});}catch(error){if(/not logged in|please run .login|authentication/i.test(error.message))throw new Error('Claude is not signed in. Open Connection and choose Sign in to Claude, then test again.');if(/unknown option|unrecognized option/i.test(error.message))throw new Error('Update Claude Code to the current version, then test again.');throw error;}
    let envelope;try{envelope=JSON.parse(result.stdout);}catch{throw new Error('Claude returned an unreadable response. Open Connection to check your Claude Code installation.');}
    if(envelope.is_error){const error=Object.assign(new Error('Claude could not finish. Check Claude Code sign-in and model access in Connection.'),{providerError:envelope});throw error;}
    let answer=envelope.structured_output;
    if(!answer){try{answer=JSON.parse(String(envelope.result||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw new Error('Claude returned no structured answer. Update Claude Code and test the connection again.');}}
    assertSchema(answer,schema);return {...answer,usage:envelope.usage};
  }
  if(config.provider==='openclaw'){
    const timeout=AbortSignal.timeout(240000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
    let response;
    try{response=await fetch(`${gatewayBase(config.gatewayUrl)}/chat/completions`,{method:'POST',redirect:'error',signal:combined,headers:{'Content-Type':'application/json',...(config.gatewayToken?{Authorization:`Bearer ${config.gatewayToken}`}:{}) ,...(config.agentId?{'x-openclaw-agent-id':config.agentId}:{})},body:JSON.stringify({model:'openclaw',stream:false,messages:[{role:'system',content:'Use only the supplied evidence. Return one JSON object matching the supplied schema. Do not run tools, browse, modify files, or send messages.'},{role:'user',content:images.length?imageInput.content.map((part,i)=>i===0?{...part,text:part.text+'\nRequired JSON schema:\n'+JSON.stringify(schema)}:part):`${input}\n\nRequired JSON schema:\n${JSON.stringify(schema)}`}],tools:[],tool_choice:'none'})});}
    catch(error){if(signal?.aborted)throw new Error('Investigation stopped.');if(timeout.aborted||error.name==='TimeoutError')throw Object.assign(new Error('OpenClaw did not respond in time. Check the gateway and try a narrower request.',{cause:error}),{code:'AI_TIMEOUT'});throw Object.assign(new Error('Could not reach the OpenClaw gateway. Check its address, HTTPS certificate, and whether it is running.',{cause:error}),{code:'AI_NETWORK_ERROR'});}
    if(!response.ok){let detail;try{const text=await response.text();detail=JSON.parse(text.slice(0,12000));}catch{}const failure={status:response.status,headers:response.headers,providerError:detail};if(classifyAiFailure(failure))throw failure;const hint=response.status===401||response.status===403?'Check the gateway token or password.':response.status===404?'Enable gateway.http.endpoints.chatCompletions.enabled on your gateway.':response.status===429?'The gateway is rate limited; wait and retry.':'Check the selected agent and its model connection.';throw new Error(`OpenClaw connection failed (${response.status}). ${hint}`);}
    const raw=await response.text();if(raw.length>24000000)throw new Error('OpenClaw response exceeded the local capture limit.');let body;try{body=JSON.parse(raw);}catch{throw new Error('OpenClaw returned an unreadable HTTP response.');}
    const content=body.choices?.[0]?.message?.content,text=Array.isArray(content)?content.map(part=>part.text||'').join('\n'):content;
    if(typeof text!=='string')throw new Error('OpenClaw returned no text answer. Use an agent that can return structured JSON.');
    let answer;try{answer=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw new Error('OpenClaw did not return the required JSON. Check its agent instructions, then retry.');}
    assertSchema(answer,schema);return {...answer,usage:body.usage};
  }
  // Current Codex rejects model_providers.openai overrides: built-in providers
  // are immutable. Exhausted upstream retries remain terminal in withAiRecovery.
  let answer='',usage,failure;const command=codexCommand(config,['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--json','-c','features.shell_tool=false','-c','features.multi_agent=false',...imageInput.args,...(config.model?['--model',config.model]:[]),'--output-schema',schemaPath,'-']);
  // A forbidden Windows socket cannot recover by waiting in Codex's reconnect
  // loop. Stop this request promptly, retaining its checkpoint for an explicit
  // resume after access is restored. Ordinary transient reconnects stay intact.
  const blocked=new AbortController(),processSignal=signal?AbortSignal.any([signal,blocked.signal]):blocked.signal;let networkDenied;
  let result;try{result=await runProcess(command.command,command.args,{cwd:directory,input,signal:processSignal,timeout:240000,onEvent(event){
    if(event.type==='item.completed'&&event.item?.type==='agent_message')answer=event.item.text;
    if(event.type==='turn.completed'){usage=event.usage;failure=null;}
    if(event.type==='error'||event.type==='turn.failed'){
      failure=event.error||event;
      if(classifyAiFailure({providerError:failure})?.category==='network-blocked'){
        networkDenied=Object.assign(new Error('Windows denied the agent network socket.'),{code:'AI_NETWORK_BLOCKED'});blocked.abort();
      }
    }
  }});}catch(error){if(signal?.aborted)throw error;if(networkDenied)throw networkDenied;if(failure)error.providerError=failure;throw error;}
  if(failure&&classifyAiFailure({providerError:failure}))throw {providerError:failure};
  if(!answer){const events=result.stdout.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});throw new Error(events.find(event=>event.error||event.type==='error')?.message||'Codex returned no answer. Open Connection to check sign-in and usage availability.');}
  const parsed=JSON.parse(answer);assertSchema(parsed,schema);return {...parsed,usage};
}

export async function runJSON(config,schema,input,schemaPath,options={}){
  return withAiRecovery(()=>runJSONOnce(config,schema,input,schemaPath,options),{safeToRetry:config.provider!=='openclaw',signal:options.signal,onProgress:options.onProgress,onRetry:config.onAiRecovery});
}
