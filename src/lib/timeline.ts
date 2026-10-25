import type { Aspect, AudioClip, Caption, CaptionStyle, ClipTransform, ProjectData, VideoClip } from './types';
import { uid } from './format';

export const MIN_CLIP = 0.1;

export const DEFAULT_TRANSFORM: ClipTransform = { x: 0, y: 0, scale: 1, rotation: 0, fit: 'contain' };
export const transformOf = (c: VideoClip): ClipTransform => ({ ...DEFAULT_TRANSFORM, ...c.transform });

export const clipLength = (c: { in: number; out: number; speed?: number }) => (c.out - c.in) / (c.speed ?? 1);

export interface PlacedClip extends VideoClip {
  start: number;
  end: number;
  index: number;
  /** 和前一段重疊的秒數（轉場長度），沒有轉場為 0 */
  overlap: number;
}

/** 轉場實際重疊的秒數：最多佔前後兩段各一半，避免三段同時重疊 */
export function transitionOverlap(prev: VideoClip | undefined, cur: VideoClip) {
  if (!prev || !cur.transition) return 0;
  return Math.max(0, Math.min(cur.transition.duration, clipLength(prev) / 2, clipLength(cur) / 2));
}

/** 主軌磁吸排列：依序接在一起，有轉場的片段會往前和上一段重疊 */
export function layoutMain(clips: VideoClip[]): PlacedClip[] {
  let t = 0;
  return clips.map((c, index) => {
    const overlap = transitionOverlap(clips[index - 1], c);
    const start = t - overlap;
    t = start + clipLength(c);
    return { ...c, start, end: t, index, overlap };
  });
}

export function mainDuration(clips: VideoClip[]) {
  const placed = layoutMain(clips);
  return placed.length ? placed[placed.length - 1].end : 0;
}

/** 某個時間點正在畫面上的主軌片段（轉場中會有兩段，前一段在前） */
export function activeClips(placed: PlacedClip[], t: number) {
  return placed.filter((c) => t >= c.start && t < c.end).slice(0, 2);
}

export function totalDuration(d: Pick<ProjectData, 'clips' | 'audio' | 'captions'> & { stickers?: ProjectData['stickers'] }) {
  return Math.max(
    mainDuration(d.clips),
    ...d.audio.map((a) => a.start + clipLength(a)),
    ...d.captions.map((c) => c.end),
    ...(d.stickers ?? []).map((s) => s.end),
    0,
  );
}

export function clipAt(placed: PlacedClip[], t: number) {
  return placed.find((c) => t >= c.start && t < c.end) ?? null;
}

export function aspectSize(aspect: Aspect, shortSide: number) {
  if (aspect === '9:16') return { width: shortSide, height: Math.round((shortSide * 16) / 9) };
  if (aspect === '16:9') return { width: Math.round((shortSide * 16) / 9), height: shortSide };
  return { width: shortSide, height: shortSide };
}

export const defaultCaptionStyle = (): CaptionStyle => ({
  font: 'Noto Sans TC',
  size: 80,
  color: '#ffffff',
  stroke: '#1f1d2b',
  background: null,
  bold: true,
  y: 0.78,
  animation: 'pop',
});

export function newCaption(start: number, end: number, text: string, style?: CaptionStyle): Caption {
  return { id: uid(), start, end, text, style: style ? { ...style } : defaultCaptionStyle() };
}

// ---------- 編輯操作（皆回傳新的資料，不改動原物件） ----------

export function splitMainAt(d: ProjectData, t: number): ProjectData {
  const placed = layoutMain(d.clips);
  const hit = clipAt(placed, t);
  if (!hit || t - hit.start < MIN_CLIP || hit.end - t < MIN_CLIP) return d;
  const cut = hit.in + (t - hit.start) * hit.speed;
  const left: VideoClip = { ...strip(hit), out: cut };
  const right: VideoClip = { ...strip(hit), id: uid(), in: cut, transition: undefined };
  const clips = [...d.clips];
  clips.splice(hit.index, 1, left, right);
  return { ...d, clips };
}

export function splitAudioAt(d: ProjectData, id: string, t: number): ProjectData {
  const a = d.audio.find((x) => x.id === id);
  if (!a) return d;
  const end = a.start + clipLength(a);
  if (t - a.start < MIN_CLIP || end - t < MIN_CLIP) return d;
  const cut = a.in + (t - a.start);
  const left: AudioClip = { ...a, out: cut, fadeOut: 0 };
  const right: AudioClip = { ...a, id: uid(), start: t, in: cut, fadeIn: 0 };
  return { ...d, audio: d.audio.flatMap((x) => (x.id === id ? [left, right] : [x])) };
}

