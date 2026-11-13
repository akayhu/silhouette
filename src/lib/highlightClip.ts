import { clipLength, mainDuration, rippleRemove, totalDuration } from './timeline';
import type { AudioClip, OverlayClip, ProjectData } from './types';

/**
 * 把專案裡的某一段時間（start–end，時間軸秒數）切成獨立的短片專案：
 * 主軌、字幕、貼紙用波紋剪掉前後；音樂音效與疊加（空鏡）要連素材的入點一起裁，才不會從頭播。
 * 不改動原專案，回傳新的專案內容。
 */

const MIN = 0.05;

/** 項目在時間軸上的範圍和 [start, end] 的交集；沒有交集就是 null。回傳新的開始位置（相對於 start）和素材入點增加的秒數 */
function slice(itemStart: number, len: number, speed: number, start: number, end: number) {
  const s = Math.max(itemStart, start);
  const e = Math.min(itemStart + len, end);
  if (e - s < MIN) return null;
  return { start: s - start, skip: (s - itemStart) * speed, keep: (e - s) * speed };
}

function sliceAudio(a: AudioClip, start: number, end: number): AudioClip | null {
  const speed = a.speed ?? 1;
  const r = slice(a.start, clipLength(a), speed, start, end);
  if (!r) return null;
  const cutHead = r.skip > 0;
  const outPoint = a.in + r.skip + r.keep;
  const cutTail = outPoint < a.out - 1e-6;
  return { ...a, start: r.start, in: a.in + r.skip, out: outPoint, fadeIn: cutHead ? 0 : a.fadeIn, fadeOut: cutTail ? 0.6 : a.fadeOut };
}

function sliceOverlay(o: OverlayClip, start: number, end: number): OverlayClip | null {
  const r = slice(o.start, clipLength(o), o.speed || 1, start, end);
  if (!r) return null;
  return { ...o, start: r.start, in: o.in + r.skip, out: o.in + r.skip + r.keep };
}

export function sliceProject(input: ProjectData, start: number, end: number): ProjectData {
  const total = totalDuration(input);
  const from = Math.max(0, start);
  const to = Math.min(total, end);
  // 鎖定只是原專案的編輯保護，新專案不需要；標記和封面都綁在原本的時間點上，也不帶過去
  const d: ProjectData = { ...input, locks: undefined, markers: [], cover: undefined };
  const ranges: [number, number][] = [];
  if (from > 0) ranges.push([0, from]);
  if (to < total) ranges.push([to, total]);
  const cut = rippleRemove({ ...d, audio: [], overlays: [] }, ranges);
  const audio = d.audio.flatMap((a) => sliceAudio(a, from, to) ?? []);
  const overlays = d.overlays.flatMap((o) => sliceOverlay(o, from, to) ?? []);
  const result = { ...cut, audio, overlays };
  const used = new Set([...result.clips, ...result.audio, ...result.overlays].map((c) => c.mediaId));
  const out = { ...result, media: result.media.filter((m) => used.has(m.id)) };
  return { ...out, duration: Math.max(totalDuration(out), mainDuration(out.clips)) };
}
