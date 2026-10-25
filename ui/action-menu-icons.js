// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
// The same small inline-SVG/stroke vocabulary used by canvas-navigation.js.
const shapes={
 inspect:[['circle',{cx:10.5,cy:10.5,r:6.5}],['path',{d:'m15.5 15.5 5 5'}]],
 trace:[['path',{d:'M5 19c0-8 14 1 14-14'}],['circle',{cx:5,cy:19,r:2.5}],['circle',{cx:19,cy:5,r:2.5}]],
 probe:[['circle',{cx:12,cy:12,r:8}],['path',{d:'M12 1v5m0 12v5M1 12h5m12 0h5'}]],
 deeper:[['path',{d:'m3 8 9-5 9 5-9 5ZM3 12l9 5 9-5M3 16l9 5 9-5'}]],
 auto:[['path',{d:'m3 10 8-4 8 4-8 4ZM3 14l8 4 8-4M3 18l8 4 8-4'}],['path',{d:'m20 1 .8 2.2L23 4l-2.2.8L20 7l-.8-2.2L17 4l2.2-.8Z',fill:'currentColor','stroke-width':'.5'}]],
 verify:[['path',{d:'m12 2 8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5ZM8 12l3 3 5-6'}]],
 compare:[['rect',{x:2,y:3,width:8,height:18,rx:1}],['rect',{x:14,y:3,width:8,height:18,rx:1}]],
 ask:[['path',{d:'M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-.8L3 22l1.5-6A9 9 0 1 1 21 11Z'}],['circle',{cx:8,cy:11,r:.65}],['circle',{cx:12,cy:11,r:.65}],['circle',{cx:16,cy:11,r:.65}]],
 read:[['path',{d:'M5 3h10l4 4v14H5ZM15 3v5h4M8 12h8M8 16h6'}]],
 keep:[['path',{d:'M6 3h12v19l-6-4-6 4Z'}]],
 pin:[['path',{d:'m8 3 8 0-1 6 4 4v2H5v-2l4-4ZM12 15v7'}]],
 fold:[['path',{d:'m5 9 7 7 7-7'}]],
 hide:[['path',{d:'M3 3l18 18M10 5a11 11 0 0 1 11 7 14 14 0 0 1-4 5M6 6a13 13 0 0 0-3 6c2 5 8 8 13 6'}]],
 position:[['path',{d:'M12 2v20M2 12h20m-13-7 3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3m14-6 3 3-3 3'}]],
 copy:[['rect',{x:8,y:8,width:13,height:13,rx:2}],['path',{d:'M16 8V3H3v13h5'}]],
 sources:[['path',{d:'M3 6h7l2 3h9v12H3ZM3 6V3h7l2 3'}]],
 coverage:[['circle',{cx:12,cy:12,r:9}],['path',{d:'M12 3v9l6 6'}]]
};
export function actionMenuIcon(key,label=''){
 key=({'agent-control':'coverage',discover:'inspect',route:'trace',evidence:'read',setup:'coverage',retry:'trace'})[key]||key;
 if(!shapes[key])key=/source/i.test(label)?'sources':/read|finding|response|receipt/i.test(label)?'read':/question|ask/i.test(label)?'ask':'inspect';
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
 for(const [name,value]of Object.entries({class:'radial-menu-icon',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))icon.setAttribute(name,value);
 for(const [tag,attributes]of shapes[key]){const shape=document.createElementNS(icon.namespaceURI,tag);for(const [name,value]of Object.entries(attributes))shape.setAttribute(name,value);icon.append(shape);}
 return icon;
}
