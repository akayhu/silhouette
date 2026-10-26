import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const format = url(await compile('format.ts'));
const captionsUrl = url((await compile('captions.ts')).replace("from './format'", `from '${format}'`));
const timelineUrl = url((await compile('timeline.ts')).replace("from './format'", `from '${format}'`).replace("from './captions'", `from '${captionsUrl}'`));
const { alignScript, alignChars } = await import(url((await compile('scriptAlign.ts')).replace("from './captions'", `from '${captionsUrl}'`).replace("from './timeline'", `from '${timelineUrl}'`)));
const captions = await import(captionsUrl);

const style = { font: 'Arial', size: 80, color: '#fff', stroke: '#000', background: null, bold: true, y: .8, animation: 'none' };
/** 辨識結果：每個字 0.2 秒，從 start 開始 */
const heard = (id, start, text) => {
  const words = [...text].map((ch, i) => ({ text: ch, start: start + i * 0.2, end: start + (i + 1) * 0.2 }));
  return { id, start, end: start + text.length * 0.2, text, style, words };
};

test('edit-distance alignment matches same characters and tolerates substitutions', () => {
  assert.deepEqual(alignChars([...'abcd'], [...'abxd']), [0, 1, 2, 3]);
  assert.deepEqual(alignChars([...'abcd'], [...'acd']), [0, -1, 1, 2]);
  assert.deepEqual(alignChars([...'ab'], [...'xaby']), [1, 2]);
});

test('script text replaces recognition errors while keeping spoken timing', () => {
  // 辨識成「離子」「敷衍」，講稿是「離職」「副業」
  const rec = [heard('a', 1, '如果我給你一個不用離子'), heard('b', 4, '就能開始的敷衍')];
  const r = alignScript('如果我給你一個不用離職，\n就能開始的副業。', rec, style);
  assert.deepEqual(r.captions.map((c) => c.text), ['如果我給你一個不用離職', '就能開始的副業']);
  assert.equal(r.total, 18);
  assert.equal(r.matched, 15);
  assert.equal(r.captions[0].start, 1);
  assert.equal(r.captions[1].start, 4);
  // 「職」沿用辨識裡「子」的時間
  const zhi = r.captions[0].words.find((w) => w.text === '職');
  assert.equal(+zhi.start.toFixed(2), 3);
  // 結果可以直接用在文字剪輯與卡拉 OK
  assert.ok(r.captions.every((c) => captions.captionWords(c)));
});

test('words missing from recognition get interpolated times, long lines split at 16 characters', () => {
  const rec = [heard('a', 0, '今天天氣很好我們去公園散步吧然後吃午餐')];
  const r = alignScript('今天天氣真的很好我們一起去公園散步吧然後吃午餐', rec, style);
  assert.ok(r.captions.length >= 2);
  assert.ok(r.captions.every((c) => [...c.text].length <= 16));
  const all = r.captions.flatMap((c) => c.words);
  for (let i = 1; i < all.length; i++) assert.ok(all[i].start >= all[i - 1].start - 1e-9, '時間要遞增');
  assert.equal(all.map((w) => w.text).join(''), '今天天氣真的很好我們一起去公園散步吧然後吃午餐');
});

test('a pause in speech starts a new caption; convert is used for comparison only', () => {
  const rec = [heard('a', 0, '你好'), heard('b', 5, '再見')];
  const r = alignScript('你好再見', rec, style);
  assert.deepEqual(r.captions.map((c) => c.text), ['你好', '再見']);
  const simp = alignScript('你好再见', rec, style, (s) => (s === '见' ? '見' : s));
  assert.equal(simp.matched, 4);
  assert.equal(simp.captions[1].text, '再见');
});
