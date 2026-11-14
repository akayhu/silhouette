import { defaultCover, renderCover } from './cover';
import { audioIssues, audioStats, frameIssues, meanLuma, type AudioStats, type ExportIssue, type FrameSample } from './exportCheckCore';
import type { ProjectData } from './types';

export type { ExportIssue } from './exportCheckCore';

/**
 * 匯出完成後自動檢查：抽幾格畫面跟預覽比對、檢查聲音有沒有靜音或爆音。
 * 全部在瀏覽器裡算，檢查失敗（例如瀏覽器解不開）只當作沒檢查，不會擋住下載。
 */

export interface ExportCheck {
  /** 完成了哪些檢查，給使用者看「檢查了什麼」 */
  checked: string[];
  issues: ExportIssue[];
  /** 檢查本身沒做完（例如被取消、瀏覽器不支援） */
  incomplete?: string;
}

const SAMPLE_AT = [0.06, 0.3, 0.55, 0.8, 0.95];
const THUMB_W = 48;

/** 專案裡有沒有會發出聲音的東西 */
export function expectsAudio(d: Pick<ProjectData, 'media' | 'clips' | 'audio' | 'overlays'>): boolean {
  const kind = new Map(d.media.map((m) => [m.id, m.kind]));
  return d.audio.some((a) => a.volume > 0) || [...d.clips, ...d.overlays].some((c) => c.volume > 0 && kind.get(c.mediaId) === 'video');
}

const withTimeout = <T,>(p: Promise<T>, ms: number, label: string) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(label + '逾時')), ms))]);

async function loadVideo(url: string): Promise<HTMLVideoElement> {
  const v = document.createElement('video');
  v.muted = true;
  v.preload = 'auto';
  v.src = url;
  await withTimeout(new Promise<void>((res, rej) => {
    v.onloadeddata = () => res();
    v.onerror = () => rej(new Error('無法讀取匯出的影片'));
  }), 15000, '讀取影片');
  return v;
}

async function seek(v: HTMLVideoElement, t: number) {
  await withTimeout(new Promise<void>((res) => {
    v.onseeked = () => res();
    v.currentTime = t;
  }), 8000, '跳到指定畫面');
}

const lumaOfCanvas = (c: HTMLCanvasElement | HTMLVideoElement, h: number) => {
  const cv = document.createElement('canvas');
  cv.width = THUMB_W;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(c, 0, 0, THUMB_W, h);
  return meanLuma(ctx.getImageData(0, 0, THUMB_W, h).data);
};

async function audioOf(blob: Blob): Promise<AudioStats | null> {
  try {
    const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await blob.arrayBuffer());
    if (!buf.length) return null;
    return audioStats(buf.getChannelData(0));
  } catch {
    return null;
  }
}

export async function checkExportOutput(blob: Blob, data: ProjectData, duration: number, signal: AbortSignal): Promise<ExportCheck> {
  const checked: string[] = [];
  const issues: ExportIssue[] = [];
  const url = URL.createObjectURL(blob);
  try {
    const video = await loadVideo(url);
    const h = Math.max(8, Math.round((THUMB_W * video.videoHeight) / Math.max(1, video.videoWidth)));
    const samples: FrameSample[] = [];
    for (const f of SAMPLE_AT) {
      if (signal.aborted) return { checked, issues, incomplete: '已取消' };
      const t = Math.max(0, Math.min(duration - 0.1, duration * f));
      await seek(video, t);
      const out = lumaOfCanvas(video, h);
      const src = lumaOfCanvas(await renderCover(data, { ...defaultCover(), time: t }, THUMB_W * 4, h * 4), h);
      samples.push({ t, out, src });
    }
    issues.push(...frameIssues(samples));
    checked.push(`抽 ${samples.length} 格畫面和預覽比對`);
    if (signal.aborted) return { checked, issues, incomplete: '已取消' };
    issues.push(...audioIssues(await audioOf(blob), expectsAudio(data)));
    checked.push('聲音（靜音、爆音）');
    return { checked, issues };
  } catch (e) {
    return { checked, issues, incomplete: (e as Error).message };
  } finally {
    URL.revokeObjectURL(url);
  }
}
