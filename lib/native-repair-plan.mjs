// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Repair only a measured tool problem. Unknown host protection is not a reason
// to download another copy of an otherwise working toolchain.
export function nativeRepairPlan(result){
 const components=result.diagnostic?.components||[],get=name=>components.find(c=>c.id==='ghidra:'+name),state=name=>get(name)?.state;
 if(result.workingFolder?.state==='unavailable')return {kind:'diagnose',reason:'The Nodes working folder did not pass its write/read/cleanup check. Review its permissions and local diagnosis; reinstalling Ghidra will not repair this.'};
 if(result.nativeCheckAvailable)return {kind:'verify'};
 for(const name of ['platform','architecture'])if(['incompatible','unavailable'].includes(state(name)))return {kind:'diagnose',reason:'This host or architecture needs diagnosis. Installing Ghidra will not repair this check.'};
 const toolNames=['configuration','installation','version','headless'];
 if(toolNames.some(n=>['missing','incompatible'].includes(state(n)))||!components.length)return {kind:'component',component:'ghidra'};
 if(toolNames.every(n=>state(n)==='ready')&&state('native_decompiler')==='ready'&&state('java')!=='ready')return {kind:'component',component:'jdk'};
 if(toolNames.every(n=>state(n)==='ready')&&state('java')==='ready')return {kind:'diagnose',reason:'Windows analysis protections or the native decompiler need diagnosis. Their unknown, unsupported or rejected state is not evidence that Ghidra needs reinstalling. Review the measured protection/decompiler check and working-folder details.'};
 return {kind:'diagnose',reason:'The engine has not established which component needs repair. Review the unknown check in Technical details or copy the setup report; no blind reinstall is proposed.'};
}
