import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

// hookCheck.ts imports mixEdit.ts (needs the DOM) and timeline.ts for checkOpeningHook, 但 swapToOpening 本身是純資料轉換，
// 直接把這個函式抽出來編譯測試就好，不用整個模組（也不用假 DOM）
const src = await compile('hookCheck.ts');
const swapFn = src.slice(src.indexOf('export function swapToOpening'));
const mod = await import(url(swapFn));

const clip = (id) => ({ id, mediaId: id, in: 0, out: 1, speed: 1, volume: 1 });

test('swapToOpening：把指定片段換到主軌最前面，其他順序不變', () => {
  const d = { clips: [clip('a'), clip('b'), clip('c')] };
  const out = mod.swapToOpening(d, 'c');
  assert.deepEqual(out.clips.map((c) => c.id), ['c', 'a', 'b']);
});

test('swapToOpening：已經是第一段或找不到就不變', () => {
  const d = { clips: [clip('a'), clip('b')] };
  assert.equal(mod.swapToOpening(d, 'a'), d);
  assert.equal(mod.swapToOpening(d, 'zzz'), d);
});
