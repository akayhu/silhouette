import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const code = stripTypeScriptTypes(await readFile(new URL('../src/lib/autoProgress.ts', import.meta.url), 'utf8'));
const { AUTO_STEPS, nextAutoProgress } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

const run = (messages) => messages.reduce((p, m) => [...p, nextAutoProgress(p.at(-1) ?? null, m)], []).map((p) => p.step);

test('流程訊息依序推進步驟', () => {
  assert.deepEqual(run(['偵測空拍', '下載語音模型 40%（只有第一次）', '辨識人聲', '挑選模板「美食探店」', '分析聲音起伏（1/2）', '安排運鏡', '挑選轉場', '套用模板']), [0, 1, 1, 2, 3, 3, 3, 4]);
  assert.equal(AUTO_STEPS.length, 5);
});

test('多支片段來回偵測、辨識時步驟不倒退，但顯示實際訊息；認不得的訊息維持原步驟', () => {
  assert.deepEqual(run(['偵測空拍（1/2）', '辨識人聲（1/2）', '偵測空拍（2/2）', '別的訊息']), [0, 1, 1, 1]);
  assert.equal(nextAutoProgress({ step: 1, detail: '' }, '偵測空拍（2/2）').detail, '偵測空拍（2/2）');
});

test('訊息文字和實際流程裡用的一致', async () => {
  const src = (await Promise.all(['smartEdit.ts', 'autoEffects.ts'].map((f) => readFile(new URL('../src/lib/' + f, import.meta.url), 'utf8')))).join('\n');
  for (const word of ['偵測空拍', '辨識人聲', '下載語音模型', '挑選模板', '分析聲音起伏', '安排運鏡', '挑選轉場', '套用模板']) assert.ok(src.includes(word), `流程裡找不到「${word}」`);
});
