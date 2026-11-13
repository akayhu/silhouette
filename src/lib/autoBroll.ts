import { uid } from './format';
import { freeOverlayLane, isLocked, layoutMain, mainDuration } from './timeline';
import type { MediaItem, OverlayClip, ProjectData } from './types';

/**
 * 自動 B-roll：口播講話時，把還沒用到的空鏡（其他影片／圖片）全螢幕蓋在畫面上，聲音不中斷。
 * 空鏡放在疊加軌、靜音，主軌的口白照常播放。純規則式，不呼叫任何 AI API。
 */

const HEAD = 2.5; // 開場先看到人，不蓋
const TAIL = 1.5; // 結尾留給主畫面
const LEN = 3; // 每段空鏡秒數
const GAP = 4; // 兩段空鏡之間至少隔幾秒
const MERGE = 0.8; // 字幕間隔小於這個秒數視為同一段連續說話

export const BROLL_TRANSFORM = { x: 0, y: 0, scale: 1, rotation: 0, fit: 'cover' as const };

/** 還沒用到的影片／圖片素材（不在主軌、也不是使用者自己疊的疊加），可以當空鏡 */
export function brollCandidates(d: Pick<ProjectData, 'media' | 'clips' | 'overlays'>): MediaItem[] {
  const used = new Set([...d.clips.map((c) => c.mediaId), ...d.overlays.filter((o) => o.role !== 'broll').map((o) => o.mediaId)]);
  return d.media.filter((m) => (m.kind === 'video' || m.kind === 'image') && !used.has(m.id) && (m.kind === 'image' || m.duration >= 1));
}

/** 連續說話的時段：依字幕合併，沒有字幕就視為整支都在說話 */
function speechSpans(d: ProjectData, total: number): [number, number][] {
  const lines = d.captions.filter((c) => c.role !== 'flower').sort((a, b) => a.start - b.start);
  if (!lines.length) return [[0, total]];
  const spans: [number, number][] = [];
  for (const c of lines) {
    const last = spans[spans.length - 1];
    if (last && c.start - last[1] < MERGE) last[1] = Math.max(last[1], c.end);
    else spans.push([c.start, c.end]);
  }
  return spans;
}

export interface BrollResult {
  data: ProjectData;
  placed: number;
}

export function planBroll(input: ProjectData, opts: { max?: number } = {}): BrollResult {
  // 重新套用：先拿掉上一次自動加的空鏡
  const d: ProjectData = { ...input, overlays: input.overlays.filter((o) => o.role !== 'broll') };
  const unchanged = { data: input, placed: 0 };
  if (isLocked(d, 'overlay')) return unchanged;
  const pool = brollCandidates(d);
  const total = mainDuration(d.clips);
  if (!pool.length || total < HEAD + TAIL + 1) return unchanged;

  const media = new Map(d.media.map((m) => [m.id, m]));
  const placedClips = layoutMain(d.clips);
  // 只蓋在口播（影片）畫面上，主軌是圖片的地方本來就有畫面，不蓋
  const onTalkingHead = (a: number, b: number) =>
    placedClips.filter((c) => c.start < b && c.end > a).every((c) => media.get(c.mediaId)?.kind === 'video');

  const max = opts.max ?? Math.max(1, Math.floor(total / 8));
  const added: OverlayClip[] = [];
  let next = 0;
  let lastEnd = -Infinity;
  for (const [a, b] of speechSpans(d, total)) {
    let t = Math.max(a + 0.5, HEAD, lastEnd + GAP);
    while (added.length < max) {
      const m = pool[next % pool.length];
      const len = Math.min(LEN, m.kind === 'video' ? m.duration : LEN);
      if (t + len > Math.min(b + 0.5, total - TAIL)) break;
      if (!onTalkingHead(t, t + len)) {
        t += 0.5;
        continue;
      }
      added.push({
        id: uid(),
        mediaId: m.id,
        start: t,
        in: 0,
        out: len,
        speed: 1,
        volume: 0,
        lane: freeOverlayLane([...d.overlays, ...added], t, t + len),
        opacity: 1,
        transform: { ...BROLL_TRANSFORM },
        role: 'broll',
      });
      next++;
      lastEnd = t + len;
      t = lastEnd + GAP;
    }
  }
  if (!added.length) return unchanged;
  return { data: { ...d, overlays: [...d.overlays, ...added] }, placed: added.length };
}
