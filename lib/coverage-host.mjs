// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {summarizeUsage} from './coverage-plan.mjs';
export function installCoverageHost({handle,store}){
 handle('coverage-usage',async id=>{
  await store.read(id);const file=path.join(store.directory(id),'reasoning-usage.jsonl');let text;
  try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.size>8*1024*1024)throw Error('The saved usage log cannot be summarized here.');text=await fs.readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return summarizeUsage([]);throw error;}
  return summarizeUsage(text.split(/\r?\n/).filter(line=>line.trim()).map(line=>{try{return JSON.parse(line)}catch{return {usage:null}}}));
 });
}
