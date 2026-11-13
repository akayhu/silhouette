import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const formatUrl = url(await compile('format.ts'));
const captionsUrl = url((await compile('captions.ts')).replace("from './format'", `from '${formatUrl}'`));
const timelineUrl = url((await compile('timeline.ts')).replace("from './format'", `from '${formatUrl}'`).replace("from './captions'", `from '${captionsUrl}'`));
const { sliceProject } = await import(url((await compile('highlightClip.ts')).replace("from './timeline'", `from '${timelineUrl}'`)));
const { layoutMain, mainDuration } = await import(timelineUrl);

const style = { font: 'Arial', size: 80, color: '#fff', stroke: '#000', background: null, bold: true, y: 0.8, animation: 'none' };
const media = (id, kind = 'video', duration = 100) => ({ id, name: id, kind, url: id, duration });
const base = (extra = {}) => ({
  aspect: '9:16',
  media: [media('v'), media('song', 'audio', 200), media('b', 'image', 3), media('unused')],
  clips: [{ id: 'c1', mediaId: 'v', in: 0, out: 100, speed: 1, volume: 1 }],
  audio: [{ id: 'a1', mediaId: 'song', start: 0, in: 0, out: 100, volume: 0.3, fadeIn: 0.6 }],
  captions: [
    { id: 'k0', start: 5, end: 8, text: '前面的字幕', style },
    { id: 'k1', start: 42, end: 46, text: '範圍內的字幕', style },
    { id: 'k2', start: 58, end: 64, text: '跨過結尾的字幕', style },
    { id: 'k3', start: 80, end: 85, text: '後面的字幕', style },
  ],
  stickers: [{ id: 's1', stickerId: 'x', start: 44, end: 47, x: 0.5, y: 0.2, scale: 1, rotation: 0, opacity: 1, animation: 'none' }, { id: 's2', stickerId: 'x', start: 90, end: 93, x: 0.5, y: 0.2, scale: 1, rotation: 0, opacity: 1, animation: 'none' }],
  overlays: [{ id: 'o1', mediaId: 'b', start: 50, in: 0, out: 3, speed: 1, volume: 0, lane: 0, opacity: 1 }, { id: 'o2', mediaId: 'b', start: 20, in: 0, out: 3, speed: 1, volume: 0, lane: 0, opacity: 1 }],
  markers: [{ id: 'm', time: 45, label: 'x' }], locks: { caption: true }, duration: 100,
  ...extra,
});

test('主軌只留下範圍內的畫面，長度正好是範圍長度，入點對應原本的位置', () => {
  const d = sliceProject(base(), 40, 60);
  assert.equal(d.clips.length, 1);
  assert.equal(d.clips[0].in, 40);
  assert.equal(d.clips[0].out, 60);
  assert.ok(Math.abs(mainDuration(d.clips) - 20) < 1e-9);
});

test('字幕與貼紙：只留範圍內的、時間往前移；跨界的被裁到範圍內', () => {
  const d = sliceProject(base(), 40, 60);
  const ids = d.captions.map((c) => c.id);
  assert.deepEqual(ids, ['k1', 'k2']);
  assert.equal(d.captions[0].start, 2);
  assert.ok(d.captions[1].end <= 20 + 1e-9);
  assert.deepEqual(d.stickers.map((s) => s.id), ['s1']);
  assert.equal(d.stickers[0].start, 4);
});

test('配樂跟著裁：從範圍起點對應的位置開始播，不會從頭播', () => {
  const d = sliceProject(base(), 40, 60);
  assert.equal(d.audio.length, 1);
  assert.equal(d.audio[0].start, 0);
  assert.equal(d.audio[0].in, 40);
  assert.equal(d.audio[0].out, 60);
  assert.equal(d.audio[0].fadeIn, 0);
  assert.ok(d.audio[0].fadeOut > 0);
});

test('疊加（空鏡）只留範圍內的；範圍外的丟掉；用不到的素材不帶過去', () => {
  const d = sliceProject(base(), 40, 60);
  assert.deepEqual(d.overlays.map((o) => o.id), ['o1']);
  assert.equal(d.overlays[0].start, 10);
  assert.deepEqual(d.media.map((m) => m.id).sort(), ['b', 'song', 'v']);
});

test('不帶標記、封面與鎖定；不改動原專案；整體長度等於範圍', () => {
  const input = base({ cover: { time: 45 } });
  const before = JSON.stringify(input);
  const d = sliceProject(input, 40, 60);
  assert.deepEqual(d.markers, []);
  assert.equal(d.cover, undefined);
  assert.equal(d.locks, undefined);
  assert.equal(JSON.stringify(input), before);
  assert.ok(Math.abs(d.duration - 20) < 0.5);
});

test('有轉場、變速的主軌：範圍切在片段中間也對得上', () => {
  const clips = [
    { id: 'c1', mediaId: 'v', in: 0, out: 30, speed: 1, volume: 1 },
    { id: 'c2', mediaId: 'v', in: 30, out: 90, speed: 2, volume: 1, transition: { type: 'fade', duration: 0.5 } },
  ];
  const d = sliceProject(base({ clips, audio: [], overlays: [], stickers: [], captions: [] }), 20, 50);
  const placed = layoutMain(d.clips);
  assert.ok(Math.abs(placed[placed.length - 1].end - 30) < 0.6);
  assert.ok(d.clips.every((c) => c.out > c.in));
});
