import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {InvestigationStore} from '../lib/investigation.mjs';
test('readable names and folder index stay current without changing identifiers or evidence paths',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-names-'));assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const store=new InvestigationStore(root),state=await store.create();state.title='A focused substep';state.messages=[{id:'map',role:'assistant',title:'Product <A> & B',features:[{name:'Feature'}]}];state.targets=[{locator:'https://example.com'}];await store.save(state);
  const [listed]=await store.list();assert.equal(listed.title,'Product <A> & B');assert.equal(listed.shortId,state.id.slice(0,8));assert.equal(listed.sources,'https://example.com');assert.ok((await fs.readFile(path.join(root,'START HERE.html'),'utf8')).includes('Product &lt;A&gt; &amp; B'));assert.ok((await fs.readFile(path.join(store.directory(state.id),'ABOUT.txt'),'utf8')).includes(state.id));
  if(process.platform==='win32')assert.ok((await fs.readFile(path.join(store.directory(state.id),'desktop.ini'),'utf16le')).includes(`Product <A> & B [${listed.shortId}]`));
  state.savedName='My comparison';await store.save(state);assert.equal((await store.list())[0].title,'My comparison');assert.equal((await store.read(state.id)).id,state.id);
});
