import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

// coverSuggest.ts 的 suggestCoverTimes 需要 engine.ts 的 Engine（瀏覽器才有的渲染管線），
// 這裡只測不需要 DOM 的 suggestCoverTitle，用一個空殼 Engine 頂替掉
const engineStub = url(`export class Engine {}`);
const mod = await import(url((await compile('coverSuggest.ts')).replace("from './engine'", `from '${engineStub}'`)));

const cap = (id, start, end, text, extra = {}) => ({ id, start, end, text, style: {}, ...extra });

test('suggestCoverTitle：封面時間點落在某句字幕內，就用那句當標題', () => {
  const captions = [cap('a', 0, 2, '今天來吃這攤甜不辣'), cap('b', 2, 4, '老闆一早就在備料')];
  assert.equal(mod.suggestCoverTitle(captions, 3), '老闆一早就在備料');
});

test('suggestCoverTitle：時間點沒有剛好落在哪句裡，用最接近的那句', () => {
  const captions = [cap('a', 0, 1, '第一句'), cap('b', 10, 11, '第二句')];
  assert.equal(mod.suggestCoverTitle(captions, 1.5), '第一句');
});

test('suggestCoverTitle：去掉句尾標點', () => {
  const captions = [cap('a', 0, 2, '今天天氣真好！')];
  assert.equal(mod.suggestCoverTitle(captions, 1), '今天天氣真好');
});

test('suggestCoverTitle：太長的句子截斷', () => {
  const long = '這是一句非常非常非常非常非常非常非常長的字幕內容用來測試截斷';
  const captions = [cap('a', 0, 2, long)];
  const result = mod.suggestCoverTitle(captions, 1);
  assert.equal(result.length, 20);
  assert.equal(result, [...long].slice(0, 20).join(''));
});

test('suggestCoverTitle：花字不算，沒有一般字幕時回傳 null', () => {
  assert.equal(mod.suggestCoverTitle([cap('f', 0, 2, '花字', { role: 'flower' })], 1), null);
  assert.equal(mod.suggestCoverTitle([], 1), null);
});

test('suggestCoverTitle：字幕內容只有標點或空白時回傳 null', () => {
  assert.equal(mod.suggestCoverTitle([cap('a', 0, 2, '，。！')], 1), null);
});
