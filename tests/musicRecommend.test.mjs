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
const { recommendMusic } = await import(url((await compile('musicRecommend.ts')).replace("from './timeline'", `from '${timelineUrl}'`)));

const style = { font: 'Arial', size: 80, color: '#fff', stroke: '#000', background: null, bold: true, y: .8, animation: 'none' };
const caption = (text, start, end) => ({ id: `c-${start}`, start, end, text, style });
const clip = (id, start, end) => ({ id, mediaId: 'm', start, in: 0, out: end - start, source: { duration: end - start } });

const track = (id, mood, bpm) => ({
  id, title: id, category: 'music', mood, bpm, desc: '', duration: 60, url: `/music/${id}.m4a`, peaks: [],
});
const library = [
  track('sunny-morning', '輕快', 120),
  track('warm-memories', '溫馨', 72),
  track('mystery-step', '懸疑', 90),
  track('zen-garden', '氛圍', 62),
];

test('依字幕關鍵字猜氣氛：旅行主題的字幕推薦「輕快」風格的配樂排在最前面', () => {
  const data = {
    captions: [caption('今天來去海邊走走，順便吃個海鮮大餐', 0, 4), caption('天氣超好，出遊心情也變好了', 4, 8)],
    clips: [clip('v1', 0, 8)],
  };
  const result = recommendMusic(data, library);
  assert.ok(result.length > 0);
  assert.equal(result[0].track.id, 'sunny-morning');
  assert.match(result[0].reason, /輕快/);
});

test('依字幕關鍵字猜氣氛：家庭回憶主題推薦「溫馨」風格', () => {
  const data = {
    captions: [caption('謝謝你一直陪在我身邊，這段回憶我會記得', 0, 5)],
    clips: [clip('v1', 0, 5)],
  };
  const result = recommendMusic(data, library);
  assert.equal(result[0].track.id, 'warm-memories');
});

test('沒有字幕內容可以猜氣氛時，改用語速猜節奏：講話很慢、留白多就推薦低 bpm 的配樂', () => {
  // 10 秒的影片只有 2 個字的字幕，語速極慢
  const data = {
    captions: [caption('嗯…', 0, 10)],
    clips: [clip('v1', 0, 10)],
  };
  const result = recommendMusic(data, library, library.length);
  // 低 bpm（氛圍 62、溫馨 72）應該排在高 bpm（輕快 120）前面
  const order = result.map((r) => r.track.id);
  assert.ok(order.indexOf('zen-garden') < order.indexOf('sunny-morning'));
});

test('只回傳配樂（music），不會混入音效（sfx）；最多回傳指定數量', () => {
  const sfxTrack = { id: 'whoosh', title: 'whoosh', category: 'sfx', mood: '音效', bpm: null, desc: '', duration: 1, url: '/x.m4a', peaks: [] };
  const data = { captions: [caption('出去玩真開心', 0, 2)], clips: [clip('v1', 0, 2)] };
  const result = recommendMusic(data, [...library, sfxTrack], 2);
  assert.equal(result.length, 2);
  assert.ok(result.every((r) => r.track.category === 'music'));
});
