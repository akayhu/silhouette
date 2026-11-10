import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const format = url(await compile('format.ts'));
const captionsUrl = url((await compile('captions.ts')).replace("from './format'", `from '${format}'`));
const timelineUrl = url((await compile('timeline.ts')).replace("from './format'", `from '${format}'`).replace("from './captions'", `from '${captionsUrl}'`));
const mod = await import(url((await compile('splitLayout.ts')).replace("from './timeline'", `from '${timelineUrl}'`)));

const W = 1080;
const H = 1920;

test('regionTransform：區域剛好是整個畫布時，置中、縮放是 cover 基準（scale=1）', () => {
  const tf = mod.regionTransform({ x: 0, y: 0, w: W, h: H }, 1920, 1080, W, H);
  assert.equal(tf.x, 0);
  assert.equal(tf.y, 0);
  assert.ok(Math.abs(tf.scale - 1) < 1e-9);
  assert.equal(tf.fit, 'cover');
});

test('regionTransform：上半部區域，中心點在 1/4 高度、縮放比例比整版小', () => {
  const region = { x: 0, y: 0, w: W, h: H / 2 };
  const tf = mod.regionTransform(region, 1920, 1080, W, H);
  assert.ok(Math.abs(tf.y - (-0.25)) < 1e-9, `y 應該是 -0.25，實際 ${tf.y}`);
  assert.equal(tf.x, 0);
  assert.ok(tf.scale < 1, '只填半個畫面需要的縮放應該比整版小');
});

test('regionTransform：子母畫面右下角區域，中心點偏右下', () => {
  const region = { x: W * 0.58, y: H * 0.58, w: W * 0.38, h: H * 0.38 };
  const tf = mod.regionTransform(region, 1920, 1080, W, H);
  assert.ok(tf.x > 0 && tf.y > 0, '右下角區域的中心點應該在畫面中心的右下方');
});

test('splitTransforms：上下對分套用時，主軌跟疊加各自對應不重疊的半邊', () => {
  const preset = { id: 'top-bottom', name: '上下對分', main: (w, h) => ({ x: 0, y: 0, w, h: h / 2 }), overlay: (w, h) => ({ x: 0, y: h / 2, w, h: h / 2 }) };
  const { main, overlay } = mod.splitTransforms(preset, '9:16', { w: 1920, h: 1080 }, { w: 1920, h: 1080 });
  assert.ok(main.y < 0, '主軌（上半部）中心點應該在畫面中心上方');
  assert.ok(overlay.y > 0, '疊加（下半部）中心點應該在畫面中心下方');
  assert.ok(Math.abs(main.y + overlay.y) < 1e-9, '上下對分兩半應該對稱');
});

test('SPLIT_PRESETS：每個版型都有唯一的 id', () => {
  const ids = mod.SPLIT_PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('regionTransform：一定帶 clipRegion，且換算成 0–1 比例正確；避免來源長寬比跟區域差很多時蓋到隔壁區域', () => {
  // 一支很寬的橫向素材（模擬手機橫錄），放進左右對分的「左半邊」窄直欄
  const region = { x: 0, y: 0, w: W / 2, h: H };
  const tf = mod.regionTransform(region, 1920, 1080, W, H);
  assert.deepEqual(tf.clipRegion, { x: 0, y: 0, w: 0.5, h: 1 });
  // 即使來源很寬、cover 縮放後畫面會超出窄欄，clipRegion 仍然精準只保留左半邊
  assert.equal(tf.clipRegion.x + tf.clipRegion.w, 0.5);
});

test('splitTransforms：子母畫面版型的 clipRegion 跟版型定義的區域一致', () => {
  const preset = mod.SPLIT_PRESETS.find((p) => p.id === 'pip-br');
  const { overlay } = mod.splitTransforms(preset, '9:16', { w: 1080, h: 1920 }, { w: 1080, h: 1920 });
  assert.ok(Math.abs(overlay.clipRegion.x - 0.58) < 1e-9);
  assert.ok(Math.abs(overlay.clipRegion.w - 0.38) < 1e-9);
});
