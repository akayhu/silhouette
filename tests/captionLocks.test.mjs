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
const clip = (id, out) => ({ id, mediaId: 'm', in: 0, out, speed: 1, volume: 1 });
const project = (caps, clips = [clip('c1', 10)]) => ({
  aspect: '9:16', media: [{ id: 'm', name: 'v', kind: 'video', url: '/v.mp4', duration: 10 }],
  clips, audio: [], captions: caps, stickers: [], overlays: [], duration: 10,
});

test('captionLanes：重疊的字幕分到不同列，不重疊的沿用同一列', () => {
  const lanes = timeline.captionLanes([cap('a', 0, 4), cap('b', 2, 6), cap('c', 10, 12)]);
  const byId = Object.fromEntries(lanes.map((r) => [r.c.id, r.lane]));
  assert.equal(byId.a, 0);
  assert.equal(byId.b, 1); // 跟 a 重疊，換列
  assert.equal(byId.c, 0); // 跟誰都沒重疊，沿用第 0 列
});

test('captionTrackKey／captionTrackKeys：第 0 列沿用舊的 "caption"，之後每列是獨立 key', () => {
  assert.equal(timeline.captionTrackKey(0), 'caption');
  assert.equal(timeline.captionTrackKey(1), 'caption-1');
  const keys = timeline.captionTrackKeys([cap('a', 0, 4), cap('b', 2, 6)]);
  assert.deepEqual(new Set(keys), new Set(['caption', 'caption-1']));
});

test('captionLocked／trackOf：只有字幕自己所在的列被鎖定時才算鎖定', () => {
  const data = project([cap('a', 0, 4), cap('b', 2, 6)]);
  data.locks = { 'caption-1': true }; // 只鎖第 1 列（b 所在的列）
  assert.equal(timeline.captionLocked(data, 'a'), false);
  assert.equal(timeline.captionLocked(data, 'b'), true);
  assert.equal(timeline.trackOf({ type: 'caption', id: 'a' }, data), 'caption');
  assert.equal(timeline.trackOf({ type: 'caption', id: 'b' }, data), 'caption-1');
});

test('removeItems：鎖定的那一列字幕刪不掉，沒鎖定的列照常刪除', () => {
  const data = project([cap('a', 0, 4), cap('b', 2, 6)], [clip('c1', 20)]);
  data.locks = { 'caption-1': true };
  const result = timeline.removeItems(data, [{ type: 'caption', id: 'a' }, { type: 'caption', id: 'b' }]);
  const ids = result.captions.map((c) => c.id);
  assert.ok(!ids.includes('a'), 'a 沒鎖定，應該被刪除');
  assert.ok(ids.includes('b'), 'b 所在的列被鎖定，不應該被刪除');
});

test('trimAt：鎖定的那一列字幕裁剪不動，沒鎖定的列照常裁剪', () => {
  const data = project([cap('a', 0, 4), cap('b', 2, 6)], [clip('c1', 20)]);
  data.locks = { 'caption-1': true };
  const { data: out, trimmed } = timeline.trimAt(
    data,
    [{ type: 'caption', id: 'a' }, { type: 'caption', id: 'b' }],
    3,
    'left',
  );
  assert.equal(trimmed, 1); // 只有 a 被裁剪
  assert.equal(out.captions.find((c) => c.id === 'a').start, 3);
  assert.equal(out.captions.find((c) => c.id === 'b').start, 2); // b 鎖定，維持原狀
});

test('rippleRemove（透過 removeItems 觸發剪主軌）：鎖定列的字幕不會跟著波紋移動', () => {
  // a(3-5) 與 b(4-8) 時間重疊，分到不同列：a 在第 0 列、b 在第 1 列
  const data = project([cap('a', 3, 5), cap('b', 4, 8)], [clip('x', 2), clip('c1', 10)]);
  data.locks = { 'caption-1': true }; // 只鎖 b 所在的第 1 列
  // 剪掉 0-2 秒的主軌片段，後面內容往前補 2 秒
  const result = timeline.removeItems(data, [{ type: 'clip', id: 'x' }]);
  const a = result.captions.find((c) => c.id === 'a');
  const b = result.captions.find((c) => c.id === 'b');
  assert.equal(a.start, 1); // 沒鎖定，跟著往前補 2 秒
  assert.equal(b.start, 4); // 鎖定，原封不動
});
