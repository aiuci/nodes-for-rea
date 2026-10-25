// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

// Windows readers/scanners can briefly prevent replacement. Never unlink the
// committed destination: a persistent failure must leave the old file intact.
export async function atomicReplace(source,destination,{rename=fs.rename,wait=delay}={}){
  for(let attempt=0;;attempt++){
    try{return await rename(source,destination);}
    catch(error){
      if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt===4)throw error;
      await wait(25*2**attempt);
    }
  }
}
