import { mixAudio } from './offlineExport';
import type { ProjectData } from './types';

/**
 * 匯出前檢查「混好的整軌」音量：levelMatch.ts 只會拉齊口白片段彼此之間的音量，
 * 但口白、配樂、音效疊在一起之後的整體音量多大完全沒人管，很容易匯出後才發現太小聲或太吵。
 * 這裡直接重用匯出真正會跑的 mixAudio 把整條時間軸混成最終音軌（含限幅器），量整軌 RMS，
 * 跟 levelMatch.ts／denoiseRecommend.ts 一樣純用訊號量測，不是聽得懂內容的 AI。
 */

const TARGET_RMS_DB = -18;
/** 偏離目標超過這個 dB 才提醒，避免正常範圍內也跳提示 */
const FLAG_THRESHOLD_DB = 3;
const MIN_GAIN = 0.3;
const MAX_GAIN = 3;
/** 音量欄位的上限（UI 滑桿也是 0~200%） */
const MAX_VOLUME = 2;

export interface MixLoudnessResult {
  /** 混音後整軌的 RMS（dBFS） */
  rmsDb: number;
  /** 建議的整體音量倍率；落在合理範圍內時為 1（不需要調整） */
  suggestedGain: number;
}

/** 混出整條時間軸的最終音軌，量 RMS 跟目標音量比對；時間軸太短或完全沒聲音回傳 null */
export async function analyzeMixLoudness(data: ProjectData, duration: number, signal: AbortSignal): Promise<MixLoudnessResult | null> {
  if (duration < 0.5) return null;
  const buffer = await mixAudio(data, duration, signal);
  let sum = 0;
  let count = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const samples = buffer.getChannelData(ch);
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    count += samples.length;
  }
  if (count === 0) return null;
  const rms = Math.sqrt(sum / count);
  if (rms <= 0) return null;
  const rmsDb = 20 * Math.log10(rms);
  if (Math.abs(rmsDb - TARGET_RMS_DB) < FLAG_THRESHOLD_DB) return { rmsDb, suggestedGain: 1 };
  const gain = Math.pow(10, (TARGET_RMS_DB - rmsDb) / 20);
  return { rmsDb, suggestedGain: Math.max(MIN_GAIN, Math.min(MAX_GAIN, gain)) };
}

/** 套用建議：等比例調整所有有聲音的片段（主軌片段原音、配樂/口白/音效、疊加片段）的音量 */
export function applyMixGain(d: ProjectData, gain: number): ProjectData {
  if (gain === 1) return d;
  const scale = (v: number) => Math.max(0, Math.min(MAX_VOLUME, v * gain));
  return {
    ...d,
    clips: d.clips.map((c) => (c.volume > 0 ? { ...c, volume: scale(c.volume) } : c)),
    audio: d.audio.map((a) => (a.volume > 0 ? { ...a, volume: scale(a.volume) } : a)),
    overlays: d.overlays.map((o) => (o.volume > 0 ? { ...o, volume: scale(o.volume) } : o)),
  };
}
