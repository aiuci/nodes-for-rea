// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
const { app, BrowserWindow, ipcMain, dialog, shell, session, safeStorage, Menu, clipboard, nativeImage, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const version=require('./lib/runtime-version.cjs').runtimeVersion(__dirname);
let window, store, investigator, active, draftQueue = Promise.resolve();const deletedIds=new Set();
const distribution=require('./lib/distribution.cjs').distributionPaths(__dirname);
const {portable:portableMode,npm:npmMode,distributed:distributedMode,dataRoot:root}=distribution;
let connection,reaConnection,setupController,documentHost,currentId,agentGuide,activePlan;

const candidateMode=!distributedMode;
app.setName(candidateMode?'Nodes for REA Candidate':'Nodes for REA');
const windowsAppId=candidateMode?'Jeremy.REA.Nodes.Candidate':'Jeremy.REA.Nodes.Next';
app.setAppUserModelId(windowsAppId);
// Keep the established profile path and AppUserModelId across the branding rename.
app.setPath('userData',distribution.profileRoot);
const ownsInstance=app.requestSingleInstanceLock();
if (!ownsInstance && (npmMode || !process.env.INVESTIGATOR_DATA)) app.quit();
app.on('second-instance', () => { window?.show(); window?.focus(); });

function trusted(event) {
  if (!window || event.sender !== window.webContents || event.senderFrame?.url !== pathToFileURL(path.join(__dirname, 'ui/index.html')).href) throw new Error('Untrusted desktop request.');
}
function handle(name, fn) { ipcMain.handle(name, async (event, ...args) => { trusted(event); return fn(...args); }); }
function idle(){if(active)throw new Error('Stop the current investigation before switching conversations.');if(setupController)throw new Error('Finish or cancel the connection check first.');}

app.whenReady().then(async () => {
  if (!ownsInstance && (npmMode || !process.env.INVESTIGATOR_DATA)) return;
  const { InvestigationStore, Investigator } = await import('./lib/investigation.mjs');
  const {capabilities,runtimeConfig,runProcess}=await import('./lib/runtime.mjs');
  const {ConnectionStore}=await import('./lib/connection.mjs');
  const {ReaConnectionStore}=await import('./lib/rea-connection.mjs');
  const {probeReaConnection}=await import('./lib/rea-client.mjs');
  const {engineReadiness}=await import('./lib/setup-readiness.mjs');
  const {setupReport}=await import('./lib/setup-report.mjs');
  const {NativeSetupCheck,readNativePolicy}=await import('./lib/native-setup-check.mjs');
  const {nativeCheckSummary,setupDiagnostic}=await import('./lib/setup-diagnostics.mjs');
  const {preflightScope}=await import('./lib/preflight.mjs');
  const {installSetupHost}=await import('./lib/setup-host.mjs');
  const {openReaClient}=await import('./lib/rea-client.mjs');
  const {reaEvidenceRecord,browserExecutable}=await import('./lib/rea-engine.mjs');
  const {runVerification}=await import('./lib/verification.mjs');
  const {deliveryMarkdown,attachDelivery}=await import('./lib/delivery.mjs');
  const {assessFreshness}=await import('./lib/targets.mjs');const {settingsRoot}=await import('./lib/paths.mjs');
  const {browserCapture}=await import('./lib/desktop-browser.mjs');const {publicUrl}=await import('./lib/sources.mjs');const captureBrowser=browserCapture({BrowserWindow},publicUrl);
  const nativeCheck=new NativeSetupCheck(settingsRoot);
  connection=new ConnectionStore(settingsRoot,safeStorage);reaConnection=new ReaConnectionStore(settingsRoot);const getConfig=async()=>{const ai=await connection.config(),engine=await reaConnection.config();const config={...ai,...engine,browser:engine.browser||ai.browser};config.nativeSetupCheck=(target,session)=>nativeCheck.current(target,engine,session);config.nativeSetupPolicy=await readNativePolicy(engine);config.captureBrowser=captureBrowser;const verified=await connection.read();config.recoveryVerification=verified.verification==='model-response'?verified.verifiedAt||'':'';return config;};
  const setup=async work=>{idle();if(setupController)throw new Error('A connection check is already running.');setupController=new AbortController();try{return await work(setupController.signal);}finally{setupController=null;}};
  const {selectFeature,savedStatus} = await import('./lib/selection.mjs');
  const {featureCollection,collectionIntent} = await import('./lib/collection.mjs');
  const {saveCollectionChange}=await import('./lib/collection-save.mjs');
  const {inventoryRecords} = await import('./lib/discovery-inventory.mjs');
  const {exportInvestigation,importInvestigation}=await import('./lib/archive.mjs');
  const {AgentSessionStore}=await import('./lib/agent-guide.mjs');
  store=new InvestigationStore(root);let config;try{config=await getConfig();}catch{config={...runtimeConfig(),captureBrowser};}investigator=new Investigator(store,{config});
  const {installProjectHandoffHost}=await import('./lib/project-handoff-host.mjs');installProjectHandoffHost({handle,store,idle,flushQueue:()=>draftQueue,dialog,getWindow:()=>window,documentsFolder:(()=>{try{return app.getPath('documents');}catch{return path.join(app.getPath('home'),'Documents');}})(),shell,clipboard});
  const {installMapImageHost}=await import('./lib/map-image-host.mjs');installMapImageHost({handle,dialog,getWindow:()=>window,store});
  const {installCoverageHost}=await import('./lib/coverage-host.mjs');installCoverageHost({handle,store});
  const {installAgentContextHost}=await import('./lib/agent-context-host.mjs');const agentContexts=installAgentContextHost({store,handle,dialog,getWindow:()=>window,idle,nativeImage});
  agentGuide=new AgentSessionStore(store,{contexts:agentContexts,turn:async(state,question,{branchFeatureName,nodeId,signal,agentContext,resumeAiAttemptId,retryFailureAttemptId})=>{investigator.config=await getConfig();await investigator.turn(state,question,{preserveDraft:true,signal,branchFeatureName,nodeId,agentContext,resumeAiAttemptId,retryFailureAttemptId,onProgress:text=>window.webContents.send('activity',text)});return store.read(state.id);}});
  const {installDocumentHost}=await import('./lib/document-host.mjs');
  const activeFile=path.join(root,'.active-investigation.json');
  const activate=async id=>{store.directory(id);const temporary=path.join(root,`.active-${require('node:crypto').randomUUID()}.tmp`);try{await fs.writeFile(temporary,JSON.stringify({id}));await fs.rename(temporary,activeFile);currentId=id;}catch(error){await fs.rm(temporary,{force:true});throw error;}};
  documentHost=installDocumentHost({store,app,dialog,Menu,getWindow:()=>window,handle,idle,flushQueue:()=>draftQueue,getCurrent:()=>currentId,setCurrent:activate,stop:()=>{active?.abort();setupController?.abort();},waitIdle:async()=>{for(let i=0;(active||setupController)&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,50));if(active||setupController)throw new Error('The running inspection has not finished stopping. Your workspace remains open.');}});
  const displayState=async state=>await documentHost.documents.binding(state.id)?state:assessFreshness(state);
  handle('runtime-update',()=>version.changed());
  handle('apply-update',async()=>{idle();await draftQueue;idle();if(!version.changed())return false;return documentHost.restart();});

  handle('rea-info',async()=>({...await reaConnection.view(),bundled:await reaConnection.bundled()}));
  handle('rea-restore-bundled',()=>setup(async signal=>{version.assertCurrent();const result=await reaConnection.restoreBundled(signal);investigator.config=await getConfig();return {...result,bundled:await reaConnection.bundled()};}));
  handle('rea-test',input=>setup(async signal=>{version.assertCurrent();const approval=await dialog.showMessageBox(window,{type:'question',title:'Save local REA tool paths',message:'Save these local tool selections?',detail:`Ghidra: ${input.ghidraPath||'Use existing discovery'}\nJava home: ${input.javaHome||'Use existing discovery'}\nOnly local paths are saved after the engine check. No download, installation, administrator permission or AI work is approved. Existing investigations and drafts stay unchanged.`,buttons:['Cancel','Save paths and check'],defaultId:0,cancelId:0,noLink:true});if(approval.response!==1)throw Error('Path save canceled. Previous settings were kept.');signal.throwIfAborted();const result=await reaConnection.saveVerified(input,signal);investigator.config=await getConfig();return result;}));
  handle('rea-pick',async kind=>{idle();if(!['rea','browser','ghidra','java'].includes(kind))throw new Error('Unknown REA runtime selector.');const directories=['ghidra','java'].includes(kind);const result=await dialog.showOpenDialog(window,{title:`Choose ${kind} runtime ${directories?'directory':'file'}`,properties:[directories?'openDirectory':'openFile']});return result.canceled?null:result.filePaths[0];});
  handle('target',async()=>{idle();const result=await dialog.showOpenDialog(window,{title:'Choose a target artifact to inspect',properties:['openFile'],filters:[{name:'Application artifacts',extensions:['exe','dll','asar','zip','apk','ipa','msix','appx','dmg','so','dylib','db','sqlite','sqlite3']},{name:'All files',extensions:['*']}]});return result.canceled?null:result.filePaths[0];});
  handle('failure-diagnose',(id,attemptId)=>setup(async signal=>{
    await draftQueue;const state=await store.read(id),attempt=state.attempts?.find(a=>a.id===attemptId);
    const {diagnoseFailure,recoveryReadiness}=await import('./lib/failure-recovery-host.mjs');const config=await getConfig();
    await diagnoseFailure(state,attempt,{config,check:async()=>{
      const ai=await connection.view(),fresh=await probeReaConnection(await reaConnection.config(),{signal}),engine=engineReadiness({...(await reaConnection.view()),status:fresh});
      const selected=preflightScope({retainedTargets:state.targets||[],incomingTargets:state.preflight?.targets||[]}),results=[];
      for(const target of selected.nativeTargets)results.push(await nativeCheck.current(target,config,fresh.session));engine.diagnostic=setupDiagnostic(engine,fresh.session,{requirements:selected.requirements,verification:nativeCheckSummary(results)});
      return recoveryReadiness({attempt,config,ai,engine});
    }});await store.save(state);return state;
  }));
  handle('target-recovery',async(id,attemptId,choice,other=false)=>{
    idle();await draftQueue;let otherPath;if(other){const picked=await dialog.showOpenDialog(window,{title:'Choose another application',properties:['openFile'],filters:[{name:'Application',extensions:['exe','asar','dll','appx','msix','apk']}]});if(picked.canceled)return null;otherPath=picked.filePaths[0];}
    idle();const controller=new AbortController();active=controller;try{const {prepareTargetRecovery}=await import('./lib/target-recovery.mjs');return await prepareTargetRecovery(store,id,attemptId,{choice,otherPath});}finally{active=null;}
  });
  handle('export-evidence',async id=>{
    idle();await draftQueue;const state=await assessFreshness(await store.read(id));await store.save(state);const selected=await dialog.showOpenDialog(window,{title:'Export the whole investigation with raw evidence and checks',properties:['openDirectory','createDirectory']});if(selected.canceled||!selected.filePaths[0])return null;idle();await draftQueue;const {exportEvidenceFolder}=await import('./lib/evidence-folder.mjs');return exportEvidenceFolder(store,id,selected.filePaths[0]);
  });
  handle('export-delivery',async(id,messageId,kind)=>{
    idle();await draftQueue;if(!['asset','takeaways','bundle'].includes(kind))throw new Error('Unknown output kind.');
    const state=await assessFreshness(await store.read(id)),message=state.messages.find(item=>item.id===messageId&&item.role==='assistant');if(!message)throw new Error('Choose a saved result.');
    const result=await dialog.showSaveDialog(window,{title:'Save investigation output',defaultPath:`rea-${kind}.md`,filters:[{name:'Markdown',extensions:['md']}]});if(result.canceled||!result.filePath)return null;
    await fs.writeFile(result.filePath,deliveryMarkdown(state,message,{kind}));return result.filePath;
  });
  handle('finalize',async(id,messageId)=>{
    idle();const controller=new AbortController();active=controller;
    try{await draftQueue;controller.signal.throwIfAborted();version.assertCurrent();const state=await assessFreshness(await store.read(id)),message=state.messages.find(item=>item.id===messageId&&item.role==='assistant');if(!message)throw new Error('Choose a saved result.');
    const {finalizeAsset}=await import('./lib/finalize.mjs');const config=await getConfig();controller.signal.throwIfAborted();message.finalAsset=await finalizeAsset(state,message,{config,directory:store.directory(id),signal:controller.signal,onProgress:text=>window.webContents.send('activity',text)});attachDelivery(state,message);await store.save(state);return state;}finally{if(active===controller)active=null;}
  });
  handle('verify',async(id,messageId)=>{
    idle();const controller=new AbortController();active=controller;let client;
    try{await draftQueue;controller.signal.throwIfAborted();version.assertCurrent();let state=await store.read(id);const message=state.messages.find(item=>item.id===messageId&&item.role==='assistant');if(!message)throw new Error('Choose a saved result to check.');
    const picked=await dialog.showOpenDialog(window,{title:'Choose declared checks JSON — executes the specified target with independent expectations',properties:['openFile'],filters:[{name:'Declared behavioral checks',extensions:['json']}]});if(picked.canceled||!picked.filePaths[0])return null;
    await draftQueue;controller.signal.throwIfAborted();const file=picked.filePaths[0];if((await fs.stat(file)).size>200000)throw new Error('Check request exceeds 200 KB.');const manifest=JSON.parse(await fs.readFile(file,'utf8'));
      investigator.config=await getConfig();if(manifest.capture!=='host-process'){try{client=await openReaClient(investigator.config,{signal:controller.signal});}catch(error){client={callTool:async()=>{throw error;}};}}
      let browserPath;if(manifest.kind==='browser'&&!manifest.browser){try{browserPath=await browserExecutable(investigator.config);}catch{}}
      const checked=await runVerification({state,messageId,manifest,client,config:investigator.config,browserPath,signal:controller.signal,directory:store.directory(id),onProgress:text=>window.webContents.send('activity',text)});
      for(const raw of checked.evidence||[]){const target=state.targets.find(target=>target.root===raw.locator||target.locator===raw.locator)||state.targets[0];let envelope=raw.raw;if(raw.error)envelope={error:raw.error,observation:raw.raw};if(typeof envelope==='string'){try{envelope=JSON.parse(envelope);}catch{envelope={content:[{type:'text',text:envelope}]};}}
        const evidence=reaEvidenceRecord(envelope,{operation:raw.operation,parameters:raw.parameters,target,status:raw.error?'inspection-failed':'check-result'});evidence.id=raw.id||evidence.id;if(raw.locator)evidence.locator=raw.locator;if(raw.kind==='host-process'){evidence.kind='host-process';evidence.title='Declared host process check';evidence.reaEvidenceId='';evidence.authority='host-process';}await store.addEvidence(state,evidence);
      }
      state.verificationRuns||=[];state.verificationRuns.push(checked.run);attachDelivery(state,message);await assessFreshness(state);await store.save(state);return state;
    }finally{try{await client?.close?.();}finally{if(active===controller)active=null;}}
  });
  handle('connection-info',async()=>{const view=await connection.view();return {...view,autoOpen:(distributedMode||process.env.REA_FORCE_SETUP==='1')&&!view.configured};});
  handle('connection-readiness',()=>connection.checkReadiness());
  // Startup checks never make a model request or lock investigation actions.
  handle('connection-discover',options=>options?.background===true?connection.discover():setup(signal=>connection.discover(signal)));
  handle('connection-connect-detected',input=>setup(async signal=>{const result=await connection.connectDetected(input,signal);investigator.config=await getConfig();return result;}));
  const loginInstruction=instruction=>{if(window&&!window.isDestroyed())window.webContents.send('connection-instruction',instruction);};
  handle('connection-login-detected',input=>setup(signal=>connection.loginDetected(input,signal,loginInstruction)));
  installSetupHost({handle,setup,connection,reaConnection,nativeCheck,store,getCurrent:()=>currentId,dialog,getWindow:()=>window,clipboard,setupReport,captureBrowser,onProgress:progress=>{if(window&&!window.isDestroyed())window.webContents.send('setup-progress',progress);},system:()=>({platform:process.platform,release:require('node:os').release(),arch:process.arch,versions:process.versions,portable:portableMode})});
  handle('connection-test',input=>setup(async signal=>{const result=await connection.saveVerified(input,signal);investigator.config=await getConfig();return result;}));
  handle('connection-login',input=>setup(signal=>connection.login(input,signal,loginInstruction)));
  handle('connection-cancel',()=>setupController?.abort());
  handle('connection-pick',async()=>{idle();const result=await dialog.showOpenDialog(window,{title:'Choose AI CLI executable or JavaScript entry point',properties:['openFile'],...(process.platform==='win32'?{filters:[{name:'AI CLI',extensions:['exe','js','mjs','cjs']}]}:{})});return result.canceled?null:result.filePaths[0];});
  handle('connection-help',kind=>{const links={codex:'https://developers.openai.com/codex/auth/',device:'https://auth.openai.com/codex/device',claude:'https://code.claude.com/docs/en/setup',claw:'https://docs.openclaw.ai/gateway/openai-http-api',ghidra:'https://github.com/NationalSecurityAgency/ghidra/releases','ghidra-guide':'https://github.com/morluto/rea/blob/rea-agents-6.5.0/docs/installation.md',jdk:'https://adoptium.net/temurin/releases/'};if(!links[kind])throw new Error('Unknown help topic.');return shell.openExternal(links[kind]);});
  handle('connection-shortcut',async()=>{if(process.platform!=='win32')throw new Error('Desktop shortcuts are available on Windows.');const script=path.join(__dirname,'create-shortcut.ps1');await runProcess('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Executable',process.execPath,'-AppName',app.getName(),'-AppFolder',__dirname,'-Icon',path.join(__dirname,'assets','rea-nodes.ico')],{timeout:15000});return true;});
  const {GoalSpeech,GoalMicrophoneGate}=await import('./lib/goal-speech.mjs');
  const goalSpeech=new GoalSpeech();let speechInfo;
  const {createDialogConfirmation}=await import('./lib/dialog-confirmation.mjs');
  const microphoneConfirmation=createDialogConfirmation({getWindow:()=>window,handle,channel:'microphone-confirmation'});
  const goalVoiceGate=new GoalMicrophoneGate({url:pathToFileURL(path.join(__dirname,'ui/index.html')).href,getWindow:()=>window,confirm:()=>microphoneConfirmation.confirm()});
  const voiceProgress=id=>event=>{if(!window.isDestroyed())window.webContents.send('goal-voice-progress',{id,...event});};
  handle('goal-voice-status',async()=>(speechInfo=await goalSpeech.status()));
  const {productLink}=await import('./lib/product-links.mjs');
  handle('product-link',key=>shell.openExternal(productLink(key)));
  handle('goal-voice-install',async id=>{if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw Error('Invalid dictation setup request.');return speechInfo=await goalSpeech.install(id,{onProgress:voiceProgress(id)});});
  handle('goal-voice-prepare',async id=>{if(!speechInfo?.available)throw new Error('No offline speech provider is ready.');goalVoiceGate.arm(id);});
  handle('goal-voice-transcribe',(id,wave)=>{goalVoiceGate.consume(id);return goalSpeech.transcribe(id,wave,{onProgress:voiceProgress(id)});});
  handle('goal-voice-cancel',id=>{goalVoiceGate.cancel(id);microphoneConfirmation.cancel();goalSpeech.cancel(id);});
  // Checks deny by default, forcing the per-recording request prompt. No persistent grant.
  session.defaultSession.setPermissionCheckHandler(()=>false);
  session.defaultSession.setPermissionRequestHandler((wc,permission,callback,details)=>{goalVoiceGate.request(wc,permission,details).then(callback,()=>callback(false));});
  const closeGoalVoice=()=>{goalVoiceGate.cancel();microphoneConfirmation.cancel();goalSpeech.close();};
  app.on('before-quit',closeGoalVoice);


  handle('load', async () => { await draftQueue;const list = await store.list(); let prior;try{prior=JSON.parse(await fs.readFile(activeFile,'utf8')).id;}catch{}const selected=list.find(item=>item.id===prior)||list[0];const state=selected ? await store.read(selected.id) : await store.create();if(state.status==='inspecting'){state.status='stopped';await store.save(state);}else state.status=savedStatus(state);await activate(state.id);await displayState(state);return { state, list, capabilities:capabilities(investigator.config) }; });
  handle('history', () => store.list());
  handle('ai-resume-status',async(id,attemptId)=>{idle();await draftQueue;const {aiResumeStatus}=await import('./lib/ai-resume-status.mjs');return aiResumeStatus(store,id,attemptId);});
  handle('saved-files',async id=>{await store.list();const folder=id?(await store.read(id),store.directory(id)):root;const error=await shell.openPath(folder);if(error)throw new Error(error);return folder;});
  handle('open', async id => { idle(); await draftQueue;if(id!==currentId&&!await documentHost.guard())return null;const state=await store.read(id);await activate(state.id);return displayState(state); });
  handle('new', async () => { idle(); await draftQueue;if(!await documentHost.guard())return null;const state=await store.create();await activate(state.id);return state; });
  const {installOnboardingHost}=await import('./lib/onboarding-host.mjs');
  installOnboardingHost({handle,store,idle,flush:()=>draftQueue,guard:()=>documentHost.guard(),activate});
  handle('draft', async (id, text) => {
    if (active || deletedIds.has(id) || typeof text !== 'string' || text.length > 18000) return;
    const operation=async()=>{if(deletedIds.has(id))return;await store.updateWorkspace(id,{draft:text});};
    const pending=draftQueue.then(operation,operation);draftQueue=pending.catch(()=>{});
    return pending;
  });
  handle('workspace', async (id, patch) => {
    if (deletedIds.has(id)) throw new Error('That investigation was deleted.');
    const operation = () => store.updateWorkspace(id, patch);
    const pending = draftQueue.then(operation, operation); draftQueue = pending.catch(()=>{});
    return pending;
  });
  handle('snapshot', async (id, evidenceId) => {
    const state=await store.read(id), record=state.evidence.find(e=>e.id===evidenceId);
    if(!record)throw new Error('Source not found.');
    if(record.portableAttachment&&record.portableAttachment.status!=='bundled')throw new Error(record.portableAttachment.reason||'This evidence remains external or was excluded from the document.');
    const raw=await fs.readFile(record.snapshotPath,'utf8').catch(error=>{if(error.code==='ENOENT')throw new Error('This snapshot is missing. Saved findings remain readable; no target was contacted.');throw error;});
    if(record.sha256&&require('node:crypto').createHash('sha256').update(raw).digest('hex')!==record.sha256)throw new Error('The saved snapshot no longer matches its recorded hash.');
    return {text:raw.slice(0,250000),truncated:raw.length>250000};
  });
  handle('select', async (id,messageId,featureName) => {
    idle();let result;
    const operation=async()=>{const state=await store.read(id);if(messageId===null&&featureName===null)state.selection=null;else selectFeature(state,messageId,featureName);await store.save(state);result=state;};
    const pending=draftQueue.then(operation,operation);draftQueue=pending.catch(()=>{});
    await pending;return result;
  });
  handle('keep', async (id,messageId,featureName,keep) => {
    idle();let result;const operation=async()=>{idle();result=await saveCollectionChange(store,id,messageId,featureName,keep);};
    const pending=draftQueue.then(operation,operation);draftQueue=pending.catch(()=>{});await pending;return result;
  });
  handle('export',async id=>{
    idle();await draftQueue;const state=await assessFreshness(await store.read(id));await store.save(state);if(!state.keptFeatures?.length)throw new Error('Keep a feature first.');
    const result=await dialog.showSaveDialog(window,{title:'Save features for my app',defaultPath:'my-app-features.json',filters:[{name:'Feature collection',extensions:['json']}]});
    if(result.canceled||!result.filePath)return null;await fs.writeFile(result.filePath,JSON.stringify(featureCollection(state),null,2));return result.filePath;
  });
  handle('export-investigation',async(id,view)=>{
    idle();await draftQueue;const state=await assessFreshness(await store.read(id));await store.save(state);
    const result=await dialog.showOpenDialog(window,{title:'Choose where to export the investigation',properties:['openDirectory','createDirectory']});
    if(result.canceled||!result.filePaths[0])return null;idle();await draftQueue;return exportInvestigation(store,id,result.filePaths[0],view);
  });
  handle('import-investigation',async()=>{
    idle();await draftQueue;const result=await dialog.showOpenDialog(window,{title:'Choose a REA investigation export folder',properties:['openDirectory']});
    if(result.canceled||!result.filePaths[0])return null;idle();await draftQueue;if(!await documentHost.guard())return null;const imported=await importInvestigation(store,result.filePaths[0]);await activate(imported.state.id);return imported;
  });
  const {createDeleteConfirmation}=await import('./lib/delete-confirmation.mjs');
  const deleteConfirmation=createDeleteConfirmation({getWindow:()=>window,handle});
  const deleteHistory=async ids=>{
    idle();await draftQueue;const {deleteHistoryBatch}=await import('./lib/history-deletion.mjs');
    const result=await deleteHistoryBatch(store,ids,{beforeDelete:async()=>{idle();await draftQueue;},mark:(id,deleted)=>deleted?deletedIds.add(id):deletedIds.delete(id),trash:directory=>shell.trashItem(directory),confirm:async items=>{
      return deleteConfirmation.confirm(items);
    }});
    let state=null;if(result.deletedIds.includes(currentId)){const list=await store.list();state=list.length?await store.read(list[0].id):await store.create();await activate(state.id);}
    return {...result,deleted:result.deletedIds.length>0,state};
  };
  handle('delete-investigation',async id=>deleteHistory([id]));
  handle('delete-investigations',async ids=>deleteHistory(ids));
  handle('turn', async (id, text, branchFeatureName, options={}) => {
    idle();const controller = new AbortController();active = controller;
    try {
    await draftQueue;controller.signal.throwIfAborted();version.assertCurrent();
    const state = await store.read(id),localCollection=collectionIntent(state,text);if(!localCollection&&distributedMode&&!(await connection.view()).configured)throw new Error('Open Setup and connect an agent before starting an investigation.');if(branchFeatureName!==undefined&&branchFeatureName!==null&&(typeof branchFeatureName!=='string'||!inventoryRecords(state).some(record=>record.row.name.trim().toLowerCase()===branchFeatureName.trim().toLowerCase())))throw new Error('That feature is not in this investigation.');
    controller.signal.throwIfAborted();if(!localCollection)investigator.config=await getConfig();controller.signal.throwIfAborted();await investigator.turn(state, text, { signal: controller.signal, preserveDraft:!!options.preserveDraft,branchFeatureName,parentResultId:options.parentResultId,parentNodeId:options.parentNodeId,nodeId:options.nodeId,continuing:!!options.continuing,recoveryAttemptId:options.recoveryAttemptId,resumeAiAttemptId:options.resumeAiAttemptId,resumeInterruptedAttemptId:options.resumeInterruptedAttemptId,retryFailureAttemptId:options.retryFailureAttemptId,collectionRequestId:options.collectionRequestId,collectionChoice:options.collectionChoice, onProgress: text => { if (!window.isDestroyed()) window.webContents.send('activity', text); } });if(!options.preserveDraft&&!state.collectionCommandResult&&state.preflight?.status!=='blocked')await store.updateWorkspace(id,{draft:'',draftContext:null});await draftQueue;const saved=await store.read(id);return {...saved,...(state.collectionCommandResult?{collectionCommandResult:state.collectionCommandResult}:{}),...(state.collectionSaveError?{collectionSaveError:state.collectionSaveError}:{})}; }
    finally { if(active===controller)active = null; }
  });
  const savedComparisons=await import('./lib/saved-comparison.mjs');
  handle('comparison-candidates',async(options={})=>{await draftQueue;return savedComparisons.listComparisonCandidates(store,options);});
  handle('comparison-status',async(id,operationId)=>{await draftQueue;return savedComparisons.comparisonStatus(store,id,operationId);});
  handle('compare-saved',async payload=>{
    idle();const controller=new AbortController();active=controller;
    try{await draftQueue;controller.signal.throwIfAborted();version.assertCurrent();
      if(payload?.destinationInvestigationId!==currentId)throw new Error('The initiating investigation changed. No comparison started.');
      if(distributedMode&&!(await connection.view()).configured)throw new Error('Open Setup and connect an agent before starting a comparison.');
      const outcome=await savedComparisons.compareSaved(store,payload,{signal:controller.signal,getConfig,directory:store.directory(currentId),beforeSave:async()=>{await draftQueue;controller.signal.throwIfAborted();version.assertCurrent();if(currentId!==payload.destinationInvestigationId)throw new Error('The comparison destination changed.');},onProgress:text=>{if(!window.isDestroyed())window.webContents.send('activity',text);}});
      await draftQueue;if(outcome.status==='saved')outcome.state=await store.read(payload.destinationInvestigationId);return outcome;
    }finally{if(active===controller)active=null;}
  });
  handle('audit', async (id, messageIds, text, options={}) => {
    idle();const controller=new AbortController();active=controller;
    try{await draftQueue;controller.signal.throwIfAborted();version.assertCurrent();const state=await store.read(id);
    if(!options.preserveDraft)await store.updateWorkspace(id,{draft:'',draftContext:null});
    controller.signal.throwIfAborted();const {auditSavedSupport}=await import('./lib/support-audit.mjs');const config=await getConfig();controller.signal.throwIfAborted();await auditSavedSupport(state,messageIds,text,{config,directory:store.directory(id),signal:controller.signal,onProgress:text=>window.webContents.send('activity',text)});await store.save(state);await draftQueue;return await store.read(id);}finally{if(active===controller)active=null;}
  });
  handle('export-graph',async id=>{
    idle();await draftQueue;const state=await store.read(id);const {investigationGraph}=await import('./lib/graph.mjs');const graph=investigationGraph(state);const {graphExportFilename}=await import('./lib/graph-export-filename.mjs');
    const result=await dialog.showSaveDialog(window,{title:'Save investigation graph',defaultPath:graphExportFilename(state.title),filters:[{name:'Investigation graph',extensions:['json']}]});
    if(result.canceled||!result.filePath)return null;
    const nodes=[...graph.nodes.values()].map(({id,type,title,summary,parent,message,row,claim,evidence,product,finding,request,kept,latest})=>({id,type,title,summary,parent,messageId:message?.id,featureName:row?.name,claim,evidence,product,finding,request,kept,latest}));
    const {serializeWorkspaceMap}=await import('./lib/workspace-map.mjs');
    await fs.writeFile(result.filePath,JSON.stringify({schemaVersion:1,investigationId:state.id,exportedAt:new Date().toISOString(),root:graph.root,nodes,edges:graph.edges,workspaceMap:serializeWorkspaceMap(state)},null,2));return result.filePath;
  });
  handle('stop', () => {active?.abort();setupController?.abort();});
  handle('agent-status',id=>agentGuide.read(id));
  handle('agent-folder',async()=>{idle();const result=await dialog.showOpenDialog(window,{title:'Choose your project folder (read only)',properties:['openDirectory']});return result.canceled?null:result.filePaths[0];});
  handle('agent-plan',async(id,goal,folder,replan=false,requestId,startingNodeId=null)=>{idle();version.assertCurrent();const controller=new AbortController();active=controller;activePlan={id,requestId,controller};try{await draftQueue;controller.signal.throwIfAborted();const config=await getConfig();controller.signal.throwIfAborted();const session=await agentGuide.propose(id,goal,folder,{config,signal:controller.signal,replan,startingNodeId});controller.signal.throwIfAborted();window.webContents.send('agent-update',{session});return session;}finally{if(active===controller)active=null;if(activePlan?.controller===controller)activePlan=null;}});
  handle('agent-plan-cancel',(id,requestId)=>{if(!requestId||activePlan?.id!==id||activePlan.requestId!==requestId)return false;activePlan.controller.abort();return true;});
  handle('agent-approve',async(id,ids,skipped)=>{idle();const session=await agentGuide.approve(id,ids,skipped);window.webContents.send('agent-update',{session});return session;});
  handle('agent-start',async id=>{idle();const controller=new AbortController();active=controller;try{await draftQueue;controller.signal.throwIfAborted();version.assertCurrent();return await agentGuide.run(id,{signal:controller.signal,onUpdate:async(session,investigation)=>{if(!window.isDestroyed())window.webContents.send('agent-update',{session,investigation});}});}finally{if(active===controller)active=null;}});
  handle('agent-pause',()=>agentGuide.pause());
  handle('agent-stop',()=>{agentGuide.stop();active?.abort();});
  handle('folder', async () => { const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'], title: 'Choose a product source folder' }); return result.canceled ? null : result.filePaths[0]; });
  handle('source', async (id, evidenceId) => {
    const state = await store.read(id); const evidence = state.evidence.find(e => e.id === evidenceId);
    if (!evidence) throw new Error('Source not found.');
    if (['page', 'browser','section'].includes(evidence.kind)) {
      const url = new URL(evidence.locator); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported source URL.');
      return shell.openExternal(url.href);
    }
    return shell.showItemInFolder(evidence.snapshotPath);
  });
  let windowIcon=path.join(__dirname,'assets/rea-nodes.ico');
  let brandRevision=0;
  handle('brand-icon',async(png,syncDesktop=false)=>{
    if(typeof png!=='string'||png.length>400000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png))throw Error('Invalid brand icon.');
    const icon=nativeImage.createFromDataURL(png),size=icon.getSize();
    if(icon.isEmpty()||size.width!==256||size.height!==256)throw Error('Expected a square brand icon.');
    const revision=++brandRevision;
    if(process.platform==='win32'){
      const sizes=[16,20,24,32,40,48,64,128,256],images=sizes.map(width=>icon.resize({width,height:width,quality:'best'}).toPNG());
      const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
      images.forEach((bytes,i)=>{const at=6+i*16;header[at]=header[at+1]=sizes[i]===256?0:sizes[i];header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(bytes.length,at+8);header.writeUInt32LE(offset,at+12);offset+=bytes.length;});
      const bytes=Buffer.concat([header,...images]),hash=require('node:crypto').createHash('sha256').update(bytes).digest('hex');
      const folder=path.join(app.getPath('userData'),'brand-icons');await fs.mkdir(folder,{recursive:true});const file=path.join(folder,`nodes-${hash}.ico`);await fs.writeFile(file,bytes);
      if(revision!==brandRevision||window.isDestroyed())return false;
      windowIcon=file;window.setIcon(file);
      window.setAppDetails({appId:windowsAppId,appIconPath:file,appIconIndex:0,relaunchCommand:portableMode?`"${process.execPath}"`:`"${process.execPath}" "${__dirname}"`,relaunchDisplayName:'Nodes for REA'});
      const {syncBrandShortcuts}=require('./lib/windows-brand-shortcuts.cjs');
      await syncBrandShortcuts({
        appData:process.env.INVESTIGATOR_DATA?path.join(root,'.owned-app-data'):app.getPath('appData'),
        desktop:syncDesktop===true?(process.env.INVESTIGATOR_DATA?path.join(root,'.owned-desktop'):app.getPath('desktop')):undefined,
        identity:{appRoot:__dirname,executable:process.execPath,portable:portableMode,scriptHost:path.join(process.env.SystemRoot,'System32/wscript.exe'),launchers:['Launch Candidate.vbs','Launch-Nodes-Next.vbs'].map(name=>path.join(__dirname,name))},
        backupFolder:path.join(app.getPath('userData'),'brand-shortcut-backups'),
        appId:windowsAppId,icon:file,shell,displayName:'Nodes for REA',isCurrent:()=>revision===brandRevision&&!window.isDestroyed()
      }).catch(()=>{});
    }else if(!window.isDestroyed())window.setIcon(icon);
    return true;
  });
  if(process.platform==='win32'){
    const iconBytes=await fs.readFile(windowIcon),iconHash=require('node:crypto').createHash('sha256').update(iconBytes).digest('hex');
    const iconFolder=path.join(process.env.LOCALAPPDATA||app.getPath('userData'),'Nodes for REA','Icons');
    await fs.mkdir(iconFolder,{recursive:true});windowIcon=path.join(iconFolder,`nodes-${iconHash}.ico`);await fs.writeFile(windowIcon,iconBytes);
  }
  const captionStyle=()=>({color:nativeTheme.shouldUseDarkColors?'#202020':'#ffffff',symbolColor:nativeTheme.shouldUseDarkColors?'#f0f0f0':'#1d1d1f',height:30});
  window = new BrowserWindow({ width: 1360, height: 900, minWidth: 480, minHeight: 600, backgroundColor: '#151617', title: 'Nodes for REA', icon:windowIcon, autoHideMenuBar: true,
    ...(process.platform==='win32'?{titleBarStyle:'hidden',titleBarOverlay:captionStyle(),show:false}:{}),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, additionalArguments:nativeTheme.shouldUseDarkColors?['--nodes-caption-dark']:[] } });
  if(process.platform==='win32')window.setAppDetails({
    appId:windowsAppId,appIconPath:windowIcon,appIconIndex:0,
    relaunchCommand:portableMode?`"${process.execPath}"`:`"${process.execPath}" "${__dirname}"`,
    relaunchDisplayName:'Nodes for REA'
  });
  window.webContents.on('render-process-gone',closeGoalVoice);
  window.webContents.on('did-start-loading',closeGoalVoice);
  window.on('closed',closeGoalVoice);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.on('close',event=>documentHost.closeWindow(event));
  if(process.platform==='win32'){
    const updateCaption=()=>{if(!window.isDestroyed()){window.setTitleBarOverlay(captionStyle());window.webContents.send('window-caption-theme',nativeTheme.shouldUseDarkColors);}};
    nativeTheme.on('updated',updateCaption);window.on('closed',()=>nativeTheme.removeListener('updated',updateCaption));
  }
  await window.loadFile(path.join(__dirname, 'ui/index.html'));
  if(process.platform==='win32'&&!window.isDestroyed())window.show();
  const updates=setInterval(()=>{if(window&&!window.isDestroyed()&&version.changed())window.webContents.send('runtime-update',true);},3000);updates.unref();
  window.on('closed',()=>clearInterval(updates));
});
app.on('window-all-closed', () => app.quit());
