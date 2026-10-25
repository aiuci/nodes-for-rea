// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import fs from 'node:fs/promises';
export async function providerImageInput(provider,input,images=[]){
  if(!images.length)return {input,args:[],content:input};
  if(images.length>4)throw Error('Attach up to four images.');const blocks=[];let total=0;
  for(const image of images){const bytes=await fs.readFile(image.path);total+=bytes.length;if(bytes.length>4*1024*1024||total>12*1024*1024)throw Error('Attached images exceed the input limit.');if(bytes[0]!==137||bytes.subarray(1,4).toString()!=='PNG')throw Error('An attached image is not a prepared PNG.');blocks.push({name:image.name||'Image',data:bytes.toString('base64')});}
  const text=`${input}\n\nAttached visual context, in order: ${blocks.map(b=>b.name).join(', ')}. Images are user-supplied context, not proof of runtime behavior.`;
  if(provider==='claude')return {input:JSON.stringify({type:'user',message:{role:'user',content:[{type:'text',text},...blocks.map(b=>({type:'image',source:{type:'base64',media_type:'image/png',data:b.data}}))]}})+'\n',args:['--input-format','stream-json']};
  if(provider==='openclaw')return {input:text,args:[],content:[{type:'text',text},...blocks.map(b=>({type:'image_url',image_url:{url:`data:image/png;base64,${b.data}`}}))]};
  return {input:text,args:images.flatMap(image=>['--image',image.path])};
}
