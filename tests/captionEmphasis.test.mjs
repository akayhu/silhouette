import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const mod = await import(url(await compile('captionEmphasis.ts')));

test('matchEmphasisRanges：抓到數字、百分比和關鍵字', () => {
  const ranges = mod.matchEmphasisRanges('限時 88折，只有今天，100%划算');
  const text = '限時 88折，只有今天，100%划算';
  const slices = ranges.map(([s, e]) => text.slice(s, e));
  assert.ok(slices.includes('限時'));
  assert.ok(slices.includes('88'));
  assert.ok(slices.includes('100%'));
});

test('matchEmphasisRanges：相鄰或重疊的範圍會合併，不會重複上色', () => {
  const ranges = mod.matchEmphasisRanges('全網最便宜');
  // 「全網」和「最」相鄰（index 0-2, 2-3）應該合併成一段
  assert.deepEqual(ranges, [[0, 3]]);
});

test('matchEmphasisRanges：沒有關鍵字或數字時回傳空陣列', () => {
  assert.deepEqual(mod.matchEmphasisRanges('今天天氣很好'), []);
  assert.deepEqual(mod.matchEmphasisRanges(''), []);
});
