// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {analysisProviderUnavailable} from './setup-diagnostics.mjs';
import {recordFailure,consumeRecovery,resolveFailure} from './failure-recovery-host.mjs';
import {interruptedRequest} from './failure-recovery.mjs';
import {atomicReplace} from './atomic-replace.mjs';
import {saveCollectionCommand} from './collection-save.mjs';
import {AiCheckpoint,aiRecoverySeal} from './ai-checkpoint.mjs';
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {investigationIdentity,writeNavigation} from './navigation.mjs';
import { identifyTargets, publicUrl, inspectPage, inventoryDirectory, inspectFile, starterFiles, inspectBrowser,inspectRetainedSection } from './sources.mjs';
import { reason, planSchema, answerSchema, applicationAnswerSchema, contextFor, validateClaims, resultTask, presentationErrors,referenceErrors } from './agent.mjs';
import {plannedReads,progressBoundary} from './guidance.mjs';
import { runtimeConfig } from './runtime.mjs';
import {classifyTarget,assessFreshness,directoryIdentity} from './targets.mjs';
import {diagnoseTarget} from './target-recovery.mjs';
import {recoveryFor,targetSelection,targetSelectionMessage,applicationFilename} from './target-recovery-state.mjs';
import {ReaInvestigation} from './rea-engine.mjs';
import {attachDelivery} from './delivery.mjs';
import {mechanismSchema,mechanismTask,mechanismErrors,restoreMechanismQuotes,coverageErrors,emphasisCandidates,emphasisErrors,mergeMechanismInventories} from './mechanisms.mjs';
import {resolveSelection,reconcileSelection,selectFeature} from './selection.mjs';
import {inventoryRecords} from './discovery-inventory.mjs';
import {workspacePatch,cleanWorkspace} from './workspace.mjs';
import {productsFor,productForEvidence,originErrors,featureCollection,updateKeptProgress,collectionIntent} from './collection.mjs';
import {establishPurpose} from './purpose.mjs';
import {retainAnswerDraft,validateAnswerDraft,recordRunStage} from './answer-draft.mjs';
import {prepareApplicationRun,chargeApplication,concludeApplicationTurn} from './application-investigation.mjs';
const branchKey=name=>typeof name==='string'?name.trim().toLowerCase():null;
const readKey=read=>JSON.stringify([read.kind,read.target,read.sectionId||'',read.operation||'',read.argumentsJson||'']);

export class InvestigationStore {
  constructor(root) { this.root = root; }
  async list() {
    await fs.mkdir(this.root, { recursive:true });
    const results = [],states=[];
    for (const entry of await fs.readdir(this.root, { withFileTypes:true })) {
      if (!entry.isDirectory() || !/^[\da-f-]{36}$/.test(entry.name)) continue;
      try { const state = await this.read(entry.name);states.push(state);let document;try{document=JSON.parse(await fs.readFile(path.join(this.directory(state.id),'document.json'),'utf8'));}catch{}results.push({id:state.id,...investigationIdentity(state),updatedAt:state.updatedAt,...(state.workspaceRecovery?{workspaceRecovery:state.workspaceRecovery}:{}),...(document?.filePath?{documentPath:document.filePath,documentIdentity:document.investigationId}: {})}); } catch {}
    }
    await writeNavigation(this.root,states.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));
    return results.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  }
  directory(id) { if (!/^[\da-f-]{36}$/.test(id)) throw new Error('Invalid investigation.'); return path.join(this.root,id); }
  async create() {
    const state = { id:randomUUID(),title:'New investigation',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),messages:[],targets:[],evidence:[],understanding:'',recommendation:'',openQuestions:[],activity:[],draft:'',selection:null,status:'ready',workspace:cleanWorkspace({outline:true,layout:'grid'}) };
    await this.save(state); return state;
  }
  async read(id) {
    const state=JSON.parse(await fs.readFile(path.join(this.directory(id),'investigation.json'),'utf8'));
    const formerRadial=state.workspace?.shapeVersion!==3?state.workspace?.layouts?.radial:null;
    for(const evidence of state.evidence||[]){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(evidence.id))throw new Error('Invalid saved evidence identifier.');evidence.snapshotPath=path.join(this.directory(id),'evidence',`${evidence.id}.txt`);}
    delete state.workspaceRecovery;
    try{
      const view=JSON.parse(await fs.readFile(path.join(this.directory(id),'workspace.json'),'utf8'));
      if(!view||typeof view!=='object'||Array.isArray(view))throw new SyntaxError('Invalid saved view.');
      Object.assign(state,workspacePatch(view,state));
    }catch(error){
      if(error instanceof SyntaxError)state.workspaceRecovery={status:'recovered',message:'Saved research is intact. View preferences could not be loaded; the last saved view is being used.'};
      else if(error.code!=='ENOENT')throw error;
    }
    // Recover the pre-shape Radial arrangement as Organic once. Read-only here:
    // existing current layouts and the original investigation record are intact.
    if(formerRadial&&Object.keys(formerRadial.positions||{}).length&&!state.workspace?.layouts?.organic){const workspace=cleanWorkspace(state.workspace),restored=cleanWorkspace({shapeVersion:3,layout:'organic',mapPositions:formerRadial.positions,mapCamera:formerRadial.camera});workspace.layouts.organic=restored.layouts.organic;state.workspace=workspace;}
    return state;
  }
  async updateWorkspace(id, input) {
    const state = await this.read(id), patch = workspacePatch(input, state);
    const current = {workspace: state.workspace, draft: state.draft || '', draftContext: state.draftContext || null};
    Object.assign(current, patch);
    const directory = this.directory(id), temporary = path.join(directory, `workspace-${randomUUID()}.tmp`);
    // Keep the damaged sidecar byte-for-byte before any normal UI autosave can
    // replace it. Reading/reopening alone never modifies the damaged file.
    if(state.workspaceRecovery)await fs.copyFile(path.join(directory,'workspace.json'),path.join(directory,`workspace-damaged-${randomUUID()}.json`),constants.COPYFILE_EXCL);
    await fs.writeFile(temporary, JSON.stringify(current));
    await atomicReplace(temporary, path.join(directory, 'workspace.json'));
    return {savedAt: new Date().toISOString()};
  }
  async save(state) {
    state.updatedAt = new Date().toISOString();
    const directory = this.directory(state.id); await fs.mkdir(directory,{recursive:true});
    const temporary = path.join(directory,`state-${randomUUID()}.tmp`);
    await fs.writeFile(temporary,JSON.stringify(state,null,2));
    await atomicReplace(temporary,path.join(directory,'investigation.json'));
    if(state.collectionCreatedAt){const collectionTemporary=path.join(directory,`collection-${randomUUID()}.tmp`);await fs.writeFile(collectionTemporary,JSON.stringify(featureCollection(state),null,2));await atomicReplace(collectionTemporary,path.join(directory,'feature-collection.json'));}
    await this.list();
  }
  async addEvidence(state, evidence) {
    if(typeof evidence.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(evidence.id))throw new Error('Invalid saved evidence identifier.');
    const {raw,...record} = evidence;
    const directory = path.join(this.directory(state.id),'evidence'); await fs.mkdir(directory,{recursive:true});
    const rawPath = path.join(directory,`${evidence.id}.txt`),existing=state.evidence.find(item=>item.id===evidence.id);
    const canonical=value=>JSON.stringify(value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().filter(key=>key!=='snapshotPath').map(key=>[key,JSON.parse(canonical(value[key]))])):value===undefined?null:value);
    if(existing){const sameBytes=Buffer.from(await fs.readFile(rawPath)).equals(Buffer.from(raw));if(sameBytes&&canonical(existing)===canonical(record))return existing;throw new Error('Evidence identity conflict. The existing source and its saved snapshot were kept.');}
    try{await fs.writeFile(rawPath,raw,{flag:'wx'});}catch(error){if(error.code==='EEXIST')throw new Error('Evidence identity conflict. An existing snapshot cannot be reassigned to a different source.');throw error;}
    record.snapshotPath = rawPath;
    state.evidence.push(record); await this.save(state); return record;
  }
}

