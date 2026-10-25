import test from 'node:test';
import assert from 'node:assert/strict';
import {graphExportFilename} from '../lib/graph-export-filename.mjs';

test('graph filenames use existing investigation titles and one JSON extension', () => {
  assert.equal(graphExportFilename('Alpha investigation'), 'Alpha investigation-graph.json');
  assert.equal(graphExportFilename('Beta investigation'), 'Beta investigation-graph.json');
  assert.equal(graphExportFilename('Alpha investigation'), graphExportFilename('Alpha investigation'));
  assert.equal(graphExportFilename('Report.JSON.json'), 'Report-graph.json');
  assert.equal(graphExportFilename('New investigation'), 'New investigation-graph.json');
});

test('untitled, unsafe Windows names and path separators remain safe basenames', () => {
  for (const title of [undefined, null, 42, '', '   ', '...', '<>:"/\\|?*\x00']) {
    assert.equal(graphExportFilename(title), 'Investigation-graph.json');
  }
  assert.equal(graphExportFilename('A: report / notes?. '), 'A report notes-graph.json');
  for (const title of ['CON', 'nul.txt', 'COM1', 'lpt9', 'COM¹', 'PRN.json']) {
    assert.ok(graphExportFilename(title).startsWith('_'));
  }
});

test('Unicode stays readable and long titles do not split surrogate pairs', () => {
  assert.equal(graphExportFilename('日本語 Café 🔍'), '日本語 Café 🔍-graph.json');
  const name = graphExportFilename('🔍'.repeat(200));
  assert.equal(name, '🔍'.repeat(80) + '-graph.json');
  assert.ok(name.length < 200);
  assert.ok(!/[. ]\.json$/u.test(graphExportFilename('a'.repeat(79) + '.  more')));
});
