// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {renderUserError,clearUserError} from './user-feedback.js';
import {themeSurfaceStops} from '../lib/theme-system.mjs';
import {xml,mapImageSvg,imageDimensions} from '../lib/map-image-export.mjs';
const $=id=>document.getElementById(id);
const properties=['fill','fill-opacity','stroke','stroke-width','stroke-opacity','stroke-dasharray','stroke-linecap','stroke-linejoin','stop-color','stop-opacity','opacity','font-size','font-family','font-weight'];
function vectorLayer(source,cameraScale=1){
  if(!source||source.hidden||getComputedStyle(source).display==='none')return '';
  const clone=source.cloneNode(true),originals=[source,...source.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
  originals.forEach((n,i)=>{const copy=copies[i],style=getComputedStyle(n);copy.removeAttribute('style');copy.removeAttribute('class');copy.removeAttribute('aria-hidden');for(const property of properties){const value=style.getPropertyValue(property).replace(/url\(["']?[^#)]*#([^"')]+)["']?\)/g,'url(#$1)');if(value){let resolved=value;if(source.id==='map-wires'&&(n.classList.contains('map-wire')||n.classList.contains('map-wire-contour'))&&['stroke-width','stroke-dasharray'].includes(property)&&value!=='none')resolved=value.replace(/[0-9]+(?:\.[0-9]+)?/g,n=>String(Math.round(Number(n)*cameraScale*1e4)/1e4));if(source.id==='map-wires'&&(n.classList.contains('map-wire')||n.classList.contains('map-wire-contour'))&&property==='stroke-width'){const dotted=source.dataset.dots==='true'&&!n.classList.contains('comparison-wire'),base=parseFloat(style.getPropertyValue(dotted?'--map-wire-export-dots':'--map-wire-export-width')||style.getPropertyValue(dotted?'--theme-wire-dots':'--theme-wire-width')),emphasis=!dotted&&n.classList.contains('orbit-related')?parseFloat(style.getPropertyValue('--map-wire-export-emphasis')||style.getPropertyValue('--theme-emphasis'))||1:1;resolved=String(Math.round((base*emphasis+(n.classList.contains('map-wire-contour')?1:0))*1e4)/1e4)+'px';}copy.setAttribute(property,resolved);}}if(n.hasAttribute('data-orbit-depth'))copy.setAttribute('stroke-width',String(parseFloat(style.getPropertyValue('--orbit-guide-ring-width'))||1.4));if(n.hasAttribute('data-orbit-core'))copy.setAttribute('stroke-width',String(parseFloat(style.getPropertyValue('--orbit-guide-core-width'))||1.2));});
  // Layer coordinates are map coordinates, independent of viewport dimensions.
  return new XMLSerializer().serializeToString(clone).replace(/^<svg\b[^>]*>/,'<g>').replace(/<\/svg>$/,'</g>');
}
export function captureMapImage(view,credit){
  if(view.legacyMode||!view.points.size)throw Error('Open a visual map to export it.');
  const theme=document.documentElement.dataset.theme==='light'?'light':'dark',light=theme==='light',appearance=window.NodesTheme?.current;
  const context=document.createElement('canvas').getContext('2d'),measure=(text,size,weight=400)=>{context.font=`${weight} ${size}px "Segoe UI", Arial, sans-serif`;return context.measureText(String(text)).width;};
  const shorten=(text,size,width,weight=400)=>{text=String(text);if(measure(text,size,weight)<=width)return text;while(text.length&&measure(text+'…',size,weight)>width)text=text.slice(0,-1);return text+'…';};
  const rects=[...view.points.values()].map(p=>({...p}));
  for(const id of ['map-arrangement-guides','map-wires']){const layer=$(id);if(layer&&!layer.hidden&&getComputedStyle(layer).display!=='none'){const b=layer.getBBox();if(b.width&&b.height)rects.push({x:b.x,y:b.y,width:b.width,height:b.height});}}
  const x=Math.min(...rects.map(p=>p.x)),y=Math.min(...rects.map(p=>p.y)),right=Math.max(...rects.map(p=>p.x+p.width)),bottom=Math.max(...rects.map(p=>p.y+p.height));
  const chrome=appearance?.material==='chrome'?`<defs><linearGradient id="theme-node-chrome" x1="0" y1="0" x2=".27" y2="1">${themeSurfaceStops(appearance).map(s=>`<stop offset="${s.offset}" stop-color="${s.color}"/>`).join('')}</linearGradient></defs>`:'';
  const nodesMarkup=chrome+[...view.points].map(([id,p])=>{
    const item=view.map.nodes.get(id),card=[...$('map-nodes').children].find(n=>n.dataset.nodeId===id);if(!item||!card)return '';
    const style=getComputedStyle(card),root=item.type==='root',color=view.color(id),label=card.querySelector('.node-label small')?.textContent||'',title=item.title;
    const fill=appearance?.material==='chrome'?'url(#theme-node-chrome)':appearance?style.backgroundColor:light?style.backgroundColor:root?'#e5ebf4':style.backgroundColor==='rgba(0, 0, 0, 0)'?'#101923':style.backgroundColor,text=appearance?.colors.ink||(light?'#1d1d1f':root?'#182635':'#c5d3e5'),muted=appearance?.colors.muted||(light?'#686d76':root?'#54677c':'#9fadc0'),radius=root?p.height/2:parseFloat(style.borderTopLeftRadius)||17;
    const symbol=({root:'◉',source:'⌁',discovery:'◉',feature:'◇',result:'▤',finding:'▤',direction:'↗'})[item.type]||'◇',fold=card.querySelector('.node-fold'),count=fold?.querySelector('small')?.textContent,badge=count?`<g><title>${xml(fold.title||fold.getAttribute('aria-label'))}</title><rect x="${p.x+p.width-38}" y="${p.y+p.height/2-13}" width="29" height="26" rx="8" fill="${appearance?.colors.canvas||(light?'#edf0f5':root?'#c8d4e3':'#1b2b3a')}"/><text x="${p.x+p.width-23}" y="${p.y+p.height/2+4}" text-anchor="middle" fill="${muted}" font-size="9">${xml((view.ws.collapsed.includes(id)?'›':'⌄')+count)}</text></g>`:'',textWidth=p.width-57-(count?34:0);
    return `<g data-node-id="${xml(id)}"><title>${xml(title)}</title><rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="${radius}" fill="${xml(fill)}" stroke="${xml(appearance?style.borderTopColor:light?style.borderTopColor:root?'#aebbc9':style.borderTopColor||color)}" stroke-width="${root?2:1.2}"${item.type==='direction'?' stroke-dasharray="3 3"':''}/><text x="${p.x+14}" y="${p.y+p.height/2+6}" fill="${xml(appearance||light?getComputedStyle(card.querySelector('.node-symbol')||card).color:root?'#52677d':color)}" font-size="23">${symbol}</text><text x="${p.x+45}" y="${p.y+p.height/2-3}" fill="${text}" font-size="13" font-weight="${root?650:500}">${xml(shorten(title,13,textWidth,root?650:500))}</text><text x="${p.x+45}" y="${p.y+p.height/2+15}" fill="${muted}" font-size="10">${xml(shorten(label,10,textWidth))}</text>${badge}</g>`;
  }).join('');
  const layout=$('map-layout').querySelector('[aria-pressed="true"]')?.textContent.trim()||view.ws.layout;
  return mapImageSvg({bounds:{x,y,width:right-x,height:bottom-y},nodesMarkup,guidesMarkup:vectorLayer($('map-arrangement-guides')),wiresMarkup:view.ws.wiresVisible===false?'':vectorLayer($('map-wires'),view.camera.scale),title:view.subject(),layout,count:view.points.size,credit,measure,theme,appearance});
}
export async function rasterMapImage(snapshot,longEdge){
  const dimensions=imageDimensions(snapshot.width,snapshot.height,longEdge),canvas=document.createElement('canvas');canvas.width=dimensions.width;canvas.height=dimensions.height;
  const svg=snapshot.svg.replace(/width="[^"]+" height="[^"]+"/,`width="${dimensions.width}" height="${dimensions.height}"`);
  try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Could not render the map image.'));image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});const context=canvas.getContext('2d');if(!context)throw Error('This image is too large to render. Choose a smaller PNG size or SVG.');context.fillStyle=snapshot.background||'#0c141a';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not encode this PNG. Choose a smaller size or SVG.');return {data:new Uint8Array(await blob.arrayBuffer()),...dimensions};}finally{canvas.width=canvas.height=1;}
}
export function installMapImageExport(view){
  const entry=document.createElement('button');entry.type='button';entry.id='export-map-image';entry.textContent='Export map as SVG or PNG…';$('file-export-items').append(entry);
  entry.onclick=async()=>{
    if(view.legacyMode||!view.points.size){view.actions.notify('Open a visual map to export it.');return;}
    const dialog=document.createElement('dialog');dialog.className='workspace-dialog map-image-dialog';dialog.setAttribute('aria-labelledby','map-image-title');
    dialog.innerHTML='<h2 id="map-image-title">Export map image</h2><p>Export the whole visible arrangement, including nodes outside the screen. Folded and hidden branches stay as shown.</p><label>Format<select id="map-image-format"><option value="svg">SVG · vector, any size</option><option value="png">PNG · high resolution</option></select></label><label id="map-image-size-row" hidden>PNG long edge<select id="map-image-size"><option value="4096">4,096 pixels</option><option value="8192" selected>8,192 pixels</option><option value="16384">16,384 pixels</option></select></label><label>Credit line<input id="map-image-credit" maxlength="180" value="Jeremy Opio - Gorgeous.systems" /></label><p class="map-image-watermark">Watermark: Nodes for REA</p><p id="map-image-dimensions" role="status"></p><div class="map-image-buttons"><button id="map-image-save" class="primary">Save image…</button><button id="map-image-cancel">Cancel</button></div>';
    document.body.append(dialog);let snapshot,working=false;
    const refresh=()=>{try{snapshot=captureMapImage(view,$('map-image-credit').value);const png=$('map-image-format').value==='png';$('map-image-size-row').hidden=!png;clearUserError($('map-image-dimensions'));const d=png?imageDimensions(snapshot.width,snapshot.height,Number($('map-image-size').value)):snapshot;$('map-image-dimensions').textContent=png?`${d.width.toLocaleString()} × ${d.height.toLocaleString()} pixels · bounded to 64 megapixels`:'Scalable vector artwork with editable text and full-title tooltips.';}catch(error){renderUserError($('map-image-dimensions'),error,{context:'export',action:{label:/ENOSPC|EACCES|EPERM/.test(error.message)?'Choose another destination':'Choose SVG export',run:()=>{if(/ENOSPC|EACCES|EPERM/.test(error.message))$('map-image-save').click();else{$('map-image-format').value='svg';refresh();}}}});snapshot=null;}};
    for(const id of ['map-image-format','map-image-size','map-image-credit'])$(id).oninput=refresh;
    $('map-image-cancel').onclick=()=>dialog.close();dialog.addEventListener('cancel',event=>{if(working)event.preventDefault();});dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    $('map-image-save').onclick=async()=>{
      refresh();if(!snapshot||working)return;working=true;
      const exportId=view.state.id,title=view.subject(),format=$('map-image-format').value,longEdge=Number($('map-image-size').value),controls=[...dialog.querySelectorAll('input,select,button')],saveButton=$('map-image-save');
      controls.forEach(n=>n.disabled=true);saveButton.textContent=format==='png'?'Rendering PNG…':'Preparing SVG…';
      try{
        await document.fonts.ready;const data=format==='svg'?snapshot.svg:(await rasterMapImage(snapshot,longEdge)).data;
        const file=await window.investigation.exportMapImage(exportId,{format,title,data});
        if(file){view.actions.notify(`Saved ${format.toUpperCase()} map image.`);dialog.close();}
      }catch(error){renderUserError($('map-image-dimensions'),error,{context:'export',action:{label:/ENOSPC|EACCES|EPERM/.test(error.message)?'Choose another destination':'Choose SVG export',run:()=>{if(/ENOSPC|EACCES|EPERM/.test(error.message))$('map-image-save').click();else{$('map-image-format').value='svg';refresh();}}}});}
      finally{working=false;controls.forEach(n=>n.disabled=false);saveButton.textContent='Save image…';}
    };
    refresh();dialog.showModal();
  };
}
