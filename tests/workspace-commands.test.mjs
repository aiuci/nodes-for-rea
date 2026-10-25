import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandRegistry,shortcutText,matchesBinding} from '../lib/command-registry.mjs';
import {anchoredMenuRect} from '../lib/anchored-menu-layout.mjs';
import {defaultControls,cleanControls,detachDock,detachControl,snapControlGroup,controlLeaves,controlDropTarget,balancedControlColumns} from '../lib/magnetic-controls.mjs';

test('bindings distinguish modifiers and reject aliases that collide before changing a registration',()=>{
 const r=createCommandRegistry();r.register({id:'fit',label:'Fit',bindings:[{key:'f'}],run(){}});
 r.register({id:'selection',bindings:[{key:'f',shift:true}],run(){}});
 assert.throws(()=>r.register({id:'bad',bindings:[{key:'f',shift:'any'}],run(){}}),/collision/);
 assert.throws(()=>r.rebind('selection',[{key:'f'}]),/collision/);
 assert.equal(shortcutText(r.get('selection')),'Shift + F');
 assert.equal(matchesBinding({key:'F',shiftKey:true},{key:'f'}),false);
 assert.equal(matchesBinding({key:'?',shiftKey:true},{key:'?',shift:'any'}),true);
 assert.equal(matchesBinding({key:'?',ctrlKey:true},{key:'?',shift:'any'}),false);
});
test('command dispatch honors availability, context, repeat and live remapping',()=>{
 const r=createCommandRegistry();let count=0,enabled=false,changed=0,prevented=0;
 r.register({id:'fit',label:'Fit',enabled:()=>enabled,when:e=>!e.blocked,bindings:[{key:'f'}],run:()=>count++});
 r.subscribe(()=>changed++);const event={key:'f',preventDefault(){prevented++;},stopImmediatePropagation(){}};
 r.dispatch(event);assert.equal(count,0);enabled=true;r.dispatch({...event,blocked:true});assert.equal(count,0);
 r.dispatch(event);r.dispatch({...event,repeat:true});assert.equal(count,1);
 r.rebind('fit',[{key:'g'}]);assert.equal(changed,1);assert.equal(shortcutText(r.get('fit')),'G');
 assert.equal(r.dispatch(event),false);r.dispatch({...event,key:'g'});assert.equal(count,2);assert.equal(prevented,4);
 const copy=r.get('fit');copy.bindings[0].key='x';assert.equal(shortcutText(r.get('fit')),'G');
});
test('anchored menus stay bounded at all viewport edges and prefer unoccupied space',()=>{
 const bounds={x:250,y:70,width:650,height:500},size={width:260,height:270};
 for(const anchor of [{x:250,y:70,width:32,height:32},{x:868,y:538,width:32,height:32},{x:550,y:300,width:32,height:32}]){
  for(const submenu of [false,true]){
   const r=anchoredMenuRect(anchor,size,bounds,[],submenu);
   assert.ok(r.x>=bounds.x&&r.y>=bounds.y);assert.ok(r.x+r.width<=900&&r.y+r.height<=570);
  }
 }
 const narrow=anchoredMenuRect({x:270,y:100,width:30,height:30},size,{x:250,y:70,width:160,height:150},[]);
 assert.ok(narrow.width<=160&&narrow.height<=150);
});
test('dock migration keeps former focus controls out of movable modules and retains saved sizes',()=>{
 const s=cleanControls({version:1,dock:['navigation','focus'],home:{width:920},groups:[{tree:{axis:'stack',active:1,children:['themes','focus','layouts']},x:20,y:30,width:410}]});
 assert.deepEqual([...s.dock,...s.groups.flatMap(g=>controlLeaves(g.tree))].sort(),['layouts','navigation','themes']);
 assert.equal(s.home.width,920);assert.equal(s.groups[0].width,410);
 assert.deepEqual(cleanControls(JSON.parse(JSON.stringify(s))),s);
});
test('whole dock detaches as one resizable assembly; center drops produce recoverable stacks',()=>{
 const whole=detachDock(defaultControls(),{x:10,y:20,width:940});assert.equal(whole.state.dock.length,0);assert.equal(whole.state.groups[0].width,940);
 const a=detachControl(defaultControls(),'navigation'),b=detachControl(a.state,'themes');
 const stacked=snapControlGroup(b.state,b.groupId,'navigation','stack');
 assert.equal(stacked.groups.length,1);assert.equal(stacked.groups[0].tree.axis,'stack');assert.equal(stacked.groups[0].tree.active,1);
 const torn=detachControl(stacked,'themes');assert.equal(torn.state.groups.length,2);assert.equal(torn.state.groups[0].tree,'navigation');
});
test('five docking targets select the indicated edge or center; preset columns never leave an orphan row',()=>{
 const t={module:'themes',x:100,y:100,width:200,height:100};
 for(const [side,x,y]of [['left',102,150],['right',298,150],['top',200,102],['bottom',200,198],['stack',200,150]])assert.equal(controlDropTarget({x,y},[t]).side,side);
 assert.equal(controlDropTarget({x:0,y:0},[t]),null);
 for(const width of [60,130,250,450,600,950,1500]){const cols=balancedControlColumns(16,width);assert.equal(16%cols,0);assert.ok(cols*54+(cols-1)*3<=width);}
});

test('Focus preference defaults to map and survives docking normalization',()=>{
 assert.equal(defaultControls().focus,'map');assert.equal(cleanControls({version:1,focus:'invalid'}).focus,'map');
 const chosen={...defaultControls(),focus:'node'},detached=detachDock(chosen);
 assert.equal(cleanControls(detached.state).focus,'node');
});
