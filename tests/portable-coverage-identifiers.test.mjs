import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {InvestigationStore} from '../lib/investigation.mjs';
import {agentCoverage} from '../lib/agent-coverage.mjs';
import {AgentControlStore,emptyAgentControl} from '../lib/agent-control.mjs';
import {portableAgentControl,validatePortableAgentControl} from '../lib/agent-control-portable.mjs';
import {buildDocument,parseDocument,installDocument} from '../lib/investigation-document.mjs';
const names=['Document opening through OU.DLL','Data / plot: β → γ','Export "linked" objects'];
test('fresh derived coverage with real feature node IDs survives full export/import without renaming or loss',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nodes-portable-coverage-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new InvestigationStore(root),state=await store.create(),text='Owned implementation delegates document opening to a supporting module.';
 await store.addEvidence(state,{id:'owned',kind:'file',locator:'owned:source',text,raw:text,sha256:createHash('sha256').update(text).digest('hex')});
 state.messages=[{id:'discovery',role:'assistant',title:'Owned application',features:names.map(name=>({name,investigate:'Trace '+name,claimIndexes:[0]})),claims:[{state:'inferred',text,evidenceId:'owned',quote:text}]}];await store.save(state);
 const control={...emptyAgentControl(state.id),coverage:agentCoverage(state)};assert.ok(control.coverage.areas.some(area=>area.id.includes('ou.dll')));await new AgentControlStore(store).mutate(state.id,record=>Object.assign(record,control));
 const before=await new AgentControlStore(store).read(state.id),document=await buildDocument(store,state.id),parsed=parseDocument(document.data);
 assert.deepEqual(parsed.control.coverage.areas,before.coverage.areas);for(const key of ['inspected','unexplored','blocked'])assert.deepEqual(parsed.control.coverage[key],before.coverage[key]);assert.equal(parsed.snapshots.length,1);
 const reopened=await installDocument(store,parsed);assert.deepEqual((await new AgentControlStore(store).read(reopened.state.id)).coverage.areas,before.coverage.areas);
});
test('logical coverage identities retain duplicate, control-character, empty and size guards',()=>{
 const base=portableAgentControl({...emptyAgentControl('owned'),coverage:{summary:'uncertain',scope:'Owned application',areas:[{id:'feature:source / β.dll',label:'Owned feature',status:'unexplored',evidenceIds:[]}],inspected:[],unexplored:['feature:source / β.dll'],blocked:[],boundaries:[],questions:[],stop:null}});
 assert.equal(validatePortableAgentControl(base,'owned'),base);
 for(const bad of ['', ' ', 'feature:bad\u0000id', 'feature:bad\nid', 'x'.repeat(181)]){const value=structuredClone(base);value.coverage.areas[0].id=bad;assert.throws(()=>validatePortableAgentControl(value,'owned'),/coverage area identity/);}
 const duplicate=structuredClone(base);duplicate.coverage.areas.push({...duplicate.coverage.areas[0]});assert.throws(()=>validatePortableAgentControl(duplicate,'owned'),/coverage area identity/);
 const opaque=structuredClone(base);opaque.messages=[{id:'message with spaces',role:'user',text:'Owned context',status:'answered'}];assert.throws(()=>validatePortableAgentControl(opaque,'owned'),/message identity/);
});
