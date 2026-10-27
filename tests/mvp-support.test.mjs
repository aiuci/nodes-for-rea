import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {InvestigationStore} from '../lib/investigation.mjs';
import {publicUrl} from '../lib/sources.mjs';
import {runJSON} from '../lib/providers.mjs';
import {withAiRecovery} from '../lib/ai-recovery.mjs';

async function owned(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-support-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}

test('damaged view remains in History with intact research and explicit recovery; next view save backs up original bytes',async t=>{
 const root=await owned(t),store=new InvestigationStore(root),state=await store.create();state.title='Retained research';state.draft='Canonical draft';state.messages=[{id:'a',role:'assistant',answer:'Saved answer'}];await store.save(state);
 const research=await fs.readFile(path.join(store.directory(state.id),'investigation.json'));
 const view=path.join(store.directory(state.id),'workspace.json'),damaged=Buffer.from('{broken view');await fs.writeFile(view,damaged);
 const list=await store.list();assert.equal(list.length,1);assert.equal(list[0].workspaceRecovery.status,'recovered');
 const reopened=await store.read(state.id);assert.equal(reopened.title,state.title);assert.equal(reopened.draft,state.draft);assert.deepEqual(reopened.messages,state.messages);assert.equal(reopened.workspaceRecovery.status,'recovered');assert.deepEqual(await fs.readFile(view),damaged);
 await store.updateWorkspace(state.id,{draft:'New draft',workspace:{outline:false}});
 const backups=(await fs.readdir(store.directory(state.id))).filter(name=>name.startsWith('workspace-damaged-'));assert.equal(backups.length,1);assert.deepEqual(await fs.readFile(path.join(store.directory(state.id),backups[0])),damaged);
 assert.deepEqual(await fs.readFile(path.join(store.directory(state.id),'investigation.json')),research);
 const fixed=await store.read(state.id);assert.equal(fixed.draft,'New draft');assert.equal(fixed.workspaceRecovery,undefined);
});

test('view permission failures and damaged canonical research remain explicit errors',async t=>{
 const root=await owned(t),store=new InvestigationStore(root),state=await store.create(),read=fs.readFile;
 fs.readFile=async(file,...args)=>{if(file===path.join(store.directory(state.id),'workspace.json'))throw Object.assign(Error('Owned permission failure'),{code:'EACCES'});return read(file,...args);};
 try{await assert.rejects(store.read(state.id),error=>error.code==='EACCES');}finally{fs.readFile=read;}
 await fs.writeFile(path.join(store.directory(state.id),'investigation.json'),'{bad research');await assert.rejects(store.read(state.id),SyntaxError);
});

