// 素材反推大綱：不做任何影像辨識，純粹用時間軸上已經有的資訊（片段數量、長度、已經下過的字幕）
// 猜一個「開頭／中段／結尾」的骨架，給還沒想好要講什麼的人當起點
import { formatTime } from './format';
import { layoutMain } from './timeline';
import type { ProjectData } from './types';

export interface OutlineSection {
  label: string;
  start: number;
  end: number;
  clipCount: number;
  hint: string;
}

const LABELS: Record<number, string[]> = {
  1: ['全部'],
  2: ['開頭', '結尾'],
  3: ['開頭', '中段', '結尾'],
};

/** 依主軌片段數量分成最多 3 段，切點對齊片段邊界（不會切在片段中間），每段附上已有的字幕內容當提示 */
export function inferOutline(data: Pick<ProjectData, 'clips' | 'captions'>): OutlineSection[] {
  const placed = layoutMain(data.clips);
  if (!placed.length) return [];
  const total = placed[placed.length - 1].end;
  const n = Math.min(3, placed.length);
  const labels = LABELS[n];

  const boundaries: number[] = [];
  for (let i = 1; i < n; i++) {
    const target = (total / n) * i;
    let best = placed[0].start;
    let bestDiff = Infinity;
    for (const p of placed) {
      const diff = Math.abs(p.start - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = p.start;
      }
    }
    boundaries.push(best);
  }
  const bounds = [0, ...boundaries, total];

  const lines = data.captions.filter((c) => c.role !== 'flower' && c.text.trim());

  return labels.map((label, i) => {
    const start = bounds[i];
    const end = bounds[i + 1];
    const clipCount = placed.filter((p) => p.start < end && p.end > start).length;
    const hint = lines
      .filter((c) => c.start < end && c.end > start)
      .map((c) => c.text)
      .join('，');
    return { label, start, end, clipCount, hint: hint || '（還沒有字幕，想想這段想講什麼）' };
  });
}

/** 轉成填進朗讀文字框的純文字，使用者可以直接編輯 */
export function formatOutline(sections: OutlineSection[]): string {
  return sections.map((s) => `【${s.label}】${formatTime(s.start)}–${formatTime(s.end)}（${s.clipCount} 個片段）：${s.hint}`).join('\n');
}
