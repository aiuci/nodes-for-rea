// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Pure projection of a retained REA check. Tool advertisements, path existence,
// diagnostic prose and successful AI sign-in are not provider-readiness proof.
import {nativeComponents,setupDiagnostic} from './setup-diagnostics.mjs';
const knownState=value=>value===true?'ready':value===false?'unavailable':'unknown';
const unique=values=>[...new Set(values.filter(Boolean))];
function checkedStatus(engine){
  if(engine?.status&&typeof engine.status.available==='boolean')return engine.status;
  if(typeof engine?.available==='boolean'&&engine.session)return engine;
  return null;
}
function operationEvidence(session,operation){
  const groups=[...(session.toolAvailability||[]),...(session.capabilities||[]).flatMap(item=>item.groups||[])];
  return groups.filter(group=>(group.names||group.operations||[]).some(value=>(typeof value==='string'?value:value?.name)===operation));
}
function operationCard(session,{id,label,operation,readyDetail}){
  const evidence=operationEvidence(session,operation),available=evidence.find(item=>item.available===true),unavailable=evidence.find(item=>item.available===false);
  return {id,label,state:available?'ready':unavailable?'unavailable':'unknown',detail:available?readyDetail:unavailable?'The engine reports this inspection route unavailable.':'Recheck the engine to establish this inspection route.',reason:unique(evidence.map(item=>item.reason)).join(' · '),remediation:unique(evidence.filter(item=>item.available!==true).map(item=>item.remediation)).join(' ')};
}
export function engineReadiness(engine={}){
  const status=checkedStatus(engine),session=status?.session||{},core=knownState(engine.available===false?false:status?.available);
  const origins={included:'REA engine included with Nodes',external:'Separately configured REA engine',missing:'No REA engine selected'},runtimes={'included-node':'Included Node.js runtime — no separate Node.js installation needed.','app-runtime':'Using this app’s runtime to run REA.','configured-runtime':'Using the runtime configured for this REA installation.','engine-executable':'Using the selected REA executable.','unavailable':'A usable REA launch has not been established.'};
  const installation={engine:origins[engine.provenance?.engine]||'REA engine selection not established',runtime:runtimes[engine.provenance?.runtime]||'The selected REA runtime has not been established.'};
  const cards=[{id:'engine-core',label:'REA engine · required for inspection',state:core,detail:core==='ready'?'The REA engine responded.':core==='unavailable'?'Nodes is running, but the REA engine could not complete its check. Investigations that need REA are paused.':'Check the REA engine before inspecting a target.',reason:status?.reason||engine.reason||'',remediation:core==='ready'?'':'Use the included engine if available, or choose a working REA installation in REA setup.'}];
  for(const specification of [
    {id:'javascript',label:'JavaScript and Electron',operation:'analyze_javascript_application',readyDetail:'The engine reports JavaScript application inspection available.'},
    {id:'web',label:'Websites',operation:'analyze_web_bundle',readyDetail:'The engine reports website inspection available. Private sign-ins remain separate.'},
    {id:'managed',label:'Managed applications',operation:'inspect_managed_artifact',readyDetail:'The engine reports managed inspection available.'},
    {id:'sqlite',label:'SQLite databases',operation:'inspect_sqlite_database',readyDetail:'The engine reports SQLite inspection available.'},
    {id:'archive',label:'Application archives',operation:'inspect_artifact',readyDetail:'The engine reports archive inspection available.'},
  ])cards.push(operationCard(core==='ready'?session:{},specification));
  const native=(core==='ready'?session.providers||[]:[]).filter(item=>['ghidra','ida','hopper'].includes(item.id));
  const available=native.find(item=>item.availability?.status==='available'&&(item.id!=='ghidra'||nativeComponents(session).every(check=>check.state==='ready')));
  const ghidra=native.find(item=>item.id==='ghidra'),candidate=ghidra||native.find(item=>item.availability?.status==='unavailable');
  const missing=['not_configured','executable_missing','runtime_missing'].includes(candidate?.availability?.code);
  const nativeState=core!=='ready'?'unknown':available?'ready':candidate?.availability?.status==='unavailable'?(missing?'missing':['unsupported_host','unsupported_version','architecture_unsupported'].includes(candidate.availability.code)?'incompatible':'unavailable'):'unknown';
  cards.push({id:'native',label:'Native decompilation',providerId:available?.id||null,state:nativeState,optional:true,detail:available?`${available.name||available.id} is available. Target compatibility is checked when you choose an application.`:nativeState==='unknown'?'REA native-provider readiness has not been established.':'REA needs a separate native analysis provider for this capability. It is not required to open Nodes or use available JavaScript and website routes.',reason:available?'':candidate?.availability?.reason||'',remediation:available?'':candidate?.availability?.remediation||candidate?.availability?.reason||'Open REA setup to check your native analysis provider.',links:!available?[{label:'Official Ghidra releases and installation instructions',url:'https://github.com/NationalSecurityAgency/ghidra/releases'}]:[]});
  const result={ready:core==='ready',installation,summary:core==='ready'?(available?'REA inspection engine ready.':nativeState==='unknown'?'REA inspection engine ready; native provider readiness is not established.':'REA inspection engine ready; native decompilation needs separate REA tools.'):'Check the inspection engine before investigating. This is REA readiness, separate from your Nodes agent connection.',cards,limitations:['Engine readiness is not proof that a particular target can be inspected.','Native providers are optional for JavaScript and website work. No provider is installed by this check.']};
  result.diagnostic=setupDiagnostic(result,session);return result;
}
