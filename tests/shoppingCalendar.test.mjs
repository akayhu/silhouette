import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');

const mod = await import(url(await compile('shoppingCalendar.ts')));

const byId = (list, id) => list.find((r) => r.moment.id === id);

test('固定日期的檔期：在範圍內才出現，daysUntil 正確', () => {
  const now = new Date(2026, 10, 1); // 2026-11-01
  const list = mod.upcomingShoppingMoments(now, 21);
  const double11 = byId(list, 'double11');
  assert.ok(double11);
  assert.equal(double11.daysUntil, 10);
  assert.equal(double11.approx, false);
});

test('固定日期的檔期：超出範圍就不出現', () => {
  const now = new Date(2026, 10, 1); // 2026-11-01
  const list = mod.upcomingShoppingMoments(now, 5);
  assert.equal(byId(list, 'double11'), undefined);
});

test('跨年：12月下旬時，隔年元旦也要抓得到', () => {
  const now = new Date(2026, 11, 20); // 2026-12-20
  const list = mod.upcomingShoppingMoments(now, 15);
  const newyear = byId(list, 'newyear');
  assert.ok(newyear);
  assert.equal(newyear.daysUntil, 12);
});

test('農曆／浮動節慶標記 approx，固定日期的不標記', () => {
  const now = new Date(2026, 0, 1); // 2026-01-01
  const list = mod.upcomingShoppingMoments(now, 365);
  assert.equal(byId(list, 'cny').approx, true);
  assert.equal(byId(list, 'double11').approx, false);
});

test('母親節：算出來的日期一定是星期日，且落在 5 月', () => {
  const now = new Date(2026, 3, 1); // 2026-04-01
  const list = mod.upcomingShoppingMoments(now, 60);
  const mother = byId(list, 'mother');
  assert.ok(mother);
  assert.equal(mother.date.getDay(), 0);
  assert.equal(mother.date.getMonth(), 4);
});

test('黑色星期五：算出來的日期一定是星期五，且落在 11 月下旬', () => {
  const now = new Date(2026, 9, 1); // 2026-10-01
  const list = mod.upcomingShoppingMoments(now, 90);
  const bf = byId(list, 'blackfriday');
  assert.ok(bf);
  assert.equal(bf.date.getDay(), 5);
  assert.equal(bf.date.getMonth(), 10);
  assert.ok(bf.date.getDate() >= 23);
});

test('結果依天數由近到遠排序', () => {
  const now = new Date(2026, 9, 25); // 2026-10-25
  const list = mod.upcomingShoppingMoments(now, 60);
  const days = list.map((r) => r.daysUntil);
  assert.deepEqual(days, [...days].sort((a, b) => a - b));
});
