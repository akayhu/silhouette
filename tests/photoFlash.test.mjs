import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const formatUrl = url(await compile('format.ts'));
const captionsUrl = url((await compile('captions.ts')).replace("from './format'", `from '${formatUrl}'`));
const timelineUrl = url((await compile('timeline.ts')).replace("from './format'", `from '${formatUrl}'`).replace("from './captions'", `from '${captionsUrl}'`));
const filtersUrl = url(await compile('filters.ts'));
const { planPhotoFlash, photoFlashPhotos, pickFlashMusic } = await import(
  url((await compile('photoFlash.ts')).replace("from './filters'", `from '${filtersUrl}'`).replace("from './format'", `from '${formatUrl}'`).replace("from './timeline'", `from '${timelineUrl}'`))
);
const { layoutMain, mainDuration } = await import(timelineUrl);

const img = (id) => ({ id, name: id, kind: 'image', url: id, duration: 3 });
const vid = (id) => ({ id, name: id, kind: 'video', url: id, duration: 30 });
const track = (id, bpm, category = 'music') => ({ id, title: id, category, mood: 'x', bpm, desc: '', duration: 10, url: '/m/' + id, peaks: [] });
const lib = [track('slow', 70), track('mid', 118), track('fast', 140), track('sfx', 120, 'sfx')];
const photoClip = (id, mediaId) => ({ id, mediaId, in: 0, out: 3, speed: 1, volume: 1 });
const base = (extra = {}) => ({
  aspect: '9:16', media: [img('p1'), img('p2'), img('p3'), img('p4')],
  clips: ['p1', 'p2', 'p3', 'p4'].map((m, i) => photoClip('c' + i, m)),
  audio: [], captions: [], stickers: [], overlays: [], markers: [], duration: 12, ...extra,
});
const opts = { secondsPerPhoto: 1, softFilter: true, music: true };

test('每張照片 1 秒、慢慢放大，換張閃白（第一張沒有轉場）', () => {
  const r = planPhotoFlash(base(), lib, opts);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.clips.map((c) => c.out - c.in), [1, 1, 1, 1]);
  assert.ok(r.data.clips.every((c) => c.motion === 'zoomIn'));
  assert.equal(r.data.clips[0].transition, undefined);
  assert.ok(r.data.clips.slice(1).every((c) => c.transition.type === 'flash' && c.transition.duration <= 0.4 + 1e-9));
  assert.ok(Math.abs(r.duration - mainDuration(r.data.clips)) < 1e-9);
  assert.equal(layoutMain(r.data.clips).length, 4);
});

test('柔和色調可以關掉；開啟時每張都套奶油色調', () => {
  assert.ok(planPhotoFlash(base(), lib, opts).data.clips.every((c) => c.filter.preset === 'cream'));
  assert.ok(planPhotoFlash(base(), lib, { ...opts, softFilter: false }).data.clips.every((c) => !c.filter));
});

test('配樂挑節奏最接近 120 的音樂（不挑音效），蓋滿整支影片、結尾淡出', () => {
  assert.equal(pickFlashMusic(lib).id, 'mid');
  const r = planPhotoFlash(base({ clips: Array.from({ length: 30 }, (_, i) => photoClip('c' + i, 'p1')) }), lib, opts);
  const songs = r.data.audio.filter((a) => a.role === 'template');
  assert.ok(songs.length >= 2);
  const end = Math.max(...songs.map((a) => a.start + (a.out - a.in)));
  assert.ok(Math.abs(end - r.duration) < 1e-6);
  assert.ok(songs.at(-1).fadeOut > 0);
});

test('重新套用只換掉上次配的快閃音樂，使用者自己加的音訊不動', () => {
  const mine = { id: 'mine', mediaId: 'p1', start: 0, in: 0, out: 5, volume: 1 };
  const once = planPhotoFlash(base({ audio: [mine] }), lib, opts).data;
  const twice = planPhotoFlash(once, lib, opts).data;
  assert.equal(twice.audio.filter((a) => a.role === 'template').length, once.audio.filter((a) => a.role === 'template').length);
  assert.ok(twice.audio.some((a) => a.id === 'mine'));
});

test('主軌有影片時不套用並說明原因；主軌鎖定也不動', () => {
  const withVideo = base({ media: [img('p1'), vid('v')], clips: [photoClip('c0', 'p1'), { id: 'c1', mediaId: 'v', in: 0, out: 10, speed: 1, volume: 1 }] });
  const r = planPhotoFlash(withVideo, lib, opts);
  assert.equal(r.ok, false);
  assert.match(r.reason, /照片/);
  assert.equal(planPhotoFlash(base({ locks: { main: true } }), lib, opts).ok, false);
});

test('主軌是空的時，改用素材庫裡還沒用到的照片排進去', () => {
  const d = base({ clips: [], overlays: [{ id: 'o', mediaId: 'p4', start: 0, in: 0, out: 2, speed: 1, volume: 0, lane: 0, opacity: 1 }] });
  assert.deepEqual(photoFlashPhotos(d).map((m) => m.id), ['p1', 'p2', 'p3']);
  const r = planPhotoFlash(d, lib, opts);
  assert.equal(r.ok, true);
  assert.equal(r.photos, 3);
  assert.equal(planPhotoFlash(base({ media: [], clips: [] }), lib, opts).ok, false);
});

test('停留秒數有上下限', () => {
  assert.equal(planPhotoFlash(base(), lib, { ...opts, secondsPerPhoto: 0.01 }).data.clips[0].out, 0.4);
  assert.equal(planPhotoFlash(base(), lib, { ...opts, secondsPerPhoto: 99 }).data.clips[0].out, 3);
});
