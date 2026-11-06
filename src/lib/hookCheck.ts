import { motionScoreAt } from './mixEdit';
import { layoutMain } from './timeline';
import type { ProjectData } from './types';

/**
 * 開場強度檢查：短影音前幾秒留不住人就會被滑掉，Pixelle 這類全自動引擎會特別規劃開場要有動態。
 * 這裡純用畫面像素比對（跟混剪的動態分析同一套邏輯），不是看得懂內容的 AI：
 * 只比較開場跟後面幾段「動得多不多」，抓不到「哪一段比較精彩」。
 */

const HOOK_WINDOW = 2.5;
/** 開場字幕出現得早，文字本身就能抓住注意力，不當作開場弱 */
const EARLY_CAPTION_SEC = 2;
/** 後面的片段動態分數要明顯贏過開場（而不是略高）才值得提示換開場 */
const WEAK_RATIO = 1.6;
/** 最多比較開場後面幾段，片段很多時避免要分析太多支影片 */
const MAX_CANDIDATES = 4;

export interface HookCheckResult {
  /** 開場前幾秒畫面動態明顯偏低，且後面有更動態的片段可以換 */
  weak: boolean;
  betterClipId: string | null;
}

export async function checkOpeningHook(d: Pick<ProjectData, 'clips' | 'captions' | 'media'>): Promise<HookCheckResult> {
  const placed = layoutMain(d.clips);
  const first = placed[0];
  if (!first) return { weak: false, betterClipId: null };
  const mediaById = new Map(d.media.map((m) => [m.id, m]));
  const firstMedia = mediaById.get(first.mediaId);
  if (!firstMedia || firstMedia.kind !== 'video') return { weak: false, betterClipId: null };

  const hasEarlyCaption = d.captions.some((c) => c.role !== 'flower' && c.start < EARLY_CAPTION_SEC);
  const openingScore = await motionScoreAt(firstMedia, first.in, Math.min(HOOK_WINDOW, first.out - first.in));

  let bestScore = openingScore;
  let betterClipId: string | null = null;
  for (const clip of placed.slice(1, 1 + MAX_CANDIDATES)) {
    const media = mediaById.get(clip.mediaId);
    if (!media || media.kind !== 'video') continue;
    const score = await motionScoreAt(media, clip.in, Math.min(HOOK_WINDOW, clip.out - clip.in));
    if (score > bestScore * WEAK_RATIO) {
      bestScore = score;
      betterClipId = clip.id;
    }
  }
  return hasEarlyCaption ? { weak: false, betterClipId: null } : { weak: betterClipId !== null, betterClipId };
}

/** 把指定片段換到主軌最前面當開場，其他片段順序不變 */
export function swapToOpening(d: ProjectData, clipId: string): ProjectData {
  const idx = d.clips.findIndex((c) => c.id === clipId);
  if (idx <= 0) return d;
  const clips = [...d.clips];
  const [clip] = clips.splice(idx, 1);
  clips.unshift(clip);
  return { ...d, clips };
}
