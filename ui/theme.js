// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {renderUserError,clearUserError} from './user-feedback.js';
import {installBottomToolbars,syncBottomToolbars} from './bottom-toolbars.js';
import {applyBrand} from './brand.js';
import {installOrbitalTheme} from './orbital-theme.js';
import {BUILTIN_THEMES,DEFAULT_THEME_ID,normalizeTheme,themeVariables,parseThemeFile,themeSurfaceStops,themeSwatchBackground} from '../lib/theme-system.mjs';
const key='nodes-for-rea.theme-state.v1',legacyKey='nodes-for-rea.appearance';
const read=k=>{try{return localStorage.getItem(k);}catch{return null;}};
const parse=()=>{try{return JSON.parse(read(key))||{};}catch{return {};}};
const old=read(legacyKey),saved=parse();
let customs=[];
for(const raw of Array.isArray(saved.customs)?saved.customs.slice(0,24):[]){try{const t=normalizeTheme(raw,{custom:true});if(!customs.some(c=>c.id===t.id))customs.push(t);}catch{/* Ignore an invalid local preset, keep the others. */}}
let selected=saved.selected||(old==='light'?DEFAULT_THEME_ID:old)||DEFAULT_THEME_ID,quickVisible=saved.floatingBarsVersion===1?saved.quickVisible!==false:true;
const presetOrder=['dark','apple','reference','sunburst','opal','riviera','aurora','orbital','velvet'];
const all=()=>[...presetOrder.map(id=>BUILTIN_THEMES.find(t=>t.id===id)),...customs];
const find=id=>all().find(t=>t.id===id)||BUILTIN_THEMES.find(t=>t.id===DEFAULT_THEME_ID);
selected=find(selected).id;
let current=normalizeTheme(find(selected));
const api={get current(){return current;}};window.NodesTheme=api;
let persistenceNotice;
const persist=()=>{try{localStorage.setItem(key,JSON.stringify({version:1,floatingBarsVersion:1,selected,quickVisible,customs}));if(persistenceNotice?.isConnected){clearUserError(persistenceNotice,'Theme preference saved.');persistenceNotice=null;}return true;}catch(error){persistenceNotice=document.getElementById('workspace-notice');if(persistenceNotice)renderUserError(persistenceNotice,error,{context:'save',title:'This theme is active for this session only',message:'The theme preference could not be saved on this device. Your saved investigations are unchanged.',action:{label:'Try saving theme preference',run:()=>{if(persist())applyBrand(find(selected),{syncDesktop:true});}}});announce('Theme is active for this session. Local storage is unavailable.');return false;}};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function apply(theme,{notify=true,syncDesktop=false}={}){
 current=normalizeTheme(theme);const root=document.documentElement;
 root.dataset.themeEffects=current.effects||'none';root.dataset.theme=current.mode;root.dataset.appearance=current.id;root.dataset.atmosphere=current.background;root.dataset.motion=current.motion;root.dataset.texture=current.texture;root.dataset.elevation=current.elevation;root.dataset.material=current.material;root.dataset.wireFinish=current.wire.finish;
 for(const [k,v]of Object.entries(themeVariables(current)))root.style.setProperty(k,v);
 applyBrand(current,{syncDesktop});
 root.style.setProperty('--theme-chrome-finish',`linear-gradient(165deg,${themeSurfaceStops(current).map(s=>`${s.color} ${s.offset*100}%`).join(',')})`);
 for(const button of document.querySelectorAll('[data-appearance]'))button.setAttribute('aria-pressed',String(button.dataset.appearance===current.id));
 for(const n of document.querySelectorAll('.theme-current-name'))n.textContent=current.name;if(palette){palette.replaceChildren(orb(current));palette.title=`Theme: ${current.name}`;palette.setAttribute('aria-label',`Theme: ${current.name}`);}
 if(notify)document.dispatchEvent(new Event('nodes-appearance-change'));
}
let status,strip,palette,manager,editor,returnFocus,themeFlyout;
apply(current,{notify:false,syncDesktop:true});
function announce(text){if(status)status.textContent=text;}
function choose(id){selected=find(id).id;const syncDesktop=persist();apply(find(id),{syncDesktop});announce(`${current.name} theme`);}
function orb(theme){const n=el('span',undefined,'theme-orb');n.setAttribute('aria-hidden','true');n.style.background=themeSwatchBackground(theme);return n;}
function swatch(theme,label=false){const b=el('button',undefined,'theme-swatch');b.type='button';b.dataset.appearance=theme.id;b.title=theme.name;b.setAttribute('aria-label',theme.name);b.setAttribute('aria-pressed',String(current.id===theme.id));b.append(orb(theme));if(label)b.append(el('span',theme.name));b.onclick=()=>{choose(theme.id);};return b;}
function expandStrip(value,{focus=false}={}){if(strip)strip.hidden=false;}
function showStrip(value){quickVisible=value;const toggle=document.getElementById('theme-strip-toggle');if(toggle)toggle.checked=value;persist();if(manager.open)expandStrip(false);else expandStrip(value,{focus:true});}

