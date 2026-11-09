import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const mod = await import(url(await compile('retakeDetect.ts')));

const seg = (start, end, text) => ({ start, end, text });

test('findRetakes：講錯重講，文字幾乎一樣，抓到前一次當作要剪掉的', () => {
  const segments = [seg(0, 2, '今天天氣真的非常好'), seg(3, 5, '今天天氣真的非常好')];
  const pairs = mod.findRetakes(segments);
  assert.deepEqual(pairs, [{ earlierIndex: 0, laterIndex: 1, similarity: 1 }]);
});

test('findRetakes：重講時文字有些微修正，相似度夠高還是抓得到', () => {
  const segments = [seg(0, 2, '這個東西真的好吃誒'), seg(3, 5, '這個東西真的好吃欸')];
  const pairs = mod.findRetakes(segments);
  assert.equal(pairs.length, 1);
  assert.ok(pairs[0].similarity > 0.85);
});

test('findRetakes：句子完全不同的正常對話不會誤判', () => {
  const segments = [seg(0, 2, '今天天氣很好'), seg(3, 5, '我們來介紹今天的產品')];
  assert.deepEqual(mod.findRetakes(segments), []);
});

test('findRetakes：間隔太久（超過時間窗）就不算同一次重錄', () => {
  const segments = [seg(0, 2, '今天天氣真的非常好'), seg(30, 32, '今天天氣真的非常好')];
  assert.deepEqual(mod.findRetakes(segments), []);
});

test('findRetakes：太短的句子（語助詞等級）不列入比對，避免誤判', () => {
  const segments = [seg(0, 1, '對對'), seg(2, 3, '對對')];
  assert.deepEqual(mod.findRetakes(segments), []);
});

test('findRetakes：一次重錄抓到就好，不會跟更後面的句子重複配對', () => {
  const segments = [seg(0, 2, '今天天氣真的非常好'), seg(3, 5, '今天天氣真的非常好'), seg(6, 8, '今天天氣真的非常好')];
  const pairs = mod.findRetakes(segments);
  assert.equal(pairs.length, 2);
  assert.deepEqual(pairs.map((p) => [p.earlierIndex, p.laterIndex]), [[0, 1], [1, 2]]);
});
