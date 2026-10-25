import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTIN_THEMES,normalizeTheme,themeColor,contrast,parseThemeFile} from '../lib/theme-system.mjs';
import {SPECTRUM_BEAT} from '../lib/jeremys-spectrum.mjs';
import {navigationBeat,navigationAccent,navigationMarker,normalizeNavigation} from '../lib/outline-navigation.mjs';
test('navigation reuses retained Spectrum beats while original Dark is exact',()=>{
 const dark=normalizeTheme(BUILTIN_THEMES.find(t=>t.id==='dark'));
 for(let i=0;i<25;i++){
  const phase=i*SPECTRUM_BEAT;assert.equal(navigationBeat(phase),i);
  assert.equal(navigationAccent(phase,dark.navigation,dark.colors.surface,themeColor(phase,dark)),themeColor(phase,dark));
 }
 assert.throws(()=>navigationBeat(NaN));
});
test('theme navigation accents remain readable and neighboring color beats separate',()=>{
 for(const raw of BUILTIN_THEMES){const theme=normalizeTheme(raw),profile=theme.navigation;if(profile.mode==='original')continue;
  for(let i=0;i<25;i++){
   const color=navigationAccent(i*SPECTRUM_BEAT,profile,theme.colors.surface,''),next=navigationAccent((i+1)*SPECTRUM_BEAT,profile,theme.colors.surface,'');
   assert.ok(contrast(color,theme.colors.surface)>=4.5-1e-6,theme.name);assert.notEqual(color,next,theme.name);
  }
 }
 const apple=normalizeTheme(BUILTIN_THEMES.find(t=>t.id==='apple'));assert.equal(apple.navigation.mode,'separated');
 assert.equal(new Set([0,1,2].map(i=>navigationMarker(i*SPECTRUM_BEAT,apple.navigation))).size,1);
 assert.equal(new Set([0,1,2].map(i=>navigationMarker(i*SPECTRUM_BEAT,{mode:'tonal',colors:[]}))).size,3);
});
test('saved stock Apple variants adopt navigation accents without overwriting authored palettes',()=>{
 const apple=BUILTIN_THEMES.find(t=>t.id==='apple'),stock={mode:'tonal',colors:['#394655','#85919e','#4b5969','#74818f']};
 for(const background of ['plain','contour']){
  const raw={...apple,id:`custom-apple-${background}-saved`,background,navigation:stock},updated=normalizeTheme(raw,{custom:true});
  assert.equal(updated.navigation.mode,'separated');assert.deepEqual(updated.wire.colors,apple.wire.colors);assert.equal(updated.background,background);
  assert.equal(normalizeTheme({...raw,navigation:undefined}).navigation.mode,'separated');
  const authored={mode:'tonal',colors:['#253647','#65788a']};assert.deepEqual(normalizeTheme({...raw,navigation:authored}).navigation,authored);
  assert.doesNotThrow(()=>normalizeTheme({...raw,navigation:{mode:'tonal',colors:'invalid'}}));
 }
});
test('custom navigation definitions survive duplication and sharing with bounded safe input',()=>{
 const theme=normalizeTheme({...BUILTIN_THEMES[0],id:'mine',navigation:{mode:'separated',colors:['#114477','#aa3377','#227755']}},{custom:true});
 assert.deepEqual(parseThemeFile(JSON.stringify(theme)),theme);
 const modified=normalizeTheme({...theme,wire:{...theme.wire,colors:['#223344','#556677']}});assert.deepEqual(modified.navigation,theme.navigation);
 const invalid=normalizeNavigation({mode:'url(unsafe)',colors:['url(unsafe)',...Array(30).fill('#123456')]},theme);assert.equal(invalid.mode,'separated');assert.equal(invalid.colors.length,8);assert.ok(!JSON.stringify(invalid).includes('url('));
 const legacyApple=normalizeTheme({...BUILTIN_THEMES.find(t=>t.id==='apple'),id:'custom-older-apple'});assert.equal(legacyApple.navigation.mode,'tonal');assert.equal(legacyApple.navigation.colors.length,4);
 const unsafeFallback=normalizeNavigation(null,{id:'unknown',wire:{colors:['url(unsafe)','#xxxxxx']}});assert.ok(unsafeFallback.colors.every(c=>/^#[0-9a-f]{6}$/i.test(c)));
});
