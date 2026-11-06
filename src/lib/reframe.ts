import { columnMotionEnergy } from './mixEdit';
import type { ClipTransform, MediaItem } from './types';

/**
 * 智能取景：16:9 素材裁成 9:16（或其他長寬比不同）時，目前永遠置中裁切，容易切掉畫面重點。
 * 這裡用混剪既有的畫面動態分析（純像素比對，不是看得懂內容的 AI），
 * 把畫面切成幾條直欄，比對哪一欄動得比較多，推算重點大概在哪一邊，算出裁切該用的水平位移。
 */

const SAMPLE_WINDOW = 3;
const COLUMNS = 5;
/** 裁切空間太小（幾乎跟畫布一樣寬）就沒什麼好調的 */
const MIN_EDGE = 0.04;
/** 重點要明顯偏一邊才建議，避免雜訊造成無意義的微調 */
const MIN_IMBALANCE = 0.15;

export interface ReframeSuggestion {
  x: number;
}

export async function suggestReframeX(
  media: MediaItem,
  from: number,
  to: number,
  opts: { fit: ClipTransform['fit']; scale: number; W: number; H: number },
): Promise<ReframeSuggestion | null> {
  if (opts.fit !== 'cover' || media.kind !== 'video' || !media.width || !media.height) return null;
  const { W, H, scale } = opts;
  const sw = media.width;
  const sh = media.height;
  const base = Math.max(W / sw, H / sh);
  const dw = sw * base * scale;
  const edge = Math.abs((1 - dw / W) / 2);
  if (edge < MIN_EDGE) return null;

  const windowSec = Math.min(SAMPLE_WINDOW, to - from);
  if (windowSec < 0.3) return null;
  const start = from + Math.max(0, (to - from - windowSec) / 2);
  const energy = await columnMotionEnergy(media, start, windowSec, COLUMNS);
  if (!energy) return null;
  const total = energy.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  const centroid = energy.reduce((acc, e, i) => acc + (i + 0.5) * e, 0) / (COLUMNS * total);
  if (Math.abs(centroid - 0.5) < MIN_IMBALANCE) return null;

  const x = Math.max(-edge, Math.min(edge, (dw / W) * (0.5 - centroid)));
  return Math.abs(x) < 0.01 ? null : { x };
}
