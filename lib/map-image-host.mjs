// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
import {imageFilename,validateImagePayload} from './map-image-export.mjs';
export function installMapImageHost({handle,dialog,getWindow,store}){
  handle('export-map-image',async(id,payload)=>{
    await store.read(id);const data=validateImagePayload(payload),format=payload.format;
    const result=await dialog.showSaveDialog(getWindow(),{title:`Save map as ${format.toUpperCase()}`,defaultPath:imageFilename(payload.title,format),filters:[{name:format==='svg'?'Scalable vector image':'High-resolution PNG',extensions:[format]}]});
    if(result.canceled||!result.filePath)return null;
    await fs.writeFile(result.filePath,data);return result.filePath;
  });
}
