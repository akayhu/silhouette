import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const formatUrl = url(await compile('format.ts'));
const captionsUrl = url((await compile('captions.ts')).replace("from './format'", `from '${formatUrl}'`));
const timeline = await import(
  url((await compile('timeline.ts')).replace("from './format'", `from '${formatUrl}'`).replace("from './captions'", `from '${captionsUrl}'`))
);

const style = { font: 'Arial', size: 80, color: '#fff', stroke: '#000', background: null, bold: true, y: .8, animation: 'none' };
const cap = (id, start, end, extra = {}) => ({ id, start, end, text: `字幕${id}`, style, ...extra });
const media = (id, origin) => ({ id, name: id, kind: 'audio', url: `/${id}.wav`, duration: 100, origin });
const audio = (id, mediaId, start, out) => ({ id, mediaId, start, in: 0, out, volume: 1 });

test('voiceActivityRanges：非花字字幕算人聲，花字不算', () => {
  const d = { captions: [cap('a', 0, 2), cap('f', 1, 3, { role: 'flower' })], audio: [], media: [] };
  const ranges = timeline.voiceActivityRanges(d);
  assert.deepEqual(ranges, [{ start: 0, end: 2 }]);
});

test('voiceActivityRanges：朗讀／錄音的音訊片段也算人聲，音樂／音效不算', () => {
  const d = {
    captions: [],
    audio: [audio('v', 'm-voice', 5, 3), audio('m', 'm-music', 0, 10), audio('s', 'm-sfx', 20, 1)],
    media: [media('m-voice', 'tts'), media('m-music', 'library'), media('m-sfx', 'library')],
  };
  // sfx 的 url 需要符合 /music/sfx- 規則才會被判定成音效，這裡故意改網址測試分類邏輯本身不受影響於本測試重點（人聲），只檢查 voice 有被抓到、music 沒被抓到
  const ranges = timeline.voiceActivityRanges(d);
  assert.deepEqual(ranges, [{ start: 5, end: 8 }]);
});

test('voiceActivityRanges：間隔很近的幾段人聲會合併成一段', () => {
  const d = { captions: [cap('a', 0, 2), cap('b', 2.2, 4)], audio: [], media: [] };
  const ranges = timeline.voiceActivityRanges(d);
  assert.deepEqual(ranges, [{ start: 0, end: 4 }]);
});

test('voiceActivityRanges：間隔夠遠的幾段人聲維持分開', () => {
  const d = { captions: [cap('a', 0, 2), cap('b', 5, 7)], audio: [], media: [] };
  const ranges = timeline.voiceActivityRanges(d);
  assert.deepEqual(ranges, [{ start: 0, end: 2 }, { start: 5, end: 7 }]);
});

test('duckGainAt：人聲範圍內完全閃避，範圍外maintain原音量，邊界有淡入淡出', () => {
  const ranges = [{ start: 5, end: 10 }];
  assert.equal(timeline.duckGainAt(ranges, 0), 1); // 遠離人聲，原音量
  assert.equal(timeline.duckGainAt(ranges, 7), timeline.DUCK_AMOUNT); // 人聲正中間，完全閃避
  assert.equal(timeline.duckGainAt(ranges, 20), 1); // 人聲結束很久之後，回到原音量
  // 邊界附近：介於原音量跟閃避音量之間（淡入淡出）
  const edge = timeline.duckGainAt(ranges, 4.9);
  assert.ok(edge > timeline.DUCK_AMOUNT && edge < 1, `邊界值應該在閃避與原音量之間，實際 ${edge}`);
});

test('duckGainAt：沒有人聲範圍時永遠是原音量', () => {
  assert.equal(timeline.duckGainAt([], 5), 1);
});