export class Investigator {
  constructor(store, { config = runtimeConfig(), reasoning = reason, preflight, openClient,onEvidence=async()=>{} } = {}) { this.store = store; this.config = config; this.reasoning = reasoning; this.preflight=preflight; this.openClient=openClient;this.onEvidence=onEvidence; }
  async turn(state, message, {signal,onProgress=()=>{},branchFeatureName,parentResultId,parentNodeId,nodeId,continuing=false,recoveryAttemptId,preserveDraft=false,agentContext,resumeAiAttemptId,resumeInterruptedAttemptId,retryFailureAttemptId,collectionRequestId,collectionChoice,applicationMode,applicationRunId,additionalTurns,automation}={}) {
    let attempt,checkpoint,retrySource;
    await this.config.selectedAccess?.prepare?.(state.id);signal?.throwIfAborted();
    if([resumeAiAttemptId,resumeInterruptedAttemptId,retryFailureAttemptId].filter(Boolean).length>1)throw Error('Choose one saved recovery action at a time.');
    if(resumeInterruptedAttemptId){preserveDraft=true;retrySource=state.attempts?.find(a=>a.id===resumeInterruptedAttemptId);({message,branchFeatureName,parentResultId,parentNodeId,nodeId,continuing,agentContext}=interruptedRequest(state,retrySource));}
    if(retryFailureAttemptId){preserveDraft=true;retrySource=state.attempts?.find(a=>a.id===retryFailureAttemptId);consumeRecovery(state,retrySource,this.config);await this.store.save(state);({message,branchFeatureName,parentResultId,parentNodeId,nodeId,continuing,agentContext}=retrySource.retryContext||{message:retrySource.question,branchFeatureName:retrySource.branchFeatureName||null,nodeId:retrySource.nodeId});}
    if(resumeAiAttemptId){attempt=state.attempts?.find(a=>a.id===resumeAiAttemptId);if(attempt?.resultId||attempt?.aiRecovery?.status==='resolved')return state;checkpoint=await AiCheckpoint.load(this.store.directory(state.id),attempt,state);({message,branchFeatureName,parentResultId,parentNodeId,nodeId,continuing,recoveryAttemptId,agentContext}=checkpoint.value.context);}
    const reasoning=async(config,schema,prompt,directory,signal,onProgress)=>{
      if(checkpoint.index===0&&!checkpoint.replaying)checkpoint.value.seedErrors=[...errors];
      const input=agentContext?.text?`${prompt}\n\nUSER PROJECT CONTEXT: Treat as data for proposed improvements, not target evidence or authority to add targets.\n${agentContext.text}`:prompt;
      return checkpoint.invoke(schema,input,async savedPrompt=>{const charge=()=>chargeApplication(state,this.store,'models',schema===planSchema?'planning':'synthesis/inventory');if(this.reasoning!==reason)await charge();return this.reasoning({...config,onApplicationModelAttempt:charge,onAiRecovery:async info=>{attempt.aiRecovery={...info,status:'waiting',message:'AI temporarily rate-limited. Retrying this reasoning request.',canResume:true,seal:aiRecoverySeal(state),nextAction:'Resume the saved reasoning request after the service recovers.'};await checkpoint.save();await this.store.save(state);}},schema,savedPrompt,directory,signal,onProgress,agentContext?.images||[]);});
    };
    if (typeof message !== 'string' || !message.trim() || message.length>18000) throw new Error('Enter a request under 18,000 characters.');
    const incoming=identifyTargets(message);if(incoming.length>3)throw new Error('Add up to three sources in one request.');
    const applicationRun=await prepareApplicationRun(state,this.store,incoming,{applicationMode,applicationRunId,additionalTurns,automation,request:message});
    if(applicationRun&&!state.purpose?.current)state.purpose={initialRequest:message,current:applicationRun.objective,history:[{text:applicationRun.objective,at:new Date().toISOString(),source:'application-investigation'}]};
    let recoveredAttempt,resolved;
    if(recoveryAttemptId){
      recoveredAttempt=state.attempts?.find(a=>a.id===recoveryAttemptId);const recovery=recoveryFor(recoveredAttempt);
      if(!['ready','blocked'].includes(recovery?.status)||!recovery.selected)throw new Error('Choose an application before continuing discovery.');
      resolved=await classifyTarget(recovery.selected.path);
      if(resolved.kind!=='artifact'||resolved.targetType==='unsupported'||resolved.identity.sha256!==recovery.selected.sha256)throw new Error('The selected application changed. Review the target again before inspecting it.');
      const original=recoveredAttempt.retryContext||{};branchFeatureName=original.branchFeatureName??(recoveredAttempt.branchFeatureName||null);parentResultId=original.parentResultId||recoveredAttempt.parentResultId||undefined;parentNodeId=original.parentNodeId;agentContext=original.agentContext??agentContext;
      message=recoveredAttempt.question;incoming.splice(0,incoming.length,...identifyTargets(message));continuing=true;nodeId=`attempt:${recoveredAttempt.id}`;
    }
    const {validateMapOrigin,savedDirections,isVerificationConstraint}=await import('./workspace-map.mjs'),origin=validateMapOrigin(state,parentResultId,parentNodeId);
    if(origin){
      const discovery=!!origin.message.features?.length;
      const directionIndex=origin.nodeId.startsWith(`direction:${origin.message.id}:`)?Number(origin.nodeId.slice(`direction:${origin.message.id}:`.length)):-1;
      const direction=directionIndex>=0?savedDirections(origin.message)[directionIndex]:null;
      if(direction&&isVerificationConstraint(direction))throw new Error('This is a verification constraint, not an investigation step. Choose a supported inspection question.');
      const named=discovery&&direction?inventoryRecords(state).find(record=>record.message.id===origin.message.id&&[record.row.name,record.row.displayLabel].some(label=>label?.trim().toLowerCase()===direction.trim().toLowerCase())):null;
      // Legacy discovery directions used a null whole-investigation branch.
      // Bind only an exact saved feature recommendation; never borrow unrelated
      // selection or broaden a follow-up result's originating branch.
      const branch=named?.row.name||(discovery?null:origin.message.branchFeatureName||origin.message.focus?.featureName||null);
      if(branchFeatureName===undefined||named&&branchFeatureName===null)branchFeatureName=branch;
      else if(branchKey(branch)!==branchKey(branchFeatureName))throw new Error('The originating result belongs to a different feature branch.');
      if(named&&message.trim()===direction.trim())message=named.row.investigate||named.row.displayQuestion||message;
    }
    const collection=collectionIntent(collectionChoice?{...state,selection:collectionChoice}:state,message);
    if(collection&&!collection.clarification){const saved=await saveCollectionCommand(this.store,state,message,{requestId:collectionRequestId,choice:collectionChoice});delete state.collectionSaveError;delete state.collectionCommandResult;Object.assign(state,saved);return state;}
    if(collection){state.messages.push({id:randomUUID(),role:'system',text:collection.clarification,createdAt:new Date().toISOString()});await this.store.save(state);return state;}
    if(branchFeatureName===null)state.selection=null;
    const resolution=branchFeatureName===undefined?resolveSelection(state,message):{};
    if(branchFeatureName){const record=inventoryRecords(state).find(record=>branchKey(record.row.name)===branchKey(branchFeatureName));if(!record)throw new Error('That feature is no longer available.');selectFeature(state,record.message.id,record.row.name);branchFeatureName=record.row.name;}
    if(resolution.clarification){state.messages.push({id:randomUUID(),role:'system',text:resolution.clarification,createdAt:new Date().toISOString()});await this.store.save(state);return state;}
    if(resolution.selectionOnly){state.messages.push({id:randomUUID(),role:'user',text:message,createdAt:new Date().toISOString()});state.draft='';state.status='saved';await this.store.save(state);return state;}
    const preflightRequest={text:message,branchFeatureName:branchFeatureName??null,options:{parentResultId,parentNodeId,nodeId,continuing,recoveryAttemptId,...(state.applicationRun?{applicationRunId:state.applicationRun.id}:{}),automation}};
    const retainPreflight=async report=>{
      state.preflight={...report,request:preflightRequest};
      if(report.status==='blocked'){
        if(!preserveDraft){state.draft=message;await this.store.updateWorkspace(state.id,{draft:message,draftContext:state.draftContext||null});}if(state.title==='New investigation'){const target=report.targets?.[0];state.title=target?.kind==='website'?new URL(target.locator).hostname:target?.root?path.basename(target.root):message.replace(/\s+/g,' ').slice(0,70);}
        await this.store.save(state);onProgress(report.canceled?'Readiness check canceled. Your request is preserved.':'Setup required. Your request is preserved; no AI request was made.');
      }
    };
    const priorContinuedAt=recoveredAttempt?.targetRecovery?.continuedAt;
    const checkInspectionReadiness=async(incomingTargets,phase='initial')=>{
      if(this.config.reaEnabled===false)return true;
      const {preflightScope,runPreflight,createReaAdapter}=await import('./preflight.mjs');
      const scope=preflightScope({incomingTargets,retainedTargets:state.targets,message});
      const preflightProgress=event=>onProgress(typeof event==='string'?event:event.status==='checking'?`Checking ${event.label}.`:'Readiness checks updated.');
      const report=await (this.preflight?this.preflight({context:scope,signal,onProgress:preflightProgress}):runPreflight({adapters:[createReaAdapter(this.config,{inspectDuringInvestigation:true})],context:scope,signal,onProgress:preflightProgress}));
      if(report.status!=='ready'){
        state.status='blocked';if(attempt)Object.assign(attempt,{status:'blocked',finishedAt:new Date().toISOString(),reason:'Inspection blocked. Resolved application prerequisites need attention. Your request is preserved.'});
        if(recoveredAttempt){recoveredAttempt.targetRecovery.status='blocked';if(priorContinuedAt)recoveredAttempt.targetRecovery.continuedAt=priorContinuedAt;else delete recoveredAttempt.targetRecovery.continuedAt;}
      }
      await retainPreflight({...report,phase,targets:incomingTargets});return report.status==='ready';
    };
    if(this.config.reaEnabled!==false){
      const incomingTargets=[];
      for(const locator of incoming){
        const replacement=resolved&&path.resolve(locator).toLowerCase()===path.resolve(recoveredAttempt.targetRecovery.originalLocator||recoveredAttempt.targetRecovery.locator).toLowerCase();
        if(replacement)incomingTargets.push({...resolved,locator});else if(/^https?:/.test(locator))incomingTargets.push({kind:'website',locator});else try{incomingTargets.push(await classifyTarget(locator));}catch{incomingTargets.push({kind:'unresolved',locator});}
      }
      if(resolved&&!incomingTargets.some(target=>target.root===resolved.root))incomingTargets.push(resolved);
      if(!await checkInspectionReadiness(incomingTargets))return state;
    }
    const directory = this.store.directory(state.id), startingEvidenceCount=checkpoint?.value.startingEvidenceCount??state.evidence.length;
    const requestsMap=/\b(?:re[- ]?discover|re[- ]?map|discover (?:more|additional|all)|(?:feature|capability|exploration) map)\b/i.test(message);
    const addsSource=incoming.some(locator=>!state.targets.some(target=>target.locator===locator));
    const hasAnswerContext=state.messages.some(m=>m.role==='assistant')||!!(branchFeatureName||state.selection?.featureName)&&inventoryRecords(state).length>0;
    const resultKind=checkpoint?.value.resultKind||(hasAnswerContext&&!requestsMap&&!addsSource?'followup':'discovery');
    const addEvidence=async evidence=>{const saved=await this.store.addEvidence(state,{...evidence,productId:productForEvidence(state,evidence)?.id||''});await this.onEvidence(state,saved);return saved;};
    const selectedCapture=async locator=>{try{const source=await this.config.selectedAccess.capture(state.id,locator,signal);signal?.throwIfAborted();return addEvidence(source);}catch(error){if(error.evidence&&!signal?.aborted){signal?.throwIfAborted();await addEvidence(error.evidence);}throw error;}};
    const usesSelected=locator=>!!this.config.selectedAccess?.has(state.id,locator);
    const mapErrors=answer=>[...coverageErrors(answer,state.mechanismInventory,{combined:productsFor(state).length>1,state,requireMap:resultKind==='discovery'}),...originErrors(answer,state)];
    const adaptive=state.applicationRun?.mode==='investigate',synthesisSchema=adaptive?applicationAnswerSchema:answerSchema;
    const task=()=>resultTask(resultKind,{combined:productsFor(state).length>1})+(adaptive?'\nAPPLICATION INVESTIGATION: Answer the recorded applicationInvestigation.question, not merely the initial map. applicationProgress.question must copy that exact question. Explain how quoted implementation advances that meaningful workflow question; a DLL name, module open, search listing or unrelated function is insufficient. decision answered requires a supported mechanism relevant to the question; advanced means relevant progress with gaps; unresolved if only inventory clues exist. boundary requires a genuine failed inspection receipt in obstacleEvidenceIds and a concrete obstacle. Missing folder/objective/admission is a wrapper defect, never successful boundary handling. Supply claimIndexes supporting the explanation. Static code is not observed runtime behavior.':'');
    const progress = text => { onProgress(text); };
    if(!continuing&&!resumeAiAttemptId)establishPurpose(state,message);
    attempt||={id:randomUUID(),question:message,branchFeatureName:branchFeatureName||state.selection?.featureName||'',nodeId:nodeId||origin?.nodeId||'',parentResultId:origin?.message.id||'',purpose:state.purpose?.current||'',status:'running',startedAt:new Date().toISOString()};
    if(!resumeAiAttemptId){attempt.retryContext={message,branchFeatureName,parentResultId,parentNodeId,nodeId,continuing,agentContext};if(retrySource)attempt.retryOf=retrySource.id;(state.attempts||=[]).push(attempt);if(resumeInterruptedAttemptId){retrySource.recovery||={status:'interrupted'};retrySource.recovery.history||=[];retrySource.recovery.history.push({at:attempt.startedAt,event:'resume-approved',continuationId:attempt.id});}}
    checkpoint||=new AiCheckpoint(directory,attempt.id);checkpoint.value.context||={message,branchFeatureName:branchFeatureName===undefined?(state.selection?.featureName||null):branchFeatureName,parentResultId,parentNodeId,nodeId,continuing,recoveryAttemptId,agentContext};checkpoint.value.resultKind=resultKind;checkpoint.value.startingEvidenceCount=startingEvidenceCount;attempt.status='running';if(state.applicationRun)await checkpoint.save();
    if(recoveredAttempt){recoveredAttempt.targetRecovery.status='ready';recoveredAttempt.targetRecovery.continuedAt=attempt.startedAt;attempt.productName=applicationFilename(recoveredAttempt.targetRecovery.selected);attempt.recoveryAttemptId=recoveredAttempt.id;}
    if(!resumeAiAttemptId){state.messages.push({id:randomUUID(),role:'user',text:message,createdAt:new Date().toISOString(),attemptId:attempt.id,...(origin?{parentResultId:origin.message.id,parentNodeId:origin.nodeId}:{})});if(!preserveDraft)state.draft='';}
    if (state.title==='New investigation') state.title=message.replace(/\s+/g,' ').slice(0,70);
    state.status='inspecting';await this.store.save(state);if(recoveredAttempt)progress('Inspecting…');
    const errors=[...(checkpoint.value.seedErrors||[])];
    const rea=new ReaInvestigation(this.config,state,directory,{signal,onProgress:progress,addEvidence,saveState:()=>this.store.save(state),openClient:this.openClient});
    rea.applicationCharge=(unit,detail)=>chargeApplication(state,this.store,unit,detail);
    const beginApplicationTurn=async()=>{if(state.applicationRun&&!attempt.applicationTurn){if(state.applicationRun.activeTurn?.status!=='active')await chargeApplication(state,this.store,'turns',attempt.id);attempt.applicationTurn=state.applicationRun.used.turns;state.applicationRun.status='running';await this.store.save(state);}};
    await assessFreshness(state);
    try {
      for(const locator of (resumeAiAttemptId?[]:incoming)) {
        const existing=state.targets.find(t=>t.locator===locator);
        if(existing){
          if(existing.kind!=='repository')continue;
          const revised=await classifyTarget(locator);if(revised.kind!=='artifact')continue;
          Object.assign(existing,revised);delete existing.files;
          progress('Inspecting the application artifact in this previously supplied folder…');
          if(this.config.reaEnabled!==false&&!await checkInspectionReadiness([existing],'resolved-target')){try{await rea.finish(addEvidence);}catch{}return state;}
          await beginApplicationTurn();if(this.config.reaEnabled!==false)try{await rea.seed(existing);}catch(error){if(signal?.aborted||error.code==='APPLICATION_ALLOWANCE')throw error;errors.push(`REA inspection: ${error.message}`);}
          continue;
        }
        if(/^https?:/.test(locator)) {
          progress(`Reading ${new URL(locator).hostname}…`);
          state.targets.push({kind:'website',locator,origin:new URL(locator).origin});
          await this.store.save(state);
          let browserNeeded=false;
          if(usesSelected(locator)){
            progress('Reading the intended page in the selected Nodes session…');
            try{await selectedCapture(locator);}catch(error){if(signal?.aborted||error.code==='APPLICATION_ALLOWANCE')throw error;errors.push(error.message);state.activity.push({at:new Date().toISOString(),source:locator,operation:'electron-selected-session',status:'failed',error:error.message});}
            await this.store.save(state);continue;
          }
          try {
            const record=await addEvidence(await inspectPage(locator,signal));
            browserNeeded=record.text.length<180||/human verification|verify.*not a robot|awswaf|aws-waf-token/i.test(record.text);
          }catch(e){if(signal?.aborted||e.code==='APPLICATION_ALLOWANCE')throw e;errors.push(e.message);browserNeeded=true;}
          if(browserNeeded){
            progress('Reading the public browser view with REA…');
            try{await rea.captureBrowser(locator);}catch(e){if(signal?.aborted||e.code==='APPLICATION_ALLOWANCE')throw e;errors.push(`REA browser: ${e.message}`);try{const fallback=await inspectBrowser(locator,this.config,directory,signal);fallback.limitations.push('Built-in browser fallback; the REA browser operation was unavailable.');await addEvidence(fallback);}catch(error){if(signal?.aborted||error.code==='APPLICATION_ALLOWANCE')throw error;errors.push(error.message);}}
          }
        } else {
          progress('Identifying the supplied application or source…');
          const replacement=resolved&&path.resolve(locator).toLowerCase()===path.resolve(recoveredAttempt.targetRecovery.originalLocator||recoveredAttempt.targetRecovery.locator).toLowerCase();
          const selected=replacement?{...resolved,locator,...(state.applicationRun?{containerRoot:state.applicationRun.scope.root,artifactCandidates:state.applicationRun.scope.components.map(c=>path.relative(state.applicationRun.scope.root,c.path))}:{}),resolution:{from:locator,selected:resolved.root,reason:recoveredAttempt.targetRecovery.selected.reason,confirmedAt:recoveredAttempt.targetRecovery.confirmedAt}}:await classifyTarget(locator);
          const target=selected.kind==='repository'?{...selected,...await inventoryDirectory(locator)}:selected;if(target.kind==='repository'&&this.config.reaEnabled!==false)target.identity=await directoryIdentity(target.root,target.files);state.targets.push(target);
          if(target.kind==='repository')for(const file of starterFiles(target,message)) { try { await addEvidence(await inspectFile(target,file,signal)); } catch(e){if(signal?.aborted||e.code==='APPLICATION_ALLOWANCE')throw e;errors.push(e.message);} }
          if(this.config.reaEnabled!==false&&!await checkInspectionReadiness([target],'resolved-target')){try{await rea.finish(addEvidence);}catch{}return state;}
          await beginApplicationTurn();if(this.config.reaEnabled!==false&&(target.kind==='artifact'||target.files?.some(file=>/\.[cm]?jsx?$/.test(file)))){try{await rea.seed(target);}catch(e){if(signal?.aborted||e.code==='APPLICATION_ALLOWANCE')throw e;errors.push(`REA inspection: ${e.message}`);target.limitations=[...(target.limitations||[]),e.message];}}
        }
        await this.store.save(state);
      }
      progress('Checking retained REA analysis…');await beginApplicationTurn();
      let reaOperations=[];try{reaOperations=await rea.catalog();}catch(error){if(signal?.aborted||error.code==='APPLICATION_ALLOWANCE')throw error;errors.push(`REA connection: ${error.message}`);}
      if(this.config.reaEnabled!==false&&errors.some(error=>error.startsWith('REA connection:')||/^REA inspection:/i.test(error)&&(analysisProviderUnavailable(error)||/ghidra|java_home|jdk|native (?:analysis )?provider.*unavailable/i.test(error)))){
        const {runPreflight}=await import('./preflight.mjs');
        const report=await runPreflight({adapters:[{id:'rea-runtime',label:'Inspection connection',check:async()=>[{id:'session',label:'Inspection connection',status:'unavailable',required:true,detail:'The inspection connection stopped. Open setup, recheck it, then retry your saved request.',diagnostic:{reason:[...new Set(errors)].join('\n')}}]}],signal});
        Object.assign(attempt,{status:'blocked',finishedAt:new Date().toISOString(),reason:'Inspection blocked. '+errors.find(error=>/^REA (connection|inspection):/.test(error))+' Your request is preserved.'});state.status='blocked';
        try{await rea.finish(addEvidence);}catch{}
        await retainPreflight({...report,phase:'runtime'});return state;
      }
      state.reaCapabilities={checkedAt:new Date().toISOString(),connected:!!rea.client,targets:reaOperations.map(({target,targetType,operations})=>({target,targetType,operations:operations.map(tool=>tool.name)}))};
      progress('Choosing the most useful next source…');
      const context=contextFor(state,{phase:'plan'});
      const allowedPages=[...new Set([
        ...state.targets.filter(t=>t.kind==='website').map(t=>t.locator),
        ...state.evidence.flatMap(e=>[...(e.links||[]).map(l=>l.url),...(['page','browser'].includes(e.kind)?[e.locator]:[])])
      ])];
      const allowedFiles=state.targets.filter(t=>t.kind==='repository').flatMap(t=>t.files.slice(0,800).map(file=>path.join(t.root,file)));
      const plan=await reasoning(this.config,planSchema,JSON.stringify({task:'Set judgment.purpose from the user workflow and current question. Name judgment.uncertainty, impact and reason before choosing reads. Use decision inspect only when proportionate available evidence can resolve that material uncertainty; answer when retained evidence suffices, boundary when decisive evidence is unavailable. Return no reads for answer or boundary. Choose zero to three reads for the latest request; zero is often correct. On discovery consider process, differentiator/comparison, and mechanism evidence across the whole source, not just obvious workflow headings. Follow the last recommendation unless redirected. Prefer relevant uninspected sources; freshness alone does not determine value. A section read retrieves a fuller retained source section: target is its evidence ID and sectionId must be an inventoried section ID. For other reads sectionId is empty. Browser capture is useful when HTML is thin or challenged. Source-free concepts need no reads. File reads use exact absolute allowedFiles; page/browser reads use exact supplied URLs. A rea read chooses one exact target from reaOperations, an advertised operation and argumentsJson containing JSON matching its inputSchema; sectionId is empty. For non-rea reads operation and argumentsJson are empty. Use retained REA evidence and parent IDs to page modules, trace implementation chains or inspect a function. Never request execution, write operations, or external targets. Inspection errors are evidence boundaries, not proof of absent features.',context,allowedPages,allowedFiles,reaOperations,inspectionErrors:errors,applicationInstruction:adaptive?'Select a meaningful application workflow question from folder and retained evidence. Put it in focus, or preserve applicationInvestigation.question exactly if already set. Trace relevant implementation within three reads. Prefer one useful read at a time; successful evidence permits replanning. Identity, initial map and generic listings are not a substantive answer. Candidate sibling targets require host validation.':undefined}),directory,signal,progress);
      if(adaptive&&!state.applicationRun.question){state.applicationRun.question=plan.focus?.trim()||plan.judgment?.uncertainty||'';state.applicationRun.questions.push({question:state.applicationRun.question,impact:plan.judgment?.impact,reason:plan.judgment?.reason,at:new Date().toISOString()});await this.store.save(state);}
      const failedReads=[],seenReads=new Set();let readCount=0,recovered=false,queue=plannedReads(plan).slice(0,3);
      while(queue.length&&readCount<3) {
        const read=queue.shift(),signature=readKey(read);
        if(seenReads.has(signature))continue;seenReads.add(signature);readCount++;
        signal?.throwIfAborted();
        const replayed=!!(checkpoint.replaying&&checkpoint.value.reads[signature]);
        try {
          if(replayed){const saved=checkpoint.value.reads[signature];if(saved.status==='failed')throw new Error(saved.error);}
          if(!replayed)await chargeApplication(state,this.store,'reads',signature);
          let evidence;
          if(replayed){evidence=state.evidence.find(e=>e.id===checkpoint.value.reads[signature].evidenceId);}else if(read.kind==='rea'){
            evidence=await rea.read(read);
          }else if(read.kind==='section'){
            const parent=state.evidence.find(e=>e.id===read.target);
            if(!parent)throw new Error('The retained source was not found.');
            const retained=state.evidence.find(source=>source.parentEvidenceId===parent.id&&source.sectionId===read.sectionId&&source.sourceSha256===parent.sha256);if(retained){state.activity.push({at:new Date().toISOString(),focus:plan.focus,source:retained.locator,reason:read.reason,evidenceId:retained.id,reused:true});await checkpoint.readDone(signature,{status:'saved',evidenceId:retained.id});continue;}
            progress('Reading the retained source section…');evidence=await inspectRetainedSection(parent,read.sectionId,signal);
          }else if(read.kind==='file') {
            const matches=state.targets.filter(t=>t.kind==='repository'&&t.files.some(f=>f===read.target||path.join(t.root,f)===read.target));
            if(matches.length!==1)throw new Error('The requested file was absent or ambiguous across source directories.');
            const target=matches[0],relative=path.isAbsolute(read.target)?path.relative(target.root,read.target).replaceAll('\\','/'):read.target;
            progress(`Reading ${relative}…`);evidence=await inspectFile(target,relative,signal);
          } else {
            if(!allowedPages.includes(read.target))throw new Error('The requested URL was not discovered in the target material.');
            if(usesSelected(read.target)){progress('Reading the intended page in the selected Nodes session…');evidence=await selectedCapture(read.target);}
            else{publicUrl(read.target); progress(read.kind==='browser'?'Inspecting the public browser view with REA…':`Reading ${new URL(read.target).pathname}…`);evidence=read.kind==='browser'?await rea.captureBrowser(read.target):await inspectPage(read.target,signal);}
          }
          if(!replayed){if(!['rea','browser'].includes(read.kind)&&evidence.captureRoute!=='electron-selected-session')await addEvidence(evidence);
          state.activity.push({at:new Date().toISOString(),focus:plan.focus,source:evidence.locator,reason:read.reason,evidenceId:evidence.id});
          await checkpoint.readDone(signature,{status:'saved',evidenceId:evidence.id});}
          if(adaptive&&readCount<3){
            signal?.throwIfAborted();reaOperations=await rea.catalog();
            const next=await reasoning(this.config,planSchema,JSON.stringify({task:'Reconsider the saved application question after the successful read. Preserve that question; explain the next uncertainty and relevance. Choose a proportionate implementation read or answer/boundary with no reads. Only advertised operations/targets; candidate siblings are host-validated. Do not repeat reads or substitute inventory for implementation. Remaining allowance is a maximum, not a quota.',context:contextFor(state,{phase:'plan'}),allowedPages,allowedFiles,reaOperations,completedReads:[...seenReads],remainingReads:3-readCount}),directory,signal,progress);
            queue=plannedReads(next).filter(next=>!seenReads.has(readKey(next))).slice(0,3-readCount);
          }
        }catch(e){
          if(signal?.aborted||e.code==='APPLICATION_ALLOWANCE'||checkpoint.value.reads[signature]?.status==='saved')throw e;errors.push(e.message);failedReads.push({read,error:e.message});if(!replayed){state.activity.push({at:new Date().toISOString(),focus:plan.focus,source:read.target,reason:read.reason,operation:read.operation||read.kind,parameters:read.argumentsJson||'',status:'failed',error:e.message});await checkpoint.readDone(signature,{status:'failed',error:e.message});await this.store.save(state);}
          if(!recovered&&readCount<3){
            recovered=true;progress('Reconsidering the inspection after a failed approach…');
            if(adaptive)reaOperations=await rea.catalog();
            try{
              const recovery=await reasoning(this.config,planSchema,JSON.stringify({task:'The planned inspection failed. Reconsider the same user question and established purpose using retained evidence and the available operations. Choose a different proportionate read only within the supplied allowed targets and remaining read budget. Do not repeat failed reads, broaden scope, execute the target, or invent findings. Return no reads with decision answer if retained evidence suffices or boundary if no supported alternative exists.',context:contextFor(state,{phase:'plan'}),allowedPages,allowedFiles,reaOperations,failedReads,inspectionErrors:errors,remainingReads:3-readCount}),directory,signal,progress);
              queue=recovery.judgment&&recovery.judgment.decision!=='inspect'?[]:[...plannedReads(recovery),...queue].filter(next=>!seenReads.has(readKey(next))).slice(0,3-readCount);
            }catch(error){if(signal?.aborted||error.aiFailure||error.code==='APPLICATION_ALLOWANCE')throw error;errors.push(`Recovery planning: ${error.message}`);}
          }
        }
      }
      checkpoint.value.needsInventory??=!!(state.evidence.length&&(resultKind==='discovery'||!state.mechanismInventory));
      if(checkpoint.value.needsInventory){
        progress('Identifying the product’s defining mechanisms…');
        let inventory;const candidates=emphasisCandidates(state.evidence);
        for(let attempt=0;attempt<2;attempt++){
          inventory=await reasoning(this.config,mechanismSchema,JSON.stringify({task:mechanismTask,context:contextFor(state,{phase:'inventory'}),emphasisCandidates:candidates,...(inventory?{repairDraft:inventory,errors:[...mechanismErrors(inventory,state.evidence),...emphasisErrors(inventory,candidates)],instruction:'Copy exact supporting quotes. Restore explicitly named umbrella capabilities from the emphasized source sections instead of substituting only their parts.'}:{})}),directory,signal,progress);
          inventory=restoreMechanismQuotes(inventory,state.evidence);
          const inventoryErrors=[...mechanismErrors(inventory,state.evidence),...emphasisErrors(inventory,candidates)];
          if(!inventoryErrors.length)break;
          await fs.writeFile(path.join(directory,`mechanism-repair-${randomUUID()}.json`),JSON.stringify({inventory,errors:inventoryErrors},null,2));
        }
        if(mechanismErrors(inventory,state.evidence).length||emphasisErrors(inventory,candidates).length)throw new Error('The mechanism inventory contained unsupported references or omitted a named capability. Captured sources remain saved.');
        state.mechanismInventory=mergeMechanismInventories(state.mechanismInventory,inventory);await this.store.save(state);
      }
      recordRunStage(attempt,'synthesis');await this.store.save(state);progress('Connecting the findings…');
      const synthesis=await reasoning(this.config,synthesisSchema,JSON.stringify({task:task(),context:contextFor(state),inspectionErrors:errors,freshEvidenceIds:state.evidence.slice(startingEvidenceCount).map(e=>e.id)}),directory,signal,progress);
      let draftIdentity=retainAnswerDraft(attempt,synthesis);recordRunStage(attempt,'validation');await this.store.save(state);progress('Validating the saved answer draft…');
      let answer=validateClaims(synthesis,state.evidence);
      validateAnswerDraft(attempt,draftIdentity,[...referenceErrors(synthesis,state.evidence),...presentationErrors(answer,state.evidence.length>0),...mapErrors(answer)]);await this.store.save(state);
      if(answer.rejectedClaimCount||presentationErrors(answer,state.evidence.length>0).length||mapErrors(answer).length){
        recordRunStage(attempt,'reference-repair','started','Repair pass 1 of 1');await this.store.save(state);progress('Checking source references — repair pass 1 of 1…');
        await fs.writeFile(path.join(directory,`citation-repair-${randomUUID()}.json`),JSON.stringify(synthesis,null,2));
        const repaired=await reasoning(this.config,synthesisSchema,JSON.stringify({task:task()+'\nRepair invalid references, omitted mechanisms and source attributions. Every observed OR inferred claim needs a real evidenceId and exact quote. Remove unsupported claims and update all row/origin indexes. Preserve every core/differentiator in the combined map with its actual product origins; overlapping mechanisms can share one row.',draft:synthesis,context:contextFor(state),inspectionErrors:errors,referenceErrors:referenceErrors(synthesis,state.evidence),formatErrors:[...presentationErrors(answer,state.evidence.length>0),...mapErrors(answer)]}),directory,signal,progress);
        draftIdentity=retainAnswerDraft(attempt,repaired,{stage:'reference-repair'});recordRunStage(attempt,'validation');await this.store.save(state);
        await fs.writeFile(path.join(directory,`citation-repaired-${randomUUID()}.json`),JSON.stringify(repaired,null,2));
        answer=validateClaims(repaired,state.evidence);
        validateAnswerDraft(attempt,draftIdentity,[...referenceErrors(repaired,state.evidence),...presentationErrors(answer,state.evidence.length>0),...mapErrors(answer)]);await this.store.save(state);
      }
      // A missing or invented reference is a failed answer, not a hidden citation loss.
      if(answer.rejectedClaimCount)throw new Error('The response contained an unsupported source reference. Sources were saved; ask again to continue from them.');
      if(presentationErrors(answer,state.evidence.length>0).length)throw new Error('A result row lacked valid supporting evidence. Sources were saved so the investigation can continue.');
      if(mapErrors(answer).length)throw new Error('The feature map omitted a defining mechanism or attributed a feature to an unsupported source. Sources were saved so discovery can continue.');
      if(state.evidence.length && !answer.claims.some(c=>c.evidenceId))throw new Error('The response did not ground its findings in the inspected sources. Saved evidence is available to retry.');
      const branch=branchFeatureName||state.selection?.featureName;
      const previous=origin?.message||state.messages.findLast(item=>item.role==='assistant'&&(!branch||branchKey(item.branchFeatureName||item.focus?.featureName)===branchKey(branch)));
      const missingArtifacts=state.targets.filter(target=>target.kind==='artifact'&&!state.evidence.some(source=>source.kind==='rea'&&source.evidenceStatus!=='inspection-failed'&&source.operation!=='open_binary'&&source.targetIdentity?.path===(target.inspectionTarget?.identity||target.identity)?.path&&source.targetIdentity?.sha256===(target.inspectionTarget?.identity||target.identity)?.sha256));
      const missingImplementation=missingArtifacts.length>0;
      const boundary=missingImplementation?{status:'blocked',reason:'No successful implementation inspection is available for: '+missingArtifacts.map(target=>target.locator).join(', ')+'. '+errors.join(' ')}:resultKind==='followup'&&progressBoundary({...answer,focus:state.selection,branchFeatureName:branch},previous,{evidence:state.evidence,judgment:plan.judgment});
      if(boundary){answer={...answer,recommendation:'',directions:[],continuation:{status:boundary.status,uncertainty:answer.continuation?.uncertainty||plan.judgment?.uncertainty||'',impact:answer.continuation?.impact||plan.judgment?.impact||'',nextEvidence:'',reason:boundary.reason}};}
      answer=concludeApplicationTurn(state,answer);
      state.understanding=answer.understanding;state.recommendation=answer.recommendation;state.openQuestions=answer.openQuestions;if(answer.title)state.title=answer.title;
      state.messages.push({id:randomUUID(),role:'assistant',text:answer.answer,createdAt:new Date().toISOString(),...answer,resultKind,presentationVersion:4,focus:state.selection,attemptId:attempt.id,purpose:state.purpose?.current||'',...(recoveredAttempt?{recoveredAttemptId:recoveredAttempt.id}:{}),...(branchFeatureName?{branchFeatureName}:{}),...(origin?{parentResultId:origin.message.id,parentNodeId:origin.nodeId}:{}),mechanismInventory:state.mechanismInventory,inspectionJudgment:plan.judgment,inspectionErrors:errors,newEvidenceCount:state.evidence.length-startingEvidenceCount});state.status='saved';
      if(recoveredAttempt)recoveredAttempt.targetRecovery.continuedAt=new Date().toISOString();
      Object.assign(attempt,{status:answer.continuation?.status||'saved',resultId:state.messages.at(-1).id,finishedAt:new Date().toISOString(),reason:answer.continuation?.reason||''});
      attachDelivery(state,state.messages.at(-1));
      if(answer.products?.length)state.products=answer.products;
      if(resultKind==='followup')updateKeptProgress(state,state.messages.at(-1));
      if(resultKind==='discovery')reconcileSelection(state,state.messages.at(-1));
    }catch(error){
      if(error.targetResolution&&!signal?.aborted){progress('Looking up the installed application…');attempt.targetRecovery=await diagnoseTarget(error.targetResolution.locator,{initial:error.targetResolution});}
      if(!signal?.aborted&&targetSelection(attempt)){
        if(state.title===message.replace(/\s+/g,' ').slice(0,70))state.title=attempt.targetRecovery.productName;
        state.status='awaiting-selection';Object.assign(attempt,{status:state.status,reason:error.message});
        try{await rea.finish(addEvidence);}catch{}
        await this.store.save(state);progress(targetSelectionMessage(attempt));return state;
      }
      if(state.applicationRun){state.applicationRun.status=signal?.aborted?'stopped':error.code==='APPLICATION_ALLOWANCE'?'allowance':'paused';state.applicationRun.stopReason=error.message;}
      state.status=signal?.aborted?'stopped':attempt.targetRecovery||error.aiFailure||error.code==='APPLICATION_ALLOWANCE'?'blocked':'failed';state.messages.push({id:randomUUID(),role:'system',text:error.message,createdAt:new Date().toISOString()});
      Object.assign(attempt,{status:state.status,reason:error.message,finishedAt:new Date().toISOString()});
      recordRunStage(attempt,attempt.stage?.name||'investigation',state.status,{faultType:error.code||error.aiFailure?.category||error.name||'Error',recovery:attempt.answerDraft?'saved-answer-draft':'retained-evidence'});
      try{await rea.finish(addEvidence);}catch{}
      if(resumeAiAttemptId&&!error.aiFailure&&!signal?.aborted){attempt.aiRecovery={...attempt.aiRecovery,status:'failed',canResume:false,nextAction:'This resumed step could not finish. Review its saved evidence and start a new request or replan the route.'};error.recoveryAttemptId=attempt.id;}
      if(signal?.aborted&&(attempt.aiRecovery||state.applicationRun)){attempt.aiRecovery={...attempt.aiRecovery,status:'paused',message:'Investigation stopped. Saved reasoning can be resumed when ready.',canResume:true,seal:aiRecoverySeal(state)};await checkpoint.save();error.recoveryAttemptId=attempt.id;}
      if(error.aiFailure){attempt.aiRecovery={...error.aiFailure,status:'paused',message:error.message,canResume:!!error.aiFailure.safeToRetry,nextAction:error.aiFailure.category==='network-blocked'?'Restore network access for the selected agent in this computer’s network protections, then resume this saved request. Your REA installation and evidence are retained.':error.aiFailure.category==='quota'?'Check account limits or switch AI connection, then resume.':error.aiFailure.safeToRetry?'Resume the saved reasoning request after the service recovers.':'Review the gateway for work already performed before starting a new request.'};try{await checkpoint.save();}catch{attempt.aiRecovery.canResume=false;attempt.aiRecovery.nextAction='The local resume checkpoint could not be saved. Your evidence is retained; start a new request using it.';}attempt.aiRecovery.seal=aiRecoverySeal(state);error.recoveryAttemptId=attempt.id;}
      recordFailure(attempt,error,this.config);if(!attempt.aiRecovery&&!attempt.targetRecovery)error.failedAttemptId=attempt.id;await this.store.save(state);throw error;
    }
    try{await rea.finish(addEvidence);}catch(error){if(signal?.aborted||error.code==='APPLICATION_ALLOWANCE')throw error;state.activity.push({at:new Date().toISOString(),reason:`REA retention boundary: ${error.message}`});}
    if(attempt.aiRecovery)attempt.aiRecovery={...attempt.aiRecovery,status:'resolved',canResume:false};resolveFailure(attempt);if(retrySource){const seen=new Set();for(let prior=retrySource;prior?.recovery&&!seen.has(prior.id);prior=state.attempts.find(a=>a.id===prior.retryOf)){seen.add(prior.id);resolveFailure(prior,{resultId:attempt.resultId});}}
    recordRunStage(attempt,'saved','completed');await this.store.save(state);await checkpoint.finish();progress('Saved');return state;
  }
}