async function handlers(){
 const source=await fs.readFile(new URL('../main.cjs',import.meta.url),'utf8'),registered={};
 const context=vm.createContext({AbortController,active:null,setupController:null,draftQueue:Promise.resolve(),handle:(name,fn)=>registered[name]=fn,version:{assertCurrent(){}},portableMode:false,distributedMode:false,collectionIntent:()=>false,deletedIds:new Set(),store:{read:async()=>({id:'owned',messages:[]}),updateWorkspace:async()=>{}},getConfig:async()=>({}),investigator:{turn:async()=>{}},agentAccess:{refresh:async()=>{}},wakeIdleMessages:async()=>{},window:{isDestroyed:()=>true}});
 vm.runInContext("function idle(){if(active)throw Error('busy');}",context);
 for(const [start,end]of [["handle('turn',","\n  });"],["handle('draft',","handle('workspace',"],["handle('audit',","handle('export-graph',"],["handle('finalize',","handle('verify',"],["handle('verify',","handle('connection-info',"],["handle('agent-start',","handle('agent-pause',"]]){
  const begin=source.indexOf(start),finish=source.indexOf(end,begin);
  assert.ok(begin>=0&&finish>begin,`Handler fixture boundaries exist: ${start}`);
  vm.runInContext(source.slice(begin,finish+(end==="\n  });"?end.length:0)),context);
 }
 return {registered,context};
}
test('turn owns admission before asynchronous preparation; Stop during preparation prevents model dispatch',async()=>{
 const {registered,context}=await handlers();let release,calls=0;context.draftQueue=new Promise(resolve=>release=resolve);context.investigator.turn=async()=>{calls++;};
 const first=registered.turn('owned','one',undefined,{preserveDraft:true});await assert.rejects(registered.turn('owned','two'),/busy/);assert.ok(context.active);context.active.abort();release();await assert.rejects(first,/abort|stopped/i);assert.equal(calls,0);assert.equal(context.active,null);
});
test('turn failure releases its own guard and a newer owner cannot be cleared by an old completion',async()=>{
 const {registered,context}=await handlers();let finish;context.investigator.turn=async()=>new Promise(resolve=>finish=resolve);
 const first=registered.turn('owned','one',undefined,{preserveDraft:true});await new Promise(resolve=>setImmediate(resolve));const newer=new AbortController();context.active=newer;finish();await first;assert.equal(context.active,newer);
 context.active=null;context.store.read=async()=>{throw Error('Owned read failure');};await assert.rejects(registered.turn('owned','one'),/Owned read failure/);assert.equal(context.active,null);
});
test('draft reports write failure but keeps shared queue usable; the next draft can save',async()=>{
 const {registered,context}=await handlers();context.store.updateWorkspace=async()=>{throw Error('Owned disk failure');};await assert.rejects(registered.draft('owned','keep me'),/disk failure/);await context.draftQueue;
 let saved;context.store.updateWorkspace=async(_id,patch)=>{saved=patch.draft;};await registered.draft('owned','retry me');assert.equal(saved,'retry me');
});
for(const name of ['audit','finalize','verify','agent-start'])test(`${name} acquires the shared owner before preparation and releases it on early Stop`,async()=>{
 const {registered,context}=await handlers();let release;context.draftQueue=new Promise(resolve=>release=resolve);
 const first=registered[name]('owned');await assert.rejects(registered[name]('owned'),/busy/);assert.ok(context.active);context.active.abort();release();await assert.rejects(first,/abort|stopped/i);assert.equal(context.active,null);
});

test('public URL guard rejects private, mapped, reserved and localhost forms across browser/source entry points',()=>{
 for(const host of ['[fd00::1]','[fe80::1]','[::]','[::1]','[::ffff:127.0.0.1]','[::ffff:192.168.0.1]','[ff02::1]','localhost.','app.localhost','0.0.0.0','127.1','0x7f000001','100.64.0.1','169.254.2.1','192.168.0.1','224.0.0.1'])assert.throws(()=>publicUrl('http://'+host+'/'),undefined,host);
 for(const value of ['https://example.com/','https://1.1.1.1/','https://[2606:4700:4700::1111]/'])assert.equal(publicUrl(value).protocol,'https:');
});

test('gateway network and timeout failures retain structured recovery and never silently replay',async t=>{
 const root=await owned(t),original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 for(const injected of [new TypeError('fetch failed'),Object.assign(new Error('timeout'),{name:'TimeoutError'})]){
  let calls=0;globalThis.fetch=async()=>{calls++;throw injected;};await assert.rejects(runJSON({provider:'openclaw',gatewayUrl:'http://127.0.0.1:18789/v1'},{type:'object'},'owned synthetic','unused',{directory:root}),error=>{assert.ok(error.aiFailure);assert.ok(['network','timeout'].includes(error.aiFailure.category));assert.equal(error.aiFailure.safeToRetry,false);return true;});assert.equal(calls,1);
 }
});
test('safe CLI network failures pause for explicit resume without automatic retry',async()=>{
 let calls=0;await assert.rejects(withAiRecovery(async()=>{calls++;throw Object.assign(Error('Connection reset'),{code:'ECONNRESET'});},{safeToRetry:true,wait:()=>assert.fail('network must not back off/replay')}),error=>error.aiFailure?.category==='network'&&error.aiFailure.safeToRetry);assert.equal(calls,1);
});