export function splitCaptionAt(d: ProjectData, id: string, t: number): ProjectData {
  const c = d.captions.find((x) => x.id === id);
  if (!c || t - c.start < MIN_CLIP || c.end - t < MIN_CLIP) return d;
  return {
    ...d,
    captions: d.captions.flatMap((x) => (x.id === id ? [{ ...c, end: t }, { ...c, id: uid(), start: t }] : [x])),
  };
}

const strip = (p: PlacedClip): VideoClip => ({
  id: p.id,
  mediaId: p.mediaId,
  in: p.in,
  out: p.out,
  speed: p.speed,
  volume: p.volume,
  transform: p.transform,
  transition: p.transition,
  filter: p.filter,
});

type Range = [number, number];

function normalize(ranges: Range[]): Range[] {
  const sorted = ranges.filter(([a, b]) => b - a > 0.001).sort((x, y) => x[0] - y[0]);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out;
}

/** 刪掉某段時間後，原本時間點 t 會移到哪裡 */
function remap(t: number, ranges: Range[]) {
  let shift = 0;
  for (const [a, b] of ranges) {
    if (t <= a) break;
    shift += Math.min(t, b) - a;
  }
  return t - shift;
}

/**
 * 波紋刪除：把時間軸上的多段範圍整段拿掉，後面的內容往前補。
 * 主軌片段會被切開；字幕與音訊跟著平移，讓畫面、字幕、聲音保持對齊。
 */
export function rippleRemove(d: ProjectData, input: Range[]): ProjectData {
  const ranges = normalize(input);
  if (!ranges.length) return d;

  const clips: VideoClip[] = [];
  for (const p of layoutMain(d.clips)) {
    let pieces: Range[] = [[p.start, p.end]];
    for (const [a, b] of ranges) {
      pieces = pieces.flatMap(([s, e]): Range[] => {
        if (b <= s || a >= e) return [[s, e]];
        const keep: Range[] = [];
        if (a > s) keep.push([s, a]);
        if (b < e) keep.push([b, e]);
        return keep;
      });
    }
    pieces
      .filter(([s, e]) => e - s >= 0.04)
      .forEach(([s, e], i) => {
        clips.push({
          ...strip(p),
          id: i === 0 ? p.id : uid(),
          transition: i === 0 ? p.transition : undefined,
          in: p.in + (s - p.start) * p.speed,
          out: p.in + (e - p.start) * p.speed,
        });
      });
  }

  const captions = d.captions
    .map((c) => ({ ...c, start: remap(c.start, ranges), end: remap(c.end, ranges) }))
    .filter((c) => c.end - c.start >= 0.05);
  const audio = d.audio.map((a) => ({ ...a, start: remap(a.start, ranges) }));
  const stickers = (d.stickers ?? [])
    .map((s) => ({ ...s, start: remap(s.start, ranges), end: remap(s.end, ranges) }))
    .filter((s) => s.end - s.start >= 0.05);

  return { ...d, clips, captions, audio, stickers };
}

export function removeMainClip(d: ProjectData, id: string): ProjectData {
  const p = layoutMain(d.clips).find((c) => c.id === id);
  return p ? rippleRemove(d, [[p.start, p.end]]) : d;
}

export function moveMainClip(d: ProjectData, from: number, to: number): ProjectData {
  if (from === to) return d;
  const clips = [...d.clips];
  const [c] = clips.splice(from, 1);
  clips.splice(to, 0, c);
  return { ...d, clips };
}

/** 一次刪除多個項目：音訊與字幕直接移除，主軌片段用波紋刪除讓後面的內容補上 */
export function removeItems(d: ProjectData, items: { type: 'clip' | 'audio' | 'caption' | 'sticker'; id: string }[]): ProjectData {
  const ids = new Set(items.map((i) => i.id));
  const ranges = layoutMain(d.clips)
    .filter((c) => ids.has(c.id))
    .map((c): [number, number] => [c.start, c.end]);
  const rest = {
    ...d,
    audio: d.audio.filter((a) => !ids.has(a.id)),
    captions: d.captions.filter((c) => !ids.has(c.id)),
    stickers: (d.stickers ?? []).filter((s) => !ids.has(s.id)),
  };
  return rippleRemove(rest, ranges);
}

export function splitStickerAt(d: ProjectData, id: string, t: number): ProjectData {
  const s = d.stickers.find((x) => x.id === id);
  if (!s || t - s.start < MIN_CLIP || s.end - t < MIN_CLIP) return d;
  return { ...d, stickers: d.stickers.flatMap((x) => (x.id === id ? [{ ...s, end: t }, { ...s, id: uid(), start: t }] : [x])) };
}
