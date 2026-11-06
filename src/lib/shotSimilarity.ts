// 連續鏡頭相似度檢查：相鄰兩段主軌畫面太像時提示「接得不明顯」；
// 跟 filterRecommend.ts 用同一種縮圖取樣手法，純色彩統計，不是看得懂內容的 AI——
// 抓不到「同一個人換了角度」之類的語意相似，也可能把色調接近但內容不同的畫面誤判成相似。
import { layoutMain } from './timeline';
import type { MediaItem, VideoClip } from './types';

const GRID = 4;
const SAMPLE_SIZE = GRID * 12;
/** 每個色版平均差異在這個值以內才算「很像」（0-255 色階） */
const SIMILAR_THRESHOLD = 12;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 把縮圖切成 GRID x GRID 格，各格平均色，當作這段畫面的色彩指紋 */
function colorSignature(img: HTMLImageElement): number[] | null {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const cell = SAMPLE_SIZE / GRID;
  const sig = new Array(GRID * GRID * 3).fill(0);
  const counts = new Array(GRID * GRID).fill(0);
  for (let y = 0; y < SAMPLE_SIZE; y++) {
    for (let x = 0; x < SAMPLE_SIZE; x++) {
      const cellIdx = Math.min(GRID - 1, Math.floor(y / cell)) * GRID + Math.min(GRID - 1, Math.floor(x / cell));
      const i = (y * SAMPLE_SIZE + x) * 4;
      sig[cellIdx * 3] += data[i];
      sig[cellIdx * 3 + 1] += data[i + 1];
      sig[cellIdx * 3 + 2] += data[i + 2];
      counts[cellIdx]++;
    }
  }
  for (let c = 0; c < GRID * GRID; c++) for (let k = 0; k < 3; k++) sig[c * 3 + k] /= counts[c] || 1;
  return sig;
}

const distance = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;

export interface SimilarShotPair {
  prevId: string;
  nextId: string;
  /** 兩段的接點時間（主軌時間軸秒數），方便跳過去看 */
  at: number;
}

/** 找出主軌上相鄰兩段畫面太像的地方；只看有縮圖的素材，同一支素材接續播放（分割片段）不算「兩段很像」 */
export async function findSimilarAdjacentShots(clips: VideoClip[], mediaById: Map<string, MediaItem>): Promise<SimilarShotPair[]> {
  const placed = layoutMain(clips);
  const sigCache = new Map<string, Promise<number[] | null>>();
  const sigOf = (mediaId: string) => {
    if (!sigCache.has(mediaId)) {
      const thumb = mediaById.get(mediaId)?.thumb;
      sigCache.set(mediaId, thumb ? loadImage(thumb).then((img) => (img ? colorSignature(img) : null)) : Promise.resolve(null));
    }
    return sigCache.get(mediaId)!;
  };

  const pairs: SimilarShotPair[] = [];
  for (let i = 1; i < placed.length; i++) {
    const prev = placed[i - 1];
    const next = placed[i];
    if (prev.mediaId === next.mediaId) continue;
    const [a, b] = await Promise.all([sigOf(prev.mediaId), sigOf(next.mediaId)]);
    if (!a || !b) continue;
    if (distance(a, b) <= SIMILAR_THRESHOLD) pairs.push({ prevId: prev.id, nextId: next.id, at: next.start });
  }
  return pairs;
}
