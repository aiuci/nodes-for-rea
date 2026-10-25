import test from 'node:test';
import assert from 'node:assert/strict';
import {engineReadiness} from '../lib/setup-readiness.mjs';

const checked=session=>({available:true,source:'bundled',status:{available:true,toolCount:207,session}});
test('engine path and advertised names do not establish inspection readiness',()=>{
  const projected=engineReadiness({available:true,source:'bundled',tools:['analyze_javascript_application']});
  assert.equal(projected.ready,false);
  assert.ok(projected.cards.every(card=>card.state==='unknown'));
});
test('clean portable core and exact operation availability leave missing native providers optional',()=>{
  const result=engineReadiness(checked({providers:[{id:'ghidra',name:'Ghidra',availability:{status:'unavailable',code:'not_configured',reason:'Choose a supported extracted Ghidra release.'}}],toolAvailability:[{names:['analyze_javascript_application'],available:true},{names:['analyze_web_bundle'],available:true},{names:['binary_overview'],available:false,reason:'target_required'}]}));
  assert.equal(result.ready,true);
  assert.deepEqual(result.cards.map(card=>[card.id,card.state]),[['engine-core','ready'],['javascript','ready'],['web','ready'],['managed','unknown'],['sqlite','unknown'],['archive','unknown'],['native','missing']]);
  assert.equal(result.cards.at(-1).optional,true);
  assert.equal(result.cards.at(-1).reason,'Choose a supported extracted Ghidra release.');
});
test('empty provider list does not hide retained independent tool capability groups',()=>{
  const result=engineReadiness(checked({providers:[],capabilities:[{provider:'javascript',groups:[{operations:['analyze_javascript_application'],available:true},{operations:['analyze_web_bundle'],available:false,reason:'provider_unavailable',remediation:'Choose the browser.'}]}]}));
  assert.equal(result.cards.find(card=>card.id==='javascript').state,'ready');
  const web=result.cards.find(card=>card.id==='web');
  assert.equal(web.state,'unavailable');assert.equal(web.remediation,'Choose the browser.');
  assert.equal(result.cards.at(-1).state,'unknown');
});
test('target_required does not disprove a validated native provider or prove an absent one',()=>{
  const result=engineReadiness(checked({providers:[{id:'ghidra',name:'Ghidra',availability:{status:'available',diagnostics:{checks:['configuration','platform','architecture','installation','version','headless','native_decompiler','java'].map(name=>({name,ok:true}))}},targetSupport:{status:'unknown'}}],toolAvailability:[{names:['binary_overview'],available:false,reason:'target_required'}]}));
  assert.equal(result.cards.at(-1).state,'ready');
  assert.match(result.cards.at(-1).detail,/Target compatibility/);
});
test('failed checks cannot leave stale successful capability cards',()=>{
  const result=engineReadiness({status:{available:false,reason:'Could not start',session:{toolAvailability:[{names:['analyze_web_bundle'],available:true}]}}});
  assert.equal(result.ready,false);assert.equal(result.cards[0].state,'unavailable');assert.equal(result.cards[2].state,'unknown');
  const missingPath=engineReadiness({available:false,reason:'Configured executable is missing.',status:{available:true,session:{toolAvailability:[{names:['analyze_web_bundle'],available:true}]}}});
  assert.equal(missingPath.ready,false);assert.equal(missingPath.cards[2].state,'unknown');
});
test('human diagnostic words are not availability evidence',()=>{
  const result=engineReadiness(checked({providers:[{id:'ghidra',availability:{reason:'Available and installed'}}],toolAvailability:[{names:['analyze_javascript_application'],reason:'available'}]}));
  assert.equal(result.cards[1].state,'unknown');assert.equal(result.cards.at(-1).state,'unknown');
});

test('included runtime identity is separate from engine failure and target-specific REA tools',()=>{
  const result=engineReadiness({available:true,provenance:{engine:'included',runtime:'included-node'},status:{available:false,reason:'Owned startup failure'}});
  assert.equal(result.ready,false);
  assert.match(result.installation.engine,/included with Nodes/);
  assert.match(result.installation.runtime,/no separate Node.js installation/);
  assert.match(result.cards[0].detail,/Nodes is running, but the REA engine/);
  assert.equal(result.cards.at(-1).optional,true);
  assert.equal(result.cards.at(-1).state,'unknown');
  const unproven=engineReadiness({provenance:{engine:'private-path',runtime:'private-path'}});
  assert.doesNotMatch(JSON.stringify(unproven.installation),/private-path/);
});
