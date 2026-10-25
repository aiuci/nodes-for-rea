import test from 'node:test';
import assert from 'node:assert/strict';
import {jeremysSpectrumColor,sampleLoopingJeremysSpectrum,SPECTRUM_BEAT,assignLoopingNodeSpectrum} from '../lib/jeremys-spectrum.mjs';
import {cleanWorkspace} from '../lib/workspace.mjs';
const numbers=color=>color.match(/[-\d.]+/g).map(Number);
const distance=(a,b)=>Math.min(Math.abs(a-b),360-Math.abs(a-b));
test('closed spectrum retains all original reference beats and adds a smooth repeating seam',()=>{
  for(let i=0;i<10;i++){const original=numbers(jeremysSpectrumColor(i,10)),loop=numbers(sampleLoopingJeremysSpectrum(i*2*SPECTRUM_BEAT));original.forEach((v,j)=>assert.ok(Math.abs(v-loop[j])<1e-10));}
  for(let i=-80;i<160;i++){const a=numbers(sampleLoopingJeremysSpectrum(i*SPECTRUM_BEAT)),b=numbers(sampleLoopingJeremysSpectrum((i+1)*SPECTRUM_BEAT));assert.ok(distance(a[0],b[0])<=14.500001);assert.ok(Math.abs(a[2]-b[2])<1);assert.equal(a[1],100);}
  assert.equal(sampleLoopingJeremysSpectrum(0),sampleLoopingJeremysSpectrum(1));assert.equal(sampleLoopingJeremysSpectrum(1),sampleLoopingJeremysSpectrum(5));
});
test('dense branches progress beyond the old cap, wrap smoothly and retain existing colors when work grows',()=>{
  const map={root:'core',children:new Map([['core',['feature']],['feature',Array.from({length:70},(_,i)=>`finding:${i}`)]])};
  const first=assignLoopingNodeSpectrum(map);assert.ok(Object.values(first).some(v=>v>.8));assert.ok(first['finding:24']<first['finding:23']);
  map.children.get('feature').push('new');const next=assignLoopingNodeSpectrum(map,first);for(const [id,p]of Object.entries(first))assert.equal(next[id],p);
  const saved=cleanWorkspace({spectrumVersion:2,spectrum:next});assert.equal(saved.spectrumVersion,2);assert.deepEqual(saved.spectrum,next);
});