function rebuild(){
 const items=strip.querySelector('.theme-strip-items');items.replaceChildren(...all().map(t=>swatch(t)));
 const list=manager.querySelector('.theme-library');list.replaceChildren(...all().map(t=>swatch(t,true)));
 manager.querySelector('#theme-strip-toggle').checked=quickVisible;
}
function openManager(){returnFocus=document.activeElement;rebuild();if(!manager.open)manager.showModal();}
function field(label,input){const row=el('label',undefined,'theme-field');row.append(el('span',label),input);return row;}
function selectControl(id,options,value){const s=el('select');s.id=id;for(const [value,label]of options){const o=el('option',label);o.value=value;s.append(o);}s.value=value;return s;}
function numberControl(id,value,min,max,step=1){const n=el('input');n.id=id;n.type='range';Object.assign(n,{min,max,step,value});return n;}
function colorControl(id,value){const n=el('input');n.id=id;n.type='color';n.value=value;return n;}
function exportTheme(){const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=current.name.replace(/[^a-z0-9 -]/gi,'').trim()+'.nodes-theme.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('Theme exported.');}
function editTheme({duplicate=false}={}){
 const original=find(selected),editing=original.id.startsWith('custom-')&&!duplicate;
 let draft=structuredClone(current);draft.id=editing?original.id:`custom-${crypto.randomUUID()}`;draft.name=editing?original.name:`${original.name} · My theme`;
 if(manager.open)manager.close();
 editor=el('dialog',undefined,'workspace-dialog theme-editor');editor.setAttribute('aria-labelledby','theme-editor-title');
 const heading=el('div',undefined,'theme-dialog-heading'),title=el('h2',editing?'Edit theme':'Create a theme');title.id='theme-editor-title';const cancel=el('button','Cancel');cancel.type='button';heading.append(title,cancel);editor.append(heading,el('p','Preview the whole workspace as you adjust. Save keeps this theme on this device.'));
 const form=el('form'),name=el('input');name.id='theme-name';name.maxLength=48;name.required=true;name.value=draft.name;form.append(field('Theme name',name));
 const grid=el('div',undefined,'theme-editor-grid');
 const mode=selectControl('theme-mode',[['light','Light'],['dark','Dark']],draft.mode),background=selectControl('theme-background',[['pearl','Pearl illumination'],['silver','Silver ribbons'],['contour','Edge contours'],['wash','Color wash'],['night','Deep illumination'],['velvet','Velvet depth'],['plain','Minimal · no decoration']],draft.background);
 grid.append(field('Light / dark',mode),field('Atmosphere',background));
 const strength=numberControl('theme-atmosphere-strength',draft.atmosphereStrength??.65,0,1,.05);grid.append(field('Atmosphere intensity',strength));
 const angle=numberControl('theme-gradient-angle',draft.gradientAngle??125,0,360),texture=selectControl('theme-texture',[['none','None'],['grain','Fine grain'],['grid','Architectural grid']],draft.texture||'none');grid.append(field('Gradient angle',angle),field('Subtle texture',texture));
 const font=selectControl('theme-font',[['system','System'],['rounded','Soft system']],draft.font);grid.append(field('Typography',font));form.append(grid);
 const colorGrid=el('div',undefined,'theme-color-grid');
 for(const [key,label]of [['canvas','Canvas'],['surface','Surfaces'],['ink','Text'],['muted','Secondary text'],['accent','Controls'],['line','Borders'],['lightA','Light one'],['lightB','Light two'],['lightC','Light three']])colorGrid.append(field(label,colorControl(`theme-color-${key}`,draft.colors[key])));
 form.append(el('h3','Materials & light'),colorGrid);
 const surfaces=el('div',undefined,'theme-editor-grid'),elevation=selectControl('theme-elevation',[['crisp','Crisp'],['soft','Soft porcelain'],['float','Floating']],draft.elevation),radius=numberControl('theme-radius',draft.radius,6,24),weight=numberControl('theme-weight',draft.weight??550,400,700,50),icons=selectControl('theme-icons',[['tonal','Tonal'],['ink','Ink'],['outlined','Outlined']],draft.icons||'tonal');const material=selectControl('theme-material',[['porcelain','Porcelain'],['chrome','Polished chrome']],draft.material||'porcelain');surfaces.append(field('Material',material),field('Surface treatment',elevation),field('Corner softness',radius),field('Label weight',weight),field('Icon treatment',icons));form.append(surfaces);
 form.append(el('h3','Connections'));
 const wires=el('div',undefined,'theme-wire-colors'),wireControls=[];
 function drawWires(){wires.replaceChildren();wireControls.length=0;draft.wire.colors.forEach((color,i)=>{const control=colorControl('theme-wire-color-'+i,color);control.setAttribute('aria-label',`Connection color ${i+1}`);wireControls.push(control);wires.append(control);control.oninput=preview;});}
 const palette=selectControl('theme-wire-palette',[['custom','My color swatches'],['spectrum',"Jeremy’s Spectrum"]],draft.wire.palette==='spectrum'?'spectrum':'custom');
 const add=el('button','Add color'),remove=el('button','Remove color');add.type=remove.type='button';
 add.onclick=()=>{if(draft.wire.colors.length<8){draft.wire.colors=wireControls.map(n=>n.value);draft.wire.colors.push(draft.wire.colors.at(-1));drawWires();preview();}};
 remove.onclick=()=>{if(draft.wire.colors.length>2){draft.wire.colors=wireControls.map(n=>n.value).slice(0,-1);drawWires();preview();}};
 form.append(field('Color progression',palette),wires);const colorActions=el('div',undefined,'theme-inline-actions');colorActions.append(add,remove);form.append(colorActions);
 const connectionGrid=el('div',undefined,'theme-editor-grid'),width=numberControl('theme-wire-width',draft.wire.width,1.5,4,.1),opacity=numberControl('theme-wire-opacity',draft.wire.opacity,.75,1,.01),emphasis=numberControl('theme-emphasis',draft.wire.emphasis??1.35,1,2,.05),curvature=selectControl('theme-curvature',[['flowing','Flowing'],['balanced','Balanced'],['taut','Taut']],draft.wire.curvature||'balanced');
 const colorFlow=numberControl('theme-color-flow',draft.wire.gradientSpan??.16,.02,.4,.01);const finish=selectControl('theme-wire-finish',[['silk','Silk color flow'],['chrome','Chrome reflections'],['tonal','Tonal · simple endpoint blend']],draft.wire.finish||'silk');connectionGrid.append(field('Path finish',finish),field('Color flow',colorFlow),field('Line thickness',width),field('Line opacity',opacity),field('Selected-path emphasis',emphasis),field('Curve character',curvature));form.append(connectionGrid,el('p','Text and connections adjust for contrast. Line width stays readable through zoom. Your saved Lines / Linear / Straight choice remains in control.','theme-editor-note'));
 const motion=selectControl('theme-motion',[['silk','Silk · slow and soft'],['precise','Precise · quick and restrained'],['buoyant','Buoyant · light and lively'],['still','Still · no decorative motion']],draft.motion);form.append(field('Motion',motion));
 const actions=el('div',undefined,'theme-dialog-actions'),save=el('button',editing?'Save theme':'Save new theme','primary');save.id='theme-save';save.type='submit';actions.append(save);form.append(actions);editor.append(form);
 let committed=false;
 function preview(){
  draft.name=name.value.trim()||'My theme';draft.mode=mode.value;draft.background=background.value;draft.atmosphereStrength=Number(strength.value);draft.gradientAngle=Number(angle.value);draft.texture=texture.value;draft.font=font.value;draft.elevation=elevation.value;draft.radius=Number(radius.value);draft.weight=Number(weight.value);draft.icons=icons.value;draft.material=material.value;
  for(const k of Object.keys(draft.colors))draft.colors[k]=form.querySelector('#theme-color-'+k).value;
  draft.wire={...draft.wire,finish:finish.value,palette:palette.value,colors:wireControls.map(n=>n.value),gradientSpan:Number(colorFlow.value),width:Number(width.value),opacity:Number(opacity.value),emphasis:Number(emphasis.value),curvature:curvature.value};draft.motion=motion.value;
  add.disabled=draft.wire.colors.length>=8;remove.disabled=draft.wire.colors.length<=2;wires.hidden=palette.value==='spectrum';colorActions.hidden=palette.value==='spectrum';apply(draft);
 }
 drawWires();form.addEventListener('input',preview);form.addEventListener('change',preview);
 form.onsubmit=event=>{event.preventDefault();if(!editing&&customs.length>=24){announce('You can save up to 24 custom themes. Remove one before adding another.');return;}draft=normalizeTheme(draft,{custom:true});const index=customs.findIndex(t=>t.id===draft.id);if(index<0)customs.push(draft);else customs[index]=draft;selected=draft.id;committed=true;const syncDesktop=persist();apply(draft,{syncDesktop});rebuild();editor.close();announce(`Saved ${draft.name}`);};
 cancel.onclick=()=>editor.close();editor.addEventListener('close',()=>{if(!committed)apply(original);editor.remove();editor=null;document.getElementById('appearance-open').focus();},{once:true});document.body.append(editor);editor.showModal();preview();
}
function install(){
 installOrbitalTheme();
 status=el('span',undefined,'sr-only');status.id='theme-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');document.body.append(status);
 strip=el('div',undefined,'theme-strip');strip.id='theme-strip';strip.hidden=true;strip.setAttribute('role','group');strip.setAttribute('aria-label','Quick themes');const items=el('div',undefined,'theme-strip-items'),name=el('span',current.name,'theme-current-name'),manage=el('button','Themes'),hide=el('button','×');manage.id='theme-manage';manage.type=hide.type='button';manage.onclick=openManager;hide.id='theme-strip-hide';hide.setAttribute('aria-label','Collapse theme picker');hide.title='Collapse theme picker';hide.onclick=()=>{quickVisible=false;persist();expandStrip(false,{focus:true});};strip.append(items,name,manage,hide);
 palette=el('button',undefined,'theme-palette-toggle');palette.id='theme-palette-toggle';palette.type='button';palette.setAttribute('aria-label','Themes');palette.title='Themes';palette.setAttribute('aria-controls','theme-strip');palette.setAttribute('aria-expanded','false');palette.append(orb(current));document.getElementById('main').append(strip,palette);strip.hidden=false;
 installBottomToolbars();
 manager=el('dialog',undefined,'workspace-dialog theme-manager');manager.id='appearance-panel';manager.setAttribute('aria-labelledby','appearance-title');manager.innerHTML='<div class="theme-dialog-heading"><h2 id="appearance-title">Appearance</h2><button id="appearance-close" type="button" aria-label="Close appearance">×</button></div><p>Choose the finish, light, and character of your workspace.</p><div class="theme-library" role="group" aria-label="Workspace appearance"></div><label class="theme-strip-option"><input id="theme-strip-toggle" type="checkbox"> Show floating theme swatches</label><div class="theme-apple-treatment" hidden><label for="apple-treatment">Apple atmosphere</label><select id="apple-treatment"><option value="contour">Apple Flow · subtle edge contours</option><option value="plain">Apple Minimal · no decoration</option></select></div><div class="theme-dialog-actions"><button id="theme-create" type="button" class="primary">Create from current</button><button id="theme-edit" type="button">Edit custom theme</button><button id="theme-duplicate" type="button">Duplicate</button><button id="theme-export" type="button">Export theme</button><button id="theme-import" type="button">Import theme…</button><button id="theme-delete" type="button">Remove custom theme</button></div><input id="theme-import-file" type="file" accept=".json,.nodes-theme.json" hidden><p id="theme-manager-status" role="status"></p>';

 document.body.append(manager);document.getElementById('appearance-open').onclick=openManager;document.getElementById('appearance-close').onclick=()=>manager.close();document.getElementById('theme-strip-toggle').onchange=e=>showStrip(e.target.checked);
 document.getElementById('theme-create').onclick=()=>editTheme({duplicate:true});document.getElementById('theme-duplicate').onclick=()=>editTheme({duplicate:true});document.getElementById('theme-edit').onclick=()=>editTheme();document.getElementById('theme-export').onclick=exportTheme;
 const file=document.getElementById('theme-import-file'),feedback=document.getElementById('theme-manager-status');document.getElementById('theme-import').onclick=()=>file.click();file.onchange=async()=>{try{if(!file.files[0])return;if(customs.length>=24)throw Error('Remove a custom theme before importing another.');const t=parseThemeFile(await file.files[0].text());t.id=`custom-${crypto.randomUUID()}`;customs.push(t);choose(t.id);rebuild();clearUserError(feedback,`Imported ${t.name}`);}catch(error){renderUserError(feedback,error,{context:'theme',action:{label:'Choose another theme file',run:()=>file.click()}});}finally{file.value='';}};
 document.getElementById('theme-delete').onclick=()=>{customs=customs.filter(t=>t.id!==selected);choose('reference');rebuild();};
 document.getElementById('apple-treatment').onchange=e=>{const apple=normalizeTheme(BUILTIN_THEMES.find(t=>t.id==='apple'));apple.background=e.target.value;apple.id=`custom-apple-${e.target.value}-${crypto.randomUUID()}`;apple.name=e.target.value==='plain'?'Apple · Minimal':'Apple · Flow';const index=customs.findIndex(t=>t.id===apple.id);if(index>=0)customs[index]=apple;else if(customs.length<24)customs.push(apple);else{feedback.textContent='Remove a custom theme before saving an Apple variation.';return;}choose(apple.id);rebuild();};
 manager.addEventListener('close',()=>returnFocus?.isConnected&&(returnFocus.getClientRects().length?returnFocus:document.querySelector('#node-settings>summary')).focus());
 document.addEventListener('nodes-appearance-change',()=>{const custom=current.id.startsWith('custom-');document.getElementById('theme-edit').hidden=!custom;document.getElementById('theme-delete').hidden=!custom;manager.querySelector('.theme-apple-treatment').hidden=!(current.id==='apple'||current.id.startsWith('custom-apple-'));document.getElementById('apple-treatment').value=current.background==='plain'?'plain':'contour';});
 rebuild();apply(current,{syncDesktop:true});expandStrip(false);strip.querySelector('.theme-strip-items').addEventListener('keydown',event=>{const buttons=[...items.querySelectorAll('button')],at=buttons.indexOf(document.activeElement);let next;if(event.key==='ArrowRight')next=(at+1)%buttons.length;else if(event.key==='ArrowLeft')next=(at-1+buttons.length)%buttons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else return;event.preventDefault();buttons[next].focus();});
}
let controlsInstalled=false;export function ensureThemeControls(){if(controlsInstalled)return;controlsInstalled=true;install();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensureThemeControls,{once:true});else ensureThemeControls();
addEventListener('storage',event=>{if(event.key!==key||editor?.open)return;const state=parse();customs=[];for(const t of Array.isArray(state.customs)?state.customs.slice(0,24):[]){try{customs.push(normalizeTheme(t,{custom:true}));}catch{}}selected=find(state.selected).id;quickVisible=state.quickVisible!==false;apply(find(selected),{syncDesktop:true});if(strip){rebuild();expandStrip(false);}});
