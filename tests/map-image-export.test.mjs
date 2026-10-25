import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {imageDimensions,mapImageSvg,validateImagePayload,imageFilename,xml,MAX_IMAGE_PIXELS} from '../lib/map-image-export.mjs';
import {installMapImageHost} from '../lib/map-image-host.mjs';
test('PNG dimensions preserve aspect ratio and respect side/pixel limits',()=>{
  assert.deepEqual(imageDimensions(2000,1000,8192),{width:8192,height:4096});
  for(const [w,h]of [[1,1000000],[1000000,1],[9000,9000],[800,2200]])for(const edge of [4096,8192,16384]){const d=imageDimensions(w,h,edge);assert.ok(d.width<=16384&&d.height<=16384);assert.ok(d.width*d.height<=MAX_IMAGE_PIXELS);}
  assert.throws(()=>imageDimensions(NaN,1));assert.throws(()=>imageDimensions(1,0));assert.throws(()=>imageDimensions(1,1,50000));
});
test('SVG preserves negative-coordinate map content, complete title and escaped attribution',()=>{
  const result=mapImageSvg({bounds:{x:-900,y:-400,width:1800,height:800},nodesMarkup:'<rect x="-900" y="-400" width="220" height="66"/>',title:'A < B & C',layout:'Spiral',count:3,credit:'By "Jeremy" & IUC'});
  assert.match(result.svg,/translate\(972 572\)/);assert.match(result.svg,/Nodes for REA/);assert.match(result.svg,/A &lt; B &amp; C/);assert.match(result.svg,/By &quot;Jeremy&quot; &amp; IUC/);assert.equal(validateImagePayload({format:'svg',data:result.svg}),result.svg);assert.equal(xml('\u0000<&'),'&lt;&amp;');assert.equal(imageFilename('../A:B','png'),'.. A B-map.png');
});

test('map export follows light appearance while existing exports default to dark',()=>{
  const input={bounds:{x:0,y:0,width:800,height:400},nodesMarkup:'',title:'Theme proof',layout:'Horizontal',count:1};
  const light=mapImageSvg({...input,theme:'light'}).svg,dark=mapImageSvg(input).svg;
  assert.match(light,/<rect width="100%" height="100%" fill="#f5f5f7"/);
  assert.match(light,/fill="#1d1d1f" font-size="26"/);
  assert.match(dark,/<rect width="100%" height="100%" fill="#0c141a"/);
  assert.equal(validateImagePayload({format:'svg',data:light}),light);
});
test('image payload validation rejects unsupported, active or oversized content',()=>{
  for(const data of ['<svg><script>alert(1)</script></svg>','<svg><image href="file:///secret"/></svg>','<svg onload="run()"></svg>'])assert.throws(()=>validateImagePayload({format:'svg',data}));
  assert.throws(()=>validateImagePayload({format:'jpg',data:''}));assert.throws(()=>validateImagePayload({format:'png',data:new Uint8Array(33)}));
  const data=new Uint8Array(33);data.set([137,80,78,71,13,10,26,10]);const v=new DataView(data.buffer);v.setUint32(16,16384);v.setUint32(20,16384);assert.throws(()=>validateImagePayload({format:'png',data}));
});
test('native export handler writes only the picker destination and cancellation writes nothing',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rea-map-export-')),file=path.join(root,'map.svg');let handler,cancel=true,reads=0;
  installMapImageHost({handle:(name,fn)=>{assert.equal(name,'export-map-image');handler=fn;},dialog:{showSaveDialog:async()=>({canceled:cancel,filePath:file})},getWindow:()=>null,store:{read:async id=>{assert.equal(id,'owned');reads++;return {};}}});
  const payload={format:'svg',title:'My map',data:'<svg xmlns="http://www.w3.org/2000/svg"></svg>'};assert.equal(await handler('owned',payload),null);assert.deepEqual(await fs.readdir(root),[]);cancel=false;assert.equal(await handler('owned',payload),file);assert.equal(await fs.readFile(file,'utf8'),payload.data);assert.equal(reads,2);
});
