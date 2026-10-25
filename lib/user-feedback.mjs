// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Human-facing categories are shared by recovery cards, notices and setup.
export const feedbackKinds={
 interrupted:{icon:'pause',action:'resume',actionLabel:'Resume investigation'},
 'evidence-validation':{icon:'source-check',action:'check',actionLabel:'Check and retry'},
 configuration:{icon:'settings',action:'agent',actionLabel:'Review agent settings'},
 authentication:{icon:'key',action:'agent',actionLabel:'Connect your agent'},
 'rate-limit':{icon:'clock',action:'refresh',actionLabel:'Check when to resume'},
 quota:{icon:'usage',action:'agent',actionLabel:'Review account connection'},
 'network-blocked':{icon:'network-blocked',action:'agent',actionLabel:'Repair agent connection'},
 connection:{icon:'connection',action:'agent',actionLabel:'Check agent connection'},
 timeout:{icon:'clock',action:'resume',actionLabel:'Resume investigation'},
 'native-tool':{icon:'tools',action:'setup',actionLabel:'Check inspection tools'},
 'missing-tool':{icon:'missing-tool',action:'setup',actionLabel:'Find required tool'},
 permission:{icon:'lock',action:'details',actionLabel:'Review access details'},
 storage:{icon:'save',action:'save',actionLabel:'Try saving again'},
 document:{icon:'document',action:'open',actionLabel:'Choose another file'},
 validation:{icon:'source-check',action:'details',actionLabel:'Review input'},
 attachment:{icon:'document',action:'details',actionLabel:'Review attachments'},
 dictation:{icon:'microphone',action:'details',actionLabel:'Type your goal instead'},
 clipboard:{icon:'copy',action:'details',actionLabel:'Try copying again'},
 export:{icon:'save',action:'details',actionLabel:'Review export options'},
 theme:{icon:'palette',action:'details',actionLabel:'Choose another theme file'},
 canceled:{icon:'stop',action:'dismiss',actionLabel:'Dismiss'},
 unknown:{icon:'help',action:'details',actionLabel:'View error details'}
};
export const cleanError=value=>String(value?.message||value||'').replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
export function errorPresentation(value,{context}={}){
 const detail=cleanError(value);let category='unknown',title='This action could not finish',message='Review the technical details below, then try the action again when the cause is resolved.';
 if(/abort|cancel(?:ed|led)|stopped by you/i.test(detail)){category='canceled';title='Action canceled';message='The action stopped. You can continue working or try it again when you are ready.';}
 else if(/document changed or moved outside the app|document (?:was )?changed (?:in|by) another|outside edits|preserve both versions/i.test(detail)){category='storage';title='This document changed in another window';message='Your changes remain in recovery. Use Save As to keep both versions.';}
 else if(/File is outside the inventoried source set|File resolves outside the chosen directory|requested file was absent or ambiguous/i.test(detail)){category='validation';title='Choose a file from the selected source';message='Nodes did not read this path. Choose a file inside the selected source folder or select a different source.';}
 else if(/selected target changed|inventoried source folder changed|declared inspection component changed/i.test(detail)){category='validation';title='The inspected application changed';message='Earlier evidence remains available. Start a new investigation for the current version before inspecting it again.';}
 else if(/analysis_provider_unavailable|provider_unavailable|selected analysis provider is unavailable/i.test(detail)){category='native-tool';title='An inspection tool needs attention';message='Open inspection setup and check the analysis provider for this application. Your saved investigation remains available.';}
 else if(/invalid inspection output|complete MCP frame|Inspection failed:|evidence.{0,30}(?:conflict|already exists)/i.test(detail)){category='evidence-validation';title='Inspection output needs a retry';message='Review the retained evidence and failure details, then retry a narrower inspection. Incomplete output is not a completed finding.';}
 else if(/proposed route could not be matched|Route item \d+ (?:does not name|repeats)/i.test(detail)){category='validation';title='The route needs another plan';message='Your agent could not make a route through distinct saved features. Your goal and investigation are kept. Choose Plan the route to try again.';}
 else if(context==='save'||/ENOSPC|disk.{0,12}full|could not.{0,20}sav|failed to.{0,12}sav|save.{0,12}failed/i.test(detail)){category='storage';title='Your latest changes could not be saved';message='Keep this window open. Check free space and the save location, then try saving again.';}
 else if(context==='open'||/invalid.{0,20}(?:document|archive)|corrupt|not a.{0,12}document|unsupported.{0,12}(?:document|file)/i.test(detail)){category='document';title='This file could not be opened';message='Choose a valid Nodes investigation file. Your current investigation has not been replaced.';}
 else if(/10013|EACCES.{0,80}(?:connect|socket)|socket.{0,80}(?:forbidden|permission)/i.test(detail)){category='network-blocked';title='Your agent cannot connect';message='The selected agent was blocked from reaching its service. Check its connection or choose another installed agent.';}
 else if(/unsupported (?:source )?reference|source.reference checks|lacked valid supporting evidence|did not ground/i.test(detail)){category='evidence-validation';title='The result needs a source check';message='The generated result did not pass its evidence checks. Review the saved attempt and check readiness before retrying.';}
 else if(/401|403|unauthori[sz]ed|authentication|not logged|invalid.{0,12}(?:key|token)/i.test(detail)){category='authentication';title='Reconnect your agent';message='Your agent could not use its current sign-in. Open agent settings to sign in or select a working connection.';}
 else if(/429|rate.?limit|too many requests/i.test(detail)){category='rate-limit';title='Your agent needs a little time';message='The service is limiting requests. If a retry time is available, wait until then before resuming.';}
 else if(/quota|out of credits|billing|usage limit|spend.limit/i.test(detail)){category='quota';title='Your agent has reached its usage limit';message='Review your account allowance or choose another connected agent. Your saved investigation is still available.';}
 else if(/timeout|timed out/i.test(detail)){category='timeout';title='The response took too long';message='The operation did not finish in time. Review any saved results before trying again.';}
 else if(/ECONN|ENOTFOUND|network|fetch failed|connection.{0,20}(?:failed|lost|closed)/i.test(detail)){category='connection';title='The connection was interrupted';message='Check your connection and selected agent, then continue from the saved request when it is ready.';}
 else if(/EACCES|EPERM|permission|access denied/i.test(detail)){category='permission';title='A required file or service could not be accessed';message='Review which resource was blocked in the details. Choose an accessible file or save location, or correct that specific permission.';}
 else if(/ghidra|jdk|java_home|decompiler|native.{0,20}unavailable/i.test(detail)){category='native-tool';title='An inspection tool needs attention';message='Open inspection setup to check the tool needed for this application. Your saved request remains available.';}
 else if(/ENOENT|not found|missing|not configured|server exited/i.test(detail)){category='missing-tool';title='A required resource is unavailable';message='Review the missing resource in the details. Choose an available file or check the inspection tools before trying again.';}
 else if(/provider.{0,30}(?:conflict|reserved|already exists)|unsupported.{0,20}(?:flag|argument)/i.test(detail)){category='configuration';title='Your agent settings need attention';message='The selected agent could not use these settings. Review the agent connection before retrying.';}
 const contexts={validation:['validation','Check this input','Review the highlighted value and correct it before continuing.'],attachment:['attachment','This context could not be added','Your goal is still in the editor. Review the file, URL or attachment limit, then try again.'],dictation:['dictation','Dictation could not finish','You can type your goal instead. Review the microphone or local dictation details before retrying.'],clipboard:['clipboard','The text could not be copied','Try copying again, or select and copy the text directly.'],export:['export','The export could not be saved','Review the format, size and destination. Your investigation remains available.'],share:['export','The shared copy could not be saved','Your original investigation remains available. Review the shared-copy choices and destination, then try again.'],handoff:['export','The handoff could not be created','Your original research remains available. Review the handoff choices and destination, then try again.'],setup:['native-tool','Inspection setup could not finish','Your application selection and saved request remain available. Review the failed setup step before trying again.'],theme:['theme','This theme could not be imported','Choose a valid Nodes theme file. Your previous saved themes remain available.']};
 if(contexts[context]&&category!=='canceled'){const next=contexts[context];if(!['permission','storage'].includes(category))category=next[0];title=next[1];message=next[2];}
 return {category,title,message,detail,...feedbackKinds[category]};
}
