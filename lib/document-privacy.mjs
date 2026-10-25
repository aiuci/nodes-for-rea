// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Connection stores, browser profiles and environment files are never collected.
// This also removes recognizable credentials that occur inside research text.
const secretKey=/^(?:password|passwd|client[-_]?secret|access[-_]?token|refresh[-_]?token|api[-_]?key|private[-_]?key|connectionSecret|gatewayToken|bearerToken|sessionToken|authToken|reaToken|tokenEncrypted|passwordEncrypted|secretEncrypted|token|secret)$/i;
export function redactText(value){
  let count=0;const replace=(pattern,replacement)=>{value=value.replace(pattern,(...args)=>{count++;return typeof replacement==='function'?replacement(...args):replacement;});};
  replace(/-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----[\s\S]*?-----END (?:[A-Z ]*PRIVATE KEY)-----/g,'[credential removed]');
  replace(/\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,'[credential removed]');
  replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=-]{16,}/gi,'[authorization removed]');
  replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|set-cookie|cookie)\s*["']?\s*[:=]\s*)[^\r\n,;}]+/gi,(_all,key)=>`${key}[credential removed]`);
  replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi,(_all,scheme)=>`${scheme}[credentials removed]@`);
  replace(/([?&](?:token|key|api_key|access_token|auth|secret|password)=)[^&#\s"']+/gi,(_all,key)=>`${key}[credential removed]`);
  return {text:value,count};
}
export function scrubCredentials(value,{paths=[]}={}){
  let count=0;
  const walk=(v,key='')=>{
    if(typeof v==='string'&&v&&(secretKey.test(key)||/^(?:authorization|proxy[-_]?authorization)$/i.test(key)&&/^(?:Bearer |Basic |[A-Za-z0-9+/_=-]{16,}$)/i.test(v))){count++;return '[credential removed]';}
    if(typeof v==='string'){const r=redactText(v);count+=r.count;let text=r.text;for(const p of paths)for(const variant of new Set([p,p.replaceAll('\\','/'),p.replaceAll('/','\\')]))if(variant){const pattern=new RegExp(variant.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');text=text.replace(pattern,'[local source path withheld]');}return text;}
    if(Array.isArray(v))return v.map(x=>walk(x));
    if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x,k)]));
    return v;
  };
  return {value:walk(value),count};
}
export function scrubSnapshot(raw,options){
  const text=raw.toString('utf8');try{const value=JSON.parse(text),r=scrubCredentials(value,options);return {data:r.count||options?.paths?.some(p=>text.includes(p))?Buffer.from(JSON.stringify(r.value,null,2)):raw,count:r.count};}catch{const r=scrubCredentials(text,options);return {data:Buffer.from(r.value),count:r.count};}
}
