import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createDialogConfirmation} from '../lib/dialog-confirmation.mjs';
function fixture(){const window=new EventEmitter(),wc=new EventEmitter(),handlers={},sent=[];window.webContents=wc;window.isDestroyed=wc.isDestroyed=()=>false;wc.send=(...args)=>sent.push(args);return {window,wc,handlers,sent,prompt:createDialogConfirmation({getWindow:()=>window,handle:(name,fn)=>handlers[name]=fn,channel:'microphone-confirmation'})};}
test('microphone consent requires the current one-use token and strict approval',async()=>{
 const f=fixture(),pending=f.prompt.confirm(),token=f.sent[0][1].token;assert.equal(f.sent[0][0],'microphone-confirmation');assert.equal(f.handlers['microphone-confirmation-answer']('foreign',true),false);assert.throws(()=>f.prompt.confirm(),/open confirmation/);f.handlers['microphone-confirmation-answer'](token,true);assert.equal(await pending,true);assert.equal(f.handlers['microphone-confirmation-answer'](token,true),false);assert.equal(f.wc.listenerCount('did-start-navigation'),0);
});
test('cancel, close, navigation and destruction decline consent and allow a fresh request',async()=>{
 for(const event of ['cancel','close','did-start-navigation','destroyed']){const f=fixture(),pending=f.prompt.confirm();if(event==='cancel')f.prompt.cancel();else if(event==='close')f.window.emit(event);else f.wc.emit(event);assert.equal(await pending,false);const again=f.prompt.confirm(),token=f.sent.at(-1)[1].token;f.handlers['microphone-confirmation-answer'](token,'true');assert.equal(await again,false);assert.equal(f.prompt.cancel(),false);}
});
