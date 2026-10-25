import test from 'node:test';
import assert from 'node:assert/strict';
import {setupReport} from '../lib/setup-report.mjs';
test('setup report excludes private configuration and raw diagnostics',()=>{
  const report=setupReport({ai:{provider:'codex',configured:true,verification:'local-auth',modelAccess:'unknown',token:'private-sentinel',codexPath:'private-sentinel',capabilities:{raw:'private-sentinel'}},engine:{cards:[{id:'native',state:'missing',reason:'private-sentinel',remediation:'private-sentinel',optional:true}]},versions:{node:'22',electron:'44',secret:'private-sentinel'}});
  assert.equal(report.agent.verification,'local-auth');assert.equal(report.agent.modelAccess,'unknown');assert.equal(report.inspection.cards[0].state,'missing');assert.ok(!JSON.stringify(report).includes('private-sentinel'));
});
