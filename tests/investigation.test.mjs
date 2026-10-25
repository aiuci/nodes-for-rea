import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { InvestigationStore, Investigator } from '../lib/investigation.mjs';
import { inventoryDirectory, inspectFile, identifyTargets, publicUrl, extractHtml,inspectRetainedSection } from '../lib/sources.mjs';
import { planSchema, validateClaims, presentationErrors } from '../lib/agent.mjs';
import {mechanismSchema,mechanismErrors,coverageErrors,emphasisCandidates,emphasisErrors} from '../lib/mechanisms.mjs';

test('target discovery keeps multiword local paths and public URL interests',()=>{
  assert.deepEqual(identifyTargets('Explore https://excalidraw.com/\n"C:\\My Product\\src"\nI care about undo.'),['https://excalidraw.com/','C:\\My Product\\src']);
  assert.deepEqual(identifyTargets('Look at C:\\My Product\\src\nI care about undo.'),['C:\\My Product\\src']);
  assert.throws(()=>publicUrl('file:///C:/private'));
  assert.throws(()=>publicUrl('http://127.0.0.1:37777'));
  assert.throws(()=>publicUrl('https://user:password@example.com'));
});
test('citations cannot fabricate a source or quote',()=>{
  const answer=validateClaims({claims:[{state:'observed',evidenceId:'a',quote:'undo stack'},{state:'observed',evidenceId:'a',quote:'automatic cloud backup'},{state:'observed',evidenceId:'b',quote:'undo stack'}]},[{id:'a',text:'The undo stack stores prior scenes.'}]);
  assert.equal(answer.claims.length,1);assert.equal(answer.rejectedClaimCount,2);
  const limit=validateClaims({claims:[{state:'inferred',evidenceId:'a',quote:'Static inspection only.'}]},[{id:'a',text:'code',limitations:['Static inspection only.']}]);
  assert.equal(limit.claims[0].quoteOrigin,'inspection-limit');
});
test('source discovery follows linked product subdomains without broadening to unrelated hosts',()=>{
  const result=extractHtml('<body><a href="https://plus.example.com/details">Details</a><a href="https://unrelated.com">Other</a></body>','https://example.com');
  assert.deepEqual(result.links,[{url:'https://plus.example.com/details',label:'Details'}]);
  assert.equal(extractHtml('<html><body><script>secret()</script></body></html>','https://example.com').text,'');
});
test('whole-source sampling preserves late comparisons and material outside main',()=>{
  const raw=`<body><header><h1>Relay</h1><p>A shared workspace</p></header><main><h2>Steps</h2><p>${'Standard process. '.repeat(3000)}</p></main><section><h2>Why our approach differs</h2><p>Live context connects edits, comments, and decisions.</p><h3>Compared with exports</h3><p>The vendor says disconnected exports lose decision context.</p></section></body>`;
  const result=extractHtml(raw,'https://example.com');
  assert.ok(result.text.length<=24000);assert.match(result.text,/Live context connects edits, comments, and decisions/);
  assert.ok(result.sections.some(section=>section.headingPath.includes('Compared with exports')));
  assert.equal(result.sourceCoverage.partial,true);
});
test('mechanism coverage rejects scattered substeps without their parent',()=>{
  const inventory={mechanisms:[{id:'shared',name:'Shared decision context',role:'differentiator',parts:['Edits','Comments'],references:[{evidenceId:'source',quote:'Edits and comments stay connected.'}]}]};
  assert.deepEqual(mechanismErrors(inventory,[{id:'source',text:'Edits and comments stay connected.'}]),[]);
  const flat={features:[{name:'Edits',parentName:'Shared decision context',mechanismIds:['shared']}],mechanismCoverage:[{mechanismId:'shared',featureNames:['Edits']}]};
  assert.ok(coverageErrors(flat,inventory).length);
  const preserved={features:[{name:'Shared decision context',parentName:'',mechanismIds:['shared']},...flat.features],mechanismCoverage:[{mechanismId:'shared',featureNames:['Shared decision context','Edits']}]};
  assert.deepEqual(coverageErrors(preserved,inventory),[]);
  assert.ok(mechanismErrors({mechanisms:[{...inventory.mechanisms[0],references:[{evidenceId:'source',quote:'Invented feature'}]}]},[{id:'source',text:'Actual text'}]).length);
});
test('named umbrella capabilities in differentiator sections cannot be replaced by their parts',()=>{
  const extracted=extractHtml('<body><h1>Product</h1><h2>Why it is different</h2><h3>Shared decision context</h3><p>Edits and comments stay connected.</p><h2>Process</h2><h3>Write a comment</h3><p>Add text.</p></body>','https://example.com');
  const candidates=emphasisCandidates([{id:'source',sections:extracted.sections}]);assert.ok(candidates.some(c=>c.sourceLabel==='Shared decision context'));assert.ok(!candidates.some(c=>c.sourceLabel==='Write a comment'));
  const candidate=candidates.find(c=>c.sourceLabel==='Shared decision context');
  const incomplete={mechanisms:[{id:'comments',name:'Comments'}],candidateReview:candidates.map(c=>({evidenceId:c.evidenceId,sectionId:c.sectionId,classification:c===candidate?'mechanism':'context',mechanismIds:['comments']}))};
  assert.ok(emphasisErrors(incomplete,candidates).length);
  assert.deepEqual(emphasisErrors({...incomplete,mechanisms:[{id:'comments',name:'Shared decision context'}]},candidates),[]);
});
test('focused section reads retain source identity and reject changed snapshots',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'investigation-section-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const raw='<body><main><h1>Relay</h1><p>Standard workflow.</p></main><section><h2>Shared context</h2><p>Edits and discussions stay connected to each decision.</p></section></body>';
  const snapshotPath=path.join(root,'source.html');await fs.writeFile(snapshotPath,raw);
  const extracted=extractHtml(raw,'https://example.com');
  const parent={id:'parent',kind:'page',locator:'https://example.com',sections:extracted.sections,snapshotPath,sha256:createHash('sha256').update(raw).digest('hex'),limitations:[]};
  const section=extracted.sections.find(s=>s.headingPath.includes('Shared context'));
  const result=await inspectRetainedSection(parent,section.id);assert.match(result.text,/Edits and discussions stay connected/);assert.equal(result.parentEvidenceId,'parent');assert.equal(result.sourceSha256,parent.sha256);
  await fs.writeFile(snapshotPath,raw+'changed');await assert.rejects(inspectRetainedSection(parent,section.id),/captured digest/);
});
test('feature and follow-up rows must reference retained claims; unknowns remain explicit gaps',()=>{
  const valid={recommendation:'Canvas',claims:[{evidenceId:'source'}],features:[{name:'Canvas',claimIndexes:[0]}],findings:[{question:'Storage?',change:'gap',claimIndexes:[]}]};
  assert.deepEqual(presentationErrors(valid,true),[]);
  assert.ok(presentationErrors({...valid,features:[{claimIndexes:[2]}]},true).length);
  assert.ok(presentationErrors({...valid,findings:[{change:'new',claimIndexes:[]}]},true).length);
  assert.deepEqual(presentationErrors({recommendation:'Proposed concept',features:[{name:'Proposed concept',claimIndexes:[]}]},false),[]);
});
test('local reads exclude credentials and prevent traversal',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'investigation-sources-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'main.js'),'export const undo = () => history.pop();');await fs.writeFile(path.join(root,'.env'),'SECRET=do-not-read');
  const target=await inventoryDirectory(root);assert.deepEqual(target.files,['main.js']);
  const file=await inspectFile(target,'main.js');assert.match(file.text,/history.pop/);assert.equal(file.lineStart,1);
  await assert.rejects(inspectFile(target,'../private.txt'));
});
test('follow-up reads actual implementation and survives reopening',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'investigation-loop-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const source=path.join(root,'source');await fs.mkdir(source);await fs.writeFile(path.join(source,'main.js'),'export const undo = () => history.pop();');
  const store=new InvestigationStore(path.join(root,'saved')),state=await store.create();
  const reasoning=async (_config,schema,_prompt,_dir)=>schema===mechanismSchema?{mechanisms:[]}:schema===planSchema?{focus:'undo',reads:[{kind:'file',target:'main.js',reason:'Trace undo implementation.'}]}:{answer:'Undo removes the last history entry.',understanding:'A source-level history operation.',recommendation:'Investigate history storage.',directions:[],openQuestions:['Is history persisted?'],claims:[{text:'Undo pops the history stack.',state:'observed',evidenceId:state.evidence.at(-1).id,quote:'history.pop()'}]};
  const investigator=new Investigator(store,{reasoning,config:{reaEnabled:false}});await investigator.turn(state,`"${source}"\nExplore undo`);
  const before=state.evidence.length;await investigator.turn(state,'Investigate that.');assert.ok(state.evidence.length>before);
  const reopened=await new InvestigationStore(store.root).read(state.id);
  assert.equal(reopened.messages.length,4);assert.equal(reopened.recommendation,'');assert.equal(reopened.messages.at(-1).continuation.status,'blocked');assert.equal(reopened.openQuestions[0],'Is history persisted?');
  assert.match(await fs.readFile(reopened.evidence[0].snapshotPath,'utf8'),/history.pop/);
});
test('unsupported citations fail honestly and keep evidence',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'investigation-error-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const source=path.join(root,'source');await fs.mkdir(source);await fs.writeFile(path.join(source,'main.js'),'actual source');
  const store=new InvestigationStore(path.join(root,'saved')),state=await store.create();
  const reasoning=async (_config,schema)=>schema===mechanismSchema?{mechanisms:[]}:schema===planSchema?{focus:'inspect',reads:[]}:{claims:[{state:'observed',evidenceId:'invented',quote:'fiction'}]};
  await assert.rejects(new Investigator(store,{reasoning,config:{reaEnabled:false}}).turn(state,`"${source}"`),/unsupported source reference/);
  const saved=await store.read(state.id);assert.equal(saved.evidence.length,1);assert.equal(saved.messages.at(-1).role,'system');
});
