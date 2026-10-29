import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { COVER_IN_VIDEO_SECONDS } from './cover';
import { createDenoiseChain } from './denoise';
import type { Engine } from './engine';
import { decodeAudio } from './media';
import { clipLength, layoutMain } from './timeline';
import type { ProjectData } from './types';

/**
 * 逐格離線匯出：畫面一格一格算好交給 WebCodecs 編碼，聲音用 OfflineAudioContext 一次混好，
 * 最後封裝成 MP4。不需要即時播放，所以不怕掉格、分頁可以在背景，通常也比影片本身還快。
 */

export type ExportBitrate = 'high' | 'standard' | 'small';
export type ExportFps = 24 | 30 | 60;

/** 匯出設定：解析度（短邊）、畫質（位元率等級）、每秒格數 */
export interface ExportSettings {
  quality: 720 | 1080;
  bitrate: ExportBitrate;
  fps: ExportFps;
}

export const DEFAULT_SETTINGS: Omit<ExportSettings, 'quality'> = { bitrate: 'standard', fps: 30 };
export const AUDIO_BITRATE = 160_000;

/**
 * 畫面位元率：標準是 1080p 8 Mbps／720p 4 Mbps（30 格），
 * 高畫質多 60%、省空間減半；60 格約多 50%，24 格略少。
 */
export function videoBitrate({ quality, bitrate, fps }: ExportSettings) {
  const base = quality === 1080 ? 8_000_000 : 4_000_000;
  const level = { high: 1.6, standard: 1, small: 0.5 }[bitrate];
  const rate = fps === 60 ? 1.5 : fps === 24 ? 0.85 : 1;
  return Math.round((base * level * rate) / 100_000) * 100_000;
}

/** 檔案大小上限（位元組）：編碼器用變動位元率，畫面簡單時實際會小很多 */
export function estimateSize(settings: ExportSettings, duration: number) {
  return ((videoBitrate(settings) + AUDIO_BITRATE) * duration) / 8;
}

/** 匯出進行到哪一步：準備素材 → 混合聲音 → 算圖編碼（或即時錄製）→ 封裝檢查 */
export type ExportStep = 'prepare' | 'audio' | 'frames' | 'record' | 'finish';

export interface ExportReporter {
  /** 給人看的一句話（含降級、重試等說明） */
  onStage: (stage: string) => void;
  /** 整體進度 0～1 */
  onProgress: (progress: number) => void;
  onStep?: (step: ExportStep) => void;
  /** 已完成幾格／總共幾格 */
  onFrames?: (done: number, total: number) => void;
}
const SAMPLE_RATE = 48_000;

export interface AudioChoice {
  config: AudioEncoderConfig;
  mux: 'aac' | 'opus';
}

/** 可用的編碼設定，依優先順序排好：畫面先硬體再軟體，聲音先 AAC 再 Opus */
export interface OfflineConfig {
  video: VideoEncoderConfig[];
  audio: AudioChoice[];
}

/** 編碼器本身出錯（不是素材或使用者取消），可以換下一組設定重來 */
export class EncoderError extends Error {
  constructor(readonly part: 'video' | 'audio', message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EncoderError';
  }
}

/** H.264 High 4.0 夠 1080p30；1080p60 需要 4.2 以上，所以先試 5.0 */
const VIDEO_CODECS = ['avc1.640028', 'avc1.640032', 'avc1.4d0028', 'avc1.42e028'];
const VIDEO_CODECS_HIGH_RATE = ['avc1.640032', 'avc1.64002a', 'avc1.4d0032', 'avc1.640028'];

async function supported<T extends VideoEncoderConfig | AudioEncoderConfig>(config: T, check: (c: T) => Promise<{ supported?: boolean }>) {
  try {
    return !!(await check(config)).supported;
  } catch {
    return false;
  }
}

/**
 * 瀏覽器支援 WebCodecs 而且找得到能用的編碼設定才回傳；否則改用即時錄製。
 * 畫面依序找：硬體編碼 → 軟體編碼 → 交給瀏覽器決定，每一層各取第一個支援的 H.264 規格。
 */
