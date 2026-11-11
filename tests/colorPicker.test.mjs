import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

// colorAlpha／withAlpha 不需要 DOM；先從原始 .tsx 切出純函式那段（跳過 React 元件與 JSX），
// 再 strip type，避免 stripTypeScriptTypes 處理到後面的 JSX 語法而整檔失敗
const raw = await readFile(new URL('../src/components/ColorPicker.tsx', import.meta.url), 'utf8');
const slice = raw.slice(raw.indexOf('const clamp'), raw.indexOf('export function ColorPicker'));
const mod = await import(url(stripTypeScriptTypes(slice)));

test('colorAlpha：讀出 hex8／rgba 的透明度，讀不到就當完全不透明', () => {
  assert.equal(mod.colorAlpha('#ffffff'), 1);
  assert.equal(Math.round(mod.colorAlpha('#ffffff66') * 100), 40);
  assert.equal(Math.round(mod.colorAlpha('rgba(212,44,34,0.4)') * 100), 40);
  assert.equal(mod.colorAlpha('not-a-color'), 1);
});

test('withAlpha：只換透明度，顏色本身不變', () => {
  const out = mod.withAlpha('#d42c22', 0.4);
  assert.equal(Math.round(mod.colorAlpha(out) * 100), 40);
  // 色相（RGB）要維持一樣，只有 alpha 這個 byte 不同
  assert.equal(out.slice(0, 7).toLowerCase(), '#d42c22');
});

test('withAlpha：透明度會夾在 0～1 之間', () => {
  const over = mod.withAlpha('#d42c22', 2);
  assert.equal(Math.round(mod.colorAlpha(over) * 100), 100);
  const under = mod.withAlpha('#d42c22', -1);
  assert.equal(Math.round(mod.colorAlpha(under) * 100), 0);
});

test('withAlpha：讀不懂的色碼原樣回傳', () => {
  assert.equal(mod.withAlpha('not-a-color', 0.5), 'not-a-color');
});
