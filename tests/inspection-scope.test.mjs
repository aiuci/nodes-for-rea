import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedManagedScopes} from '../lib/inspection-scope.mjs';
test('managed boundary describes cited successful type filters, not broad failures or unrelated history',()=>{
 const narrow={id:'narrow',operation:'inspect_managed_members',parameters:{path:'App.dll',type_names:['<Module>']},limitations:['Selected types only.']},failed={...narrow,id:'failed',evidenceStatus:'inspection-failed'},other={...narrow,id:'other',parameters:{path:'Other.dll',type_names:['Other.Feature']}};
 const state={evidence:[failed,narrow,other]},message={claims:[{evidenceId:'failed'},{evidenceId:'narrow'}]};
 assert.deepEqual(selectedManagedScopes(state,message),[{evidenceId:'narrow',path:'App.dll',types:['<Module>'],limitations:['Selected types only.']}]);assert.deepEqual(selectedManagedScopes(state,{claims:[]}),[]);
});
