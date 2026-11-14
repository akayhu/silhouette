import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const code = stripTypeScriptTypes(await readFile(new URL('../src/lib/rangePreview.ts', import.meta.url), 'utf8'));
const { previewStep, cutSummary } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

const ranges = [[10, 12], [30, 31]];

test('還在範圍內：繼續播', () => {
  assert.deepEqual(previewStep(ranges, 0, 10.5, true), { kind: 'continue' });
  assert.deepEqual(previewStep(ranges, 0, 9.8, true), { kind: 'continue' });
});

test('播到這段結尾：跳下一段；最後一段播完：結束', () => {
  assert.deepEqual(previewStep(ranges, 0, 12.01, true), { kind: 'next', index: 1 });
  assert.deepEqual(previewStep(ranges, 1, 31, true), { kind: 'done' });
});

test('使用者自己暫停、或往前拖到很早的位置：不再接手', () => {
  assert.deepEqual(previewStep(ranges, 0, 11, false), { kind: 'cancel' });
  assert.deepEqual(previewStep(ranges, 1, 5, true), { kind: 'cancel' });
});

test('累計摘要：剪掉多少、剩多少；沒剪過是 0；沒有原長就不顯示', () => {
  assert.deepEqual(cutSummary(180, 168), { base: 180, removed: 12, current: 168 });
  assert.equal(cutSummary(180, 180).removed, 0);
  assert.equal(cutSummary(180, 200).removed, 0);
  assert.equal(cutSummary(0, 10), null);
});
