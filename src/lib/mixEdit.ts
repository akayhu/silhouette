import { analyzeVideo, toEditedTime, type Range } from './autoEdit';
import type { Segment } from './asr';
import { captionFromWords, mainDuration } from './timeline';
import { uid } from './format';
import type { Caption, CaptionStyle, MediaItem, ProjectData, VideoClip } from './types';

/**
 * 智能混剪：一次丟多支素材，每支自動挑一段接起來。
 * - 有講話的素材：沿用「剪掉空拍」的語音辨識結果，留下講話的段落（最多到每支的秒數上限），順便帶字幕
 * - 沒講話的素材（空景、B-roll）：用畫面動態分析，抓動態最大的一段固定長度的畫面
 * 這是訊號處理＋語音辨識，不是「看得懂內容」的 AI——挑不出「最精彩那一刻」，只挑得出「有人在講話」
 * 和「畫面動得比較多」。背景音樂、整體風格還是要到「智能剪輯」套模板，或自己調整。
 */

export type MixMode = 'speech' | 'motion' | 'full';

export interface MixPlanItem {
  media: MediaItem;
  mode: MixMode;
  /** 要保留的原片時間範圍（素材時間），依序播放 */
  ranges: Range[];
  segments?: Segment[];
  error?: string;
}

export interface MixOptions {
  /** 每支素材最多保留幾秒 */
  perClipSeconds: number;
}

const MOTION_WORK_W = 80;
const MOTION_STEP = 0.4;

/** 分析一支素材：有講話的留講話段，沒講話的留動態最多的一段 */
export async function planMixItem(media: MediaItem, opts: MixOptions, onProgress?: (stage: string, p?: number) => void): Promise<MixPlanItem> {
  try {
    if (media.duration <= opts.perClipSeconds + 0.3) return { media, mode: 'full', ranges: [[0, media.duration]] };
    // 語音分析失敗（例如素材完全沒有音軌）不代表整支都分析失敗，改用畫面動態分析
    let speech: { hasSpeech: boolean; keeps: Range[]; segments: Segment[] } | null = null;
    try {
      onProgress?.('分析聲音');
      speech = await analyzeVideo(media, (stage, p) => onProgress?.(stage === 'speech' || stage === 'download' ? '辨識語音' : '分析聲音', p));
    } catch {
      speech = null;
    }
    if (speech?.hasSpeech && speech.keeps.length) {
      return { media, mode: 'speech', ranges: capRanges(speech.keeps, opts.perClipSeconds), segments: speech.segments };
    }
    onProgress?.('分析畫面動態');
    const window = await pickMotionWindow(media, Math.min(opts.perClipSeconds, media.duration));
    return window ? { media, mode: 'motion', ranges: [window] } : { media, mode: 'full', ranges: [[0, Math.min(media.duration, opts.perClipSeconds)]] };
  } catch (e) {
    // 畫面動態分析也失敗了，不要讓整個混剪失敗：退回取開頭一段
    return { media, mode: 'full', ranges: [[0, Math.min(media.duration, opts.perClipSeconds)]], error: (e as Error).message };
  }
}

export async function planMixEdit(medias: MediaItem[], opts: MixOptions, onProgress?: (i: number, total: number, stage: string, p?: number) => void): Promise<MixPlanItem[]> {
  const out: MixPlanItem[] = [];
  for (let i = 0; i < medias.length; i++) {
    out.push(await planMixItem(medias[i], opts, (stage, p) => onProgress?.(i, medias.length, stage, p)));
  }
  return out;
}

/** 依序保留片段，累積秒數到上限就停止 */
function capRanges(ranges: Range[], cap: number): Range[] {
  const out: Range[] = [];
  let total = 0;
  for (const [a, b] of ranges) {
    if (total >= cap - 0.05) break;
    const len = Math.min(b - a, cap - total);
    if (len < 0.15) continue;
    out.push([a, a + len]);
    total += len;
  }
  return out.length ? out : [ranges[0]];
}

/** 抓畫面動態最大的一段固定長度：逐格比對灰階差異，滑動視窗找總和最大的位置 */
async function pickMotionWindow(media: MediaItem, windowSec: number): Promise<Range | null> {
  if (media.kind !== 'video' || !media.url) return null;
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = media.url;
  await new Promise<void>((res, rej) => {
    video.onloadeddata = () => res();
    video.onerror = () => rej(new Error('無法讀取影片'));
  });
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) {
    video.removeAttribute('src');
    return null;
  }
  const W = MOTION_WORK_W;
  const H = Math.max(2, Math.round((W * vh) / vw));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const duration = Math.max(0.5, Math.min(media.duration, video.duration || media.duration));
  if (duration <= windowSec + 0.3) {
    video.removeAttribute('src');
    return [0, duration];
  }
  const n = Math.max(4, Math.min(80, Math.floor(duration / MOTION_STEP)));
  let prevGray: Float32Array | null = null;
  const scores: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(duration - 0.05, (i / n) * duration);
    await new Promise<void>((res) => {
      video.onseeked = () => res();
      video.currentTime = t;
    });
    ctx.drawImage(video, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;
    const gray = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) gray[p] = px[p * 4] * 0.299 + px[p * 4 + 1] * 0.587 + px[p * 4 + 2] * 0.114;
    if (prevGray) {
      let diff = 0;
      for (let p = 0; p < W * H; p++) diff += Math.abs(gray[p] - prevGray[p]);
      scores.push(diff / (W * H));
    } else {
      scores.push(0);
    }
    prevGray = gray;
  }
  video.removeAttribute('src');

  const dt = duration / n;
  const winN = Math.max(1, Math.round(windowSec / dt));
  let best = 0;
  let bestSum = -1;
  let sum = 0;
  for (let i = 0; i < scores.length; i++) {
    sum += scores[i];
    if (i >= winN) sum -= scores[i - winN];
    if (i >= winN - 1 && sum > bestSum) {
      bestSum = sum;
      best = i - winN + 1;
    }
  }
  const start = Math.max(0, Math.min(duration - windowSec, best * dt));
  return [start, Math.min(duration, start + windowSec)];
}

/** 把混剪結果依序接到主軌最後面，講話的段落順便帶字幕；片段之間加一個淡入轉場，接起來不會太生硬 */
export function applyMixEdit(d: ProjectData, plan: MixPlanItem[], opts: { withCaptions: boolean; style?: CaptionStyle }): ProjectData {
  let clips: VideoClip[] = [...d.clips];
  let captions: Caption[] = [...d.captions];
  for (const item of plan) {
    if (!item.ranges.length) continue;
    const base = mainDuration(clips);
    const newClips: VideoClip[] = item.ranges.map(([a, b], idx) => ({
      id: uid(),
      mediaId: item.media.id,
      in: a,
      out: b,
      speed: 1,
      volume: 1,
      // 整條主軌上不是第一段的片段才加轉場，避免一開場就有多餘的淡入
      transition: clips.length + idx > 0 ? { type: 'fade', duration: 0.3 } : undefined,
    }));
    clips = [...clips, ...newClips];
    if (opts.withCaptions && item.segments?.length) {
      const map = (t: number) => base + toEditedTime(item.ranges, t);
      for (const s of item.segments) {
        const start = map(s.start);
        const end = map(s.end);
        if (end - start < 0.2) continue;
        const words = s.words?.map((w) => ({ ...w, start: map(w.start), end: map(w.end) }));
        captions.push(captionFromWords(start, end, s.text, opts.style, words));
      }
    }
  }
  return { ...d, clips, captions: captions.sort((a, b) => a.start - b.start) };
}
