import type { MediaKind } from './types';

export function kindOf(file: File): MediaKind | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  return null;
}

/** 讀取長度與尺寸（用本機 object URL，不必等上傳完成） */
export function probe(src: string, kind: MediaKind): Promise<{ duration: number; width?: number; height?: number }> {
  return new Promise((resolve, reject) => {
    if (kind === 'image') {
      const img = new Image();
      img.onload = () => resolve({ duration: 3, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('無法讀取圖片'));
      img.src = src;
      return;
    }
    const el = document.createElement(kind);
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const v = el as HTMLVideoElement;
      resolve({ duration: el.duration, width: v.videoWidth || undefined, height: v.videoHeight || undefined });
    };
    el.onerror = () => reject(new Error('這個檔案格式瀏覽器無法播放'));
    el.src = src;
  });
}

/** 擷取影片某一格當作縮圖 */
export function videoPoster(src: string, at = 0.5): Promise<string> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.src = src;
    v.onloadeddata = () => {
      v.currentTime = Math.min(at, v.duration / 2);
    };
    v.onseeked = () => {
      const c = document.createElement('canvas');
      const scale = 240 / Math.max(v.videoWidth, v.videoHeight);
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    v.onerror = () => resolve('');
  });
}

const audioCache = new Map<string, Promise<AudioBuffer>>();

/** 解碼整個檔案的音軌（同一個檔案只解碼一次） */
export function decodeAudio(url: string): Promise<AudioBuffer> {
  if (!audioCache.has(url)) {
    audioCache.set(
      url,
      (async () => {
        const buf = await (await fetch(url)).arrayBuffer();
        const ctx = new OfflineAudioContext(1, 1, 44100);
        return ctx.decodeAudioData(buf);
      })().catch((e) => {
        audioCache.delete(url);
        throw new Error('這段影片沒有可分析的音軌：' + (e as Error).message);
      }),
    );
  }
  return audioCache.get(url)!;
}

/** 取出 [from, to) 秒的片段，轉成單聲道並重新取樣（Whisper 需要 16kHz） */
export async function sliceMono(buffer: AudioBuffer, from: number, to: number, sampleRate: number) {
  const length = Math.max(1, Math.ceil((to - from) * sampleRate));
  const ctx = new OfflineAudioContext(1, length, sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  src.start(0, from, to - from);
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

export interface SilenceOptions {
  /** 低於此音量（dBFS）視為靜音 */
  thresholdDb: number;
  /** 靜音至少持續多久才剪 */
  minSilence: number;
  /** 剪掉後前後保留的緩衝 */
  padding: number;
}

/** 回傳來源檔案時間（秒）中的靜音區段 */
export async function detectSilence(buffer: AudioBuffer, from: number, to: number, opts: SilenceOptions) {
  const sr = 8000;
  const samples = await sliceMono(buffer, from, to, sr);
  const win = Math.round(sr * 0.02);
  const threshold = Math.pow(10, opts.thresholdDb / 20);
  const silent: [number, number][] = [];
  let runStart = -1;
  const windows = Math.floor(samples.length / win);
  for (let w = 0; w <= windows; w++) {
    let rms = 1;
    if (w < windows) {
      let sum = 0;
      for (let i = w * win; i < (w + 1) * win; i++) sum += samples[i] * samples[i];
      rms = Math.sqrt(sum / win);
    }
    const t = (w * win) / sr;
    if (rms < threshold) {
      if (runStart < 0) runStart = t;
    } else if (runStart >= 0) {
      if (t - runStart >= opts.minSilence) {
        const a = runStart === 0 ? 0 : runStart + opts.padding;
        const b = w === windows ? t : t - opts.padding;
        if (b - a > 0.05) silent.push([from + a, from + b]);
      }
      runStart = -1;
    }
  }
  return silent;
}
