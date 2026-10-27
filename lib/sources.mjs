// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import { load } from 'cheerio';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {isIP} from 'node:net';
import { runProcess } from './runtime.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const skip = /^(node_modules|\.git|\.venv|venv|dist|build|coverage|data|acceptance-data|structured-data|mechanism-data|combined-data|qa-output|\.next|\.cache|vendor|target)$/i;
const sensitive = /(^|[\/\\])(?:\.env(?:\..*)?|auth\.json|credentials[^\/\\]*|secrets?[^\/\\]*|.*\.(?:pem|key|pfx|p12))$/i;
const readable = /\.(?:[cm]?[jt]sx?|py|rs|go|java|cs|cpp|c|h|swift|kt|json|toml|ya?ml|md|txt|html|css|sql|vue|svelte)$/i;
const compact = s => s.replace(/\s+/g, ' ').trim();

export function extractHtml(raw, locator, {fullSections=false}={}) {
  const url = new URL(locator), $ = load(raw), links=[];
  const title=compact($('title').text())||url.hostname;
  const productHost=url.hostname.replace(/^www\./,'');
  $('a[href]').each((_,a)=>{try{const link=publicUrl(new URL($(a).attr('href'),url).href);const sameProduct=link.hostname===productHost||link.hostname.endsWith(`.${productHost}`);if(sameProduct&&!/\.(pdf|jpg|png|zip|svg)$/i.test(link.pathname)&&!links.some(x=>x.url===link.href))links.push({url:link.href,label:compact($(a).text()).slice(0,120)});}catch{}});
  const scripts=$('script[src]').map((_,e)=>$(e).attr('src')).get();
  $('script,style,noscript,svg,template,nav,[role="navigation"]').remove();
  // Walk the complete document in source order. Product headers, comparison
  // sections, and material outside <main> are evidence, not disposable chrome.
  const sections=[],headings=[];let current={id:'s0',headingPath:[],chunks:[]};
  function finish(){const text=compact(current.chunks.join(' '));if(text)sections.push({id:current.id,headingPath:[...current.headingPath],text});}
  function visit(node){
    if(node.type==='text'){current.chunks.push(node.data);return;}
    if(/^h[1-6]$/.test(node.name||'')){
      const heading=compact($(node).text());if(!heading)return;
      finish();const level=Number(node.name[1]);headings.length=level;headings[level-1]=heading;
      current={id:`s${sections.length+1}`,headingPath:headings.filter(Boolean),chunks:[]};return;
    }
    for(const child of node.children||[])visit(child);
  }
  visit($('body').get(0)||$.root().get(0));finish();
  const seen=new Set(),unique=sections.filter(section=>{const key=JSON.stringify([section.headingPath,section.text]);if(seen.has(key))return false;seen.add(key);return true;});
  const totalText=unique.map(section=>[section.headingPath.join(' > '),section.text].filter(Boolean).join('\n')).join('\n\n');
  const budget=24000,selected=unique.slice(0,160);
  const label=section=>section.headingPath.join(' > ').slice(-120);
  const overhead=selected.reduce((sum,section)=>sum+label(section).length+4,0);
  const quota=Math.max(20,Math.floor((budget-overhead)/Math.max(1,selected.length)));
  const summaries=selected.map(section=>{
    const available=totalText.length<=budget?section.text.length:quota;
    const partial=section.text.length>available;
    const excerpt=partial?section.text.slice(0,Math.floor(available*.7))+'\n…\n'+section.text.slice(-Math.max(1,Math.floor(available*.3)-3)):section.text;
    const localPath=section.headingPath.length>1?section.headingPath.slice(1):section.headingPath;
    const emphasis=localPath.some(heading=>/unique|different|sets .*apart|advantage|why|compar|versus|\bvs\b|approach/i.test(heading));
    return {id:section.id,headingPath:section.headingPath,characters:section.text.length,excerpt,partial,emphasis};
  });
  const text=summaries.map(section=>[label(section),section.excerpt].filter(Boolean).join('\n')).join('\n\n').slice(0,budget);
  const sourceCoverage={totalCharacters:totalText.length,excerptCharacters:text.length,totalSections:unique.length,sampledSections:summaries.length,partial:totalText.length>budget||unique.length>160};
  return {title,text,sections:summaries,sourceCoverage,links:links.slice(0,120),scripts,truncated:sourceCoverage.partial,...(fullSections?{fullSections:unique}:{})};
}

