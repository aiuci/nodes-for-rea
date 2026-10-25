// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { resolveReaConfig } from './rea-config.mjs';

export function invalidReaOutput(operation, field) {
  const error = new Error(`REA returned invalid inspection output (${field}). Review retained evidence and retry a narrower inspection.`);
  error.code = 'REA_INVALID_OUTPUT'; error.data = {operation, stage:'tool-output', field, outputUnavailable:true};
  return error;
}
function validateToolOutput(result, operation) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw invalidReaOutput(operation, 'result');
  if ('content' in result && !Array.isArray(result.content)) throw invalidReaOutput(operation, 'content');
  if (result.content?.some(block => !block || typeof block !== 'object' || (block.type === 'text' && typeof block.text !== 'string'))) throw invalidReaOutput(operation, 'content block');
  if ('structuredContent' in result && (!result.structuredContent || typeof result.structuredContent !== 'object' || Array.isArray(result.structuredContent))) throw invalidReaOutput(operation, 'structuredContent');
}

export function unwrapReaResult(envelope) {
  if (envelope?.structuredContent) return envelope.structuredContent;
  const blocks = (envelope?.content || []).filter(block => block.type === 'text').map(block => block.text);
  for (const text of blocks) { try { return JSON.parse(text); } catch {} }
  return { text: blocks.join('\n'), isError: !!envelope?.isError };
}

export function compactReaStatus(envelope) {
  const value = unwrapReaResult(envelope);
  const session = value.result || value;
  return {
    open: !!session.open,
    analysisProviderBinding: session.analysis_provider_binding || null,
    providers: (session.analysis_provider_candidates || []).map(candidate => ({ id: candidate.provider?.id, name: candidate.provider?.name, version:candidate.provider?.version,  selected: !!candidate.selected, availability: candidate.availability, targetSupport: candidate.target_support })),
    toolAvailability: (session.tool_availability?.groups || []).map(group => ({ names: group.names, available: group.available, reason: group.reason, remediation: group.remediation, effects: group.effects })),
    capabilities: (session.capabilities || []).map(capability => ({ provider: capability.provider, groups: capability.groups?.map(({ operations, available, reason, availability_code }) => ({ operations, available, reason, availabilityCode: availability_code })) })),
  };
}

