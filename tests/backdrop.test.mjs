import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const code = stripTypeScriptTypes(await readFile(new URL('../src/lib/backdrop.ts', import.meta.url), 'utf8'));
const { BACKDROP_PRESETS, backdropId, drawBackdrop } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

const fakeCtx = () => {
  const calls = [];
  const rec = (name) => (...args) => calls.push([name, ...args]);
  return { calls, fillStyle: null, fillRect: rec('fillRect'), beginPath: rec('beginPath'), moveTo: rec('moveTo'), arc: rec('arc'), fill: rec('fill'), createLinearGradient: (...a) => ({ stops: [], addColorStop(o, c) { this.stops.push([o, c]); }, a }) };
};

test('沒有設定背景就是模糊放大；每個預設都能認回自己', () => {
  assert.equal(backdropId(undefined), 'blur');
  for (const p of BACKDROP_PRESETS) assert.equal(backdropId(p.value ?? undefined), p.id);
  assert.equal(backdropId({ style: 'solid', color: '#123456' }), 'custom');
});

test('純色只鋪滿一次；漸層用兩個顏色', () => {
  const solid = fakeCtx();
  drawBackdrop(solid, { style: 'solid', color: '#000' }, 540, 960);
  assert.deepEqual(solid.calls, [['fillRect', 0, 0, 540, 960]]);
  const grad = fakeCtx();
  drawBackdrop(grad, { style: 'gradient', color: '#f00', color2: '#00f' }, 540, 960);
  assert.deepEqual(grad.fillStyle.stops, [[0, '#f00'], [1, '#00f']]);
});

test('圓點鋪滿整個畫面，大小跟著畫面寬度（預覽和匯出看起來一樣）', () => {
  const count = (w, h) => {
    const c = fakeCtx();
    drawBackdrop(c, { style: 'dots', color: '#111', color2: '#333' }, w, h);
    return c.calls.filter((x) => x[0] === 'arc');
  };
  const small = count(540, 960);
  const big = count(1080, 1920);
  assert.equal(small.length, big.length);
  assert.ok(small.some(([, x, y]) => x > 500 && y > 900));
  assert.ok(Math.abs(big[0][3] - small[0][3] * 2) < 1e-9);
});