export function identifyTargets(message) {
  const urls = [...message.matchAll(/https?:\/\/[^\s<>"\]]+/g)].map(m => m[0].replace(/[.,;!?)]$/, ''));
  const local = [...message.matchAll(/(?:"([A-Za-z]:[\\/][^"\r\n]+)"|(?<![A-Za-z0-9])([A-Za-z]:[\\/][^"\r\n]+))/g)].map(m => (m[1] || m[2]).trim());
  if (message.trim().startsWith('/') && !message.includes('\n')) local.push(message.trim());
  return [...new Set([...urls, ...local])];
}

export function publicUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS URL without embedded credentials.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.+$/,'');
  let privateHost=host==='localhost'||host.endsWith('.localhost');
  if(isIP(host)===4){
    const [a,b,c]=host.split('.').map(Number);
    privateHost||=a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2||b===88&&c===99)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113;
  }else if(isIP(host)===6){
    // Public unicast only. This also rejects IPv4-mapped/compatible literals,
    // unique-local, link-local, unspecified, loopback and multicast addresses.
    const first=parseInt(host.split(':')[0],16);
    privateHost||=!(first>=0x2000&&first<=0x3fff)||/^2001:db8:/.test(host);
  }
  if(privateHost)throw new Error('This first version inspects public websites. Use a source folder for a local product.');
  url.hash = ''; return url;
}

