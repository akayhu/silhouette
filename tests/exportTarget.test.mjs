import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const code = stripTypeScriptTypes(await readFile(new URL('../src/lib/exportBitrate.ts', import.meta.url), 'utf8'));
const { planTargetSize, videoBitrate, estimateSize, MIN_VIDEO_BPS } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const MB = 1024 * 1024;
const s1080 = { quality: 1080, bitrate: 'standard', fps: 30 };

test('目標比原本預估還大：不用動畫質', () => {
  const p = planTargetSize(s1080, 10, 100 * MB);
  assert.equal(p.feasible, true);
  assert.equal(p.capBps, undefined);
});

test('目標比預估小但壓得進去：算出位元率上限，預估大小不超過目標', () => {
  const p = planTargetSize(s1080, 60, 25 * MB);
  assert.equal(p.feasible, true);
  assert.ok(p.capBps < videoBitrate(s1080) && p.capBps >= MIN_VIDEO_BPS);
  assert.ok(estimateSize({ ...s1080, capBps: p.capBps }, 60) <= 25 * MB);
  assert.ok(p.estimate <= 25 * MB);
});

test('影片太長壓不進目標：回報辦不到並告知最小大小，不偷偷降到更低', () => {
  const p = planTargetSize(s1080, 3600, 10 * MB);
  assert.equal(p.feasible, false);
  assert.equal(p.capBps, MIN_VIDEO_BPS);
  assert.ok(p.minBytes > 10 * MB);
});

test('capBps 只會往下限制，不會把位元率拉高', () => {
  assert.equal(videoBitrate({ ...s1080, bitrate: 'small', capBps: 99_000_000 }), videoBitrate({ ...s1080, bitrate: 'small' }));
  assert.equal(videoBitrate({ ...s1080, capBps: 1_000_000 }), 1_000_000);
});
