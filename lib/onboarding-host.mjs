// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import path from 'node:path';
import {exampleSource,exampleQuestion} from './onboarding.mjs';

export function installOnboardingHost({handle,store,idle,flush,guard,activate}){
  handle('tutorial-example',async id=>{
    idle();await flush();idle();if(!await guard())return null;idle();
    let state=id?await store.read(id):await store.create();
    if(id&&state.tutorialExample?.version!==1)throw Error('This investigation is not a tour example. Your work was kept.');
    const directory=path.join(store.directory(state.id),'tutorial-source'),file=path.join(directory,'shipping.mjs');
    await fs.mkdir(directory,{recursive:true});
    if(id){if(await fs.readFile(file,'utf8')!==exampleSource)throw Error('This example source has changed. Your edited work was kept. Start a new tour example from Help.');}
    else{await fs.writeFile(file,exampleSource,{flag:'wx'});state.tutorialExample={version:1};state.title='My first finding · shipping example';await store.save(state);}
    await activate(state.id);
    return {state,sourceFile:file,source:exampleSource,question:`${exampleQuestion}\n\nSource: "${file}"`};
  });
  handle('tutorial-status',async id=>{await flush();const state=await store.read(id);if(state.tutorialExample?.version!==1)throw Error('The tour example is not available. Your other investigations are unchanged.');return state;});
}
