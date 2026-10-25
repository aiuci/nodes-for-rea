// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const clean=value=>String(value||'').replace(/[\x00-\x1f]/g,' ').trim();
const pathLike=value=>/^(?:[a-z]:[\\/]|\\\\|\/|file:\/\/)/i.test(value);
function locationName(value){
  const text=clean(value).replace(/^["']|["']$/g,'');
  if(/^https?:\/\//i.test(text)){try{return new URL(text).hostname;}catch{return '';}}
  if(!pathLike(text))return '';
  const parts=text.replace(/[\\/]+$/,'').split(/[\\/]/).filter(Boolean);
  return parts.at(-1)||text;
}
export function shortenHistoryPath(value,limit=76){
  const text=clean(value);if(text.length<=limit)return text;
  const parts=text.split(/[\\/]/),separator=text.includes('\\')?'\\':'/';
  const tail=parts.slice(-3).join(separator),prefix=/^[a-z]:/i.test(text)?text.slice(0,2):text.startsWith('\\\\')?'\\\\':'';
  const compact=prefix+separator+'…'+separator+tail;
  if(compact.length<=limit)return compact;
  return text.slice(0,20)+'…'+text.slice(-(limit-21));
}
export function historyPresentation(item){
  const original=clean(item.title),unquoted=original.replace(/^["']|["']$/g,'');
  const source=clean(item.sources),location=clean(item.documentPath)||source||(pathLike(unquoted)?unquoted:'');
  const title=locationName(unquoted)||(!original||original==='New investigation'?locationName(source):original)||'New investigation';
  const date=new Date(item.updatedAt),valid=Number.isFinite(date.getTime());
  const savedAt=valid?date.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Save time unavailable';
  return {title,shortId:clean(item.shortId||item.id?.slice(0,8)),savedAt,dateTime:valid?date.toISOString():null,location,locationLabel:item.documentPath?'Document':'Source',shortLocation:shortenHistoryPath(location),originalTitle:original};
}
