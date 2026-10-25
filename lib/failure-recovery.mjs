// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {analysisProviderUnavailable} from './setup-diagnostics.mjs';
import {targetSelection} from './target-recovery-state.mjs';
// Evidence-based explanations only: never invent a repair or parse error text as commands.
export function explainFailure(attempt={}){
 const text=String(attempt.reason||''),stopped=['stopped','interrupted','running'].includes(attempt.status);
 const rule=stopped?['interrupted','Investigation interrupted','The operation stopped before a completed result was saved.','Review retained evidence before retrying; a remote operation may already have run.']:
 /selected target changed|inventoried source folder changed|declared inspection component changed/i.test(text)?['validation','The inspected application changed','The selected application no longer matches the inspected version. Earlier evidence remains available.','Start a new investigation for the current version before inspecting it again.']:
 !analysisProviderUnavailable(text)&&/invalid inspection output|complete MCP frame|Inspection failed:|evidence.{0,30}(?:conflict|already exists)/i.test(text)?['evidence-validation','Inspection output needs a retry','This operation did not provide a complete, valid inspection result. Earlier evidence is retained.','Review retained evidence and failure details, then retry a narrower inspection. Do not treat partial output as a completed finding.']:
 /proposed route could not be matched|Route item \d+ (?:does not name|repeats)/i.test(text)?['validation','The route needs another plan','The proposed route could not be matched to distinct saved features. Your goal and investigation are kept.','Open Agent Control and choose Plan the route to try again.']:
 /mechanism inventory contained unsupported references|response contained an unsupported source reference|result row lacked valid supporting evidence|feature map omitted a defining mechanism|response did not ground its findings/i.test(text)?['evidence-validation','Source check needs a retry','The generated result did not pass its source-reference checks. Captured evidence is retained.','Use Diagnose to check readiness, then retry the original request. This error does not indicate a broken connection.']:
 /(?:provider.*(?:conflict|already exists|reserved|built.in)|(?:conflict|duplicate).*provider)/i.test(text)?['configuration','AI provider configuration conflict','A provider definition conflicts with another provider.','Open your agent configuration, rename the conflicting custom provider and update its references. Verify the connection in Setup before retrying.']:
 /401|403|unauthori[sz]ed|invalid.*(?:key|token)|not logged|authentication/i.test(text)?['authentication','AI connection needs attention','The service rejected the current credentials or permissions.','Open Setup, sign in again or select a working connection, and verify it.']:
 /429|rate.?limit|too many requests/i.test(text)?['rate-limit','AI temporarily rate-limited','The service is not accepting this request yet.','Wait for the provider’s retry window, then use the saved-request recovery when available.']:
 /quota|out of credits|billing|spend.limit/i.test(text)?['quota','AI usage limit reached','The account cannot accept more requests under its current limits.','Check account limits or choose another connection in Setup.']:
 (analysisProviderUnavailable(text)||/native (?:analysis )?provider.*unavailable|ghidra|java_home|jdk|decompiler/i.test(text))?['native-tool','Analysis tool needs attention','REA could not use a required native analysis tool.','Open Setup and check native analysis readiness. Install or configure only the tools required for this target.']:
 /ENOENT|not found|missing|cannot find|not configured|server exited/i.test(text)?['missing-tool','Inspection dependency unavailable','A required engine, executable or runtime could not start.','Open Setup and check the REA engine and selected agent. Follow the specific missing-tool instructions there.']:
 /timeout|timed out|ECONN|ENOTFOUND|network|fetch failed/i.test(text)?['connection','Connection interrupted','The operation could not finish communicating with a service.','Check service and network availability. Review saved results before retrying.']:
 /EACCES|EPERM|permission denied|access denied/i.test(text)?['permission','Access was denied','Nodes or its analysis engine could not access a required resource.','Check the reported file or service permissions. Do not grant broad administrator access automatically.']:
 ['unknown','Investigation needs attention','This attempt did not produce a completed result. The available error does not establish a safe automatic fix.','Review Details and retained evidence. Check Setup, then correct the cause or ask a narrower question.'];
 return {category:rule[0],title:rule[1],explanation:rule[2],nextAction:rule[3]};
}
export function failedAttempt(a){return !!a&&!targetSelection(a)&&!a.resultId&&!a.recovery?.resolvedAt&&['failed','blocked','stopped','interrupted','running'].includes(a.status);}
export function failureHistory(attempt){return attempt.recovery?.history||[{at:attempt.finishedAt||attempt.startedAt,event:attempt.status,error:attempt.reason||''}];}
// An explicit resume restarts an unfinished local step through normal preflight.
// AI checkpoints and target selection retain their specialized recovery paths.
export function interruptedRequest(state,attempt){
 if(!failedAttempt(attempt)||!['stopped','interrupted','running'].includes(attempt.status)||attempt.kind==='planning'||attempt.aiRecovery||attempt.targetRecovery)throw Error('This attempt cannot restart here. Open its current recovery action.');
 if(state.attempts?.some(a=>a.retryOf===attempt.id))throw Error('This attempt already has a newer continuation. Open the latest attempt to continue.');
 const context={message:attempt.question,branchFeatureName:attempt.branchFeatureName||null,nodeId:attempt.nodeId,...attempt.retryContext};
 if(typeof context.message!=='string'||!context.message.trim())throw Error('The saved request is unavailable. Ask a new question without replacing your draft.');
 return context;
}