export async function offlineConfig(width: number, height: number, settings: ExportSettings): Promise<OfflineConfig | null> {
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined' || typeof VideoFrame === 'undefined' || typeof AudioData === 'undefined') return null;
  const video: VideoEncoderConfig[] = [];
  for (const hardwareAcceleration of ['prefer-hardware', 'prefer-software', 'no-preference'] as const) {
    for (const codec of settings.fps > 30 && width * height > 1280 * 720 ? VIDEO_CODECS_HIGH_RATE : VIDEO_CODECS) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate: videoBitrate(settings),
        framerate: settings.fps,
        hardwareAcceleration,
        latencyMode: 'quality',
        avc: { format: 'avc' },
      };
      if (await supported(config, (c) => VideoEncoder.isConfigSupported(c))) {
        video.push(config);
        break;
      }
    }
  }
  const audio: AudioChoice[] = [];
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']] as const) {
    const config: AudioEncoderConfig = { codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: AUDIO_BITRATE };
    if (await supported(config, (c) => AudioEncoder.isConfigSupported(c))) audio.push({ config, mux });
  }
  return video.length && audio.length ? { video, audio } : null;
}

/**
 * 變速的片段如果有聲音，離線混音會連音調一起變（聲音變尖或變低沉），
 * 預覽時瀏覽器會保持音調，所以這種專案改用即時錄製，匯出才和預覽一樣。
 */
export function needsRealtime(data: ProjectData): boolean {
  const kind = new Map(data.media.map((m) => [m.id, m.kind]));
  return [...data.clips, ...data.overlays].some((c) => c.speed !== 1 && c.volume > 0 && kind.get(c.mediaId) === 'video');
}

/** 影片沒有音軌時當成靜音；純音訊素材讀不到就是錯誤 */
async function audioOf(url: string, required: boolean, name: string): Promise<AudioBuffer | null> {
  try {
    return await decodeAudio(url);
  } catch {
    if (required) throw new Error(`音訊「${name}」無法讀取，請重新上傳後再匯出。`);
    return null;
  }
}

/** 把整條時間軸的聲音一次混成雙聲道 48kHz；規則和預覽一致（轉場交叉淡化、淡入淡出、各自音量） */
export async function mixAudio(data: ProjectData, duration: number, signal: AbortSignal): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * SAMPLE_RATE)), SAMPLE_RATE);
  const media = new Map(data.media.map((m) => [m.id, m]));
  // 人聲、配樂、音效疊在一起可能超過 0dB，先過限幅器，避免編碼時削波爆音
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  limiter.connect(ctx.destination);
  const play = async (buffer: AudioBuffer, at: number, offset: number, length: number, rate: number, shape: (g: AudioParam) => void, denoiseStrength = 0) => {
    if (length <= 0 || at >= duration) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    shape(gain.gain);
    if (denoiseStrength > 0) {
      const chain = await createDenoiseChain(ctx);
      chain.setStrength(denoiseStrength);
      src.connect(chain.input);
      chain.output.connect(gain).connect(limiter);
    } else {
      src.connect(gain).connect(limiter);
    }
    src.start(at, offset, length);
  };

  const placed = layoutMain(data.clips);
  for (const [i, c] of placed.entries()) {
    signal.throwIfAborted();
    const m = media.get(c.mediaId);
    if (m?.kind !== 'video' || c.volume <= 0) continue;
    const buffer = await audioOf(m.url, false, m.name);
    if (!buffer) continue;
    const fadeIn = c.overlap;
    const fadeOut = placed[i + 1]?.overlap ?? 0;
    await play(
      buffer,
      c.start,
      c.in,
      (c.end - c.start) * c.speed,
      c.speed,
      (g) => {
        g.setValueAtTime(fadeIn > 0 ? 0 : c.volume, c.start);
        if (fadeIn > 0) g.linearRampToValueAtTime(c.volume, c.start + fadeIn);
        if (fadeOut > 0) {
          g.setValueAtTime(c.volume, c.end - fadeOut);
          g.linearRampToValueAtTime(0, c.end);
        }
      },
      c.denoise?.strength ?? 0,
    );
  }
  for (const o of data.overlays) {
    signal.throwIfAborted();
    const m = media.get(o.mediaId);
    if (m?.kind !== 'video' || o.volume <= 0) continue;
    const buffer = await audioOf(m.url, false, m.name);
    if (buffer) await play(buffer, o.start, o.in, o.out - o.in, o.speed, (g) => g.setValueAtTime(o.volume, o.start));
  }
  for (const a of data.audio) {
    signal.throwIfAborted();
    const m = media.get(a.mediaId);
    if (!m || a.volume <= 0) continue;
    const buffer = await audioOf(m.url, true, m.name);
    if (!buffer) continue;
    const len = clipLength(a);
    await play(buffer, a.start, a.in, a.out - a.in, 1, (g) => {
      g.setValueAtTime(a.fadeIn ? 0 : a.volume, a.start);
      if (a.fadeIn) g.linearRampToValueAtTime(a.volume, a.start + Math.min(a.fadeIn, len));
      if (a.fadeOut) {
        g.setValueAtTime(a.volume, a.start + Math.max(0, len - a.fadeOut));
        g.linearRampToValueAtTime(0, a.start + len);
      }
    });
  }
  signal.throwIfAborted();
  return ctx.startRendering();
}

