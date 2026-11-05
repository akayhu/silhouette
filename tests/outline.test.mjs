import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
const compile = async (file) => stripTypeScriptTypes(await readFile(new URL('../src/lib/' + file, import.meta.url), 'utf8'));
const url = (code) => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const formatUrl = url(await compile('format.ts'));
const captionsUrl = url((await compile('captions.ts')).replace("from './format'", `from '${formatUrl}'`));
const timelineUrl = url(
  (await compile('timeline.ts')).replace("from './format'", `from '${formatUrl}'`).replace("from './captions'", `from '${captionsUrl}'`),
);
const { inferOutline, formatOutline } = await import(
  url((await compile('outline.ts')).replace("from './format'", `from '${formatUrl}'`).replace("from './timeline'", `from '${timelineUrl}'`))
);

const style = { font: 'Arial', size: 80, color: '#fff', stroke: '#000', background: null, bold: true, y: .8, animation: 'none' };
const caption = (text, start, end) => ({ id: `c-${start}`, start, end, text, style });
const clip = (id, out) => ({ id, mediaId: 'm', start: 0, in: 0, out });

test('沒有素材時回傳空陣列', () => {
  assert.deepEqual(inferOutline({ clips: [], captions: [] }), []);
});

test('只有 1 個片段時不硬切三段，整段算「全部」', () => {
  const sections = inferOutline({ clips: [clip('a', 10)], captions: [] });
  assert.equal(sections.length, 1);
  assert.equal(sections[0].label, '全部');
  assert.equal(sections[0].clipCount, 1);
});

test('6 個片段切成開頭／中段／結尾，切點對齊片段邊界，不會切在片段中間', () => {
  const clips = Array.from({ length: 6 }, (_, i) => clip(`c${i}`, 4)); // 每段 4 秒，共 24 秒
  const sections = inferOutline({ clips, captions: [] });
  assert.deepEqual(sections.map((s) => s.label), ['開頭', '中段', '結尾']);
  // 每段的起訖時間要剛好落在 4 的倍數（片段邊界），不能是中間值
  for (const s of sections) {
    assert.equal(s.start % 4, 0);
    assert.equal(s.end % 4, 0);
  }
  assert.equal(sections[0].start, 0);
  assert.equal(sections.at(-1).end, 24);
  // 每段都涵蓋到實際的片段
  assert.ok(sections.every((s) => s.clipCount > 0));
});

test('每段抓時間範圍內已有的字幕當提示，沒有字幕的段落提示使用者自己想', () => {
  const clips = [clip('a', 8), clip('b', 8), clip('c', 8)]; // 0-8, 8-16, 16-24
  const captions = [caption('今天來去海邊走走', 0, 4)];
  const sections = inferOutline({ clips, captions });
  assert.equal(sections[0].hint, '今天來去海邊走走');
  assert.match(sections[1].hint, /還沒有字幕/);
  assert.match(sections[2].hint, /還沒有字幕/);
});

test('formatOutline 輸出可編輯的純文字，每段一行', () => {
  const sections = inferOutline({ clips: [clip('a', 8), clip('b', 8)], captions: [caption('開場白', 0, 2)] });
  const text = formatOutline(sections);
  const lines = text.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^【開頭】00:00–00:08（1 個片段）：開場白$/);
});
