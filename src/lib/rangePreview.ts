/**
 * 試聽選取：依序播放幾段時間範圍，每段播到結尾就跳到下一段，最後一段播完停下。
 * 這裡只放「現在該怎麼辦」的判斷，不碰播放引擎，方便測試。
 */

export type Range = [number, number];

export type PreviewStep =
  /** 還在這一段裡，繼續播 */
  | { kind: 'continue' }
  /** 這一段播完了，跳到第 index 段的開頭 */
  | { kind: 'next'; index: number }
  /** 全部播完 */
  | { kind: 'done' }
  /** 使用者自己暫停或拖到別處，不要再接手 */
  | { kind: 'cancel' };

/** 拖到比目前這段開頭還早這麼多秒，視為使用者自己換了位置 */
const SEEK_AWAY = 0.5;

export function previewStep(ranges: Range[], index: number, time: number, playing: boolean): PreviewStep {
  if (!playing) return { kind: 'cancel' };
  const [start, end] = ranges[index];
  if (time < start - SEEK_AWAY) return { kind: 'cancel' };
  if (time < end) return { kind: 'continue' };
  return index + 1 < ranges.length ? { kind: 'next', index: index + 1 } : { kind: 'done' };
}

/** 文字剪輯面板頂端的累計摘要：這次編輯一開始多長、已經剪掉多少、現在剩多少 */
export function cutSummary(base: number, current: number): { base: number; removed: number; current: number } | null {
  if (!(base > 0)) return null;
  return { base, removed: Math.max(0, base - current), current };
}
