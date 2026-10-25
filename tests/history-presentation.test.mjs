import test from 'node:test';
import assert from 'node:assert/strict';
import {historyPresentation,shortenHistoryPath} from '../lib/history-presentation.mjs';
test('history presents path titles as project names while retaining source paths and session identity',()=>{
  const source='C:\\Example\\Projects\\SampleApp';
  const item={id:'8140aaf6-0000-4000-8000-000000000000',title:source,sources:source,updatedAt:'2026-10-20T12:08:00Z'};
  const info=historyPresentation(item);assert.equal(info.title,'SampleApp');assert.equal(info.location,source);assert.equal(info.shortId,'8140aaf6');assert.equal(info.dateTime,item.updatedAt.replace('Z','.000Z'));
  assert.equal(historyPresentation({...item,title:'"'+source+'\\"'}).title,'SampleApp');
  assert.equal(historyPresentation({...item,title:'A named investigation'}).title,'A named investigation');
  assert.equal(historyPresentation({...item,title:'\\\\server\\share\\Project\\'}).title,'Project');
  assert.equal(historyPresentation({...item,title:'https://example.com/a'}).title,'example.com');
});
test('history preserves document locations and bounds pathological paths without losing complete detail',()=>{
  const source='C:\\'+('long folder\\').repeat(40)+'Project';
  const info=historyPresentation({title:'Project',sources:source,documentPath:'D:\\Saved\\Project.reanodes',updatedAt:'invalid'});
  assert.equal(info.locationLabel,'Document');assert.equal(info.location,'D:\\Saved\\Project.reanodes');assert.equal(info.savedAt,'Save time unavailable');
  assert.ok(shortenHistoryPath(source).length<=76);assert.ok(shortenHistoryPath(source).endsWith('Project'));assert.equal(shortenHistoryPath('short'),'short');
  assert.equal(historyPresentation({title:'New investigation',sources:source}).title,'Project');
});
