import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseReaRegistration, resolveReaConfig } from '../lib/rea-config.mjs';

test('registration reads only REA command, arguments and engine environment', () => {
  const registration = parseReaRegistration(`[mcp_servers.other]\ncommand = "unrelated-secret"\n[mcp_servers.rea]\ncommand = "node"\nargs = ["/rea.mjs", "mcp"]\n[mcp_servers.rea.env]\nGHIDRA_INSTALL_DIR = '/ghidra'\nJAVA_HOME = "/java"\nUNRELATED_TOKEN = "secret"\n[another]\nargs = ["other"]`);
  assert.deepEqual(registration, { command: 'node', args: ['/rea.mjs', 'mcp'], env: { GHIDRA_INSTALL_DIR: '/ghidra', JAVA_HOME: '/java' } });
});

test('optional portable native tools are process-local defaults, never replace explicit paths or establish readiness',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'rea-native-portable-'));
 try{
  const write=rel=>{const file=path.join(root,rel);mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,'owned fixture');};
  for(const p of ['engines/rea/rea.mjs','engines/node/node.exe','engines/native/ghidra/support/analyzeHeadless.bat','engines/native/jdk/bin/java.exe'])write(p);
  const options={portableRoot:root,appRoot:root,home:root,env:{},codexConfigPath:path.join(root,'absent.toml')};
  let r=resolveReaConfig({},options);assert.equal(r.env.GHIDRA_INSTALL_DIR,path.join(root,'engines/native/ghidra'));assert.equal(r.env.JAVA_HOME,undefined,'a runtime without javac is not a full JDK');
  write('engines/native/jdk/bin/javac.exe');r=resolveReaConfig({},options);assert.equal(r.env.JAVA_HOME,path.join(root,'engines/native/jdk'));assert.equal(r.status,undefined,'location is not operation proof');
  assert.equal(resolveReaConfig({reaEnv:{JAVA_HOME:'C:/chosen-jdk'}},options).env.JAVA_HOME,'C:/chosen-jdk');
  assert.equal(resolveReaConfig({},{...options,env:{JAVA_HOME:'C:/environment-jdk'}}).env.JAVA_HOME,undefined,'host environment stays authoritative');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('registration supports multiline argument arrays and comments without changing quoted hashes', () => {
  assert.deepEqual(parseReaRegistration(`[mcp_servers.rea]\ncommand = "node" # local runtime\nargs = [\n  "/path#literal/rea.mjs", # retained hash\n  "mcp",\n]\ncwd = "/analysis"\n`), { command: 'node', args: ['/path#literal/rea.mjs', 'mcp'], env: {}, cwd: '/analysis' });
});
test('settings take precedence; bundled and registration discovery do not download', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'rea-config-test-'));
  try {
    const script = path.join(root, 'rea.mjs'); writeFileSync(script, '');
    const codexConfigPath = path.join(root, 'config.toml');
    writeFileSync(codexConfigPath, `[mcp_servers.rea]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(script)}, "mcp"]\n[mcp_servers.rea.env]\nJAVA_HOME = "/java"`);
    const options = { codexConfigPath, appRoot: root, portableRoot: root, env: {} };
    assert.equal(resolveReaConfig({}, options).source, 'codex-registration');
    const explicit = resolveReaConfig({ rea: script, node: process.execPath }, options);
    assert.equal(explicit.source, 'settings'); assert.equal(explicit.env.JAVA_HOME, '/java');
    assert.deepEqual(explicit.args, [script, 'mcp']);
    assert.equal(resolveReaConfig({}, { ...options, env: { INVESTIGATOR_REA: script } }).source, 'environment');
    mkdirSync(path.join(root, 'engines/rea'), { recursive: true }); writeFileSync(path.join(root, 'engines/rea/rea.mjs'), '');
    assert.equal(resolveReaConfig({}, options).source, 'bundled');
    assert.equal(resolveReaConfig({}, options).available,false,'a missing bundled Node must not fall back to host Node');
    const portableNode=path.join(root,'engines/node/node.exe');mkdirSync(path.dirname(portableNode),{recursive:true});writeFileSync(portableNode,'');
    assert.equal(resolveReaConfig({}, options).env.JAVA_HOME,undefined,'bundled engine does not borrow another app MCP paths');
    assert.equal(resolveReaConfig({reaEnv:{JAVA_HOME:'/explicit-java'}}, options).env.JAVA_HOME,'/explicit-java','user engine settings remain authoritative');
    assert.equal(resolveReaConfig({node:process.execPath}, options).command,portableNode);
    assert.equal(resolveReaConfig({rea:script,node:process.execPath}, options).command,process.execPath);
    const explicitBundled=resolveReaConfig({rea:path.join(root,'engines/rea/rea.mjs'),node:process.execPath,reaEnv:{JAVA_HOME:'/own-java'}},{...options,env:{INVESTIGATOR_NODE:'/external-node'}});
    assert.equal(explicitBundled.source,'settings');assert.equal(explicitBundled.bundled,true);assert.equal(explicitBundled.command,portableNode);assert.equal(explicitBundled.env.JAVA_HOME,'/own-java');
    assert.equal(resolveReaConfig({rea:path.join(root,'engines/rea/rea.mjs')},options).env.JAVA_HOME,undefined);
    assert.equal(resolveReaConfig({reaNode:process.execPath},options).command,process.execPath);
    assert.equal(resolveReaConfig({ rea: path.join(root, 'missing.mjs') }, options).available, false);
    assert.equal(resolveReaConfig({ rea: { command: 'npx', args: ['rea-agents', 'mcp'] } }, options).available, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
