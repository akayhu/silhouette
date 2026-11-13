import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const formatUrl = url(await compile('format.ts'));
const captionsUrl = url((await compile('captions.ts')).replace("from './format'", `from '${formatUrl}'`));
const timelineUrl = url((await compile('timeline.ts')).replace("from './format'", `from '${formatUrl}'`).replace("from './captions'", `from '${captionsUrl}'`));
const { planBroll, brollCandidates } = await import(
  url((await compile('autoBroll.ts')).replace("from './format'", `from '${formatUrl}'`).replace("from './timeline'", `from '${timelineUrl}'`))
);

const style = { font: 'Arial', size: 80, color: '#fff', stroke: '#000', background: null, bold: true, y: 0.8, animation: 'none' };
const talk = { id: 'talk', name: '口播', kind: 'video', url: 'a', duration: 30 };
const roll = (id, duration = 5) => ({ id, name: id, kind: 'video', url: id, duration });
const base = (extra = {}) => ({
  aspect: '9:16',
  media: [talk, roll('r1'), roll('r2')],
  clips: [{ id: 'c1', mediaId: 'talk', in: 0, out: 30, speed: 1, volume: 1 }],
  audio: [], captions: [{ id: 'k', start: 0, end: 30, text: '一直在講話', style }], stickers: [], overlays: [], markers: [], duration: 30,
  ...extra,
});

test('只有沒用到的影片／圖片才算空鏡候選', () => {
  const d = base({ media: [talk, roll('r1'), { id: 'a', name: 'a', kind: 'audio', url: 'a', duration: 9 }, roll('short', 0.3)] });
  assert.deepEqual(brollCandidates(d).map((m) => m.id), ['r1']);
});

test('口播講話時蓋上空鏡：全螢幕、靜音、不蓋開場與結尾、彼此有間隔', () => {
  const { data, placed } = planBroll(base());
  assert.ok(placed >= 2);
  const os = data.overlays.filter((o) => o.role === 'broll');
  assert.equal(os.length, placed);
  for (const o of os) {
    assert.equal(o.volume, 0);
    assert.equal(o.transform.fit, 'cover');
    assert.equal(o.transform.scale, 1);
    assert.ok(o.start >= 2.5 && o.start + (o.out - o.in) <= 30 - 1.5 + 1e-9);
  }
  for (let i = 1; i < os.length; i++) assert.ok(os[i].start - (os[i - 1].start + (os[i - 1].out - os[i - 1].in)) >= 4 - 1e-9);
});

test('空鏡輪流使用不同素材', () => {
  const { data } = planBroll(base());
  assert.deepEqual(data.overlays.slice(0, 2).map((o) => o.mediaId), ['r1', 'r2']);
});

test('沒有空鏡素材、或影片太短就不動', () => {
  assert.equal(planBroll(base({ media: [talk] })).placed, 0);
  const short = base({ clips: [{ id: 'c1', mediaId: 'talk', in: 0, out: 4, speed: 1, volume: 1 }] });
  assert.equal(planBroll(short).placed, 0);
});

test('重新套用只換掉自動加的空鏡，使用者自己疊的疊加不動', () => {
  const mine = { id: 'mine', mediaId: 'r1', start: 0, in: 0, out: 2, speed: 1, volume: 1, lane: 0, opacity: 1 };
  const once = planBroll(base({ overlays: [mine] })).data;
  const twice = planBroll(once).data;
  assert.equal(twice.overlays.filter((o) => o.role === 'broll').length, once.overlays.filter((o) => o.role === 'broll').length);
  assert.ok(twice.overlays.some((o) => o.id === 'mine'));
});

test('疊加軌鎖定時不動；主軌是圖片的地方不蓋', () => {
  assert.equal(planBroll(base({ locks: { overlay: true } })).placed, 0);
  const img = { id: 'img', name: 'img', kind: 'image', url: 'i', duration: 3 };
  const d = base({ media: [talk, img, roll('r1')], clips: [{ id: 'c0', mediaId: 'img', in: 0, out: 30, speed: 1, volume: 1 }] });
  assert.equal(planBroll(d).placed, 0);
});

test('只講在有字幕的時段：字幕中間有大空檔時不蓋在沒人講話的地方', () => {
  const d = base({ captions: [{ id: 'a', start: 0, end: 6, text: 'x', style }, { id: 'b', start: 20, end: 26, text: 'y', style }] });
  const { data } = planBroll(d);
  for (const o of data.overlays.filter((x) => x.role === 'broll')) {
    assert.ok((o.start >= 0 && o.start + 3 <= 6.5) || (o.start >= 20 && o.start + 3 <= 26.5), `空鏡在 ${o.start} 不在說話時段`);
  }
});
