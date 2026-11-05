// 配樂對齊重點時刻：用配樂庫已經附帶的 peaks（波形能量）資料，找出配樂的「高潮」，
// 對齊到影片第一個智能剪輯標記的重點特寫（punch／shake），純資料比對，不用任何 AI
import { layoutMain } from './timeline';
import type { LibraryTrack, VideoClip } from './types';

/** 在 peaks 陣列裡找出「能量最高」的一小段窗口，回傳窗口中點對應到音檔的秒數 */
export function findPeakMoment(track: Pick<LibraryTrack, 'peaks' | 'duration'>): number {
  const { peaks, duration } = track;
  if (!peaks?.length || !duration) return 0;
  const windowSize = Math.max(1, Math.round(peaks.length / 8)); // 約 1/8 首歌長的窗口
  let bestIndex = 0;
  let bestSum = -Infinity;
  for (let i = 0; i <= peaks.length - windowSize; i++) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) sum += peaks[i + j];
    if (sum > bestSum) {
      bestSum = sum;
      bestIndex = i;
    }
  }
  const centerIndex = bestIndex + windowSize / 2;
  return (centerIndex / peaks.length) * duration;
}

/** 從某個時間點開始，影片裡第一個「重點特寫」（智能剪輯標記的 punch／shake）時間點；沒有就回傳 null */
export function firstHighlightTime(clips: VideoClip[], from = 0): number | null {
  const placed = layoutMain(clips);
  const hit = placed.find((c) => (c.motion === 'punch' || c.motion === 'shake') && c.start >= from);
  return hit ? hit.start : null;
}

/** 配樂加入時，算出要從音檔哪一秒開始播，才能讓配樂的高潮對齊影片下一個重點特寫；
 * 還沒跑過智能剪輯、沒有重點特寫可以對齊時回傳 0，維持原本從頭播放的行為 */
export function alignedTrackOffset(track: Pick<LibraryTrack, 'peaks' | 'duration'>, clips: VideoClip[], playheadTime: number): number {
  const highlight = firstHighlightTime(clips, playheadTime);
  if (highlight === null) return 0;
  const peakMoment = findPeakMoment(track);
  const want = peakMoment - (highlight - playheadTime);
  const maxIn = Math.max(0, track.duration - 1); // 至少留 1 秒可播放
  return Math.min(maxIn, Math.max(0, want));
}
