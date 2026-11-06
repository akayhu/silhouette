import { decodeAudio, sliceMono } from './media';
import { audioCategoryOf } from './timeline';
import type { AudioClip, MediaItem, ProjectData } from './types';

/**
 * 多段配音自動拉齊音量：Pixelle 這類全自動引擎的旁白都來自同一個 TTS 模型，音量天生一致；
 * 片刻剪趣混用多段朗讀或錄音時沒有這個保證，這裡純用訊號量測（RMS 音量）把各段拉到同一個目標音量，
 * 不是聽得懂內容的 AI。
 */

const TARGET_RMS_DB = -20;
const TARGET_RMS = Math.pow(10, TARGET_RMS_DB / 20);
const MIN_VOLUME = 0.1;
const MAX_VOLUME = 2;

/** 一段配音在 [clip.in, clip.out) 範圍內的平均音量（RMS，0~1）；算不出來（太短、解碼失敗）回傳 null */
async function clipRms(media: MediaItem, clip: AudioClip): Promise<number | null> {
  try {
    const buffer = await decodeAudio(media.url);
    const from = clip.in;
    const to = Math.min(clip.out, buffer.duration);
    if (to - from < 0.1) return null;
    const samples = await sliceMono(buffer, from, to, 8000);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    return rms > 0 ? rms : null;
  } catch {
    return null;
  }
}

export interface LevelMatchResult {
  /** clip id → 新的 volume；算不出來的段落不會出現，維持原音量 */
  volumes: Map<string, number>;
}

/** 分析所有朗讀配音段落的音量，算出要拉齊到同一個目標音量各自需要的新 volume */
export async function matchVoiceLevels(d: Pick<ProjectData, 'audio' | 'media'>): Promise<LevelMatchResult> {
  const mediaById = new Map(d.media.map((m) => [m.id, m]));
  const voiceClips = d.audio.filter((a) => audioCategoryOf(mediaById.get(a.mediaId)) === 'voice');
  const volumes = new Map<string, number>();
  for (const clip of voiceClips) {
    const media = mediaById.get(clip.mediaId);
    if (!media) continue;
    const rms = await clipRms(media, clip);
    if (rms === null) continue;
    volumes.set(clip.id, Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, TARGET_RMS / rms)));
  }
  return { volumes };
}

/** 套用分析結果：只改有分析到的段落的音量 */
export function applyLevelMatch(d: ProjectData, result: LevelMatchResult): ProjectData {
  if (!result.volumes.size) return d;
  return { ...d, audio: d.audio.map((a) => (result.volumes.has(a.id) ? { ...a, volume: result.volumes.get(a.id)! } : a)) };
}
