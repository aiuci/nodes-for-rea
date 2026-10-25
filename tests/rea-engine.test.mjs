import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ReaInvestigation, reaEvidenceRecord } from '../lib/rea-engine.mjs';
import { fileIdentity } from '../lib/targets.mjs';

const target = { kind: 'artifact', root: 'C:/owned/app.asar', locator: 'C:/owned/app.asar', targetType: 'javascript' };
const engine = () => new ReaInvestigation({}, { evidence: [], targets: [target] }, 'C:/owned/state');
test('REA reads reject unselected paths, unadvertised effects and foreign Evidence IDs before dispatch', async () => {
  const rea = engine();
  assert.throws(() => rea.validateArguments('analyze_javascript_application', { input_path: 'C:/other/app.asar' }, target), /paths must match/);
  assert.throws(() => rea.validateArguments('capture_process_scenario', {}, target), /inspection scope/);
  assert.throws(() => rea.validateArguments('inspect_analysis_view', { source: { kind: 'retained-evidence', evidence_id: `ev_${'a'.repeat(64)}` } }, target), /not part/);
  assert.throws(() => rea.validateArguments('inspect_analysis_view', { source: { kind: 'inline', evidence: {} } }, target), /retained REA evidence/);
  await assert.rejects(rea.read({ target: 'C:/unselected.exe', operation: 'list_procedures' }), /not selected/);
  await assert.rejects(rea.read({ target: target.locator, operation: 'inspect_analysis_view', argumentsJson: '[]' }), /must be an object/);
});
test('REA JavaScript reads force summary detail and bounded retained pages', () => {
  const rea = engine();
  const args = rea.validateArguments('analyze_javascript_application', { detail: 'complete', analysis_timeout_ms: 999999 }, target);
  assert.equal(args.input_path, target.root); assert.equal(args.detail, 'summary'); assert.equal(args.analysis_timeout_ms, 60000);
  assert.throws(() => rea.validateArguments('inspect_analysis_view', { view: { kind: 'page', limit: 33 } }, target), /at most 32/);
  const repository = { kind: 'repository', root: 'C:/owned/app', files: ['main.mjs', 'package.json'] };
  assert.throws(() => rea.validateArguments('analyze_javascript_application', { source_paths: ['../other.mjs'] }, repository), /inventoried/);
});
test('saved Evidence references are recognized before a reopened session connects', () => {
  const evidenceId = `ev_${'a'.repeat(64)}`, parentId = `ev_${'b'.repeat(64)}`;
  const rea = new ReaInvestigation({}, { targets: [target], evidence: [{ locator: target.root, reaEvidenceId: evidenceId, reaParentEvidenceId: parentId }] }, 'C:/owned/state');
  assert.doesNotThrow(() => rea.validateArguments('inspect_analysis_view', { source: { kind: 'retained-evidence', evidence_id: parentId }, view: { kind: 'summary' } }, target));
  assert.throws(() => rea.validateArguments('inspect_analysis_view', { source: { kind: 'retained-evidence', evidence_id: parentId }, view: { kind: 'summary' } }, { ...target, root: 'C:/different/app.asar', locator: 'C:/different/app.asar' }), /different selected target/);
});
test('REA evidence retains canonical IDs, full raw bytes and explicit static limits', () => {
  const envelope = { content: [{ type: 'text', text: JSON.stringify({ result: { evidence_id: `ev_${'a'.repeat(64)}`, normalized_result: { parent_evidence_id: `ev_${'b'.repeat(64)}`, coverage: 'partial' }, limitations: ['fixture boundary'] } }) }] };
  const record = reaEvidenceRecord(envelope, { operation: 'analyze_javascript_application', target });
  assert.equal(record.reaEvidenceId, `ev_${'a'.repeat(64)}`);
  assert.equal(record.reaParentEvidenceId, `ev_${'b'.repeat(64)}`);
  assert.deepEqual(JSON.parse(record.raw), envelope);
  assert.ok(record.limitations.includes('fixture boundary'));
  assert.ok(record.limitations.some(value => /has not been executed/.test(value)));
  assert.equal(record.evidenceStatus, 'static');
});
test('changed artifact bytes block binding before an inspection server starts', async () => {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'rea-engine-freshness-'));
  try {
    const file = path.join(directory, 'owned-fixture.dll'); await fs.writeFile(file, 'initial owned fixture');
    const native = { kind: 'artifact', targetType: 'native', root: file, locator: file, identity: await fileIdentity(file) };
    await fs.writeFile(file, 'changed owned fixture');
    const rea = new ReaInvestigation({ reaEnabled: false }, { targets: [native], evidence: [] }, directory);
    await assert.rejects(rea.bind(native), /selected target changed/);
    assert.equal(rea.client, null);
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('known but uncheckpointed references cannot be advertised as resumable after interruption',()=>{const id='ev_lost';const rea=new ReaInvestigation({},{targets:[target],evidence:[{locator:target.root,reaEvidenceId:id}],reaUnretainedEvidenceIds:[id]},'C:/owned/state');assert.throws(()=>rea.validateArguments('inspect_analysis_view',{source:{kind:'retained-evidence',evidence_id:id},view:{kind:'summary'}},target),/not part/);});

test('failed native and browser operations retain complete returned diagnostics',async()=>{const records=[],state={targets:[target],evidence:[],activity:[]},rea=new ReaInvestigation({browser:process.execPath},state,'C:/owned/state',{addEvidence:async record=>{records.push(record);return record;}}),failure={isError:true,content:[{type:'text',text:'{"error":{"message":"owned failure","details":{"reason":"missing-provider"}}}'}]};rea.client={callTool:async()=>failure};await assert.rejects(rea.invoke('analyze_function',{procedure:'missing'},target),/Inspection failed/);await assert.rejects(rea.captureBrowser('https://example.com/'),/owned failure/);assert.equal(records.length,2);for(const record of records){assert.equal(record.evidenceStatus,'inspection-failed');assert.deepEqual(JSON.parse(record.raw),failure);}});

test('transport rejection retains an explicitly incomplete diagnostic instead of a successful result',async()=>{const records=[],rea=new ReaInvestigation({},{targets:[target],evidence:[],activity:[]},'C:/owned/state',{addEvidence:async record=>{records.push(record);return record;}});rea.client={callTool:async()=>{throw new Error('owned timeout');}};await assert.rejects(rea.invoke('analyze_function',{procedure:'f'},target),/owned timeout/);assert.equal(records[0].evidenceStatus,'inspection-failed');assert.equal(JSON.parse(records[0].raw).outputUnavailable,true);});
test('saving a failure diagnostic cannot mask the original stage timeout or discard completed evidence',async()=>{
 const primary=Object.assign(new Error('STAGE_TIMEOUT: binary_overview timed out'),{code:'STAGE_TIMEOUT'}),kept={id:'saved',text:'Actual earlier output'},state={targets:[target],evidence:[kept],activity:[]};
 const rea=new ReaInvestigation({},state,'C:/owned/state',{addEvidence:async()=>{throw Error('ENOSPC: cannot save diagnostic');}});rea.client={callTool:async()=>{throw primary;}};
 await assert.rejects(rea.invoke('binary_overview',{},target),error=>error===primary);
 assert.deepEqual(state.evidence,[kept]);assert.match(state.activity.at(-1).reason,/ENOSPC/);
});
test('checkpoint failure stays primary while both browser and REA cleanup are attempted',async()=>{
 const primary=Object.assign(new Error('STAGE_TIMEOUT: export_evidence_bundle timed out'),{code:'STAGE_TIMEOUT'}),state={targets:[target],evidence:[],activity:[]},rea=new ReaInvestigation({},state,'C:/owned/state');let closed=0;
 rea.checkpoint=async()=>{throw primary;};rea.closeWeb=async()=>{throw Error('browser cleanup failed');};rea.client={close:async()=>{closed++;throw Error('Session is closed');}};
 await assert.rejects(rea.finish(),error=>error===primary);assert.equal(closed,1);assert.equal(rea.client,null);assert.equal(state.activity.length,2);
});
test('cleanup failure without an earlier failure is still reported',async()=>{
 const rea=new ReaInvestigation({},{targets:[target],evidence:[],activity:[]},'C:/owned/state');rea.client={close:async()=>{throw Error('cleanup failed');}};
 await assert.rejects(rea.finish(),/cleanup failed/);
});
test('a recoverable RPC error does not poison later successful inspection or cleanup',async()=>{
 const rea=new ReaInvestigation({},{targets:[target],evidence:[],activity:[]},'C:/owned/state'),recoverable=Object.assign(new Error('Invalid parameter'),{code:-32602});let calls=0;
 rea.client={closed:false,callTool:async()=>{if(!calls++)throw recoverable;return {content:[{type:'text',text:'{}'}]};},close:async()=>{}};rea.checkpoint=async()=>{};
 await assert.rejects(rea.invoke('analyze_function',{},target),error=>error===recoverable);await rea.invoke('analyze_function',{},target);await rea.finish();assert.equal(rea.primaryFailure,undefined);
});
