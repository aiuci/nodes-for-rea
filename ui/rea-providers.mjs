// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
export function providerSummaries(capabilities){
  return Object.entries(capabilities||{}).flatMap(([key,value])=>{
    if(key==='tools'||value==null)return [];
    const object=typeof value==='object',name=object?(value.name||value.id||value.provider_id||key.replaceAll('_',' ')):key.replaceAll('_',' ');
    const status=typeof value==='boolean'?(value?'Available':'Unavailable'):typeof value==='string'?value:object?(value.availability?.status||(value.available===true?'Available':value.available===false?'Unavailable':value.status||'Unknown')):'';
    const reason=object?(value.availability?.reason||value.reason):'';
    return status?[`${name}: ${status}${reason?` · ${reason}`:''}`]:[];
  });
}
