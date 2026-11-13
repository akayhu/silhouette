import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const formatUrl = url(await compile('format.ts'));
const captionsUrl = url((await compile('captions.ts')).replace("from './format'", `from '${formatUrl}'`));
const t = await import(url((await compile('timeline.ts')).replace("from './format'", `from '${formatUrl}'`).replace("from './captions'", `from '${captionsUrl}'`)));

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
beforeEach(() => store.clear());

test('沒存過預設時，新字幕用內建預設樣式', () => {
  assert.deepEqual(t.newCaption(0, 1, 'x').style, t.defaultCaptionStyle());
  assert.equal(t.hasCaptionStyleDefault(), false);
});

test('存成預設後，新增的字幕用使用者的樣式（含位置、陰影），沒存的欄位用內建值', () => {
  t.saveCaptionStyleDefault({ ...t.defaultCaptionStyle(), color: '#ffe14a', size: 64, y: 0.6, shadow: { color: '#000', opacity: 0.5, blur: 4, distance: 3, angle: 45 } });
  const c = t.newCaption(0, 1, 'x');
  assert.equal(c.style.color, '#ffe14a');
  assert.equal(c.style.size, 64);
  assert.equal(c.style.y, 0.6);
  assert.equal(c.style.shadow.blur, 4);
  assert.equal(c.style.font, t.defaultCaptionStyle().font);
  assert.equal(t.hasCaptionStyleDefault(), true);
});

test('明確指定樣式時不受預設影響；還原預設後回到內建', () => {
  t.saveCaptionStyleDefault({ ...t.defaultCaptionStyle(), color: '#ff0000' });
  assert.equal(t.newCaption(0, 1, 'x', t.defaultCaptionStyle()).style.color, '#ffffff');
  t.clearCaptionStyleDefault();
  assert.deepEqual(t.newCaption(0, 1, 'x').style, t.defaultCaptionStyle());
});

test('預設樣式資料壞掉或含不認得的欄位時，不會讓新增字幕出錯', () => {
  store.set('pianke.captionStyleDefault', '{壞掉');
  assert.deepEqual(t.newCaption(0, 1, 'x').style, t.defaultCaptionStyle());
  store.set('pianke.captionStyleDefault', JSON.stringify({ color: '#00ff00', evil: 'x' }));
  const s = t.newCaption(0, 1, 'x').style;
  assert.equal(s.color, '#00ff00');
  assert.equal(s.evil, undefined);
});
