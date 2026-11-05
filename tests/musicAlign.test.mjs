import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const formatUrl = url(await compile('format.ts'));
const captionsUrl = url((await compile('captions.ts')).replace("from './format'", `from '${formatUrl}'`));
const timelineUrl = url(
  (await compile('timeline.ts')).replace("from './format'", `from '${formatUrl}'`).replace("from './captions'", `from '${captionsUrl}'`),
);
const { findPeakMoment, firstHighlightTime, alignedTrackOffset } = await import(
  url((await compile('musicAlign.ts')).replace("from './timeline'", `from '${timelineUrl}'`))
);

const clip = (id, out, motion) => ({ id, mediaId: 'm', in: 0, out, speed: 1, volume: 1, ...(motion ? { motion } : {}) });

test('findPeakMoment：找出 peaks 裡能量最高窗口的中點秒數', () => {
  // 32 個取樣點，代表 40 秒的曲子；中後段（約 25-30 秒處）是高潮
  const peaks = Array.from({ length: 32 }, (_, i) => (i >= 20 && i < 24 ? 0.9 : 0.1));
  const time = findPeakMoment({ peaks, duration: 40 });
  assert.ok(time > 22 && time < 32, `預期高潮落在 22-32 秒附近，實際 ${time}`);
});

test('沒有 peaks 資料時回傳 0', () => {
  assert.equal(findPeakMoment({ peaks: [], duration: 40 }), 0);
  assert.equal(findPeakMoment({ peaks: undefined, duration: 40 }), 0);
});

test('firstHighlightTime：找出第一個 punch／shake 片段的開始時間', () => {
  const clips = [clip('a', 4), clip('b', 4, 'punch'), clip('c', 4, 'shake')];
  assert.equal(firstHighlightTime(clips), 4); // b 從第 4 秒開始
});

test('firstHighlightTime：可以指定從某個時間點之後開始找', () => {
  const clips = [clip('a', 4, 'punch'), clip('b', 4), clip('c', 4, 'shake')];
  assert.equal(firstHighlightTime(clips, 5), 8); // 跳過第一段的 punch，從 c 找到
});

test('firstHighlightTime：完全沒有重點特寫時回傳 null', () => {
  assert.equal(firstHighlightTime([clip('a', 4), clip('b', 4)]), null);
});

test('alignedTrackOffset：沒有重點特寫時回傳 0，維持原本從頭播放', () => {
  const peaks = Array.from({ length: 20 }, () => 0.5);
  const offset = alignedTrackOffset({ peaks, duration: 30 }, [clip('a', 10)], 0);
  assert.equal(offset, 0);
});

test('alignedTrackOffset：讓配樂高潮對齊第一個重點特寫', () => {
  // 曲子高潮在第 10 秒（40 個取樣點、第 20-22 個取樣點是高潮，對應約 10 秒處）
  const peaks = Array.from({ length: 40 }, (_, i) => (i >= 19 && i < 23 ? 0.9 : 0.1));
  const clips = [clip('a', 6), clip('b', 6, 'punch')]; // 重點特寫從第 6 秒開始
  const offset = alignedTrackOffset({ peaks, duration: 40 }, clips, 0);
  // 播放頭在第 0 秒加入，第 6 秒要聽到高潮，所以要從「高潮時間 - 6」秒開始播
  const peakMoment = findPeakMoment({ peaks, duration: 40 });
  assert.ok(Math.abs(offset - (peakMoment - 6)) < 0.01);
  assert.ok(offset >= 0);
});
