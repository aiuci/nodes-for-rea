import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openReaClient, unwrapReaResult, compactReaStatus } from '../lib/rea-client.mjs';
import {ReaInvestigation} from '../lib/rea-engine.mjs';

const config = { available: true, source: 'test', command: process.execPath, args: [fileURLToPath(new URL('./fixtures/rea-mcp-fixture.mjs', import.meta.url))], env: {} };
test('MCP negotiation, canonical schemas, arguments and raw errors survive transport', async () => {
  const client = await openReaClient(config, { allowedTools: ['inspect_fixture', 'fail_fixture'] });
  try {
    assert.equal(client.server.serverInfo.name, 'fixture-transport');
    assert.equal(client.catalog(['inspect_fixture'])[0].inputSchema.type, 'object');
    const raw = await client.callTool('inspect_fixture', { key: 'é😀\nvalue' });
    assert.equal(raw.content[0].type, 'text');
    assert.deepEqual(unwrapReaResult(raw).result.echoed, { key: 'é😀\nvalue' });
    const error = await client.callTool('fail_fixture', {});
    assert.equal(error.isError, true);
    await assert.rejects(client.callTool('unadvertised', {}), /does not advertise/);
    await assert.rejects(client.callTool('wait_fixture', {}), /allowed tool set/);
    assert.equal(compactReaStatus(await client.callTool('binary_session', {})).open, false);
  } finally { await client.close(); }
  assert.equal(client.closed, true);
  await assert.rejects(client.request('tools/list'), /closed/);
});
test('timeout invalidates the session and kills its server', async () => {
  const client = await openReaClient(config);
  const { pid: grandchildPid } = unwrapReaResult(await client.callTool('spawn_fixture_child', {}));
  const serverPid = client.child.pid;
  await assert.rejects(client.callTool('wait_fixture', {}, { timeout: 80 }), /timed out/);
  await client.close();
  assert.equal(client.closed, true);
  assert.throws(() => process.kill(serverPid, 0), { code: 'ESRCH' });
  assert.throws(() => process.kill(grandchildPid, 0), { code: 'ESRCH' });
});
test('cancellation terminates in-flight work and closes the session', async () => {
  const controller = new AbortController();
  const client = await openReaClient(config);
  const { pid: grandchildPid } = unwrapReaResult(await client.callTool('spawn_fixture_child', {}));
  const serverPid = client.child.pid;
  const operation = client.callTool('wait_fixture', {}, { signal: controller.signal });
  controller.abort();
  await assert.rejects(operation, /stopped/);
  await client.close();
  assert.equal(client.closed, true);
  assert.throws(() => process.kill(serverPid, 0), { code: 'ESRCH' });
  assert.throws(() => process.kill(grandchildPid, 0), { code: 'ESRCH' });
});
test('pre-aborted investigations never start a child', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(openReaClient(config, { signal: controller.signal }), /stopped/);
});
test('stage timeout remains the primary failure after session teardown', async () => {
 const client=await openReaClient(config);let primary;
 try{
  await assert.rejects(client.callTool('wait_fixture',{}, {timeout:30}),error=>{primary=error;return error.code==='STAGE_TIMEOUT'&&error.data?.operation==='wait_fixture';});
  await assert.rejects(client.callTool('wait_fixture',{}),error=>error===primary);
 }finally{await client.close();}
});
test('actual MCP timeout preserves earlier returned evidence through closed-session cleanup',async()=>{
 const client=await openReaClient(config),target={kind:'artifact',targetType:'native',root:'owned-fixture.exe',locator:'owned-fixture.exe'},state={targets:[target],evidence:[],activity:[]},rea=new ReaInvestigation({},state,'owned-fixture-directory',{addEvidence:async record=>{state.evidence.push(record);return record;}});
 // Use the real pipe/client/deadline; only shorten the fixture's hanging tool.
 rea.client={get closed(){return client.closed;},callTool:(name,args,options)=>client.callTool(name,args,{...options,...(name==='wait_fixture'?{timeout:30}:{})}),close:async()=>{await client.close();throw Error('Session is closed');}};
 try{
  await rea.invoke('inspect_fixture',{source:'actual completed fixture response'},target);const kept=JSON.stringify(state.evidence[0]);let primary;
  await assert.rejects(rea.invoke('wait_fixture',{},target),error=>{primary=error;return error.code==='STAGE_TIMEOUT'&&error.data.operation==='wait_fixture';});
  await assert.rejects(rea.finish(),error=>error===primary);
  assert.equal(JSON.stringify(state.evidence[0]),kept);assert.equal(state.evidence[0].evidenceStatus,'static');assert.equal(state.evidence.length,2);
  const failed=state.evidence[1];assert.equal(failed.evidenceStatus,'inspection-failed');assert.equal(JSON.parse(failed.raw).outputUnavailable,true);assert.equal(JSON.parse(failed.raw).error.code,'STAGE_TIMEOUT');assert.match(state.activity.at(-1).reason,/Session is closed/);assert.equal(state.activity.at(-1).secondary,true);
  assert.equal(client.closed,true);assert.equal(rea.client,null);assert.throws(()=>process.kill(client.child.pid,0),{code:'ESRCH'});
 }finally{await client.close();}
});
