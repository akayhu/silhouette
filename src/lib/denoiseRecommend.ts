import { decodeAudio, detectSilence } from './media';
import type { MediaItem, VideoClip } from './types';

/**
 * 依這段素材音訊的噪音基準建議降噪強度：跟 autoEdit.ts 升級 ASR 模型用的同一個訊號（detectSilence
 * 的 onNoiseFloor），安靜環境維持關閉，噪音越高建議強度越高，不用自己猜要不要開、開多少。
 */

/** 噪音基準低於這個值（dBFS）算乾淨，不建議開降噪 */
const QUIET_FLOOR_DB = -45;
/** 噪音基準高於這個值算吵雜，建議開到接近最強 */
const NOISY_FLOOR_DB = -25;

export async function suggestDenoiseStrength(media: MediaItem, clip: Pick<VideoClip, 'in' | 'out'>): Promise<number> {
  try {
    const buffer = await decodeAudio(media.url);
    const from = clip.in;
    const to = Math.min(clip.out, buffer.duration);
    if (to - from < 0.1) return 0;
    let floorDb = -80;
    await detectSilence(buffer, from, to, { minSilence: 0.5, padding: 0.12, onNoiseFloor: (db) => (floorDb = db) });
    if (floorDb <= QUIET_FLOOR_DB) return 0;
    if (floorDb >= NOISY_FLOOR_DB) return 90;
    const t = (floorDb - QUIET_FLOOR_DB) / (NOISY_FLOOR_DB - QUIET_FLOOR_DB);
    return Math.round(30 + t * 60);
  } catch {
    return 0;
  }
}
