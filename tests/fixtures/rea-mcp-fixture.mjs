import readline from 'node:readline';
import { spawn } from 'node:child_process';
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
for await (const line of readline.createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (request.method === 'initialize') send({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fixture-transport', version: '1' } } });
  if (request.method === 'tools/list') send({ jsonrpc: '2.0', id: request.id, result: { tools: ['binary_session', 'close_binary', 'inspect_fixture', 'wait_fixture', 'fail_fixture', 'spawn_fixture_child'].map(name => ({ name, inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } })) } });
  if (request.method !== 'tools/call') continue;
  const name = request.params.name;
  if (name === 'spawn_fixture_child') {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });
    send({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify({ pid: child.pid }) }] } });
    continue;
  }
  if (name === 'wait_fixture') continue;
  if (name === 'fail_fixture') send({ jsonrpc: '2.0', id: request.id, result: { isError: true, content: [{ type: 'text', text: 'Expected fixture failure.' }] } });
  else send({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify({ result: { open: false, tool_availability: { groups: [] }, echoed: request.params.arguments } }) }] } });
}
