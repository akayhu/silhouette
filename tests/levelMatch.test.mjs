import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

// levelMatch.ts 的 matchVoiceLevels 需要解碼真的音訊（瀏覽器才有 OfflineAudioContext），
// 這裡只測不需要 DOM 的 applyLevelMatch（純資料套用）
const src = await compile('levelMatch.ts');
const fn = src.slice(src.indexOf('export function applyLevelMatch'));
const mod = await import(url(fn));

const clip = (id, volume) => ({ id, mediaId: id, start: 0, in: 0, out: 1, volume });

test('applyLevelMatch：只改有分析到的段落的音量，其他維持原樣', () => {
  const d = { audio: [clip('a', 1), clip('b', 1), clip('c', 0.5)] };
  const result = { volumes: new Map([['a', 1.8], ['c', 0.3]]) };
  const out = mod.applyLevelMatch(d, result);
  assert.deepEqual(out.audio.map((a) => a.volume), [1.8, 1, 0.3]);
});

test('applyLevelMatch：沒有任何分析結果時回傳原物件（不觸發多餘的 commit）', () => {
  const d = { audio: [clip('a', 1)] };
  assert.equal(mod.applyLevelMatch(d, { volumes: new Map() }), d);
});
