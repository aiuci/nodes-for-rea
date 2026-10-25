import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTIN_THEMES,normalizeTheme,themeColor,contrast,parseThemeFile,themeVariables,themeAtmosphereSvg,themeWireStops,themeSurfaceStops,themeWireContour} from '../lib/theme-system.mjs';
import {assignLoopingNodeSpectrum} from '../lib/jeremys-spectrum.mjs';
import {mapImageSvg} from '../lib/map-image-export.mjs';
import {wireHitsNode} from '../lib/map-routing.mjs';
test('all theme phases remain readable; skin changes preserve retained identity allocations',()=>{
 const map={root:'core',children:new Map([['core',['a','b']],['a',['a1']]])},saved=assignLoopingNodeSpectrum(map),before=structuredClone(saved);
 for(const raw of BUILTIN_THEMES){const theme=normalizeTheme(raw);for(let i=0;i<=360;i++){const color=themeColor(i/360,theme);assert.match(color,/^#[0-9a-f]{6}$/);assert.ok(contrast(color,theme.colors.canvas)>=3.2-1e-6,`${theme.name} phase ${i}`);}assert.ok(contrast(theme.colors.ink,theme.colors.surface)>=7);assert.ok(contrast(theme.colors.muted,theme.colors.surface)>=4.5);}
 assert.deepEqual(saved,before);assert.deepEqual(assignLoopingNodeSpectrum({...map,children:new Map([...map.children,['b',['new']]])},saved).a,saved.a);
});
test('portable custom definitions roundtrip; unsupported input cannot become executable CSS or unbounded data',()=>{
 const t=normalizeTheme({...BUILTIN_THEMES[2],id:'my-theme',name:'My silver',background:'silver',wire:{colors:['#000000','#a25783'],width:2.8,emphasis:1.5,curvature:'taut'},atmosphereStrength:.3,weight:650,icons:'outlined'},{custom:true});
 assert.deepEqual(parseThemeFile(JSON.stringify(t)),t);assert.equal(t.id,'custom-my-theme');assert.equal(t.background,'silver');assert.equal(themeVariables(t)['--theme-weight'],'650');
 const dirty=normalizeTheme({...t,colors:{canvas:'url(https://untrusted)',surface:'#ffffff',ink:'#ffffff'},motion:'loop-forever',background:'url(x)',wire:{colors:Array(100).fill('#ffffff'),width:Infinity,opacity:0}});
 assert.equal(dirty.colors.canvas,'#f8f9fc');assert.ok(contrast(dirty.colors.ink,dirty.colors.surface)>=7);assert.ok(dirty.wire.colors.length<=8);assert.ok(dirty.wire.width<=4);assert.ok(dirty.wire.opacity>=.75);assert.equal(dirty.motion,'silk');assert.ok(!JSON.stringify(themeVariables(dirty)).includes('url('));
 assert.throws(()=>parseThemeFile('{'));assert.throws(()=>parseThemeFile(JSON.stringify({...t,version:2})));assert.throws(()=>parseThemeFile(' '.repeat(64001)));
});
test('artwork follows theme lighting and text while legacy export callers remain compatible',()=>{
 const common={bounds:{x:0,y:0,width:500,height:400},nodesMarkup:'',title:'Map',layout:'Orbit',count:200};
 for(const theme of BUILTIN_THEMES){const artwork=mapImageSvg({...common,appearance:theme});assert.equal(artwork.background,theme.colors.canvas);assert.ok(artwork.svg.includes(theme.colors.ink));assert.ok(artwork.svg.includes(theme.background==='contour'?'data-theme-edge-contours':'theme-light-a'));}
 const minimal={...BUILTIN_THEMES[2],background:'plain'};assert.equal(themeAtmosphereSvg(minimal),'');assert.ok(!mapImageSvg({...common,appearance:minimal}).svg.includes('theme-light-a'));
 assert.equal(mapImageSvg({...common,theme:'light'}).background,'#f5f5f7');
});
test('theme curve variations check actual bezier geometry against node obstacles',()=>{
 const start={x:0,y:0},end={x:400,y:300},obstacles=[{x:100,y:50,width:50,height:80}];
 assert.equal(wireHitsNode(start,end,obstacles,{tension:.5}),true);
 assert.equal(wireHitsNode(start,end,[],{tension:.68}),false);
 assert.equal(wireHitsNode(start,end,obstacles,{tension:.28}),true);
});

test('same-phase links retain visible gradients, endpoints and independent custom color flow',()=>{
 for(const raw of BUILTIN_THEMES){const t=normalizeTheme(raw);for(const phase of [0,.08,.25,.5,.9]){const c=themeColor(phase,t),stops=themeWireStops(phase,phase,t);assert.equal(stops.length,t.wire.finish==='chrome'?5:t.wire.finish==='tonal'?2:4);assert.equal(stops[0].color,c);assert.equal(stops.at(-1).color,c);if(t.wire.finish!=='tonal')assert.ok(new Set(stops.map(s=>s.color)).size>1,t.name);if(t.wire.finish!=='chrome')for(const s of stops)assert.ok(contrast(s.color,t.colors.canvas)>=(t.id==='sunburst'&&s.offset>0&&s.offset<1?1.5:3.2)-1e-6);}}
 const t=normalizeTheme({...BUILTIN_THEMES[3],wire:{...BUILTIN_THEMES[3].wire,gradientSpan:.3}},{custom:true});assert.equal(parseThemeFile(JSON.stringify(t)).wire.gradientSpan,.3);assert.deepEqual(themeWireStops(.1,.2,t),themeWireStops(.1,.2,t));
});

test('chrome sharing retains broad silver reflection and readable soft-steel contour',()=>{
 const t=normalizeTheme({...BUILTIN_THEMES.find(t=>t.id==='apple'),material:'chrome',wire:{...BUILTIN_THEMES.find(t=>t.id==='apple').wire,finish:'chrome'}},{custom:true});assert.equal(t.material,'chrome');assert.equal(t.wire.finish,'chrome');assert.deepEqual(parseThemeFile(JSON.stringify(t)),t);const stops=themeWireStops(.2,.2,t);assert.ok(new Set(stops.map(s=>s.color)).size>=3);assert.ok(contrast(stops[1].color,stops[2].color)>2);for(let i=1;i<stops.length;i++)assert.ok(stops[i].offset-stops[i-1].offset>=.2);const edge=themeWireContour(t);assert.ok(contrast(edge,t.colors.canvas)>=3.2);assert.ok(parseInt(edge.slice(1,3),16)>=95);assert.equal(themeSurfaceStops(t).length,5);
 const other=normalizeTheme({...t,material:'unknown',wire:{...t.wire,finish:'unknown'}});assert.equal(other.material,'porcelain');assert.equal(other.wire.finish,'silk');
});

test('Sunburst has vivid red, orange and golden line interiors while retaining node endpoints',()=>{
 const t=normalizeTheme(BUILTIN_THEMES.find(t=>t.id==='sunburst'));
 assert.deepEqual(t.wire.colors,['#d3261c','#eb570b','#e8ac00']);
 const interiors=[];
 for(let i=0;i<=100;i++){
  const phase=i/100,c=themeColor(phase,t),stops=themeWireStops(phase,phase,t);
  assert.equal(stops[0].color,c);assert.equal(stops.at(-1).color,c);
  assert.ok(contrast(c,t.colors.canvas)>=3.2);
  interiors.push(...stops.slice(1,-1).map(s=>s.color));
 }
 const channels=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
 assert.ok(interiors.some(c=>{const [r,g,b]=channels(c);return r>=200&&g<65&&b<40;}),'rich red remains visible');
 assert.ok(interiors.some(c=>{const [r,g,b]=channels(c);return r>=220&&g>=150&&b<20;}),'golden yellow remains visible');
 assert.ok(interiors.some(c=>{const [r,g,b]=channels(c);return r>=220&&g>=75&&g<140&&b<35;}),'fiery orange transition remains visible');
 const overrides=themeWireStops(.2,.4,t,{sourceColor:'#795638',targetColor:'#ad2017'});
 assert.equal(overrides[0].color,'#795638');assert.equal(overrides.at(-1).color,'#ad2017');
 assert.equal(t.wire.opacity,1);assert.equal(t.wire.width,2.6);assert.equal(t.wire.gradientSpan,.4);
});
