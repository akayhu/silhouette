import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const format = url(await compile('format.ts'));
const captionsUrl = url((await compile('captions.ts')).replace("from './format'", `from '${format}'`));
const check = await import(url((await compile('captionCheck.ts')).replace("from './captions'", `from '${captionsUrl}'`)));

const style = { font: 'Arial', size: 80, color: '#fff', stroke: '#000', background: null, bold: true, y: .8, animation: 'none' };
const cap = (id, start, end, text, extra = {}) => ({ id, start, end, text, style, ...extra });
const kinds = (list) => check.checkCaptions(list).map((i) => `${i.id}:${i.kind}`);

test('detects empty, overlapping, short, too fast and too long captions; ignores flowers', () => {
  const list = [
    cap('ok', 0, 2, '你好'),
    cap('empty', 2.5, 3.5, '  '),
    cap('ov', 4, 6, '第一句'),
    cap('next', 5.5, 7, '第二句'),
    cap('short', 8, 8.4, '嗨'),
    cap('fast', 9, 10, '這一句話有非常多的字要在一秒內讀完'),
    cap('f', 0, 0.2, '花字花字花字花字花字花字花字花字花字花字', { role: 'flower' }),
  ];
  assert.deepEqual(kinds(list), ['empty:empty', 'ov:overlap', 'short:short', 'fast:fast', 'fast:long']);
  assert.match(check.summarizeIssues(check.checkCaptions(list)), /1 句字太多讀不完/);
});

test('one-click fix removes blanks, trims overlaps and extends without pushing the next caption', () => {
  const list = [cap('empty', 0, 1, ''), cap('ov', 1, 3, '第一句'), cap('next', 2.5, 4, '第二句'), cap('short', 5, 5.3, '嗨'), cap('tight', 6, 6.3, '十個字的句子要讀很久'), cap('wall', 6.5, 8, '牆')];
  const { captions, fixed } = check.fixCaptions(list);
  const by = Object.fromEntries(captions.map((c) => [c.id, c]));
  assert.equal(by.empty, undefined);
  assert.equal(by.ov.end, 2.46);
  assert.equal(by.short.end, 5.8);
  assert.equal(by.tight.end, 6.46); // 只能延長到下一句前
  assert.equal(by.next.start, 2.5);
  assert.ok(fixed >= 4);
  // 修完之後只剩後面沒空間、延長不了的那句，並提示要自己處理
  assert.deepEqual(kinds(captions), ['tight:short', 'tight:fast']);
  assert.ok(check.checkCaptions(captions).every((i) => i.manual));
});

test('long lines split at the punctuation nearest the middle, keeping word timings', () => {
  const text = '如果我給你一個不用離職，就能開始的副業機會';
  const words = [...text].map((ch, i) => ({ text: ch, start: 1 + i * 0.2, end: 1.2 + i * 0.2 }));
  const { captions } = check.fixCaptions([cap('l', 1, 1 + text.length * 0.2, text, { words })]);
  assert.deepEqual(captions.map((c) => c.text), ['如果我給你一個不用離職，', '就能開始的副業機會']);
  assert.ok(captions.every((c) => c.words?.length));
  assert.deepEqual(kinds(captions), []);
});

test('fixing selected ids leaves other captions untouched', () => {
  const list = [cap('a', 0, 0.3, '嗨'), cap('b', 2, 2.3, '嗨')];
  const { captions } = check.fixCaptions(list, new Set(['a']));
  assert.equal(captions[0].end, 0.8);
  assert.equal(captions[1].end, 2.3);
});
