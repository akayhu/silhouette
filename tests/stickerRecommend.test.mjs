import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const exportSupportUrl = url(await compile('exportSupport.ts'));
const stickersUrl = url((await compile('stickers.ts')).replace("from './exportSupport'", `from '${exportSupportUrl}'`));
const { recommendStickers } = await import(url((await compile('stickerRecommend.ts')).replace("from './stickers'", `from '${stickersUrl}'`)));

const caption = (text) => ({ text, role: undefined });

test('字幕提到「好吃」時推薦「超好吃」貼紙，並說明比對到的關鍵字', () => {
  const result = recommendStickers([caption('今天這間真的好吃')]);
  assert.ok(result.some((r) => r.sticker.id === 'badge-yummy'));
  const yummy = result.find((r) => r.sticker.id === 'badge-yummy');
  assert.equal(yummy.reason, '內容提到「好吃」');
});

test('字幕提到「哈哈」時推薦大笑表情', () => {
  const result = recommendStickers([caption('這也太好笑了吧哈哈')]);
  assert.ok(result.some((r) => r.sticker.id === 'face-laugh'));
});

test('沒有比對到任何關鍵字時回傳空陣列，不會硬湊貼紙', () => {
  const result = recommendStickers([caption('今天去超市買東西')]);
  assert.deepEqual(result, []);
});

test('沒有字幕內容時回傳空陣列', () => {
  assert.deepEqual(recommendStickers([]), []);
});

test('花字（role: flower）不列入推薦依據', () => {
  const result = recommendStickers([{ text: '好吃', role: 'flower' }]);
  assert.deepEqual(result, []);
});

test('最多回傳指定數量', () => {
  const result = recommendStickers([caption('好吃 推薦 免費 特價 打卡 分享出去 必看')], 3);
  assert.equal(result.length, 3);
});
