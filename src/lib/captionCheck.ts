import { orderedCaptions, splitCaptionText } from './captions';
import type { Caption } from './types';

/**
 * 字幕品質檢查：找出觀眾讀不完、看不清楚或排版有問題的字幕，並提供一鍵修正。
 * 標準參考串流平台的繁體中文字幕規範：每行最多 16 字、每秒最多 9 字、每句至少顯示約 0.8 秒。
 * 花字是裝飾用的大字，不檢查。
 */

export const MAX_LINE = 16;
export const MAX_CPS = 9;
export const MIN_DURATION = 0.8;
/** 兩句之間留一點空隙，換句時看得出是新的一句 */
const GAP = 0.04;

export type IssueKind = 'empty' | 'overlap' | 'short' | 'fast' | 'long';

export interface CaptionIssue {
  id: string;
  kind: IssueKind;
  /** 給人看的說明 */
  message: string;
  /** 一鍵修正做不完全時（例如字太多、後面沒有空間延長），提示使用者自己處理 */
  manual?: string;
}

export const ISSUE_LABELS: Record<IssueKind, string> = {
  empty: '空白字幕',
  overlap: '和下一句重疊',
  short: '顯示時間太短',
  fast: '字太多讀不完',
  long: '一行太長',
};

/** 計算閱讀速度用的字數：不算空白和標點 */
export const readableChars = (text: string) => [...text.replace(/[\s\p{P}\p{S}]/gu, '')].length;
const lineLength = (text: string) => Math.max(0, ...text.split('\n').map((l) => [...l].length));

function plainCaptions(captions: Caption[]) {
  return orderedCaptions(captions.filter((c) => c.role !== 'flower'));
}

export function checkCaptions(captions: Caption[]): CaptionIssue[] {
  const list = plainCaptions(captions);
  const issues: CaptionIssue[] = [];
  list.forEach((c, i) => {
    const next = list[i + 1];
    const duration = c.end - c.start;
    if (!c.text.trim()) {
      issues.push({ id: c.id, kind: 'empty', message: '沒有文字，畫面上會什麼都不顯示' });
      return;
    }
    if (next && next.start < c.end - 0.05) {
      issues.push({ id: c.id, kind: 'overlap', message: `和下一句重疊 ${(c.end - next.start).toFixed(1)} 秒，兩句會疊在一起` });
    }
    const room = (next ? next.start - GAP : Infinity) - c.start;
    if (duration < MIN_DURATION - 1e-6) {
      issues.push({
        id: c.id,
        kind: 'short',
        message: `只顯示 ${duration.toFixed(1)} 秒，來不及看`,
        manual: room < MIN_DURATION ? '後面緊接著下一句，延長不夠時可以和下一句合併' : undefined,
      });
    }
    const chars = readableChars(c.text);
    const cps = chars / Math.max(duration, 0.01);
    if (cps > MAX_CPS + 1e-6) {
      const need = chars / MAX_CPS;
      issues.push({
        id: c.id,
        kind: 'fast',
        message: `每秒 ${cps.toFixed(1)} 字，超過 ${MAX_CPS} 字讀不完`,
        manual: room < need ? '延長到下一句之前仍然太快，建議刪減文字或拆成兩句' : undefined,
      });
    }
    if (lineLength(c.text) > MAX_LINE) {
      issues.push({ id: c.id, kind: 'long', message: `一行 ${lineLength(c.text)} 字，超過 ${MAX_LINE} 字會換成很多行或太小` });
    }
  });
  return issues;
}

/** 長句的拆點：離中間最近的標點後面；沒有標點就從中間切 */
function splitPoint(text: string) {
  const chars = [...text];
  const mid = chars.length / 2;
  let best = -1;
  chars.forEach((ch, i) => {
    if (i > 0 && i < chars.length - 1 && /[，。！？、；,.!?;：:\s]/.test(ch) && (best < 0 || Math.abs(i + 1 - mid) < Math.abs(best - mid))) best = i + 1;
  });
  const at = best > 0 ? best : Math.round(mid);
  return chars.slice(0, at).join('').length;
}

/**
 * 修正指定的問題（ids 沒給就是全部）。順序：刪空白 → 拆長句 → 解重疊 → 延長太短／太快的字幕。
 * 延長只用到下一句開始前，不會把別句往後推；做不到的留給使用者處理。
 */
export function fixCaptions(captions: Caption[], only?: Set<string>): { captions: Caption[]; fixed: number } {
  const target = (id: string) => !only || only.has(id);
  let fixed = 0;
  let list = captions.filter((c) => {
    const drop = c.role !== 'flower' && !c.text.trim() && target(c.id);
    if (drop) fixed++;
    return !drop;
  });

  // 一行太長：拆成兩句（有逐字時間就切在那個字的時間點），拆完還太長就再拆
  for (let round = 0; round < 4; round++) {
    let changed = false;
    list = list.flatMap((c) => {
      if (c.role === 'flower' || !target(c.id) || lineLength(c.text) <= MAX_LINE || c.text.includes('\n')) return [c];
      try {
        const pieces = splitCaptionText(c, splitPoint(c.text));
        changed = true;
        fixed++;
        return pieces;
      } catch {
        return [c];
      }
    });
    if (!changed) break;
  }
  // 拆出來的新句子也要一起修
  const ids = only ? new Set([...only, ...list.map((c) => c.id).filter((id) => !captions.some((x) => x.id === id))]) : undefined;
  const pick = (id: string) => !ids || ids.has(id);

  const ordered = plainCaptions(list);
  const updates = new Map<string, Caption>();
  ordered.forEach((c, i) => {
    if (!pick(c.id)) return;
    const next = ordered[i + 1];
    let end = c.end;
    // 重疊：前一句提早結束
    if (next && next.start < end - 0.05) {
      end = Math.max(c.start + 0.1, next.start - GAP);
    }
    // 太短或太快：往後延長，但不超過下一句開始
    const want = Math.max(MIN_DURATION, readableChars(c.text) / MAX_CPS);
    if (end - c.start < want - 1e-6) {
      const limit = next ? next.start - GAP : Infinity;
      end = Math.max(end, Math.min(c.start + want, limit));
    }
    if (Math.abs(end - c.end) > 1e-6) {
      updates.set(c.id, { ...c, end: Math.round(end * 1000) / 1000 });
      fixed++;
    }
  });
  return { captions: list.map((c) => updates.get(c.id) ?? c), fixed };
}

/** 摘要文字，例如「2 句讀不完、1 句重疊」 */
export function summarizeIssues(issues: CaptionIssue[]) {
  const counts = new Map<IssueKind, Set<string>>();
  for (const i of issues) {
    if (!counts.has(i.kind)) counts.set(i.kind, new Set());
    counts.get(i.kind)!.add(i.id);
  }
  return [...counts].map(([kind, set]) => `${set.size} 句${ISSUE_LABELS[kind]}`).join('、');
}
