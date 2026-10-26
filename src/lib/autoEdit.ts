import { ASR_MODELS, isFiller, transcribe, type Segment } from './asr';
import { decodeAudio, detectSilence, sliceMono } from './media';
import { mainDuration, newCaption } from './timeline';
import { uid } from './format';
import type { Caption, CaptionStyle, MediaItem, ProjectData, VideoClip } from './types';

/**
 * 上傳影片後的自動剪輯：找出有人聲的片段、剪掉空拍（沒聲音，或有聲音但沒人說話）與「嗯、啊」，
 * 同時把語音辨識成字幕。產生「剪輯前」「剪輯後」兩種版本讓使用者選。
 */

export type Range = [number, number];
export type AutoEditStage = 'audio' | 'silence' | 'download' | 'speech';

export interface AutoEditResult {
  duration: number;
  /** 剪輯後要保留的原片段落（素材時間） */
  keeps: Range[];
  /** 辨識到的字幕（素材時間，不含口誤） */
  segments: Segment[];
  /** 剪掉幾段、共幾秒 */
  cuts: number;
  removed: number;
  /** 沒辨識到人聲時不剪，只能用原片 */
  hasSpeech: boolean;
}

const MIN_KEEP = 0.15;
const SPEECH_PAD = 0.3;

const overlaps = (a: Range, b: Range) => a[0] < b[1] && b[0] < a[1];

export function complement(gaps: Range[], from: number, to: number): Range[] {
  const out: Range[] = [];
  let t = from;
  for (const [a, b] of [...gaps].sort((x, y) => x[0] - y[0])) {
    if (a > t) out.push([t, a]);
    t = Math.max(t, b);
  }
  if (t < to) out.push([t, to]);
  return out;
}

function subtract(ranges: Range[], cut: Range[]): Range[] {
  return ranges.flatMap((r) => complement(cut.filter((c) => overlaps(c, r)), r[0], r[1]));
}

/** 分析素材的某一段（素材時間 from–to）：要保留的人聲段落與字幕，時間都是素材時間 */
export async function analyzeRange(
  media: MediaItem,
  from: number,
  to: number,
  onStage: (stage: AutoEditStage, progress?: number) => void,
  model: string = ASR_MODELS[0].id,
): Promise<{ keeps: Range[]; segments: Segment[]; hasSpeech: boolean }> {
  onStage('audio');
  const buffer = await decodeAudio(media.url);
  const end = Math.min(to, buffer.duration);

  onStage('silence');
  const silences = await detectSilence(buffer, from, end, { thresholdDb: -38, minSilence: 0.5, padding: 0.12 });
  const sound = complement(silences, from, end);

  onStage('speech');
  const samples = await sliceMono(buffer, from, end, 16000);
  const raw = await transcribe(samples, model, (p) => (p.phase === 'download' ? onStage('download', p.progress) : onStage('speech')));
  const all = raw.map((s) => ({ ...s, start: from + s.start, end: Math.min(end, from + s.end) }));
  // 只剩標點的片段（去掉句尾標點後是空字串）不當成字幕
  const segments = all.filter((s) => s.text.trim() && !isFiller(s.text));
  const fillers: Range[] = all.filter((s) => isFiller(s.text)).map((s) => [s.start, s.end]);
  if (!segments.length) return { keeps: [[from, end]], segments: [], hasSpeech: false };

  // 有聲音、而且附近有人說話的段落才保留，再扣掉只有語助詞的部分
  const speech: Range[] = segments.map((s) => [s.start - SPEECH_PAD, s.end + SPEECH_PAD]);
  const keeps = subtract(
    sound.filter((r) => speech.some((sp) => overlaps(sp, r))),
    fillers,
  ).filter(([x, y]) => y - x >= MIN_KEEP);
  return { keeps, segments, hasSpeech: true };
}

export async function analyzeVideo(media: MediaItem, onStage: (stage: AutoEditStage, progress?: number) => void, model?: string): Promise<AutoEditResult> {
  const duration = media.duration;
  const { keeps, segments, hasSpeech } = await analyzeRange(media, 0, duration, onStage, model);
  if (!hasSpeech) return { duration, keeps, segments: [], cuts: 0, removed: 0, hasSpeech: false };
  const kept = keeps.reduce((n, [x, y]) => n + y - x, 0);
  return { duration, keeps, segments, cuts: complement(keeps, 0, duration).filter(([x, y]) => y - x > 0.05).length, removed: duration - kept, hasSpeech: true };
}

/** 素材時間 → 剪輯後的時間；落在被剪掉的空檔就對齊到下一段的開頭 */
export function toEditedTime(keeps: Range[], t: number) {
  let acc = 0;
  for (const [a, b] of keeps) {
    if (t < a) return acc;
    if (t <= b) return acc + (t - a);
    acc += b - a;
  }
  return acc;
}

export type AutoEditChoice = 'edited' | 'original';

/** 依使用者的選擇，把影片接在主軌最後面，字幕對齊到相同位置 */
export function applyAutoEdit(d: ProjectData, media: MediaItem, result: AutoEditResult, choice: AutoEditChoice, opts: { captions: boolean; style?: CaptionStyle }): ProjectData {
  const base = mainDuration(d.clips);
  const ranges: Range[] = choice === 'edited' && result.hasSpeech ? result.keeps : [[0, result.duration]];
  const clips: VideoClip[] = ranges.map(([a, b]) => ({ id: uid(), mediaId: media.id, in: a, out: b, speed: 1, volume: 1 }));
  const map = (t: number) => (choice === 'edited' && result.hasSpeech ? toEditedTime(result.keeps, t) : t);
  const captions: Caption[] = opts.captions
    ? result.segments.flatMap((s) => {
        const start = base + map(s.start);
        const end = base + map(s.end);
        return end - start >= 0.2 ? [newCaption(start, end, s.text, opts.style)] : [];
      })
    : [];
  return { ...d, clips: [...d.clips, ...clips], captions: [...d.captions, ...captions].sort((a, b) => a.start - b.start) };
}
