// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {spawn} from 'node:child_process';
import {openReaClient,unwrapReaResult,invalidReaOutput} from './rea-client.mjs';
import {fileIdentity,sqliteIdentity,sameIdentity,classifyTarget} from './targets.mjs';
import {publicUrl,extractHtml} from './sources.mjs';

const native=['binary_overview','list_procedures','search_procedures','list_names','search_strings','list_strings','analyze_function','procedure_info','procedure_callers','procedure_callees','procedure_references','procedure_pseudo_code','read_function_instructions','trace_feature','trace_call_path','read_bytes','xrefs','inspect_analysis_view'];
const javascript=['analyze_javascript_application','inspect_analysis_view','trace_application_feature','trace_javascript_semantics'];
const managed=['inspect_managed_artifact','inspect_managed_members','inspect_analysis_view'];
const archive=['inspect_artifact'];
const web=['analyze_web_bundle'];
const sqlite=['inspect_sqlite_database'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const stringify=value=>JSON.stringify(value,null,2);
const inspectionTarget=target=>target.inspectionTarget?{...target,...target.inspectionTarget,locator:target.locator,inspectionTarget:undefined}:target;
async function verifyComponent(target){
  const current=await classifyTarget(target.root),expected=target.inspectionTarget,actual=current.inspectionTarget;
  if(!sameIdentity(current.identity,target.identity)||!actual||actual.root!==expected.root||!sameIdentity(actual.identity,expected.identity)||JSON.stringify(actual.declaration.metadata)!==JSON.stringify(expected.declaration.metadata))throw new Error('The application or its declared inspection component changed. Review the target before inspecting it.');
}
// A delivery failure can retain a complete analysis. Accept only the server's
// explicit retained-reference receipt, never an arbitrary ID in diagnostic prose.
export function deliveryReference(value){
  const error=value?.error||unwrapReaResult(value)?.error;
  if(error?.code!=='resource_constraint'||error.details?.resource!=='transport')return '';
  const ref=error.details.reported_limits?.evidence_reference;
  return ref?.kind==='retained-evidence'&&/^ev_[a-f0-9]{64}$/.test(ref.evidence_id)?ref.evidence_id:'';
}
function savedDeliveryReference(source){try{return deliveryReference(JSON.parse(source.text));}catch{return '';}}
function nativeCount(state,target,field){const source=(state.evidence||[]).findLast(e=>e.operation==='binary_overview'&&e.evidenceStatus!=='inspection-failed'&&[target.root,target.locator].includes(e.locator));try{return JSON.parse(source?.text||'{}')[field];}catch{return undefined;}}
function managedCount(state,target){const source=(state.evidence||[]).findLast(e=>e.operation==='inspect_managed_artifact'&&e.evidenceStatus!=='inspection-failed'&&[target.root,target.locator].includes(e.locator));try{const value=JSON.parse(source?.text||'{}');return (value.summary||value).metadata?.table_row_counts?.MethodDef;}catch{return undefined;}}
// Present the safe retained-reference variants, not multi-megabyte inline Evidence schemas.
function planningSchema(name,schema,target,state){
  if(name==='inspect_managed_members'&&!(managedCount(state,inspectionTarget(target))<=100))return {...schema,required:[...new Set([...(schema.required||[]),'type_names'])]};
  const reference={type:'object',properties:{kind:{const:'retained-evidence'},evidence_id:{type:'string'}},required:['kind','evidence_id'],additionalProperties:false};
  if(name==='trace_application_feature')return {type:'object',properties:{application:reference,seed:{type:'object',properties:{kind:{enum:['node-id','route','string','channel','module','native-export']},value:{type:'string'}},required:['kind','value']},direction:{enum:['incoming','outgoing','both']}},required:['application','seed']};
  if(name==='inspect_analysis_view')return {type:'object',description:'Use only compatible retained analyses. Native views require analyze_function evidence. This REA version does not view or paginate list_strings/list_procedures; use focused search_strings/search_procedures instead.',properties:{source:reference,view:{description:'Use summary for compatible producers; page with collection modules/sections/symbols, offset and limit<=32; item with collection modules and selector.node_id; native analyze_function with facet pseudocode/procedure/callers/callees and offset/limit; managed-members with collection methods/types/call_edges.',type:'object',properties:{kind:{enum:['summary','page','item','native','managed','managed-members']},collection:{type:'string'},facet:{type:'string'},offset:{type:'integer'},limit:{type:'integer'},selector:{type:'object',properties:{node_id:{type:'string'}}}},required:['kind']}},required:['source','view']};
  if(name==='analyze_web_bundle')return {type:'object',properties:{},additionalProperties:false,description:'Host supplies the selected public page and its owned browser endpoint.'};
  if(name==='trace_javascript_semantics')return null;
  return schema;
}

export function reaEvidenceRecord(result,{operation,parameters={},target,status='static',text}={}){
  const value=unwrapReaResult(result),record=value?.evidence_id?value:value?.result?.evidence_id?value.result:null,normalized=record?.normalized_result??value?.result??value;
  for(const candidate of [value,value?.result,normalized])if(candidate&&typeof candidate==='object'){
    if('evidence_id' in candidate&&(typeof candidate.evidence_id!=='string'||!candidate.evidence_id.trim()))throw invalidReaOutput(operation,'evidence_id');
    if('limitations' in candidate&&(!Array.isArray(candidate.limitations)||candidate.limitations.some(item=>typeof item!=='string')))throw invalidReaOutput(operation,'limitations');
    if('locations' in candidate&&!Array.isArray(candidate.locations))throw invalidReaOutput(operation,'locations');
  }
  const raw=stringify(result),body=text||stringify(normalized),excerpt=body.slice(0,24000);
  const limitations=[...(record?.limitations||[]),...(normalized?.limitations||[]),...(body.length>24000?['Reasoning excerpt capped at 24,000 characters; complete operation result retained in the snapshot.']:[]),...(status==='static'?['Static REA inspection; target behavior has not been executed or independently checked by this operation.']:[])];
  return {id:randomUUID(),kind:'rea',locator:target?.root||target?.locator||'REA',title:`${operation} · ${path.basename(target?.root||target?.locator||'retained evidence')}`,capturedAt:new Date().toISOString(),sha256:sha(raw),raw,text:excerpt,reaEvidenceId:record?.evidence_id||'',reaParentEvidenceId:normalized?.parent_evidence_id||deliveryReference(result),operation,parameters,targetIdentity:target?.identity||null,analysisProfile:record?.analysis_profile||null,locations:record?.locations||[],evidenceStatus:status,applicability:target?.applicability||(target?.identity?'current':'unknown'),sourceCoverage:normalized?.source_coverage||normalized?.summary?.coverage||normalized?.coverage||normalized?.graph?.coverage||null,limitations:[...new Set(limitations)]};
}

export async function browserExecutable(config){
  if(config.browser)return config.browser;
  const roots=[path.join(homedir(),'AppData/Local/ms-playwright'),path.resolve('engines/browser')];
  for(const root of roots){let entries;try{entries=await fs.readdir(root);}catch{continue;}
    for(const entry of entries.filter(name=>/^chromium-/.test(name)).sort().reverse())for(const relative of ['chrome-win64/chrome.exe','chrome-win/chrome.exe','chrome-linux/chrome','chrome-mac/Chromium.app/Contents/MacOS/Chromium','chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium']){const file=path.join(root,entry,relative);try{await fs.access(file);return file;}catch{}}
  }
  throw new Error('REA browser observation needs a Chromium executable. Choose it in REA connection settings.');
}

export class ReaInvestigation{
  constructor(config,state,directory,{signal,onProgress=()=>{},addEvidence,saveState,openClient=openReaClient}={}){
    Object.assign(this,{config,state,directory,signal,onProgress,addEvidence,saveState,openClient});this.client=null;this.bound='';this.dirty=false;this.known=new Set();this.pendingReferences=new Set();this.references=new Map();
    for(const source of state.evidence||[]){
      const deliveryId=savedDeliveryReference(source);
      if(deliveryId&&!source.reaParentEvidenceId)source.reaParentEvidenceId=deliveryId;
      for(const id of [source.reaEvidenceId,source.reaParentEvidenceId].filter(Boolean)){if(!(state.reaUnretainedEvidenceIds||[]).includes(id))this.known.add(id);this.references.set(id,source.locator);}
    }
  }
  async connect(){
    if(this.config.reaEnabled===false)throw new Error('REA inspection is disabled for this isolated fixture.');
    if(this.client)return this.client;
    const config={...this.config};const [major,minor]=process.versions.node.split('.').map(Number);if(!config.reaNode&&process.versions.electron&&(major>24||major===24&&minor>=15)&&this.state.targets.some(target=>target.targetType==='sqlite'))config.reaNode=process.execPath;
    this.client=await this.openClient(config,{signal:this.signal});
    const saved=this.state.evidence.find(source=>source.id===this.state.reaBundleEvidenceId);
    if(saved){try{const raw=await fs.readFile(saved.snapshotPath);if(sha(raw)!==saved.sha256)throw new Error('Retained REA bundle digest mismatch.');const restored=await this.client.callTool('import_evidence_bundle',{path:saved.snapshotPath},{signal:this.signal});if(restored.isError)throw new Error(JSON.stringify(unwrapReaResult(restored)));}catch(error){await this.client.close();this.client=null;throw new Error(`Could not restore retained REA evidence: ${error.message}`);}}
    return this.client;
  }
  async invoke(operation,parameters,target){
    const client=await this.connect();this.onProgress(`REA: ${operation.replaceAll('_',' ')}…`);
    let raw;try{raw=await client.callTool(operation,parameters,{signal:this.signal,timeout:300000});}catch(error){if(client.closed||error.code==='STAGE_TIMEOUT'||this.signal?.aborted)this.primaryFailure??=error;try{await this.retainFailure(operation,parameters,target,error);}catch(secondary){this.recordSecondary(`Could not save ${operation} failure diagnostic`,secondary);}throw error;}this.dirty=true;
    let evidence;
    try{evidence=reaEvidenceRecord(raw,{operation,parameters,target});}catch(error){try{await this.retainFailure(operation,parameters,target,error);}catch(secondary){this.recordSecondary(`Could not save ${operation} failure diagnostic`,secondary);}throw error;}
    // Failed producer/delivery receipts already have failure provenance and may
    // carry a resumable retained reference. Preserve that primary failure;
    // freshness gates results that would otherwise be published as current.
    if(!raw?.isError&&evidence.sourceCoverage?.state!=='unavailable'&&target?.identity&&target.identity.kind!=='directory'){
      let now;try{now=target.targetType==='sqlite'?await sqliteIdentity(target.identity.path):await fileIdentity(target.identity.path);}catch{}
      if(!now||!sameIdentity(now,target.identity)){
        const error=new Error('The selected target changed during inspection. Start a new investigation for this artifact version; earlier evidence remains available.');error.code='TARGET_CHANGED_DURING_INSPECTION';error.data={operation,stage:'target-freshness',expectedSha256:target.identity.sha256,observedSha256:now?.sha256||null,outputUnavailable:false};
        evidence.evidenceStatus='inspection-failed';evidence.operationStatus='failed';evidence.applicability='changed';evidence.stale=true;evidence.limitations.push(error.message);if(this.addEvidence)try{await this.addEvidence(evidence);}catch(secondary){this.recordSecondary(`Could not save ${operation} changed-target output`,secondary);}throw error;
      }
    }
    for(const id of [evidence.reaEvidenceId,evidence.reaParentEvidenceId].filter(Boolean)){this.known.add(id);this.references.set(id,evidence.locator);this.pendingReferences.add(id);}
    this.state.reaUnretainedEvidenceIds=[...new Set([...(this.state.reaUnretainedEvidenceIds||[]),...this.pendingReferences])];
    if(!raw?.isError&&evidence.sourceCoverage?.state==='unavailable'){
      const reason=evidence.sourceCoverage.issues?.map(issue=>issue.detail).filter(Boolean).join('; ')||'The producer could not inspect this scope.';
      evidence.evidenceStatus='inspection-failed';evidence.operationStatus='failed';evidence.limitations.push(reason);
      if(this.addEvidence){await this.addEvidence(evidence);try{await this.checkpoint(this.addEvidence);}catch(error){this.state.activity?.push({at:new Date().toISOString(),reason:`Unavailable inspection checkpoint: ${error.message}`});}}
      throw new Error(`Inspection unavailable: ${reason} Use a supported narrower selection; empty returned rows do not establish absence.`);
    }
    if(raw?.isError){evidence.evidenceStatus='inspection-failed';evidence.operationStatus='failed';const failure=unwrapReaResult(raw);evidence.limitations.push(`Inspection failed: ${[failure.error?.code||failure.code,failure.error?.message||failure.message||JSON.stringify(failure).slice(0,1000)].filter(Boolean).join(': ')}`);if(this.addEvidence)await this.addEvidence(evidence);if(deliveryReference(raw)&&this.addEvidence)try{await this.checkpoint(this.addEvidence);}catch(error){evidence.reaReferenceAvailable=false;this.state.activity?.push({at:new Date().toISOString(),reason:`Retained analysis checkpoint unavailable: ${error.message}`});}throw new Error(evidence.limitations.find(limit=>limit.startsWith('Inspection failed:')));}
    const saved=this.addEvidence?await this.addEvidence(evidence):evidence;
    if(this.addEvidence&&this.pendingReferences.size)try{await this.checkpoint(this.addEvidence);}catch(error){saved.reaReferenceAvailable=false;saved.limitations.push(`Canonical REA resumption is unavailable until a checkpoint succeeds: ${error.message}`);(this.state.activity||=[]).push({at:new Date().toISOString(),reason:saved.limitations.at(-1)});}
    return saved;
  }
  async retainFailure(operation,parameters,target,error){
    const raw={operation,parameters,error:{message:error.message,code:error.code||null,details:error.data||null},outputUnavailable:true},evidence=reaEvidenceRecord(raw,{operation,parameters,target,status:'inspection-failed'});evidence.operationStatus='failed';evidence.limitations.push('The operation did not return a complete result. This retained diagnostic is not a successful inspection.');if(this.addEvidence)await this.addEvidence(evidence);return evidence;
  }
  async bind(target){
    await this.routePackagedTarget(target);
    if(target.inspectionTarget){
      await verifyComponent(target);
      await this.bind(inspectionTarget(target));return;
    }
    if(target.identity?.kind==='directory'&&target.applicability==='changed')throw new Error('The inventoried source folder changed. Start a new investigation for this version; earlier evidence remains readable.');
    if(target.identity&&target.identity.kind!=='directory'){const now=target.targetType==='sqlite'?await sqliteIdentity(target.identity.path):await fileIdentity(target.identity.path);if(!sameIdentity(now,target.identity))throw new Error('The selected target changed. Start a new investigation for this artifact version; earlier evidence remains available.');}
    if(!['native','archive'].includes(target.targetType)||this.bound===target.root)return;
    await this.invoke('open_binary',{path:target.root},target);this.bound=target.root;
  }
  async seed(target){
    await this.routePackagedTarget(target);
    if(target.inspectionTarget){
      // Check the selected entry, companion and declarations before using this
      // packaging relationship. No application or manifest command is executed.
      await verifyComponent(target);
      const raw=stringify(target.inspectionTarget.declaration);
      if(this.addEvidence)await this.addEvidence({id:randomUUID(),kind:'artifact-manifest',locator:target.root,title:target.inspectionTarget.targetType==='managed'?'Declared application assembly':'Packaged JavaScript application',raw,text:raw,sha256:sha(raw),capturedAt:new Date().toISOString(),targetIdentity:target.identity,evidenceStatus:'static',limitations:['Packaging declarations connect the launcher to this implementation. They do not establish execution or whole-product coverage.']});
      return this.seed(inspectionTarget(target));
    }
    await this.connect();const records=[];
    if(target.targetType==='native'||target.targetType==='archive'){
      records.push(await this.invoke('open_binary',{path:target.root},target));this.bound=target.root;
      records.push(await this.invoke(target.targetType==='archive'?'inspect_artifact':'binary_overview',{},target));
    }else if(target.targetType==='sqlite'){
      records.push(await this.invoke('inspect_sqlite_database',{path:target.root,schema_scope:'inventory'},target));
    }else if(target.targetType==='managed'){
      records.push(await this.invoke('inspect_managed_artifact',{path:target.root,detail:'summary'},target));
      // A summary limits delivery, not member decoding. Keep large/unknown
      // assemblies scoped to a bootstrap query; this is explicitly NOT a full
      // type inventory. Unmatched names and the selected scope remain recorded.
      const members={path:target.root,detail:'summary',...(managedCount(this.state,target)<=100?{}:{type_names:['<Module>']})};
      records.push(await this.invoke('inspect_managed_members',members,target));
      const parent=records.at(-1).reaParentEvidenceId;
      if(parent)records.push(await this.invoke('inspect_analysis_view',{source:{kind:'retained-evidence',evidence_id:parent},view:{kind:'managed-members',collection:'types',offset:0,limit:24}},target));
    }else if(target.targetType==='javascript'||target.kind==='repository'&&target.files?.some(file=>/\.[cm]?jsx?$/.test(file))){
      const parameters={input_path:target.root,detail:'summary',analysis_timeout_ms:60000};
      if(target.kind==='repository')parameters.source_paths=target.files.filter(file=>/\.[cm]?jsx?$|(?:^|\/)package\.json$/.test(file)).slice(0,12);
      if(target.bootstrapSources)parameters.source_paths=target.bootstrapSources;
      records.push(await this.invoke('analyze_javascript_application',parameters,target));
      const parent=records[0].reaParentEvidenceId;
      if(parent)records.push(await this.invoke('inspect_analysis_view',{source:{kind:'retained-evidence',evidence_id:parent},view:{kind:'page',collection:'modules',offset:0,limit:24}},target));
    }else throw new Error('This target format has no supported REA analysis route. Choose a native binary, managed assembly, ASAR, archive, SQLite snapshot, or JavaScript application folder.');
    return records;
  }
  names(target){if(target.inspectionTarget)return this.names(inspectionTarget(target));return target.kind==='website'?web:target.kind==='repository'||target.targetType==='javascript'?javascript:target.targetType==='sqlite'?sqlite:target.targetType==='managed'?managed:target.targetType==='archive'?archive:target.targetType==='native'?native:[];}
  async routePackagedTarget(target){
    // Older saved investigations may still identify the Electron launcher as
    // native. Recheck unchanged bytes before offering or dispatching operations.
    if(target.targetType!=='native'||target.inspectionTarget||!target.identity||!target.root?.toLowerCase().endsWith('.exe'))return;
    this.routingChecked??=new WeakSet();if(this.routingChecked.has(target))return;
    let current;try{current=await classifyTarget(target.root);}catch(error){if(['ENOENT','ENOTDIR','EACCES','EPERM'].includes(error.code)){this.routingChecked.add(target);return;}throw error;}
    if(!sameIdentity(current.identity,target.identity))throw new Error('The selected application changed. Review this version before inspecting it.');
    if(current.inspectionTarget){target.inspectionTarget=current.inspectionTarget;target.limitations=[...new Set([...(target.limitations||[]),...current.limitations])];}
    this.routingChecked.add(target);
  }
  async catalog(){
    if(this.config.reaEnabled===false)return [];
    for(const target of this.state.targets)await this.routePackagedTarget(target);
    const targets=this.state.targets.filter(target=>this.names(target).length);if(!targets.length)return [];
    const client=await this.connect(),catalog=[];
    for(const target of targets){
      let availability=[];try{const status=await client.sessionStatus({signal:this.signal});availability=(status.result||status).tool_availability?.groups||[];}catch{}
      catalog.push({target:target.locator,targetType:inspectionTarget(target).targetType||'javascript',inspectionRoot:inspectionTarget(target).root,identity:inspectionTarget(target).identity,operations:client.tools.filter(tool=>this.names(target).includes(tool.name)&&!(tool.name==='list_procedures'&&!(nativeCount(this.state,target,'procedure_count')<=100))&&!availability.some(group=>group.names?.includes(tool.name)&&!group.available&&group.reason!=='target_required')).map(({name,inputSchema,description})=>({name,inputSchema:name==='list_strings'&&!(nativeCount(this.state,target,'string_count')<=100)?{...inputSchema,required:[...new Set([...(inputSchema.required||[]),'address'])]}:planningSchema(name,inputSchema,target,this.state),description:name==='list_strings'?'Read one known string address. For discovery use search_strings with a focused literal pattern. This provider offers no offset/limit for list_strings.':description?.slice(0,300)})).filter(tool=>tool.inputSchema)});
    }
    return catalog;
  }
  validateArguments(operation,args,target){
    if(target.inspectionTarget){if(args.path===target.root)args.path=target.inspectionTarget.root;return this.validateArguments(operation,args,inspectionTarget(target));}
    if(!this.names(target).includes(operation))throw new Error('This REA operation is outside the selected target’s inspection scope.');
    if(operation==='list_strings'&&!args.address&&!(nativeCount(this.state,target,'string_count')<=100))throw new Error('The string inventory is large or unknown. Use search_strings with a focused literal pattern, or list_strings at one known address. This provider does not paginate list_strings.');
    if(operation==='list_procedures'&&!(nativeCount(this.state,target,'procedure_count')<=100))throw new Error('The procedure inventory is large or unknown. Use search_procedures with a focused name pattern instead of listing every procedure.');
    const walk=(value,key='')=>{
      if(Array.isArray(value)){if(value.length>100)throw new Error('Narrow the inspection to fewer inputs.');for(const item of value)walk(item,key);return;}
      if(value&&typeof value==='object'){if(['source','application'].includes(key)&&value.kind!=='retained-evidence')throw new Error('Use an existing retained REA evidence reference.');for(const [k,v]of Object.entries(value))walk(v,k);return;}
      if(['path','input_path','snapshot_path','output_directory','executable_path','document'].includes(key)&&value!==target.root)throw new Error('REA paths must match the selected target.');
      if(['cdp_endpoint','target_id','allowed_origins'].includes(key))throw new Error('Browser endpoints are selected by the host, not the inspection plan.');
      if(key==='evidence_id'&&!this.known.has(value))throw new Error('The REA evidence reference is not part of this investigation.');
      if(key==='evidence_id'&&this.references.has(value)&&![target.root,target.locator].includes(this.references.get(value)))throw new Error('This retained evidence belongs to a different selected target.');
      if(key==='limit'&&(!Number.isInteger(value)||value<1||value>12000))throw new Error('Use a bounded retained evidence view.');
    };walk(args);
    if(operation==='analyze_javascript_application'){
      args.input_path=target.root;args.detail='summary';args.analysis_timeout_ms=60000;
      if(target.kind==='repository'){
        if(!Array.isArray(args.source_paths)||!args.source_paths.length||args.source_paths.length>16||args.source_paths.some(file=>!target.files.includes(file)))throw new Error('Select up to 16 exact inventoried JavaScript source paths.');
      }
    }
    if(operation.startsWith('inspect_managed_')||operation==='inspect_sqlite_database')args.path=target.root;
    if(operation==='inspect_managed_members'){
      if(args.type_names===undefined?!(managedCount(this.state,target)<=100):!Array.isArray(args.type_names)||args.type_names.length<1||args.type_names.length>8||args.type_names.some(name=>typeof name!=='string'||!name.trim()||name.length>300))throw new Error('Inspect one to eight exact declaring type names. Selected-type pages are not a full assembly inventory; an unfiltered member decode can exceed the provider representation budget.');
      args.detail='summary';
    }
    if(operation==='inspect_sqlite_database'&&args.row_limit!==undefined&&(!Number.isInteger(args.row_limit)||args.row_limit<0||args.row_limit>100))throw new Error('Sample at most 100 database rows.');
    if(operation==='inspect_analysis_view'&&args.view?.kind==='page'&&args.view.limit>32)throw new Error('Page at most 32 retained items.');
    return args;
  }
  async read(read){
    const target=this.state.targets.find(target=>target.locator===read.target||target.root===read.target);if(!target)throw new Error('REA target was not selected in this investigation.');
    await this.routePackagedTarget(target);
    if((read.argumentsJson||'').length>30000)throw new Error('Narrow the REA inspection arguments.');
    let args;try{args=JSON.parse(read.argumentsJson||'{}');}catch{throw new Error('REA inspection arguments must be JSON.');}
    if(!args||Array.isArray(args)||typeof args!=='object')throw new Error('REA arguments must be an object.');
    this.validateArguments(read.operation,args,target);if(!['inspect_analysis_view','trace_application_feature','trace_javascript_semantics'].includes(read.operation))await this.bind(target);
    if(read.operation==='analyze_web_bundle')Object.assign(args,await this.webEndpoint(target),{allowed_origins:[new URL(publicUrl(target.locator)).origin],include_script_sources:true,fetch_source_maps:false,observation_ms:1500});
    return this.invoke(read.operation,args,inspectionTarget(target));
  }
  async webEndpoint(target){
    if(this.web?.url===target.locator)return this.web.connection;
    await this.closeWeb();const url=publicUrl(target.locator).href,profile=await fs.mkdtemp(path.join(this.directory,'rea-browser-'));
    const child=spawn(await browserExecutable(this.config),['--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check',url],{windowsHide:true,stdio:'ignore',shell:false});
    let startupError;child.on('error',error=>{startupError=error;});this.web={child,profile,url};
    const abort=()=>{this.closeWeb().catch(()=>{});};this.signal?.addEventListener('abort',abort,{once:true});this.web.abort=abort;
    for(let attempt=0;attempt<100;attempt++){
      this.signal?.throwIfAborted();if(startupError)throw startupError;
      try{const port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(!Number.isInteger(port)||port<1)throw new Error('Browser endpoint unavailable.');const endpoint=`http://127.0.0.1:${port}`,pages=await (await fetch(`${endpoint}/json/list`,{signal:AbortSignal.timeout(3000)})).json();const page=pages.find(page=>page.type==='page'&&page.url===url);if(page){await this.navigateOwnedPage(page.webSocketDebuggerUrl,url);this.web.connection={cdp_endpoint:endpoint,target_id:page.id};return this.web.connection;}}catch(error){if(this.signal?.aborted)throw error;if(this.web?.navigationStarted)throw error;}
      await new Promise(resolve=>setTimeout(resolve,150));
    }
    throw new Error('The owned browser page did not expose its expected target.');
  }
  async navigateOwnedPage(endpoint,url){
    this.web.navigationStarted=true;const socket=new WebSocket(endpoint);let sequence=0;const pending=new Map();
    const fail=error=>{for(const request of pending.values())request.reject(error);pending.clear();socket.close();};
    socket.addEventListener('message',event=>{let value;try{value=JSON.parse(event.data);}catch{return;}const request=pending.get(value.id);if(request){pending.delete(value.id);value.error?request.reject(new Error(value.error.message)):request.resolve(value.result);}});
    socket.addEventListener('error',()=>fail(new Error('Could not inspect the owned browser page.')));
    const abort=()=>fail(new Error('Investigation stopped.'));this.signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>fail(new Error('The owned browser page did not settle within 25 seconds.')),25000);
    const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
    try{
      await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});socket.addEventListener('close',()=>reject(new Error('Owned browser connection closed before initialization.')),{once:true});});
      this.signal?.throwIfAborted();await call('Page.enable');const navigation=await call('Page.navigate',{url});if(navigation.errorText)throw new Error(`Browser navigation failed: ${navigation.errorText}`);
      for(let attempt=0;attempt<100;attempt++){
        this.signal?.throwIfAborted();const result=await call('Runtime.evaluate',{expression:'JSON.stringify({url:location.href,ready:document.readyState})',returnByValue:true});let page;try{page=JSON.parse(result.result?.value);}catch{}
        if(page?.url&&/^https?:/.test(page.url)&&new URL(publicUrl(page.url)).origin!==new URL(url).origin)throw new Error('The page redirected outside the selected origin. Add that public URL explicitly to inspect it.');
        if(page?.ready==='complete'&&page.url&&new URL(page.url).origin===new URL(url).origin)return;
        await new Promise(resolve=>setTimeout(resolve,150));
      }
      throw new Error('The owned browser page did not finish loading.');
    }finally{clearTimeout(timer);this.signal?.removeEventListener('abort',abort);socket.close();}
  }
  async closeWeb(){
    const web=this.web;if(!web)return;this.web=null;this.signal?.removeEventListener('abort',web.abort);
    if(web.child.pid&&web.child.exitCode===null){if(process.platform==='win32')await new Promise(resolve=>{const stop=spawn('taskkill.exe',['/PID',String(web.child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});stop.on('error',()=>{web.child.kill();resolve();});stop.on('close',resolve);});else web.child.kill('SIGTERM');}
    const relative=path.relative(path.resolve(this.directory),path.resolve(web.profile));if(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.basename(web.profile).startsWith('rea-browser-'))await fs.rm(web.profile,{recursive:true,force:true,maxRetries:3,retryDelay:150}).catch(()=>{});
  }
  async captureBrowser(url){
    const args={browser:{mode:'launch',executable_path:await browserExecutable(this.config),headless:true},start_url:{url},actions:[{step_id:'settle',action:'wait_for_timeout',duration_ms:1500}],capture:{at_end:['dom','accessibility','url'],events:['page-errors']}};
    const client=await this.connect();let raw;try{raw=await client.callTool('capture_browser_scenario',args,{signal:this.signal,timeout:90000});}catch(error){await this.retainFailure('capture_browser_scenario',args,{locator:url},error);throw error;}
    if(raw.isError){this.dirty=true;const record=reaEvidenceRecord(raw,{operation:'capture_browser_scenario',parameters:args,target:{locator:url},status:'inspection-failed'});record.operationStatus='failed';if(this.addEvidence)await this.addEvidence(record);throw new Error(JSON.stringify(unwrapReaResult(raw)).slice(0,1500));}
    this.dirty=true;const evidence=reaEvidenceRecord(raw,{operation:'capture_browser_scenario',parameters:args,target:{locator:url},status:'runtime-observed'}),value=unwrapReaResult(raw),observation=value.normalized_result||value.result?.normalized_result;
    const step=observation?.steps?.findLast(step=>step.artifacts?.dom?.state==='captured'),dom=step?.artifacts?.dom?.value?.text;if(dom){const locator=publicUrl(step.after_url?.url||url).href;Object.assign(evidence,extractHtml(dom,locator),{locator});}
    if(evidence.reaEvidenceId){this.known.add(evidence.reaEvidenceId);this.pendingReferences.add(evidence.reaEvidenceId);this.references.set(evidence.reaEvidenceId,url);this.state.reaUnretainedEvidenceIds=[...new Set([...(this.state.reaUnretainedEvidenceIds||[]),...this.pendingReferences])];}evidence.limitations.push('Public page observation only; no authenticated workflow, private backend inspection or behavioral equivalence check.');const saved=this.addEvidence?await this.addEvidence(evidence):evidence;if(this.addEvidence)try{await this.checkpoint(this.addEvidence);}catch(error){saved.reaReferenceAvailable=false;saved.limitations.push(`Canonical REA resumption is unavailable until a checkpoint succeeds: ${error.message}`);}return saved;
  }
  async checkpoint(addEvidence){
    if(!this.client||!this.dirty)return;
    const file=path.join(this.directory,`rea-bundle-${randomUUID()}.json`);
    try{const result=await this.client.callTool('export_evidence_bundle',{path:file},{signal:this.signal});if(result.isError)throw new Error(JSON.stringify(unwrapReaResult(result)));const raw=await fs.readFile(file,'utf8');const record=await addEvidence({id:randomUUID(),kind:'rea-bundle',locator:this.directory,title:'Retained REA session evidence',capturedAt:new Date().toISOString(),sha256:sha(raw),raw,text:'Portable retained REA observations. Use selected evidence records and retained views for interpretation.',limitations:['Retained historical evidence; importing it does not execute or freshly inspect the original target.']});this.state.reaBundleEvidenceId=record.id;this.state.reaUnretainedEvidenceIds=(this.state.reaUnretainedEvidenceIds||[]).filter(id=>!this.pendingReferences.has(id));for(const source of this.state.evidence)if(this.pendingReferences.has(source.reaEvidenceId)||this.pendingReferences.has(source.reaParentEvidenceId))source.reaReferenceAvailable=true;this.pendingReferences.clear();this.dirty=false;await this.saveState?.();}finally{await fs.unlink(file).catch(()=>{});}
  }
  async finish(addEvidence){
    let failure=this.primaryFailure;
    try{await this.checkpoint(addEvidence);}catch(error){if(failure&&error!==failure)this.recordSecondary('REA evidence checkpoint',error);failure??=error;}
    try{await this.closeWeb();}catch(error){this.recordSecondary('Browser cleanup',error);failure??=error;}
    try{await this.client?.close();}catch(error){this.recordSecondary('REA session cleanup',error);failure??=error;}finally{this.client=null;}
    if(failure)throw failure;
  }
  recordSecondary(phase,error){(this.state.activity||=[]).push({at:new Date().toISOString(),reason:`${phase}: ${error.message||String(error)}`,secondary:true});}
}
