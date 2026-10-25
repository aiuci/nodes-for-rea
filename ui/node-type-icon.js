// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {wireNodeTooltip} from './node-tooltip.js';
import {nodeStatusMarker} from './node-status.js';
// One icon per existing type; all paths use the same quiet 18px stroke language.
export const NODE_TYPES={
  root:{name:'Root',path:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',center:true},
  feature:{name:'Feature',path:'m12 3 9 9-9 9-9-9Z'},
  result:{name:'Result',path:'M5 3h10l4 4v14H5ZM15 3v5h4M8 12h8M8 16h6'},
  finding:{name:'Finding',path:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6M7 10l2 2 4-4'},
  direction:{name:'Direction',path:'M5 19 19 5M7 5h12v12'},
  constraint:{name:'Constraint',path:'M12 3 2 21h20ZM12 9v5M12 17v.5'},
  discovery:{name:'Discovery',path:'M3 7h6v6H3ZM15 7h6v6h-6ZM9 17h6v5H9ZM6 13v4h12v-4M12 3v4M6 7h12'},
  source:{name:'Source',path:'M3 6h7l2 3h9v12H3ZM3 9V4h7l2 2h7v3'},
  attempt:{name:'Attempt',path:'M4 10a8 8 0 1 1 2 8M4 4v6h6M12 7v5l3 2'}
};

const meanings={root:'The investigation’s starting point and overall subject.',feature:'A discovered capability or an explicitly inferred/proposed candidate; hover or focus its symbol for status.',result:'A saved investigation response, its symbol discloses the saved outcome.',finding:'An individual finding, limitation or open question; hover or focus its symbol for evidence status.',direction:'A recorded possible next investigation; its symbol discloses current or earlier advice.',constraint:'An evidence boundary or verification rule, rather than a runnable step.',discovery:'A saved feature-discovery pass or feature-map update.',source:'An application, site or other target being inspected.',attempt:'An inspection attempt without a saved result; its symbol discloses running, stopped or failure status.'};

export function installNodeKey(){
  if(document.getElementById('node-key-open'))return;
  const menu=document.getElementById('settings-items');if(!menu)return;
  const entry=document.createElement('button');entry.id='node-key-open';entry.type='button';entry.textContent='Node key';entry.setAttribute('aria-haspopup','dialog');menu.append(entry);
  const headerKey=document.createElement('div');headerKey.id='header-node-key';headerKey.setAttribute('role','group');headerKey.setAttribute('aria-label','Node types');
  for(const type of Object.keys(NODE_TYPES)){const icon=nodeTypeIcon(type,()=>meanings[type]);icon.classList.add('header-node-type');headerKey.append(icon);}
  const compact=document.createElement('button');compact.type='button';compact.className='header-node-key-compact';compact.textContent='Key';compact.setAttribute('aria-label','Node key');compact.setAttribute('aria-haspopup','dialog');wireNodeTooltip(compact,()=> 'Node key\nSee the nine node symbols and their meanings.','type');headerKey.append(compact);
  // The complete Node key stays available in Settings.
  headerKey.hidden=true;document.getElementById('coverage-open')?.before(headerKey);
  entry.onclick=event=>{
    const returnTo=event.currentTarget===entry?document.querySelector('#node-settings>summary'):compact;
    const dialog=document.createElement('dialog');dialog.className='workspace-dialog node-key-dialog';dialog.setAttribute('aria-labelledby','node-key-title');
    const close=document.createElement('button');close.type='button';close.className='dialog-close';close.textContent='Close';close.setAttribute('aria-label','Close node key');close.onclick=()=>dialog.close();
    const heading=document.createElement('h2');heading.id='node-key-title';heading.textContent='Node key';const note=document.createElement('p');note.textContent='Findings show Observed (inspected evidence), Inferred (interpretation), or Unknown (not established, not absent). Inspect the source details to distinguish static code from runtime observation. Symbol color follows the node’s outline. Hover or focus a symbol for its exact status. Small ! and ? markers flag limitations and uncertainty.';
    const table=document.createElement('table');
    for(const [type,spec]of Object.entries(NODE_TYPES)){
      const row=document.createElement('tr'),symbol=document.createElement('td'),name=document.createElement('th'),meaning=document.createElement('td');
      symbol.className='node-key-symbol';symbol.setAttribute('aria-hidden','true');symbol.append(nodeTypeIcon(type).querySelector('svg'));name.scope='row';name.textContent=spec.name;meaning.textContent=meanings[type];row.append(symbol,name,meaning);table.append(row);
    }
    dialog.append(close,heading,note,table);document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();returnTo?.focus();});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});dialog.showModal();
  };
  compact.onclick=event=>entry.onclick(event);
}

export function nodeTypeIcon(type,statusText=()=>'',status=''){
  const spec=NODE_TYPES[type]||{name:'Inventory',path:'M4 5h16M4 12h16M4 19h16'};
  const button=document.createElement('button');button.type='button';button.className='node-type-icon node-symbol';button.dataset.nodeType=type;
  button.setAttribute('aria-label',`${spec.name} node`);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',spec.path);svg.append(path);
  if(spec.center){const dot=document.createElementNS(svg.namespaceURI,'circle');dot.setAttribute('cx','12');dot.setAttribute('cy','12');dot.setAttribute('r','3');dot.setAttribute('fill','currentColor');svg.append(dot);}
  button.append(svg);
  const marker=nodeStatusMarker(status);
  if(marker){const mark=document.createElement('span');mark.className=`node-state-marker ${marker.tone}`;mark.textContent=marker.symbol;mark.setAttribute('aria-hidden','true');button.append(mark);button.dataset.statusTone=marker.tone;}
  const describe=()=>{const text=statusText();if(text)button.setAttribute('aria-description',text);return [spec.name,text].filter(Boolean).join('\n');};
  describe();wireNodeTooltip(button,describe,'type');
  button.onclick=event=>{event.stopPropagation();};
  return button;
}
