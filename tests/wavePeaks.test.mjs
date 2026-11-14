import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const code = stripTypeScriptTypes(await readFile(new URL('../src/lib/wavePeaks.ts', import.meta.url), 'utf8'));
const { peaksFromSamples, barsFor, displayHeight, PEAKS_PER_SECOND } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

test('取樣資料算出每秒固定數量的峰值，靜音是 0、滿格是 1', () => {
  const sr = 8000;
  const samples = new Float32Array(sr * 2);
  samples.fill(0.5, sr, sr * 2); // 第 2 秒有聲音
  const peaks = peaksFromSamples(samples, sr);
  assert.equal(peaks.length, PEAKS_PER_SECOND * 2);
  assert.ok(peaks.slice(0, PEAKS_PER_SECOND).every((p) => p === 0));
  assert.ok(peaks.slice(PEAKS_PER_SECOND).every((p) => Math.abs(p - 0.5) < 1e-6));
  assert.equal(peaksFromSamples(Float32Array.of(2, -3), 8000)[0], 1);
});

test('只取片段用到的範圍：入點之前、出點之後的聲音不會畫出來', () => {
  const peaks = [...Array(20).fill(0.1), ...Array(20).fill(0.9), ...Array(20).fill(0.1)]; // 3 秒，中間 1 秒大聲
  const loud = barsFor(peaks, 20, 1, 2, 10);
  assert.ok(loud.every((b) => b === 0.9));
  const quiet = barsFor(peaks, 20, 0, 1, 10);
  assert.ok(quiet.every((b) => b === 0.1));
});

test('條數依畫面寬度決定；範圍或資料不合理時回傳空陣列', () => {
  const peaks = Array.from({ length: 100 }, (_, i) => i / 100);
  assert.equal(barsFor(peaks, 20, 0, 5, 37).length, 37);
  assert.deepEqual(barsFor([], 20, 0, 5, 10), []);
  assert.deepEqual(barsFor(peaks, 20, 3, 3, 10), []);
  assert.deepEqual(barsFor(peaks, 20, 0, 5, 0), []);
});

test('一條涵蓋多個峰值時取最大的，不會把突起的聲音平均掉', () => {
  const peaks = [0.1, 0.1, 0.8, 0.1];
  assert.deepEqual(barsFor(peaks, 1, 0, 4, 1), [0.8]);
});

test('粗略波形（素材附帶的 48 條）也能用：每秒幾個值由呼叫端算', () => {
  const coarse = Array.from({ length: 48 }, (_, i) => (i < 24 ? 0.2 : 1));
  const bars = barsFor(coarse, 48 / 60, 30, 60, 6);
  assert.ok(bars.every((b) => b === 1));
});

test('波形高度跟著音量縮放，但有下限', () => {
  assert.equal(displayHeight(1, 1), 1);
  assert.ok(displayHeight(1, 0.5) < displayHeight(1, 1));
  assert.ok(displayHeight(1, 0) >= 0.2);
});
