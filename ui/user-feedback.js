// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
import {errorPresentation,feedbackKinds} from '../lib/user-feedback.mjs';
const paths={pause:'M8 5v14M16 5v14',stop:'M6 6h12v12H6Z',clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2',key:'M14 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10M10 13l-7 7M3 17v3h3',usage:'M4 20V10M10 20V5M16 20v-8M22 20H2',settings:'M4 7h16M4 17h16M8 4v6M16 14v6',connection:'M8 16 5 19a4 4 0 0 1-6-6l3-3M16 8l3-3a4 4 0 0 1 6 6l-3 3M8 16l8-8', 'network-blocked':'M3 3l18 18M4 9a13 13 0 0 1 16 0M7 13a8 8 0 0 1 10 0M10 17h4M12 21h.01',tools:'m14 6 4-4a6 6 0 0 1-7 8L4 21l-3-3L12 7a6 6 0 0 1 8-7l-4 4Z','missing-tool':'M3 6h7l2 3h9v12H3ZM12 12v4M12 18h.01',lock:'M6 10h12v11H6ZM8 10V7a4 4 0 0 1 8 0v3',save:'M4 3h13l4 4v14H3V3ZM7 3v6h9V3M7 21v-8h10v8',document:'M5 3h10l4 4v14H5ZM15 3v5h4M8 12h8M8 16h5','source-check':'M5 3h10l4 4v7M15 3v5h4M5 3v18h6M13 18l3 3 6-7',help:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01',resume:'M8 5v14l12-7Z',check:'m4 12 5 5L20 6'};
export function feedbackIcon(category){
 Object.assign(paths,{microphone:'M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',copy:'M8 8h13v13H8ZM16 8V3H3v13h5',palette:'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4c0-4-5-6-9-6ZM7 8h.01M12 6h.01M17 8h.01M6 13h.01'});
 const key=feedbackKinds[category]?.icon||category,path=paths[key]||paths.help,svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 for(const [k,v]of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:'feedback-icon','data-error-icon':key}))svg.setAttribute(k,v);
 const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',path);svg.append(p);return svg;
}
export function feedbackHeading(title,category,tag='h2'){const heading=document.createElement(tag);heading.className='feedback-heading';heading.append(feedbackIcon(category),document.createTextNode(title));return heading;}
export function feedbackButton(label,action,{primary=false,icon='resume'}={}){const b=document.createElement('button');b.type='button';b.className=primary?'recovery-primary':'recovery-secondary';b.append(feedbackIcon(icon),document.createTextNode(label));b.onclick=action;return b;}
export function clearUserError(container,text=''){container.classList.remove('user-error');delete container.dataset.errorCategory;container.textContent=text;}
export function renderUserError(container,error,{context,actions={},action,title,message,category}={}){
 const info=errorPresentation(error,{context});if(category)Object.assign(info,feedbackKinds[category],{category});if(title)info.title=title;if(message)info.message=message;container.replaceChildren();container.dataset.errorCategory=info.category;container.classList.add('user-error');container.setAttribute('role','status');container.setAttribute('aria-live','polite');container.hidden=false;
 container.append(feedbackHeading(info.title,info.category,'strong'));const body=document.createElement('span');body.className='feedback-message';body.textContent=info.message;container.append(body);
 const details=document.createElement('details'),summary=document.createElement('summary'),raw=document.createElement('pre');summary.textContent='Technical details';raw.textContent=info.detail;details.append(summary,raw);
 const run=action?.run||actions[info.action]||(info.action==='dismiss'?()=>{clearUserError(container);container.hidden=true;}:null),label=action?.label||info.actionLabel;
 container.append(feedbackButton(run?label:'View error details',run||(()=>{details.open=true;summary.focus();}),{primary:true,icon:run?info.icon:'help'}),details);return info;
}
