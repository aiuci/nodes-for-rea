// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nativeRepairPlan} from './native-repair-plan.mjs';
import {nativeArtifacts,downloadTool,extractTool,safeToolRoot,managedTool} from './tool-acquisition.mjs';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Effects are explicit dependencies so approval, cancellation and races can be
// tested without downloading dependencies or touching the person's installation.
export async function repairNative({readiness,connection,root,approve,pick,signal,onProgress=()=>{},download=downloadTool,extract=extractTool,findCompatible=async()=>null,checkCandidate,validateContext,platform=process.platform,arch=process.arch}){
 const before=await readiness(signal);if(platform!=='win32'||arch!=='x64')throw Error('Automatic native setup currently supports Windows x64. Keep your current tools and copy the diagnostic report for this architecture.');
 if(before.diagnostic?.policy?.releaseLine!=='12.1.x')throw Error('This engine has no reviewed 12.1.x installation policy. No download or configuration change was made.');
 if(before.nativeCheckAvailable)return before;
 const plan=nativeRepairPlan(before);if(plan.kind==='diagnose')throw Error(plan.reason);
 const component=plan.component,artifact=nativeArtifacts[component];
 const previous=await connection.read(),selectedContext=hash(before.context),configuration=hash(previous);
 const fresh=async()=>{signal?.throwIfAborted();if(hash(await connection.read())!==configuration)throw Error('Tool settings changed. Test REA again before approving this setup.');const now=validateContext?await validateContext(signal):await readiness(signal);if(hash(now.context)!==selectedContext)throw Error('The selected application changed. Test REA again; nothing else will be installed.');};
 const tools=path.join(root,'tools'),detail=`${artifact.name} ${artifact.version}\nOfficial source: ${artifact.source}\n${artifact.url}\nDownload: ${(artifact.bytes/1024**2).toFixed(1)} MiB ZIP\nSHA-256: ${artifact.sha256}\nDestination: ${tools}\nUser-local extraction; no administrator permission, system PATH change, credentials or target execution.\nLicense: ${artifact.license}. Vendor license files stay in the installation.\nCompatible existing installations are preferred. Java is not assumed absent when unconfirmed.`;
 const reusable=await managedTool(tools,artifact),detected=reusable?null:await findCompatible(component,{signal});const choice=await approve('Review native setup',detail+(reusable?'\nExisting extracted component: '+reusable:detected?'\nCompatible existing installation verified through REA: '+detected.path+' ('+detected.source+')':''),['Cancel','Use existing folder',reusable?'Reuse extracted component':detected?'Use verified existing installation':'Download this component']);if(choice===0)return {...before,canceled:true};let folder;
 if(choice===1){folder=await pick(component);if(!folder)return {...before,canceled:true};await fresh();}
 else if(reusable){folder=reusable;onProgress({state:'Installed',component:artifact.name});await fresh();}
 else if(detected){folder=detected.path;onProgress({state:'Checking',component:artifact.name});await fresh();}
 else{
  await fresh();await safeToolRoot(tools);onProgress({state:'Downloading',component:artifact.name,loaded:0,total:artifact.bytes});
  const archive=await download(artifact,path.join(tools,'downloads'),{signal,onProgress});
  try{await fresh();if(await approve('Extract verified component',`Download verified.\n${detail}\nExtract into a new separate folder? Existing tool folders will not be replaced.`,['Cancel','Extract component'])!==1)return {...before,canceled:true};await fresh();folder=await extract(archive,tools,artifact,{signal,onProgress});onProgress({state:'Installed',component:artifact.name});}finally{await fs.unlink(archive).catch(()=>{});}
 }
 await fresh();const candidateStatus=checkCandidate?await checkCandidate(component,folder,signal):null;await fresh();const input={};for(const key of ['reaPath','browser','ghidraPath','javaHome'])if(previous[key])input[key]=previous[key];input[component==='ghidra'?'ghidraPath':'javaHome']=folder;
 if(await approve('Save local tool path',`${artifact.name}: ${folder}\nOnly this Nodes copy will use the selected folder. Other applications and system settings are unchanged. Save this path and recheck?`,['Cancel','Save path and recheck'])!==1)return {...before,canceled:true,installedPath:folder};await fresh();
 // Saving paths is not native readiness. saveVerified probes only engine startup;
 // the next task-aware check and explicit native operation determine readiness.
 await connection.saveVerified(input,signal,candidateStatus?{checkedStatus:candidateStatus}:undefined);onProgress({state:'Checking',component:artifact.name});const after=await readiness(signal);return {...after,repair:{component,installed:choice===2&&!reusable,reused:!!reusable,verification:'Not verified until an explicit target operation passes'}};
}
