// 封面推薦精彩畫面：不用任何視覺 AI 模型，純粹在瀏覽器裡輕量取樣整支影片（含濾鏡／貼紙／字幕），
// 用畫面的亮度變異數（對比度高的畫面通常比較清楚、有細節；轉場、淡入淡出、單色畫面則偏平坦）評分，
// 挑出分數最高、彼此時間點也有拉開的幾個候選給使用者選
import { Engine } from './engine';
import type { ProjectData } from './types';

export interface CoverCandidate {
  time: number;
  score: number;
}

const SCORE_SIZE = 96; // 只是拿來評分，不是要顯示，越小讀像素越快

export async function suggestCoverTimes(data: ProjectData, count = 4): Promise<CoverCandidate[]> {
  const canvas = document.createElement('canvas');
  canvas.width = SCORE_SIZE;
  canvas.height = SCORE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  const engine = new Engine(canvas, { speakers: false, watermark: false });
  const scored: CoverCandidate[] = [];
  try {
    engine.setData({ ...data, cover: undefined });
    const duration = engine.duration;
    if (!duration || duration < 0.5) return [];
    await engine.ready();

    const sampleCount = Math.min(30, Math.max(6, Math.round(duration)));
    const step = duration / sampleCount;
    for (let i = 0; i < sampleCount; i++) {
      const t = Math.min((i + 0.5) * step, duration - 0.01);
      await engine.renderAt(t);
      scored.push({ time: t, score: brightnessVariance(ctx) });
    }
  } finally {
    engine.destroy();
  }
  if (!scored.length) return [];

  // 依分數排序，但要求彼此間隔，不然分數最高的幾個常常是同一段連續畫面
  const duration = scored.at(-1)!.time;
  scored.sort((a, b) => b.score - a.score);
  const minGap = duration / (count * 2);
  const picked: CoverCandidate[] = [];
  for (const c of scored) {
    if (picked.every((p) => Math.abs(p.time - c.time) >= minGap)) picked.push(c);
    if (picked.length >= count) break;
  }
  return picked.sort((a, b) => a.time - b.time);
}

function brightnessVariance(ctx: CanvasRenderingContext2D): number {
  const { data, width, height } = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const n = width * height;
  const lum = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const v = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    lum[i] = v;
    sum += v;
  }
  const mean = sum / n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (lum[i] - mean) ** 2;
  return variance / n;
}