/** 編碼器多久沒有消化任何一格就當成卡死（硬體編碼器偶爾會無聲無息停住） */
const STALL_MS = 15_000;

/** 編碼器塞太多就等它消化，避免記憶體一路往上；不支援 dequeue 事件的瀏覽器改用輪詢 */
async function drain(encoder: VideoEncoder | AudioEncoder, max: number, part: 'video' | 'audio', check: () => void) {
  let last = encoder.encodeQueueSize;
  let since = performance.now();
  while (encoder.encodeQueueSize > max) {
    check();
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        encoder.removeEventListener('dequeue', done);
        resolve();
      };
      const timer = setTimeout(done, 20);
      encoder.addEventListener('dequeue', done);
    });
    if (encoder.encodeQueueSize < last) {
      last = encoder.encodeQueueSize;
      since = performance.now();
    } else if (performance.now() - since > STALL_MS) {
      throw new EncoderError(part, '編碼器沒有回應');
    }
  }
}

/** flush 也可能卡住，加上逾時 */
async function flush(encoder: VideoEncoder | AudioEncoder, part: 'video' | 'audio') {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      encoder.flush(),
      new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new EncoderError(part, '編碼器沒有回應')), STALL_MS * 2))),
    ]);
  } catch (error) {
    throw error instanceof EncoderError ? error : new EncoderError(part, '編碼失敗', { cause: error });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 用指定的一組編碼設定把整支影片編好。編碼器出的任何錯都包成 EncoderError，
 * 讓呼叫端換下一組設定從頭重來；素材讀不到、使用者取消等錯誤照原樣丟出。
 * 聲音事先混好（mixed）傳進來，重試時不必再混一次。
 */
export async function encodeOffline(
  engine: Engine,
  canvas: HTMLCanvasElement,
  mixed: AudioBuffer,
  duration: number,
  video: VideoEncoderConfig,
  audio: AudioChoice,
  signal: AbortSignal,
  report: ExportReporter,
  /** 影片開頭顯示的封面（已畫好的畫面）；沒有就從第一格開始正常算圖 */
  cover?: HTMLCanvasElement | null,
): Promise<Blob> {
  const { onStage, onProgress } = report;
  const fps = video.framerate ?? 30;
  const coverFrames = cover ? Math.max(1, Math.round(COVER_IN_VIDEO_SECONDS * fps)) : 0;
  const keyframeEvery = Math.round(fps * 2);
  let failure: EncoderError | null = null;
  const fail = (part: 'video' | 'audio') => (error: unknown) => {
    failure ??= new EncoderError(part, error instanceof Error ? error.message : String(error), { cause: error });
  };
  const check = () => {
    if (failure) throw failure;
    signal.throwIfAborted();
  };
  /** 編碼器的同步呼叫（configure／encode）丟出的錯也算編碼器錯誤 */
  const guard = <T>(part: 'video' | 'audio', run: () => T): T => {
    try {
      return run();
    } catch (error) {
      throw new EncoderError(part, error instanceof Error ? error.message : String(error), { cause: error });
    }
  };

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width: canvas.width, height: canvas.height, frameRate: fps },
    audio: { codec: audio.mux, numberOfChannels: 2, sampleRate: SAMPLE_RATE },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });
  let audioEncoder: AudioEncoder | null = null;
  let videoEncoder: VideoEncoder | null = null;

  try {
    // 1. 聲音（佔進度的 5%～10%）
    report.onStep?.('audio');
    audioEncoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: fail('audio') });
    const ae = audioEncoder;
    guard('audio', () => ae.configure(audio.config));
    const left = mixed.getChannelData(0);
    const right = mixed.getChannelData(1);
    const block = SAMPLE_RATE / 10;
    for (let i = 0; i < mixed.length; i += block) {
      check();
      const n = Math.min(block, mixed.length - i);
      const planar = new Float32Array(n * 2);
      planar.set(left.subarray(i, i + n), 0);
      planar.set(right.subarray(i, i + n), n);
      const chunk = new AudioData({ format: 'f32-planar', sampleRate: SAMPLE_RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SAMPLE_RATE) * 1e6), data: planar });
      try {
        guard('audio', () => ae.encode(chunk));
      } finally {
        chunk.close();
      }
      await drain(ae, 32, 'audio', check);
      onProgress(0.05 + 0.05 * (i / mixed.length));
    }
    await flush(ae, 'audio');
    check();

    // 2. 畫面：一格一格畫好就編碼（佔進度的 10%～98%）
    videoEncoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: fail('video') });
    const ve = videoEncoder;
    guard('video', () => ve.configure(video));
    const frames = Math.max(1, Math.ceil(duration * fps - 1e-6));
    // 先排好每個片段要取的所有時間點，解碼器才能一路往前解，不必每格跳轉
    const schedule = new Map<string, { url: string; times: number[] }>();
    // 封面那幾格不用解碼影片，排程從封面之後開始
    for (let i = coverFrames; i < frames; i++) {
      for (const { key, url, time } of engine.videoTargets(Math.min(i / fps, duration))) {
        let entry = schedule.get(key);
        if (!entry) schedule.set(key, (entry = { url, times: [] }));
        entry.times.push(time);
      }
    }
    // 解碼器（mediabunny）只在匯出時才載入，不拖慢編輯器開啟
    const { FrameDecoder } = await import('./frameDecoder');
    engine.decoder = new FrameDecoder(schedule);
    const frameUs = 1e6 / fps;
    report.onStep?.('frames');
    report.onFrames?.(0, frames);
    onStage('算圖與編碼…');
    // 每格都更新畫面太頻繁，約每 0.1 秒回報一次
    let reported = 0;
    try {
      for (let i = 0; i < frames; i++) {
        check();
        if (cover && i < coverFrames) canvas.getContext('2d')!.drawImage(cover, 0, 0, canvas.width, canvas.height);
        else await engine.renderAt(i / fps, signal);
        const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
        try {
          guard('video', () => ve.encode(frame, { keyFrame: i % keyframeEvery === 0 }));
        } finally {
          frame.close();
        }
        await drain(ve, 4, 'video', check);
        const now = performance.now();
        if (now - reported > 100 || i === frames - 1) {
          reported = now;
          onProgress(0.1 + 0.88 * ((i + 1) / frames));
          report.onFrames?.(i + 1, frames);
        }
      }
    } finally {
      engine.decoder?.dispose();
      engine.decoder = null;
    }
    report.onStep?.('finish');
    onStage('整理影片檔案…');
    await flush(ve, 'video');
    check();
    muxer.finalize();
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    for (const encoder of [audioEncoder, videoEncoder]) {
      if (encoder && encoder.state !== 'closed') encoder.close();
    }
  }
}
