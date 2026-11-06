/**
 * 字幕關鍵字強調：數字、百分比、「最」「超」「限時」等重點字詞自動變色，
 * 是自動剪輯短影音常見的手法——純關鍵字比對，不是看得懂語意的 AI。
 */

const KEYWORDS = ['最', '超', '全網', '第一', '限時', '免費', '半價', '必', '獨家', '史上', '唯一', '瘋狂', '爽', '狠'];

const NUMBER_RE = /\d+(\.\d+)?%?/g;

/** 回傳文字裡要強調的字元範圍（Array.from(text) 的索引，[start, end)），已排序且不重疊 */
export function matchEmphasisRanges(text: string): [number, number][] {
  if (!text) return [];
  const ranges: [number, number][] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const start = m.index ?? 0;
    ranges.push([start, start + m[0].length]);
  }
  for (const kw of KEYWORDS) {
    let idx = text.indexOf(kw);
    while (idx >= 0) {
      ranges.push([idx, idx + kw.length]);
      idx = text.indexOf(kw, idx + kw.length);
    }
  }
  if (!ranges.length) return [];
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [[...ranges[0]]];
  for (const [s, e] of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}
