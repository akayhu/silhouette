import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const code = stripTypeScriptTypes(await readFile(new URL('../src/lib/exportCheckCore.ts', import.meta.url), 'utf8'));
const { meanLuma, frameIssues, audioStats, audioIssues } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

const px = (r, g, b, n = 4) => Array.from({ length: n }, () => [r, g, b, 255]).flat();
const wave = (amp, n = 4800) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(i / 10));

test('平均亮度：全黑 0、全白 255、紅綠藍依人眼權重', () => {
  assert.equal(meanLuma(px(0, 0, 0)), 0);
  assert.ok(Math.abs(meanLuma(px(255, 255, 255)) - 255) < 1e-9);
  assert.ok(meanLuma(px(0, 255, 0)) > meanLuma(px(255, 0, 0)));
  assert.equal(meanLuma([]), 0);
});

test('畫面和預覽差不多：沒有問題（含免費版浮水印造成的小差異）', () => {
  assert.deepEqual(frameIssues([{ t: 1, out: 120, src: 118 }, { t: 5, out: 80, src: 92 }]), []);
});

test('預覽有畫面、匯出卻全黑：整支都黑時是 error', () => {
  const r = frameIssues([1, 5, 9].map((t) => ({ t, out: 2, src: 110 })));
  assert.equal(r.length, 1);
  assert.equal(r[0].level, 'error');
});

test('只有部分時間點對不上：warn，說出大約的時間；預覽本來就是黑的不算', () => {
  const r = frameIssues([{ t: 3, out: 100, src: 100 }, { t: 65, out: 3, src: 120 }, { t: 9, out: 90, src: 92 }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].level, 'warn');
  assert.match(r[0].text, /1:05/);
  assert.match(r[0].text, /黑畫面/);
  assert.deepEqual(frameIssues([{ t: 1, out: 2, src: 3 }, { t: 2, out: 90, src: 92 }]), []);
});

test('聲音：有預期聲音卻整段靜音要提醒；本來就沒聲音就不提醒', () => {
  const silent = audioStats(new Float32Array(4800));
  assert.equal(audioIssues(silent, true).length, 1);
  assert.deepEqual(audioIssues(silent, false), []);
  assert.deepEqual(audioIssues(audioStats(wave(0.4)), true), []);
});

test('找不到音軌：有預期聲音才提醒', () => {
  assert.equal(audioIssues(null, true).length, 1);
  assert.deepEqual(audioIssues(null, false), []);
});

test('爆音：被削平的取樣太多要提醒，偶爾碰到滿格不算', () => {
  const clipped = Float32Array.from({ length: 10000 }, (_, i) => (i % 20 === 0 ? 1 : 0.3));
  assert.match(audioIssues(audioStats(clipped), false)[0].text, /爆音/);
  const rare = Float32Array.from({ length: 10000 }, (_, i) => (i === 5 ? 1 : 0.3));
  assert.deepEqual(audioIssues(audioStats(rare), false), []);
});
