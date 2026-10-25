import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {installCoverageHost} from '../lib/coverage-host.mjs';
test('usage IPC validates the investigation, returns aggregate counts only and never modifies the log',async t=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-coverage-usage-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));let handler;const store={read:async id=>{if(id!=='owned')throw Error('Unknown investigation')},directory:()=>root};installCoverageHost({handle:(name,fn)=>{assert.equal(name,'coverage-usage');handler=fn},store});assert.equal((await handler('owned')).input,null);await assert.rejects(handler('../outside'),/Unknown/);const file=path.join(root,'reasoning-usage.jsonl'),text=JSON.stringify({usage:{input_tokens:20,output_tokens:4}})+'\n{partial\n';await fs.writeFile(file,text);const result=await handler('owned');assert.equal(result.input,20);assert.equal(result.output,4);assert.equal(result.unknown,1);assert.equal(await fs.readFile(file,'utf8'),text);assert.ok(!JSON.stringify(result).includes('partial'));await fs.truncate(file,9*1024*1024);await assert.rejects(handler('owned'),/cannot be summarized/)});
