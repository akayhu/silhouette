import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const { pickTemplate, AUTO_PICK_TEMPLATE_IDS } = await import(url(await compile('autoPick.ts')));

const templatesSrc = await readFile(new URL('../src/lib/templates.ts', import.meta.url), 'utf8');
const templateIds = [...templatesSrc.matchAll(/^ {4}id: '([^']+)'/gm)].map((m) => m[1]);
const templates = templateIds.map((id) => ({ id, name: id }));
const cap = (text, role) => ({ text, role });

test('規則表裡的模板 id 都真的存在，不會挑到不存在的模板', () => {
  for (const id of AUTO_PICK_TEMPLATE_IDS) assert.ok(templateIds.includes(id), `找不到模板 ${id}`);
});

test('提到美食、老闆、好吃就挑美食探店，並回傳命中的關鍵字', () => {
  const r = pickTemplate([cap('今天來吃這攤'), cap('老闆說招牌最好吃')], templates);
  assert.equal(r.template.id, 'food');
  assert.ok(r.matched.includes('好吃'));
});

test('命中關鍵字最多的類型勝出', () => {
  const r = pickTemplate([cap('露營的帳篷搭好了'), cap('營火旁邊有咖啡')], templates);
  assert.equal(r.template.id, 'camp');
});

test('沒有任何關鍵字命中時，用最通用的知識口播，不亂挑', () => {
  const r = pickTemplate([cap('嗯這個東西啊')], templates);
  assert.equal(r.template.id, 'talk');
  assert.deepEqual(r.matched, []);
});

test('花字不列入判斷依據', () => {
  const r = pickTemplate([cap('美食好吃', 'flower'), cap('哈囉你好')], templates);
  assert.equal(r.matched.length, 0);
});

test('模板清單沒有該類型時略過，不會回傳 undefined', () => {
  const r = pickTemplate([cap('好吃的餐廳')], [{ id: 'talk', name: 'talk' }]);
  assert.equal(r.template.id, 'talk');
});