export class ReaClient {
  constructor(launch, { signal, onEvent, timeout = 180000, maxFrameBytes = 64 * 1024 * 1024, allowedTools } = {}) {
    this.launch = launch; this.timeout = timeout; this.onEvent = onEvent; this.maxFrameBytes = maxFrameBytes;
    this.allowedTools = allowedTools ? new Set([...allowedTools, 'binary_session', 'close_binary']) : null;
    this.tools = []; this.pending = new Map(); this.sequence = 0; this.closed = false; this.stderr = ''; this.closePromise = null;
    if (signal?.aborted) throw new Error('REA investigation stopped.');
    this.child = spawn(launch.command, launch.args, { cwd: launch.cwd, env: { ...process.env, ...launch.env }, windowsHide: true, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    this.child.stdout.on('data', chunk => {
      buffer += decoder.write(chunk);
      if (Buffer.byteLength(buffer) > maxFrameBytes) return this.fail(new Error('REA response exceeded the transport limit. Request a summary or retained evidence page.'));
      let index;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { this.fail(new Error('REA emitted invalid MCP JSON.')); return; }
        if (message.id !== undefined && this.pending.has(message.id)) {
          const request = this.pending.get(message.id); this.pending.delete(message.id); request.cleanup();
          if (message.error) { const error = new Error(`REA ${request.method}: ${message.error.message || 'MCP request failed'}`); error.code = message.error.code; error.data = message.error.data; request.reject(error); }
          else request.resolve(message.result);
        } else if (message.id !== undefined && message.method) {
          this.write({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Host does not support server-initiated requests.' } });
        } else this.onEvent?.({ type: 'rea-notification', method: message.method, params: message.params });
      }
    });
    this.child.stderr.on('data', chunk => { this.stderr = (this.stderr + chunk.toString()).slice(-6000); });
    this.child.on('error', error => this.fail(new Error(`Could not start local REA: ${error.message}`)));
    this.child.on('close', code => { if (!this.closed) {
      if (buffer.trim()) { const error=new Error('REA response ended before a complete MCP frame. Review retained evidence and retry a narrower inspection.');error.code='REA_TRUNCATED_OUTPUT';error.data={operation:[...this.pending.values()][0]?.operation,stage:'transport',receivedBytes:Buffer.byteLength(buffer),outputUnavailable:true};this.fail(error); }
      else this.fail(new Error(`REA server exited (${code}). ${this.stderr.slice(-1500)}`));
    } });
    this.child.stdin.on('error', error => { if (!this.closed) this.fail(new Error(`REA transport closed: ${error.message}`)); });
    this.signal = signal; this.abort = () => this.fail(new Error('REA investigation stopped.'));
    signal?.addEventListener('abort', this.abort, { once: true });
  }
  write(message) { if (!this.closed && !this.child.stdin.destroyed) this.child.stdin.write(JSON.stringify(message) + '\n'); }
  request(method, params = {}, { signal, timeout = this.timeout } = {}) {
    if (this.closed) return Promise.reject(this.terminalError||new Error('REA session is closed.'));
    if (signal?.aborted) { this.fail(new Error('REA investigation stopped.')); return Promise.reject(new Error('REA investigation stopped.')); }
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const abort = () => {
        this.write({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id, reason: 'Investigation stopped' } });
        this.fail(new Error('REA investigation stopped.'));
      };
      const timer = setTimeout(() => {const operation=method==='tools/call'?params.name:method,error=new Error(`STAGE_TIMEOUT: REA ${operation} timed out after ${timeout/1000}s. Review retained results and choose a narrower inspection.`);error.code='STAGE_TIMEOUT';error.data={operation,timeoutMs:timeout,outputUnavailable:true};this.fail(error);}, timeout);
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
      this.pending.set(id, { resolve, reject, cleanup, method, operation:method==='tools/call'?params.name:method });
      signal?.addEventListener('abort', abort, { once: true });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }
  async initialize(options = {}) {
    this.server = await this.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'rea-investigation-host', version: '1.0.0' } }, { timeout: 30000, ...options });
    this.write({ jsonrpc: '2.0', method: 'notifications/initialized' });
    let cursor;
    do {
      const page = await this.request('tools/list', cursor ? { cursor } : {}, { timeout: 30000, ...options });
      this.tools.push(...(page.tools || [])); cursor = page.nextCursor;
    } while (cursor);
    return this;
  }
  async callTool(name, args = {}, options = {}) {
    if (!this.tools.some(tool => tool.name === name)) throw new Error(`REA does not advertise ${name}.`);
    if (this.allowedTools && !this.allowedTools.has(name)) throw new Error(`REA operation ${name} is outside this investigation's allowed tool set.`);
    this.onEvent?.({ type: 'rea-tool-start', name });
    const result = await this.request('tools/call', { name, arguments: args }, options);
    validateToolOutput(result, name);
    this.onEvent?.({ type: 'rea-tool-complete', name, isError: !!result?.isError });
    return result;
  }
  async sessionStatus(options = {}) { return unwrapReaResult(await this.callTool('binary_session', {}, options)); }
  catalog(names) { return this.tools.filter(tool => !names || names.includes(tool.name)).map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })); }
  fail(error) {
    if (this.closed) return;
    this.terminalError=error;
    this.closed = true; this.signal?.removeEventListener('abort', this.abort);
    for (const request of this.pending.values()) { request.cleanup(); request.reject(error); }
    this.pending.clear(); this.closePromise = this.killTree();
  }
  async killTree() {
    if (!this.child.pid || this.child.exitCode !== null) return;
    if (process.platform === 'win32') {
      await new Promise(resolve => {
        const killer = spawn('taskkill.exe', ['/PID', String(this.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => { this.child.kill(); resolve(); }); killer.on('close', resolve);
      });
    } else {
      try { process.kill(-this.child.pid, 'SIGTERM'); } catch { this.child.kill('SIGTERM'); }
      // A surviving analysis child must not outlive the investigation.
      await new Promise(resolve => setTimeout(resolve, 100));
      try { process.kill(-this.child.pid, 'SIGKILL'); } catch {}
    }
  }
  async close({verify=false}={}) {
    if (this.closed) { await this.closePromise; if(verify&&!this.closureVerified)throw new Error('REA session ended before clean closure was confirmed.');return; }
    let failure;
    try { if (this.tools.some(tool => tool.name === 'close_binary')) {const result=await this.callTool('close_binary', {}, { timeout: 5000 });if(result?.isError)throw new Error('REA did not confirm clean session closure.');this.closureVerified=true;}else if(verify)throw new Error('REA does not advertise session closure.'); } catch(error) { failure=error; }
    this.fail(new Error('REA session closed.')); await this.closePromise;
    if(verify&&failure)throw failure;
  }
}

export async function openReaClient(config = {}, options = {}) {
  const launch = config.available !== undefined ? config : resolveReaConfig(config, options.discovery);
  if (!launch.available) throw new Error(launch.reason || 'Local REA is unavailable.');
  const client = new ReaClient(launch, options);
  try { return await client.initialize({ signal: options.signal }); }
  catch (error) { await client.close(); throw error; }
}

export async function probeReaConnection(config = {}, options = {}) {
  let client;
  try {
    client = await openReaClient(config, options);
    const envelope = await client.callTool('binary_session', {}, { timeout: 30000, signal: options.signal });
    const session = compactReaStatus(envelope);
    return { available: !envelope.isError, source: client.launch.source, serverInfo: client.server?.serverInfo, toolCount: client.tools.length, tools: client.tools.map(tool => tool.name), session, reason: envelope.isError ? 'REA session capability check returned an error.' : '' };
  } catch (error) { return { available: false, reason: error.message }; }
  finally { await client?.close(); }
}
