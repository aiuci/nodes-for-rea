// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {wireNodeTooltip,hideNodeTooltip} from './node-tooltip.js';
import {renderUserError} from './user-feedback.js';
const api=window.investigation,footer=document.createElement('footer');footer.id='product-footer';footer.setAttribute('aria-label','Support and websites');
const icon=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
const coffee=document.createElement('button');coffee.type='button';coffee.id='footer-coffee';coffee.setAttribute('aria-label','Buy me a cup of coffee');coffee.innerHTML=icon('M4 8h12v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8ZM16 9h2a3 3 0 0 1 0 6h-2M3 22h16M7 5V2M11 5V2');
const tree=document.createElement('button');tree.type='button';tree.id='footer-sites';tree.setAttribute('aria-label','Explore our sites');tree.setAttribute('aria-haspopup','menu');tree.setAttribute('aria-expanded','false');tree.innerHTML=icon('m12 3-6 7h4l-6 7h6v4h4v-4h6l-6-7h4Z');
const menu=document.createElement('div');menu.id='footer-sites-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','Our sites');menu.hidden=true;tree.setAttribute('aria-controls',menu.id);
const status=document.createElement('p');status.id='footer-link-status';status.setAttribute('role','status');status.hidden=true;
const close=(restore=false)=>{menu.hidden=true;tree.setAttribute('aria-expanded','false');hideNodeTooltip();if(restore)tree.focus({preventScroll:true});};
const openLink=async key=>{close(key!=='coffee');status.hidden=true;try{await api.openProductLink(key);}catch(error){renderUserError(status,error,{category:'connection',title:'This link could not open',message:'Try again, or open the website in your browser.',action:{label:'Try again',run:()=>openLink(key)}});status.hidden=false;}};
for(const [key,label]of [['coolnew','CoolNew.tech'],['gorgeous','Gorgeous.systems'],['aiuci','Aiuci.com']]){
 const item=document.createElement('button');item.type='button';item.setAttribute('role','menuitem');item.textContent=label;item.dataset.productLink=key;item.onclick=()=>openLink(key);menu.append(item);
}
const show=(last=false)=>{hideNodeTooltip();status.hidden=true;menu.hidden=false;tree.setAttribute('aria-expanded','true');[...menu.children].at(last?-1:0).focus();};
coffee.onclick=()=>openLink('coffee');tree.onclick=()=>menu.hidden?show():close();
tree.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();event.stopPropagation();show(event.key==='ArrowUp');}};
menu.onkeydown=event=>{const items=[...menu.children],at=items.indexOf(document.activeElement);let next;if(event.key==='ArrowDown')next=(at+1)%items.length;else if(event.key==='ArrowUp')next=(at-1+items.length)%items.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=items.length-1;else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}else if(event.key==='Tab'){close();return;}else return;event.preventDefault();event.stopPropagation();items[next].focus();};
document.addEventListener('pointerdown',event=>{if(!footer.contains(event.target)){close();status.hidden=true;}});
document.addEventListener('focusin',event=>{if(!footer.contains(event.target))close();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){event.preventDefault();event.stopPropagation();close(true);}});
window.addEventListener('resize',()=>close());
wireNodeTooltip(coffee,()=>'Buy me a cup of coffee','command');wireNodeTooltip(tree,()=>'Explore our sites','command');
footer.append(coffee,tree,menu,status);document.body.append(footer);
