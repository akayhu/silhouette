import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

// findHighlights 依賴 autoEffects.ts（isEmphasis）跟 mixEdit.ts（motionScoreAt，需要真的影片解碼），
// 這裡只測文字／時間的評分邏輯，用空殼頂替掉兩個需要瀏覽器的模組：motionScoreAt 固定回傳 0（分數全靠字幕）
const format = url(await compile('format.ts'));
const captionsUrl = url((await compile('captions.ts')).replace("from './format'", `from '${format}'`));
const timelineUrl = url((await compile('timeline.ts')).replace("from './format'", `from '${format}'`).replace("from './captions'", `from '${captionsUrl}'`));
const autoEffectsStub = url(`export const isEmphasis = (text) => /[!！]|哇|超|太|真的|竟然|居然|絕對|一定|必|重點|最/.test(text);`);
const mixEditStub = url(`export async function motionScoreAt() { return 0; }`);
const mod = await import(
  url(
    (await compile('highlightDetect.ts'))
      .replace("from './autoEffects'", `from '${autoEffectsStub}'`)
      .replace("from './mixEdit'", `from '${mixEditStub}'`)
      .replace("from './timeline'", `from '${timelineUrl}'`),
  )
);

const clip = (id, mediaId, inp, out) => ({ id, mediaId, in: inp, out, speed: 1, volume: 1 });
const cap = (id, start, end, text, extra = {}) => ({ id, start, end, text, style: {}, ...extra });
const media = (id) => ({ id, name: id, kind: 'video', url: `/${id}.mp4`, duration: 200 });

test('findHighlights：影片太短（不到一個半窗口）直接回傳空陣列', () => {
  return (async () => {
    const d = { clips: [clip('c1', 'm1', 0, 20)], captions: [], media: [media('m1')] };
    assert.deepEqual(await mod.findHighlights(d), []);
  })();
});

test('findHighlights：字幕密度與強調詞集中的時間窗分數較高，會被選中', async () => {
  const clips = [clip('c1', 'm1', 0, 100)];
  const media_ = [media('m1')];
  // 0-20s 跟 60-80s 附近塞滿強調詞字幕，中間平淡無字幕
  const captions = [
    cap('a', 2, 8, '這個真的太好吃了！竟然這麼便宜'),
    cap('b', 10, 16, '超推薦必吃的一家店'),
    cap('c', 65, 71, '最後這段畫面絕對會讓你驚訝'),
    cap('d', 73, 79, '一定要看到最後'),
  ];
  const result = await mod.findHighlights({ clips, captions, media: media_ }, 2);
  assert.ok(result.length > 0, '應該找到至少一段');
  // 選中的時間窗應該落在有強調詞字幕密集的區域附近
  assert.ok(result.some((r) => r.start < 20), '前段密集強調詞的窗口應該入選');
});

test('findHighlights：入選的候選彼此時間有間隔，不會擠在一起', async () => {
  const clips = [clip('c1', 'm1', 0, 100)];
  const media_ = [media('m1')];
  const captions = Array.from({ length: 10 }, (_, i) => cap(`c${i}`, i * 10, i * 10 + 8, '超級精彩絕對必看！'));
  const result = await mod.findHighlights({ clips, captions, media: media_ }, 3);
  for (let i = 1; i < result.length; i++) {
    assert.ok(result[i].start - result[i - 1].start >= 10, '候選之間應該有間隔');
  }
});

test('findHighlights：沒有字幕也沒有動態時（全部平淡）回傳空陣列', async () => {
  const clips = [clip('c1', 'm1', 0, 100)];
  const media_ = [media('m1')];
  const result = await mod.findHighlights({ clips, captions: [], media: media_ });
  assert.deepEqual(result, []);
});
