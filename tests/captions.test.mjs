import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const format = url(await compile('format.ts'));
const captions = await import(url((await compile('captions.ts')).replace("from './format'", `from '${format}'`)));
const style = { font: 'Arial', size: 80, color: '#fff', stroke: '#000', background: null, bold: true, y: .8, animation: 'none' };
const cap = (id, start, end, text, extra = {}) => ({ id, start, end, text, style: structuredClone(style), ...extra });
const input = [cap('a', 1, 3, '你好台北'), cap('b', 3.5, 5, 'Mac Book'), cap('f', 1.2, 2, '台北花字', { role: 'flower' })];

test('literal replacement escapes regex characters and preserves literal dollar signs', () => {
  const items = [cap('x', 0, 2, 'a.b a*b (a) [a] \\a $& A.B')];
  const result = captions.replaceCaptionText(items, new Set(['x']), 'a.b', '$&', false);
  assert.equal(result.captions[0].text, '$& a*b (a) [a] \\a $& $&');
  assert.equal(result.occurrences, 2);
  for (const text of ['a*b', '(a)', '[a]', '\\a', '$&']) assert.equal(captions.replaceCaptionText([cap('x', 0, 2, text)], new Set(['x']), text, 'OK').captions[0].text, 'OK');
  assert.equal(captions.replaceCaptionText(input, new Set(['a']), 'Mac Book', '品牌').captions, input);
});
test('batch timing is atomic, preserves durations and does not move other tracks', () => {
  const shifted = captions.shiftCaptions(input, new Set(['a', 'b']), .125);
  assert.equal(shifted[0].start, 1.125); assert.equal(shifted[0].end, 3.125); assert.equal(shifted[2], input[2]);
  assert.throws(() => captions.shiftCaptions(input, new Set(['a', 'b']), -2), /早於 0/);
  assert.equal(input[0].start, 1); assert.throws(() => captions.shiftCaptions(input, new Set(['a']), Infinity));
});
test('merge only adjacent captions of the same role; preserve first style and text', () => {
  const result = captions.mergeCaptions(input, new Set(['a', 'b']));
  assert.equal(result.captions.length, 2); assert.equal(result.captions[0].text, '你好台北\nMac Book'); assert.equal(result.captions[0].end, 5); assert.equal(result.captions[0].style, input[0].style);
  assert.throws(() => captions.mergeCaptions(input, new Set(['a', 'f'])), /分開合併/);
  assert.throws(() => captions.mergeCaptions([...input, cap('c', 6, 7, '第三句')], new Set(['a', 'c'])), /相鄰/);
});
test('split text and timeline at grapheme boundaries without duplicating the sentence', () => {
  const c = cap('x', 0, 4, '你好世界'); const split = captions.splitCaptionText(c, 2);
  assert.deepEqual(split.map((c) => [c.text, c.start, c.end]), [['你好', 0, 2], ['世界', 2, 4]]);
  const timed = captions.splitCaptionByTime(c, 1); assert.equal(timed[0].text, '你'); assert.equal(timed[1].text, '好世界');
  const emoji = cap('u', 0, 4, '你👨‍👩‍👧‍👦好'); assert.throws(() => captions.splitCaptionText(emoji, 3));
  const pieces = captions.splitCaptionText(emoji, '你👨‍👩‍👧‍👦'.length); assert.equal(pieces[1].text, '好');
  assert.throws(() => captions.splitCaptionText(cap('s', 0, .1, '你好'), 1), /0.1 秒/);
});
test('dictionary prefers longest term and applies once without cascading corrections', () => {
  const rules = captions.parseCaptionRules('台北 => 臺北\n臺北 => 臺北市\n台北市 => Taipei');
  const result = captions.applyCaptionRules([cap('a', 0, 2, '台北 台北市 臺北')], new Set(['a']), rules);
  assert.equal(result.captions[0].text, '臺北 Taipei 臺北市');
  assert.throws(() => captions.parseCaptionRules('品牌=>A\n品牌=>B'), /重複/); assert.throws(() => captions.parseCaptionRules('沒有分隔符'));
});
test('SRT handles BOM, CRLF, overlaps and multiline captions with milliseconds', () => {
  const result = captions.parseSubtitles('\uFEFF1\r\n00:00:01,250 --> 00:00:03,500\r\n你好\r\n第二行\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\n重疊字幕');
  assert.equal(result.cues.length, 2); assert.equal(result.cues[0].start, 1.25); assert.equal(result.cues[0].text, '你好\n第二行');
});
test('WebVTT handles identifiers, NOTE, STYLE, minute timestamps and cue markup', () => {
  const result = captions.parseSubtitles('WEBVTT\n\nNOTE comment\nignored\n\nSTYLE\n::cue {color:red}\n\ncue-a\n00:01.000 --> 00:03.500 align:start\n<v 爸爸><b>你好</b> &amp; &#x1F600;</v>');
  assert.equal(result.cues[0].text, '你好 & 😀'); assert.equal(result.cues[0].end, 3.5); assert.ok(result.warnings.length);
});
test('malformed or empty subtitle blocks reject the whole import', () => {
  for (const text of ['', '1\n00:00:03,000 --> 00:00:01,000\n反向', '1\n00:99:01,000 --> 00:99:02,000\n錯誤', 'WEBVTT\n00:01.000 --> 00:02.000\n無空行', '1\n00:00:01,000 --> 00:00:02,000']) assert.throws(() => captions.parseSubtitles(text));
});
test('SRT/VTT round-trip timestamps and literal markup without executing it', () => {
  const items = [cap('x', 1.9996, 3.125, '<b>文字</b> & 😀\n下一行 -->'), cap('y', 3600, 3602, '一小時')];
  for (const format of ['srt', 'vtt']) {
    const result = captions.parseSubtitles(captions.serializeSubtitles(items, format)); assert.equal(result.cues[0].start, 2); assert.equal(result.cues[0].text, items[0].text); assert.equal(result.cues[1].start, 3600);
  }
  assert.equal(captions.formatCaptionTime(59.9996), '00:01:00.000'); assert.equal(captions.parseEditTime('1.125'), 1.125); assert.throws(() => captions.parseEditTime('-1'));
});
test('append/replace import preserves decorative captions and respects track locks', () => {
  const project = { aspect: '9:16', media: [], clips: [], audio: [], captions: input, stickers: [], overlays: [], duration: 5 };
  const cues = [{ start: 0, end: 1, text: '匯入字幕' }];
  const next = captions.importCaptionCues(project, cues, 'replace', style);
  assert.equal(next.captions.length, 2); assert.equal(next.captions[0].id, 'f'); assert.equal(project.captions, input);
  assert.equal(captions.importCaptionCues(project, cues, 'append', style).captions.length, 4);
  assert.throws(() => captions.importCaptionCues({ ...project, locks: { caption: true } }, cues, 'append', style), /鎖定/);
});