export async function inspectPage(value, signal) {
  const requested = publicUrl(value); let url = requested, response;
  for (let i = 0; i <= 5; i++) {
    response = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'REA-Investigation-Desktop/0.1 (public source inspection)', Accept: 'text/html,text/plain,application/json' }, signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(25000)]) });
    if (![301,302,303,307,308].includes(response.status)) break;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location || i === 5) throw new Error('The page has an unsupported redirect chain.');
    url = publicUrl(new URL(location, url).href);
  }
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Page returned HTTP ${response.status}: ${url.href}`); }
  const type = response.headers.get('content-type') || '';
  if (!/(html|text|json|xml)/.test(type)) { await response.body?.cancel(); throw new Error(`Unsupported page type: ${type}`); }
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 3000000) throw new Error('Page exceeds the 3 MB inspection limit.'); chunks.push(chunk); }
  const raw = Buffer.concat(chunks).toString('utf8');
  const {title,text,links,scripts,truncated,sections,sourceCoverage}=extractHtml(raw,url.href);
  return {
    id: randomUUID(), kind: 'page', locator: url.href, requested: requested.href, title, capturedAt: new Date().toISOString(),
    sha256: hash(raw), text, raw, links: links.slice(0,120), scripts,sections,sourceCoverage,
    limitations: ['Public HTML describes or exposes client material; private implementation is unknown.', ...(truncated ? ['Section-balanced source excerpts capped at 24,000 characters and 160 sections; request a retained section for more detail.'] : []), 'Link discovery capped at 120 unique product-site URLs.']
  };
}

export async function inventoryDirectory(root) {
  const canonical = await fs.realpath(root);
  if (!(await fs.stat(canonical)).isDirectory()) throw new Error('Choose a source directory.');
  const files = []; let examined = 0, capped = false;
  async function walk(dir, depth) {
    if (depth > 12 || examined >= 6000) { capped = true; return; }
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (++examined > 6000) { capped = true; break; }
      if (entry.isSymbolicLink() || skip.test(entry.name)) continue;
      const full = path.join(dir, entry.name), rel = path.relative(canonical, full);
      if (sensitive.test(rel)) continue;
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (entry.isFile() && readable.test(entry.name)) files.push(rel.replaceAll('\\','/'));
    }
  }
  await walk(canonical, 0);
  return { root: canonical, files, limitations: [capped ? 'Directory inventory bounded at 6,000 entries and depth 12; partial coverage.' : 'Inventory excludes dependencies, generated folders, symlinks, credential files, and binary files.'] };
}

export async function inspectFile(target, relative, signal) {
  signal?.throwIfAborted();
  if (!target.files.includes(relative) || sensitive.test(relative)) throw new Error('File is outside the inventoried source set.');
  const root = await fs.realpath(target.root), full = await fs.realpath(path.resolve(root, relative));
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('File resolves outside the chosen directory.');
  const stat = await fs.stat(full);
  if (stat.size > 500000) throw new Error('File exceeds the 500 KB source limit; choose a smaller implementation file.');
  const raw = await fs.readFile(full, 'utf8');
  if (raw.includes('\0')) throw new Error('Binary content cannot be inspected as text.');
  const text = raw.slice(0,16000);
  return { id: randomUUID(), kind: 'file', locator: full, relative, title: relative, capturedAt: new Date().toISOString(), sha256: hash(raw), text, raw,
    lineStart: 1, lineEnd: text.split('\n').length, limitations: [text.length < raw.length ? 'Source excerpt capped at 16,000 characters; remaining implementation uninspected.' : 'Source was read statically; runtime behavior unverified.'] };
}

export function starterFiles(target, interest) {
  const terms = interest.toLowerCase().match(/[a-z]{4,}/g) || [];
  return [...target.files].sort((a,b) => score(b)-score(a)).slice(0,5);
  function score(file) {
    return (/README\.md$/i.test(file) ? 20 : 0) + (/^package\.json$|pyproject\.toml$/i.test(file) ? 18 : 0)
      + (/^(src|app|lib)\//.test(file) ? 10 : 0) + (/(main|index|server|app)\.[cm]?[jt]s$/.test(file) ? 13 : 0)
      + terms.filter(t => file.toLowerCase().includes(t)).length * 5 - file.split('/').length;
  }
}

export async function inspectBrowser(value, config, directory, signal) {
  const url = publicUrl(value).href;
  const request = { browser: { mode: 'launch', executable_path: config.browser, headless: true }, start_url: { url }, actions: [{step_id:'settle',action:'wait_for_timeout',duration_ms:2000}], capture: { at_end: ['dom','accessibility','url'], events: ['page-errors'] } };
  const requestPath = path.join(directory, `browser-${randomUUID()}.json`);
  await fs.writeFile(requestPath, JSON.stringify(request));
  const {stdout}=config.captureBrowser?{stdout:JSON.stringify(await config.captureBrowser(url,signal))}:await runProcess(config.node,[config.rea,'capture-browser-scenario',requestPath,'--format','json'],{signal,timeout:90000});
  const raw = JSON.parse(stdout), evidence = raw.evidence_id ? raw : (raw.result?.evidence_id ? raw.result : raw.data?.evidence_id ? raw.data : null);
  if (!evidence) throw new Error('REA did not return an Evidence record.');
  const normalized = evidence.normalized_result;
  const captured=[...(normalized.steps||[])].reverse().find(step=>step.artifacts?.dom?.state==='captured');
  const dom=captured?.artifacts.dom.value.text;
  if(!dom)throw new Error('REA did not capture readable DOM content.');
  const locator=captured.after_url?.url||url;
  const extracted=extractHtml(dom,locator);
  return { id: randomUUID(), kind: 'browser', locator, title: extracted.title, capturedAt: new Date().toISOString(), sha256: hash(stdout), text:extracted.text, links:extracted.links, scripts:extracted.scripts,sections:extracted.sections,sourceCoverage:extracted.sourceCoverage, raw: stdout, reaEvidenceId: evidence.evidence_id,
    limitations: [...(evidence.limitations || []), 'Fresh headless public-page capture; no authenticated workflows or private backend source.', ...(extracted.truncated ? ['Section-balanced source excerpts capped at 24,000 characters; full REA evidence saved.'] : [])] };
}

export async function inspectRetainedSection(parent,sectionId,signal){
  signal?.throwIfAborted();
  if(!parent.sections?.some(section=>section.id===sectionId))throw new Error('Section was not in the retained source inventory.');
  const raw=await fs.readFile(parent.snapshotPath,'utf8');let html=raw;
  if(hash(raw)!==parent.sha256)throw new Error('The retained source no longer matches its captured digest.');
  if(parent.kind==='browser'&&parent.captureRoute!=='electron-selected-session'){
    const capture=JSON.parse(raw);const steps=capture.normalized_result?.steps||capture.result?.normalized_result?.steps||[];
    html=steps.findLast(step=>step.artifacts?.dom?.state==='captured')?.artifacts.dom.value.text;
  }
  if(!html)throw new Error('Retained DOM content was unavailable.');
  const section=extractHtml(html,parent.locator,{fullSections:true}).fullSections.find(section=>section.id===sectionId);
  if(!section)throw new Error('Section identity changed unexpectedly.');
  const content=[section.headingPath.join(' > '),section.text].filter(Boolean).join('\n');
  return {id:randomUUID(),kind:'section',locator:parent.locator,title:section.headingPath.at(-1)||parent.title,text:content.slice(0,16000),raw:content,sha256:hash(content),capturedAt:new Date().toISOString(),parentEvidenceId:parent.id,sectionId,sourceSha256:parent.sha256,limitations:[...parent.limitations,'Read from the retained source snapshot; no new network observation.',...(content.length>16000?['Selected section excerpt capped at 16,000 characters.']:[])]};
}
