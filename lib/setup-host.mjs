// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {engineReadiness} from './setup-readiness.mjs';
import {nativeCheckSummary,setupDiagnostic} from './setup-diagnostics.mjs';
import {probeReaConnection} from './rea-client.mjs';
import {readNativePolicy} from './native-setup-check.mjs';
import {preflightDiagnostic} from './preflight.mjs';
import {checkInspectionRoute} from './setup-route-check.mjs';
import {repairNative} from './native-repair.mjs';
import {nativeRepairPlan} from './native-repair-plan.mjs';
import {discoverToolCandidates} from './tool-discovery.mjs';
import {investigationSetupContext} from './setup-flow.mjs';
import {setupFlow} from './setup-presentation.mjs';
import {classifyTarget} from './targets.mjs';
export function installSetupHost({handle,setup,connection,reaConnection,nativeCheck,store,getCurrent,dialog,getWindow,clipboard,setupReport,system,captureBrowser,classify=classifyTarget,discover=discoverToolCandidates,repair=repairNative,onProgress:sendProgress=()=>{},probe=probeReaConnection}){
 let session=0;const onProgress=event=>sendProgress({...event,session});
 let latest=null,routeProof=null,explicitTarget=null,explicitOwner=null,explicitBasis=null,probeCache=null,folderCheck=null,launchPending=false;
 const key=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),routeKey=(context,config)=>key({context,config});
 const begin=work=>setup(async signal=>{session++;probeCache=null;folderCheck=null;try{return await work(signal);}finally{launchPending=false;}});
 async function scope(){const id=getCurrent(),state=id?await store.read(id):null,basis=key({selected:state?.attempts?.findLast(a=>a.targetRecovery?.selected&&!a.targetRecovery.continuedAt)?.targetRecovery?.selected,targets:state?.targets,preflight:state?.preflight?.targets});if(explicitOwner!==id||explicitBasis&&explicitBasis!==basis)explicitTarget=null;explicitOwner=id;explicitBasis=basis;return investigationSetupContext(state,explicitTarget,{classify});}
 async function checkFolder(){if(folderCheck)return folderCheck;let folder;try{await fs.mkdir(path.dirname(nativeCheck.file),{recursive:true});folder=await fs.mkdtemp(path.join(path.dirname(nativeCheck.file),'setup-write-check-'));const f=path.join(folder,'owned');await fs.writeFile(f,'Nodes setup check',{flag:'wx'});if(await fs.readFile(f,'utf8')!=='Nodes setup check')throw Error('Working folder readback did not match.');return folderCheck={state:'ready',detail:'Nodes created, read and removed its own temporary working file.'};}catch(e){return folderCheck={state:'unavailable',detail:'Nodes could not verify its working folder: '+String(e.message).slice(0,300)};}finally{if(folder)await fs.rm(folder,{recursive:true,force:true});}}
 async function readiness(signal){
  signal.throwIfAborted();const selected=await scope(),engine=await reaConnection.view(),config=await reaConnection.config(),configKey=key(config);
  onProgress({row:'application',state:selected.kind==='target'?'Identified':'Pending',detail:selected.label});
  let checked;if(probeCache?.key===configKey)checked=probeCache.value;else{onProgress({type:'snapshot',result:{context:selected,cards:[{id:'engine-core',state:'unknown'}],diagnostic:{components:[],verification:{state:'unknown'}}}});onProgress({row:'core',state:'Checking'});checked=await probe(config,{signal});signal.throwIfAborted();probeCache={key:configKey,value:checked};}
  const result=engineReadiness({...engine,status:checked}),results=[];
  for(const target of selected.nativeTargets)results.push(await nativeCheck.current(target,config,checked.session));
  const verification=launchPending?{state:'unknown'}:nativeCheckSummary(results);
  result.diagnostic=setupDiagnostic(result,checked.session,{requirements:selected.requirements,verification,policy:await readNativePolicy(config)});
  result.diagnostic.scope={kind:selected.kind,requirements:selected.requirements};if(selected.kind==='unresolved'){result.diagnostic.status='blocked';result.diagnostic.summary='Choose the application before checking its required inspection tools.';result.diagnostic.nextAction='Choose an application file. The engine check alone does not verify this folder.';}
  result.summary=result.diagnostic.summary;result.context=selected;result.operationCheck=routeProof?.key===routeKey(selected,config)&&Date.now()-routeProof.time<600000?routeProof.result:{state:'unknown'};
  result.diagnostic.routeVerification={state:result.operationCheck.state,checkedAt:result.operationCheck.checkedAt||null};
  result.localToolChecks=(checked.session?.providers||[]).filter(p=>p.id==='ghidra').flatMap(p=>(p.availability?.diagnostics?.checks||[]).slice(0,16).map(c=>({name:preflightDiagnostic(c.name),code:preflightDiagnostic(c.code),detail:preflightDiagnostic(c.detail)})));
  result.localDiagnostic=verification.localDetail||'';result.workingFolder=selected.nativeTargets.length?await checkFolder():null;result.diagnostic.workingFolder=result.workingFolder?{state:result.workingFolder.state}:null;
  result.nativeCheckAvailable=result.cards.find(card=>card.id==='native')?.state==='ready';latest={...result,setupSession:session,bundled:await reaConnection.bundled()};
  for(const row of setupFlow(latest).rows)onProgress({row:row.id,state:row.state,detail:row.detail});onProgress({type:'snapshot',result:latest});return latest;
 }
 const approval=async(title,detail,buttons)=>(await dialog.showMessageBox(getWindow(),{type:'question',title,message:title,detail,buttons,defaultId:0,cancelId:0,noLink:true})).response;
 async function verifyNative(signal,before,{approved=false}={}){
  before||=await readiness(signal);if(!before.nativeCheckAvailable)throw Error('Native prerequisites are missing or not checked. Review the component checks before verifying inspection.');if(before.workingFolder?.state!=='ready')throw Error('The Nodes working folder needs attention before static inspection.');
  const selected=await scope();let target=selected.nativeTargets.length===1?selected.nativeTargets[0]:null;
  if(!target){const picked=await dialog.showOpenDialog(getWindow(),{title:'Choose a native application for a static check',properties:['openFile'],filters:[{name:'Native application',extensions:['exe','dll']}]});if(picked.canceled)return {...before,canceled:true};target=await classify(picked.filePaths[0]);}
  explicitTarget=target.root;explicitOwner=getCurrent();if(target.targetType!=='native')throw Error('This target uses a different inspection route. Native tools are not required for it.');
  if(!approved&&await approval('Verify native static inspection',`Target: ${target.root}\nNodes will ask REA to open this file, read an overview, confirm its provider and close the temporary session (up to ${Math.ceil((nativeCheck.timeoutMs||360000)/60000)} minutes). The inspected application is not executed. No AI, download, installation or path change is approved. Your request and draft stay unchanged.`,['Cancel','Verify static inspection'])!==1)return {...before,canceled:true,canceledRow:'operation'};
  signal.throwIfAborted();const contextKey=key(await scope()),config=await reaConnection.config();onProgress({row:'operation',state:'Checking'});const verified=await nativeCheck.run(target,config,probeCache.value.session,{signal});
  if(signal.aborted)return {...before,canceled:true,canceledRow:'operation',verification:verified};if(key(await scope())!==contextKey||key(await reaConnection.config())!==key(config))throw Error('The target or settings changed during verification. Recheck this application.');launchPending=false;return {...await readiness(signal),verification:verified};
 }
 async function checkCandidate(component,folder,signal){
  signal.throwIfAborted();const config=await reaConnection.config(),candidate={...config,reaEnv:{...config.reaEnv,[component==='ghidra'?'GHIDRA_INSTALL_DIR':'JAVA_HOME']:folder}};
  onProgress({row:component==='ghidra'?'provider':'jdk',state:'Checking',component:component==='ghidra'?'Ghidra':'Full JDK'});
  const checked=probeCache?.key===key(candidate)?probeCache.value:await probe(candidate,{signal});signal.throwIfAborted();const components=engineReadiness({available:true,status:checked}).diagnostic.components;
  const names=component==='ghidra'?['configuration','installation','version','headless','native_decompiler']:['java'];
  if(!checked.available||names.some(n=>components.find(c=>c.id==='ghidra:'+n)?.state!=='ready'))throw Error(`The selected ${component==='ghidra'?'Ghidra':'full JDK'} did not pass the selected REA engine's component checks. Keep the current paths; review the incompatible or unknown check.`);
  probeCache={key:key(candidate),value:checked};return checked;
 }
 async function findCompatible(component,{signal}){
  const settings=await reaConnection.read(),config=await reaConnection.config(),rows=await discover(component,{settings,env:process.env,overrideEnv:config.reaEnv,toolsRoot:path.join(path.dirname(nativeCheck.file),'tools')});
  for(const row of rows.slice(0,6)){signal.throwIfAborted();try{await checkCandidate(component,row.path,signal);return row;}catch(error){if(signal.aborted)throw error;}}
  return null;
 }
 handle('setup-entry',async()=>{const context=await scope(),state=getCurrent()?await store.read(getCurrent()):null;return {context,blocked:state?.preflight?.status==='blocked'};});
 handle('setup-check',target=>begin(async signal=>{if(typeof target==='string'){explicitTarget=target;explicitOwner=getCurrent();explicitBasis=null;}return readiness(signal);}));
 async function repairAndVerify(signal,current,options){
  current||=await readiness(signal);const initialPlan=nativeRepairPlan(current);if(initialPlan.kind==='diagnose')return {...current,repairDiagnosis:initialPlan.reason};const visited=new Set();
  for(let i=0;i<3&&!current.nativeCheckAvailable;i++){
   const plan=nativeRepairPlan(current);if(plan.kind==='diagnose')return {...current,repairDiagnosis:plan.reason};if(visited.has(plan.component))return {...current,repairDiagnosis:'That component still did not pass. Review its measured diagnosis; another download is not proposed.'};visited.add(plan.component);
   const row=plan.component==='ghidra'?'provider':'jdk';
   current=await repair({readiness,connection:reaConnection,root:path.dirname(nativeCheck.file),signal,onProgress:event=>onProgress({...event,row}),checkCandidate,findCompatible,validateContext:async()=>({context:await scope()}),approve:approval,pick:async component=>{const picked=await dialog.showOpenDialog(getWindow(),{title:component==='ghidra'?'Choose existing Ghidra folder':'Choose existing full JDK folder',properties:['openDirectory']});return picked.canceled?null:picked.filePaths[0];}});
   if(current.canceled)return {...current,canceledRow:row};
  }
  return current.nativeCheckAvailable?verifyNative(signal,current,options):current;
 }
 handle('setup-repair',()=>begin(signal=>repairAndVerify(signal)));
 // The explicit Start REA command authorizes this bounded read-only check.
 // Acquisition/path changes still use the existing effect-specific approvals.
 handle('setup-launch',target=>begin(async signal=>{
  launchPending=true;routeProof=null;
  if(typeof target==='string'){explicitTarget=target;explicitOwner=getCurrent();explicitBasis=null;}
  let context=await scope();
  if(context.kind!=='target'||context.targets.length!==1){
   const picked=await dialog.showOpenDialog(getWindow(),{title:'Choose an application for REA to verify',properties:['openFile']});
   signal.throwIfAborted();if(picked.canceled)return {...await readiness(signal),canceled:true,canceledRow:'application'};
   explicitTarget=picked.filePaths[0];explicitOwner=getCurrent();explicitBasis=null;
  }
  const before=await readiness(signal);context=before.context;
  if(before.cards.find(c=>c.id==='engine-core')?.state!=='ready'||context.kind!=='target')return before;
  if(context.nativeTargets.length)return repairAndVerify(signal,before,{approved:true});
  if(before.cards.some(c=>context.requirements.includes(c.id)&&c.state!=='ready'))return before;
  const config=await reaConnection.config(),bound=routeKey(context,config);
  routeProof=null;onProgress({row:'operation',state:'Checking'});
  const result=await checkInspectionRoute(context.targets[0],{...config,captureBrowser},{root:path.dirname(nativeCheck.file),signal});
  if(routeKey(await scope(),await reaConnection.config())!==bound)throw Error('Target or settings changed. Recheck this application.');
  routeProof={key:bound,time:Date.now(),result};launchPending=false;return readiness(signal);
 }));
 handle('setup-route-check',()=>begin(async signal=>{const before=await readiness(signal),context=await scope();if(context.kind!=='target'||context.targets.length!==1||context.nativeTargets.length)throw Error('Choose one supported application for this check.');if(await approval('Verify application inspection',`Target: ${context.label}\nOne bounded static read in an ephemeral session, up to75 seconds. No AI, target execution, download or settings change.`,['Cancel','Verify inspection'])!==1)return {...before,canceled:true,canceledRow:'operation'};const config=await reaConnection.config(),bound=routeKey(context,config);onProgress({row:'operation',state:'Checking'});const result=await checkInspectionRoute(context.targets[0],{...config,captureBrowser},{root:path.dirname(nativeCheck.file),signal});if(routeKey(await scope(),await reaConnection.config())!==bound)throw Error('Target or settings changed. Recheck this application.');routeProof={key:bound,time:Date.now(),result};return readiness(signal);}));
 handle('setup-resume-info',async()=>{const context=await scope();return context.request?{id:context.investigationId,request:context.request}:null;});
 handle('setup-native-check',()=>begin(signal=>verifyNative(signal)));
 handle('setup-report',async()=>{clipboard.writeText(JSON.stringify(setupReport({ai:await connection.view(),engine:latest,...system()}),null,2));return true;});
 return {readiness};
}
