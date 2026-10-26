import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const format = url(await compile('format.ts'));
const captionsUrl = url((await compile('captions.ts')).replace("from './format'", `from '${format}'`));
const captions = await import(captionsUrl);
const timeline = await import(url((await compile('timeline.ts')).replace("from './format'", `from '${format}'`).replace("from './captions'", `from '${captionsUrl}'`)));

const style = { font: 'Arial', size: 80, color: '#fff', stroke: '#000', background: null, bold: true, y: .8, animation: 'none' };
const w = (text, start, end) => ({ text, start, end });
// 「如果我給你」：1.0～2.0 秒，每個字 0.2 秒
const words = [w('如果', 1, 1.4), w('我', 1.4, 1.6), w('給', 1.6, 1.8), w('你', 1.8, 2)];
const cap = (extra = {}) => ({ id: 'a', start: 1, end: 2, text: '如果我給你', style: structuredClone(style), words, ...extra });
const project = (caps) => ({
  aspect: '9:16',
  media: [{ id: 'm', name: 'v', kind: 'video', url: '/v.mp4', duration: 10 }],
  clips: [{ id: 'c', mediaId: 'm', in: 0, out: 10, speed: 1, volume: 1 }],
  audio: [], captions: caps, stickers: [], overlays: [], duration: 10,
});

test('word timings stay valid for same-length typo fixes, invalid after length changes or moving away', () => {
  assert.deepEqual(captions.captionWords(cap()).map((x) => x.text), ['如果', '我', '給', '你']);
  assert.deepEqual(captions.captionWords(cap({ text: '如果他給你' })).map((x) => x.text), ['如果', '他', '給', '你']);
  assert.equal(captions.captionWords(cap({ text: '如果我給你們' })), null);
  assert.equal(captions.captionWords(cap({ start: 5, end: 6 })), null);
  assert.equal(captions.captionWords(cap({ words: undefined })), null);
});

test('splitting uses the real word boundary and hands each side its own words', () => {
  const [left, right] = captions.splitCaptionText(cap(), 3);
  assert.equal(left.text, '如果我'); assert.equal(right.text, '給你');
  assert.equal(left.end, 1.6); assert.equal(right.start, 1.6);
  assert.deepEqual(right.words.map((x) => x.text), ['給', '你']);
  // 切在「如果」中間：時間依字數比例
  const [l2, r2] = captions.splitCaptionText(cap(), 1);
  assert.equal(l2.words[0].text, '如'); assert.equal(r2.words[0].text, '果'); assert.equal(l2.end, 1.2);
  // 依播放頭拆句：切在最近的字與字之間
  const [l3] = captions.splitCaptionByTime(cap(), 1.62);
  assert.equal(l3.text, '如果我');
});

test('cutting selected words removes that footage and shortens the caption text', () => {
  const out = timeline.cutTranscript(project([cap()]), [[1.4, 1.6]]);
  assert.equal(out.clips.length, 2);
  assert.deepEqual(out.clips.map((c) => [c.in, c.out]), [[0, 1.4], [1.6, 10]]);
  assert.equal(out.captions[0].text, '如果給你');
  assert.deepEqual(out.captions[0].words.map((x) => [x.text, +x.start.toFixed(3)]), [['如果', 1], ['給', 1.4], ['你', 1.6]]);
  assert.equal(+out.captions[0].end.toFixed(3), 1.8);
});

test('cutting a whole sentence removes the caption and shifts later captions with their words', () => {
  const later = { ...cap(), id: 'b', start: 3, end: 4, words: words.map((x) => ({ ...x, start: x.start + 2, end: x.end + 2 })) };
  const out = timeline.cutTranscript(project([cap(), later]), [[1, 2]]);
  assert.equal(out.captions.length, 1);
  assert.equal(out.captions[0].id, 'b');
  assert.equal(out.captions[0].start, 2);
  assert.equal(out.captions[0].words[0].start, 2);
  assert.notEqual(captions.captionWords(out.captions[0]), null);
});

test('captions whose words no longer match lose them instead of keeping stale timings', () => {
  const out = timeline.cutTranscript(project([cap({ text: '完全不同的字幕內容' })]), [[5, 6]]);
  assert.equal(out.captions[0].words, undefined);
  assert.equal(out.captions[0].text, '完全不同的字幕內容');
});

test('words heard past the end of a clip are dropped instead of becoming zero-length', () => {
  const c = timeline.captionFromWords(0.64, 1.86, '', style, [w('離', 1.62, 1.78), w('子', 1.78, 1.86), w('就', 1.9, 2.0)]);
  assert.equal(c.text, '離子');
  assert.ok(c.words.every((x) => x.end > x.start));
  const out = timeline.cutTranscript(project([{ ...c, id: 'z' }]), [[1.62, 1.78]]);
  assert.equal(out.captions[0].text, '子');
});

test('music that ended with the video is shortened with it after a cut', () => {
  const d = { ...project([cap()]), audio: [{ id: 'm1', mediaId: 'm', start: 0, in: 0, out: 10, volume: 1 }, { id: 'm2', mediaId: 'm', start: 0, in: 0, out: 4, volume: 1 }] };
  const out = timeline.cutTranscript(d, [[1.4, 1.6]]);
  assert.equal(+out.audio[0].out.toFixed(3), 9.8);
  assert.equal(out.audio[1].out, 4);
});

test('re-recognizing a range replaces only captions centred inside it and keeps flowers', () => {
  const c = (id, start, end, extra = {}) => ({ id, start, end, text: id, style, ...extra });
  const old = [c('a', 0, 2), c('b', 2, 4), c('c', 3.9, 6), c('f', 2.5, 3, { role: 'flower' })];
  const fresh = [c('n', 2.1, 3.8)];
  const out = captions.replaceCaptionsInRanges(old, fresh, [[2, 4]]);
  assert.deepEqual(out.map((x) => x.id), ['a', 'n', 'f', 'c']);
  // 沒給範圍＝整條重做，花字保留
  assert.deepEqual(captions.replaceCaptionsInRanges(old, fresh).map((x) => x.id), ['n', 'f']);
});

test('bilingual captions: SRT puts the translation on the next line; split keeps it once; merge joins them', () => {
  const c = (id, start, end, text, translation) => ({ id, start, end, text, style, translation });
  const srt = captions.serializeSubtitles([c('a', 0, 1, '你好', 'Hello')], 'srt');
  assert.match(srt, /00:00:00,000 --> 00:00:01,000\n你好\nHello\n/);
  const [l, r] = captions.splitCaptionText(c('b', 0, 2, '你好世界', 'Hello world'), 2);
  assert.equal(l.translation, 'Hello world');
  assert.equal(r.translation, '');
  const merged = captions.mergeCaptions([c('x', 0, 1, '你好', 'Hello'), c('y', 1, 2, '世界', 'world')], new Set(['x', 'y']));
  assert.equal(merged.captions[0].translation, 'Hello world');
});
