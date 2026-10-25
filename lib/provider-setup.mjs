// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Provider-level launch evidence is separate from this computer's connection check.
// A local login or model-response probe never upgrades release verification.
export const PROVIDER_SETUP=Object.freeze({
 codex:Object.freeze({label:'Codex',releaseStatus:'tested-path',notice:'Launch path tested with Codex 0.163.0-alpha.11 on Windows 10: real REA finding, save and reopen. Your selected installation is checked separately.',connectionKind:'cli'}),
 claude:Object.freeze({label:'Claude Code',releaseStatus:'experimental',notice:'Experimental, not yet verified. The complete REA finding, save and reopen journey has not been verified for this provider.',connectionKind:'cli'}),
 openclaw:Object.freeze({label:'OpenClaw',releaseStatus:'experimental',notice:'Experimental, not yet verified. The complete REA finding, save and reopen journey has not been verified for this provider.',connectionKind:'gateway'})
});
export function providerSetup(provider,{configured=false,readiness={},needsToken=false}={}){
 const definition=Object.hasOwn(PROVIDER_SETUP,provider)?PROVIDER_SETUP[provider]:null;if(!definition)return {provider:'unknown',releaseStatus:'unsupported',notice:'This provider is not supported in this release.',steps:[]};
 readiness||={};const cli=definition.connectionKind==='cli',version=/^[0-9][a-zA-Z0-9.+-]{0,70}$/.test(readiness.version||'')?readiness.version:null;
 const detectState=cli?(readiness.installation==='available'?'available':readiness.installation==='unavailable'?'unavailable':'unknown'):configured?'configured':'unknown';
 const checkState=['reachable','failed'].includes(readiness.state)?readiness.state:'unknown';
 const repair=needsToken?'enter-token':readiness.authentication==='signed-out'||readiness.code==='sign-in'?'sign-in':cli?'choose-agent':'review-gateway';
 return {provider,releaseStatus:definition.releaseStatus,notice:definition.notice,steps:[
  {id:'detect',label:'Detect',state:detectState,detail:cli?version?`Installed version ${version}.`:'Installed version has not been confirmed.':configured?'A gateway address is saved. Its service version has not been confirmed.':'Configure the gateway address; no gateway has been detected.'},
  {id:'check',label:'Check',state:checkState,detail:checkState==='reachable'?'Account service reached without an AI request. A model response is still untested by this check.':checkState==='failed'?'The selected connection did not pass its check. Your saved work is kept.':provider==='codex'?'Check the selected agent without requesting a model response.':'A free live service check is not available for this provider. Model access remains unverified.'},
  {id:'repair',label:'Repair',state:needsToken||checkState==='failed'?'needed':'available',action:repair,detail:repair==='enter-token'?'Enter the gateway token again on this computer.':repair==='sign-in'?'Use the official sign-in action below, then check again.':cli?'Choose an installed agent below, or use its official setup link.':'Review the gateway address, certificate and token in Advanced. Saved requests are retained.'},
  {id:'diagnose',label:'Diagnose',state:'available',action:'copy-diagnostics',detail:'Copy measured states and unknowns. Account details, tokens, paths and raw output are excluded.'}
 ]};
}
