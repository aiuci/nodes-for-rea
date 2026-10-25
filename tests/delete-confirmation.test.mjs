import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createDeleteConfirmation} from '../lib/delete-confirmation.mjs';
function fixture(){const window=new EventEmitter(),wc=new EventEmitter(),messages=[],handlers={};window.webContents=wc;window.isDestroyed=wc.isDestroyed=()=>false;wc.send=(...args)=>messages.push(args);return {window,wc,messages,handlers,prompt:createDeleteConfirmation({getWindow:()=>window,handle:(name,fn)=>handlers[name]=fn})};}
const items=[{id:'private-store-id',title:'7-Zip',shortId:'abc12345',savedAt:'Today'}];
test('delete confirmation is bound to a one-use token and does not accept replacement IDs',async()=>{
 const f=fixture(),pending=f.prompt.confirm(items),[channel,payload]=f.messages[0],answer=f.handlers['delete-confirmation-answer'];assert.equal(channel,'delete-confirmation');assert.equal(payload.items[0].id,undefined);assert.equal(answer('foreign',true),false);assert.throws(()=>f.prompt.confirm(items),/open deletion/);assert.equal(answer(payload.token,true),true);assert.equal(await pending,true);assert.equal(answer(payload.token,true),false);assert.equal(f.window.listenerCount('close'),0);assert.equal(f.wc.listenerCount('did-start-navigation'),0);
});
test('Cancel, window close and navigation never approve a deletion',async()=>{
 for(const mode of ['cancel','close','navigation']){const f=fixture(),pending=f.prompt.confirm(items),token=f.messages[0][1].token;if(mode==='cancel')f.handlers['delete-confirmation-answer'](token,false);else if(mode==='close')f.window.emit('close');else f.wc.emit('did-start-navigation');assert.equal(await pending,false);assert.equal(f.wc.listenerCount('destroyed'),0);}
});
test('a missing renderer cancels safely and the next request can still be made',async()=>{
 const f=fixture();f.wc.send=()=>{throw Error('closed transport');};assert.equal(await f.prompt.confirm(items),false);f.wc.send=(...args)=>f.messages.push(args);const pending=f.prompt.confirm(items),token=f.messages.at(-1)[1].token;f.handlers['delete-confirmation-answer'](token,'true');assert.equal(await pending,false);
});
