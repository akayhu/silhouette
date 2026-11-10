import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

// mixLoudness.ts 的 analyzeMixLoudness 需要真的混音（瀏覽器才有 OfflineAudioContext），
// 這裡只測不需要 DOM 的 applyMixGain（純資料套用）
const src = await compile('mixLoudness.ts');
const fn = src.slice(src.indexOf('const MAX_VOLUME'));
const mod = await import(url(fn));

const clip = (id, volume) => ({ id, volume });

test('applyMixGain：等比例調整主軌、配樂/口白/音效、疊加片段的音量，靜音的段落不動', () => {
  const d = {
    clips: [clip('c1', 1), clip('c2', 0)],
    audio: [clip('a1', 0.5)],
    overlays: [clip('o1', 1)],
  };
  const out = mod.applyMixGain(d, 1.5);
  assert.equal(out.clips[0].volume, 1.5);
  assert.equal(out.clips[1].volume, 0);
  assert.equal(out.audio[0].volume, 0.75);
  assert.equal(out.overlays[0].volume, 1.5);
});

test('applyMixGain：夾在音量上限（200%）內', () => {
  const d = { clips: [clip('c1', 1.8)], audio: [], overlays: [] };
  const out = mod.applyMixGain(d, 2);
  assert.equal(out.clips[0].volume, 2);
});

test('applyMixGain：gain 為 1 時直接回傳原物件，不觸發多餘的 commit', () => {
  const d = { clips: [clip('c1', 1)], audio: [], overlays: [] };
  assert.equal(mod.applyMixGain(d, 1), d);
});
