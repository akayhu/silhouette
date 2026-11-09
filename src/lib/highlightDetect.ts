import { isEmphasis } from './autoEffects';
import { motionScoreAt } from './mixEdit';
import { clipAt, layoutMain, mainDuration } from './timeline';
import type { ProjectData } from './types';

/**
 * 精彩片段抓取：一支長影片裡，抓出幾段最可能適合剪成獨立短片的時間窗。
 * 不是看得懂內容的 AI，用三個已經在用的訊號算分：字幕密度、強調詞（最、超、竟然、驚嘆號…）出現次數、
 * 畫面動態。全部都是純文字／像素統計，跟 Pixelle 那種真的理解內容選「最精彩那刻」不是同一回事。
 */

export interface HighlightCandidate {
  start: number;
  end: number;
  score: number;
}

const WINDOW_SEC = 20;
const STEP_SEC = 5;
/** 候選彼此間隔至少窗口的這個比例，避免同一段反覆入選 */
const MIN_GAP_RATIO = 0.5;

export async function findHighlights(d: Pick<ProjectData, 'clips' | 'captions' | 'media'>, count = 3): Promise<HighlightCandidate[]> {
  const duration = mainDuration(d.clips);
  if (duration < WINDOW_SEC * 1.5) return [];
  const placed = layoutMain(d.clips);
  const mediaById = new Map(d.media.map((m) => [m.id, m]));

  const windows: { start: number; end: number }[] = [];
  for (let t = 0; t + WINDOW_SEC <= duration; t += STEP_SEC) windows.push({ start: t, end: t + WINDOW_SEC });
  if (!windows.length) return [];

  // 字幕密度與強調詞：純文字／時間比對，很快
  const chars = windows.map(({ start, end }) => {
    const inWindow = d.captions.filter((c) => c.role !== 'flower' && c.start < end && c.end > start);
    return inWindow.reduce((n, c) => n + c.text.replace(/\s/g, '').length, 0);
  });
  const emphasis = windows.map(({ start, end }) => d.captions.filter((c) => c.role !== 'flower' && c.start < end && c.end > start && isEmphasis(c.text)).length);

  // 畫面動態：逐格讀影片比較花時間，只在窗口起點所在的素材上取樣
  const motion: number[] = [];
  for (const w of windows) {
    const clip = clipAt(placed, w.start);
    const media = clip && mediaById.get(clip.mediaId);
    if (!clip || !media || media.kind !== 'video') {
      motion.push(0);
      continue;
    }
    const from = clip.in + (w.start - clip.start);
    const dur = Math.min(WINDOW_SEC, clip.out - from);
    motion.push(dur > 0.3 ? await motionScoreAt(media, from, dur) : 0);
  }

  const norm = (arr: number[]) => {
    const max = Math.max(...arr, 1e-6);
    return arr.map((v) => v / max);
  };
  const nChars = norm(chars);
  const nEmphasis = norm(emphasis);
  const nMotion = norm(motion);

  const scored = windows.map((w, i) => ({ ...w, score: nChars[i] * 0.3 + nEmphasis[i] * 0.4 + nMotion[i] * 0.3 }));
  scored.sort((a, b) => b.score - a.score);

  const minGap = WINDOW_SEC * MIN_GAP_RATIO;
  const picked: HighlightCandidate[] = [];
  for (const c of scored) {
    if (c.score <= 0) break;
    if (picked.every((p) => Math.abs(p.start - c.start) >= minGap)) picked.push(c);
    if (picked.length >= count) break;
  }
  return picked.sort((a, b) => a.start - b.start);
}
