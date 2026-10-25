// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// Recover the original contiguous excerpt when a model reflows whitespace.
// Never normalize words, punctuation, case, or omitted text.
export function sourceQuote(text,quote){
  if(typeof text!=='string'||typeof quote!=='string'||!quote.trim())return null;
  if(text.includes(quote))return quote;
  const words=quote.trim().split(/\s+/u);
  const pattern=words.map(word=>word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');
  return text.match(new RegExp(pattern,'u'))?.[0]??null;
}
