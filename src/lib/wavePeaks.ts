/**
 * 時間軸上音訊片段的真實聲音波形：先把整段音訊算成「每秒 PEAKS_PER_SECOND 個峰值」，
 * 再依片段實際用到的範圍（入點～出點）和畫面寬度，重新取樣成剛好的條數。
 */

export const PEAKS_PER_SECOND = 20;

/** 取樣資料 → 每個時間格取最大振幅（0～1） */
export function peaksFromSamples(samples: ArrayLike<number>, sampleRate: number, perSecond = PEAKS_PER_SECOND): number[] {
  const size = Math.max(1, Math.floor(sampleRate / perSecond));
  const count = Math.ceil(samples.length / size);
  const peaks = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    let max = 0;
    const end = Math.min(samples.length, (i + 1) * size);
    // 跳著看（每 8 個取一個）就夠畫波形，省時間
    for (let j = i * size; j < end; j += 8) {
      const v = Math.abs(samples[j]);
      if (v > max) max = v;
    }
    peaks[i] = Math.min(1, max);
  }
  return peaks;
}

/**
 * 把音訊的 [inPoint, outPoint]（素材秒數）這一段，取樣成 count 條高度（0～1）。
 * peaksPerSecond：peaks 陣列每秒有幾個值（精細的是 PEAKS_PER_SECOND；素材附帶的粗略波形是 長度 / 秒數）。
 */
export function barsFor(peaks: ArrayLike<number>, peaksPerSecond: number, inPoint: number, outPoint: number, count: number): number[] {
  if (!peaks.length || count <= 0 || outPoint <= inPoint) return [];
  const bars = new Array<number>(count);
  const span = outPoint - inPoint;
  for (let i = 0; i < count; i++) {
    const a = Math.floor((inPoint + (span * i) / count) * peaksPerSecond);
    const b = Math.max(a + 1, Math.ceil((inPoint + (span * (i + 1)) / count) * peaksPerSecond));
    let max = 0;
    for (let j = Math.max(0, a); j < Math.min(peaks.length, b); j++) if (peaks[j] > max) max = peaks[j];
    bars[i] = max;
  }
  return bars;
}

/** 波形高度要不要跟著音量縮放：音量越小波形越矮，但至少留一點讓人看得到 */
export const displayHeight = (peak: number, volume: number) => Math.min(1, peak * Math.min(1.2, Math.max(0.2, volume)));
