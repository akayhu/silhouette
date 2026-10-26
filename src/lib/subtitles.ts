import { transcribe } from './asr';
import { decodeAudio, sliceMono } from './media';
import { captionFromWords, layoutMain } from './timeline';
import type { Caption, ProjectData } from './types';

export type TimeRange = [number, number];

/** 太短的片段辨識不出東西，略過 */
const MIN_PIECE = 0.3;
/** 只辨識一段範圍時，前後多聽這麼多秒（同一段影片內），從句子中間開始也聽得出來；超出範圍的字不保留 */
const CONTEXT = 1;

/**
 * 聽寫主軌影片，產生帶逐字時間的字幕（時間軸秒數）。AI 自動字幕與「貼上講稿自動對時」共用。
 * ranges：只辨識這些時間範圍（例如選取的片段或指定的時間），沒給就是整條主軌。
 */
export async function transcribeTimeline(data: ProjectData, model: string, onStatus: (text: string) => void, ranges?: TimeRange[]): Promise<Caption[]> {
  const media = new Map(data.media.map((m) => [m.id, m]));
  const clips = layoutMain(data.clips).filter((c) => media.get(c.mediaId)?.kind === 'video');
  if (!clips.length) throw new Error('主軌上還沒有影片');
  // 每段影片和範圍的交集才需要辨識
  const pieces = clips.flatMap((clip) =>
    (ranges ?? [[clip.start, clip.end] as TimeRange])
      .map(([a, b]) => ({ clip, from: Math.max(a, clip.start), to: Math.min(b, clip.end) }))
      .filter((p) => p.to - p.from >= MIN_PIECE),
  );
  if (!pieces.length) throw new Error(ranges ? '選取的範圍裡沒有影片' : '主軌上還沒有影片');
  const style = data.captions.find((c) => c.role !== 'flower')?.style;
  const out: Caption[] = [];
  for (const [i, { clip, from, to }] of pieces.entries()) {
    const label = pieces.length > 1 ? `（${i + 1}/${pieces.length}）` : '';
    onStatus(`讀取音軌${label}`);
    const buffer = await decodeAudio(media.get(clip.mediaId)!.url);
    const listenFrom = ranges ? Math.max(clip.start, from - CONTEXT) : from;
    const listenTo = ranges ? Math.min(clip.end, to + CONTEXT) : to;
    const srcFrom = clip.in + (listenFrom - clip.start) * clip.speed;
    const srcTo = clip.in + (listenTo - clip.start) * clip.speed;
    const samples = await sliceMono(buffer, srcFrom, srcTo, 16000);
    const segs = await transcribe(
      samples,
      model,
      (p) => onStatus(p.phase === 'download' ? `下載語音模型 ${Math.round(p.progress ?? 0)}%（只有第一次）` : `辨識中${label}…`),
      { words: true },
    );
    const toT = (t: number) => listenFrom + t / clip.speed;
    const within = (a: number, b: number) => (a + b) / 2 >= from && (a + b) / 2 < to;
    for (const s of segs) {
      if (s.words?.length) {
        // 只留下說話時間在範圍內的字
        const words = s.words.map((w) => ({ ...w, start: toT(w.start), end: Math.min(listenTo, toT(w.end)) })).filter((w) => within(w.start, w.end));
        if (!words.length) continue;
        const start = Math.max(from, words[0].start);
        const end = Math.min(to, words[words.length - 1].end);
        if (end - start > 0.05) out.push(captionFromWords(start, end, s.text, style, words.map((w) => ({ ...w, start: Math.max(w.start, start), end: Math.min(w.end, end) }))));
      } else {
        const start = Math.max(from, toT(s.start));
        const end = Math.min(to, toT(s.end));
        if (within(toT(s.start), toT(s.end)) && end - start > 0.05) out.push(captionFromWords(start, end, s.text, style));
      }
    }
  }
  return out;
}
