import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const formatUrl = url(await compile('format.ts'));
const captionsUrl = url((await compile('captions.ts')).replace("from './format'", `from '${formatUrl}'`));
const timelineUrl = url((await compile('timeline.ts')).replace("from './format'", `from '${formatUrl}'`).replace("from './captions'", `from '${captionsUrl}'`));
const { addCard, CARD_PRESETS } = await import(url((await compile('cards.ts')).replace("from './timeline'", `from '${timelineUrl}'`)));

const style = { font: 'Arial', size: 80, color: '#fff', stroke: '#000', background: null, bold: true, y: 0.8, animation: 'none' };
const base = (extra = {}) => ({
  aspect: '9:16', media: [], clips: [{ id: 'c', mediaId: 'v', in: 0, out: 20, speed: 1, volume: 1 }],
  audio: [], captions: [{ id: 'k', start: 1, end: 3, text: '說的話', style }], stickers: [], overlays: [], markers: [], duration: 20, ...extra,
});
const card = (r) => r.data.captions.find((c) => c.id === r.id);

test('每種圖卡都加得上，標成 card，原本的字幕不動', () => {
  for (const p of CARD_PRESETS) {
    const r = addCard(base(), p.kind, 5);
    const c = card(r);
    assert.equal(c.role, 'card');
    assert.equal(c.cardKind, p.kind);
    assert.ok(c.end > c.start);
    assert.ok(r.data.captions.some((x) => x.id === 'k' && !x.role));
  }
});

test('標題橫幅蓋整支影片；結尾卡放在最後 2.5 秒；段落與名牌從播放頭開始', () => {
  assert.deepEqual([card(addCard(base(), 'banner', 7)).start, card(addCard(base(), 'banner', 7)).end], [0, 20]);
  const end = card(addCard(base(), 'end', 0));
  assert.deepEqual([end.start, end.end], [17.5, 20]);
  const sec = card(addCard(base(), 'section', 5));
  assert.deepEqual([sec.start, sec.end], [5, 8]);
  assert.equal(card(addCard(base(), 'lower', 5)).end, 8.5);
});

test('播放頭太靠近結尾時往前挪，不會超出影片', () => {
  const c = card(addCard(base(), 'section', 19));
  assert.equal(c.end, 20);
  assert.equal(c.start, 17);
});

test('橫幅與結尾卡只放一張：再按一次換掉舊的並保留打過的字；段落標籤可以多張', () => {
  const first = addCard(base(), 'banner', 0);
  card(first).text = '我的標題';
  const second = addCard(first.data, 'banner', 0);
  assert.equal(second.data.captions.filter((c) => c.cardKind === 'banner').length, 1);
  assert.equal(card(second).text, '我的標題');
  const twice = addCard(addCard(base(), 'section', 2).data, 'section', 10);
  assert.equal(twice.data.captions.filter((c) => c.cardKind === 'section').length, 2);
  const end2 = addCard(addCard(base(), 'end', 0).data, 'end', 0);
  assert.equal(card(end2).end, 20);
});

test('帳號浮水印蓋整支影片、只放一張、位置在下方', () => {
  const r = addCard(addCard(base(), 'handle', 9).data, 'handle', 3);
  const list = r.data.captions.filter((c) => c.cardKind === 'handle');
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].start, list[0].end], [0, 20]);
  assert.ok(list[0].style.y > 0.88);
});
