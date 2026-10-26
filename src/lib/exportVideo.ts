import { Engine } from './engine';
import { supportedExportMimes, waitForReady } from './exportSupport';
import { totalDuration } from './timeline';
import type { ProjectData } from './types';

export interface ExportOptions {
  signal: AbortSignal;
  quality: 720 | 1080;
  watermark: boolean;
  test?: boolean;
  onStage: (stage: string) => void;
  onProgress: (progress: number) => void;
}

export function validateExport(data: ProjectData) {
  const used = [...data.clips, ...data.audio, ...data.overlays];
  for (const clip of used) {
    const media = data.media.find((m) => m.id === clip.mediaId);
    if (!media?.url) throw new Error('專案有遺失的素材，請重新加入素材後再匯出。');
    if ('speed' in clip && media.kind === 'audio') {
      throw new Error(`素材「${media.name}」不是影片或圖片，請從畫面軌移除。`);
    }
    const speed = 'speed' in clip ? clip.speed : 1;
    if (!Number.isFinite(clip.in) || !Number.isFinite(clip.out) || clip.in < 0 || clip.out <= clip.in || !Number.isFinite(speed) || speed <= 0) {
      throw new Error(`素材「${media.name}」的剪輯範圍或速度無效，請調整後再試。`);
    }
    if (media.kind !== 'image' && Number.isFinite(media.duration) && clip.out > media.duration + 0.15) {
      throw new Error(`素材「${media.name}」的剪輯範圍超過素材長度，請縮短片段後再試。`);
    }
    if ('start' in clip && (!Number.isFinite(clip.start) || clip.start < 0)) throw new Error('片段開始時間無效，請調整後再試。');
  }
  const duration = totalDuration(data);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('專案沒有可匯出的內容，請先加入影片、圖片或字幕。');
  return duration;
}

/** One export owns its engine, streams, recorder, timers and cancellation scope. */
export async function exportVideo(canvas: HTMLCanvasElement, source: ProjectData, options: ExportOptions) {
  const { signal, onStage, onProgress } = options;
  const duration = Math.min(validateExport(source), options.test ? 5 : Infinity);
  const mimes = supportedExportMimes();
  if (!mimes.length) throw new Error('此瀏覽器不支援影片匯出，請改用最新版 Chrome、Edge 或 Safari。');
  if (document.visibilityState === 'hidden') throw new Error('請回到這個分頁後再開始匯出。');
  signal.throwIfAborted();
  const used = new Set([...source.clips, ...source.audio, ...source.overlays].map((c) => c.mediaId));
  const data = { ...source, media: source.media.filter((m) => used.has(m.id)) };
  const scope = new AbortController();
  let engine: Engine | undefined;
  let stream: MediaStream | undefined;
  let silence: ConstantSourceNode | undefined;
  let recorder: MediaRecorder | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  let fontTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectRun: (error: Error) => void = () => {};
  let failure: Error | undefined;
  const fail = (error: Error) => { failure ??= error; scope.abort(); rejectRun(error); };
  const abort = () => fail(new DOMException('已取消匯出', 'AbortError'));
  const hidden = () => {
    if (document.visibilityState === 'hidden') fail(new Error('匯出因分頁切到背景而中止。請保持分頁在前景後重新匯出。'));
  };
  const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
  signal.addEventListener('abort', abort, { once: true });
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('beforeunload', beforeUnload);
  try {
    onStage('檢查素材與字型…');
    engine = new Engine(canvas, { speakers: false, watermark: options.watermark });
    engine.onError = fail;
    // Resume during the user's click, before waiting for network or font downloads.
    const audioReady = engine.audioCtx.resume();
    engine.setData(data);
    await Promise.all([
      engine.ready(scope.signal),
      new Promise<void>((resolve, reject) => {
        rejectRun = reject;
        fontTimer = setTimeout(() => reject(new Error('字型或音訊初始化逾時，請重新整理後再試。')), 30_000);
        Promise.all([audioReady, document.fonts.ready]).then(() => resolve(), reject);
      }),
    ]);
    clearTimeout(fontTimer);
    if (failure) throw failure;
    signal.throwIfAborted();
    if (engine.audioCtx.state !== 'running') throw new Error('音訊引擎無法啟動，請點擊重試。');
    // Test capture before recording: a cross-origin canvas must not produce a broken download.
    canvas.toDataURL('image/png');
    // Keep an audio clock even for silent/image-only projects. Otherwise some MP4
    // encoders receive no audio packets and write a truncated duration.
    silence = engine.audioCtx.createConstantSource();
    silence.offset.value = 0;
    silence.connect(engine.recordDest);
    silence.start();
    let canvasStream = canvas.captureStream(0);
    let videoTrack = canvasStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    if (typeof videoTrack.requestFrame !== 'function') {
      canvasStream.getTracks().forEach((track) => track.stop());
      canvasStream = canvas.captureStream(30);
      videoTrack = canvasStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    }
    stream = new MediaStream([...canvasStream.getVideoTracks(), ...engine.recordDest.stream.getAudioTracks()]);
    const blob = await new Promise<Blob>((resolve, reject) => {
      rejectRun = reject;
      let ending = false;
      let chunks: Blob[] = [];
      const stop = () => {
        if (ending) return;
        ending = true;
        engine!.pause();
        onStage('整理影片檔案…');
        stopTimer = setTimeout(() => reject(new Error('影片檔案整理逾時，請以 720p 重試。')), 10_000);
        if (recorder?.state !== 'inactive') recorder?.stop();
      };
      // isTypeSupported is advisory; construction/start can still fail at runtime.
      for (const mime of mimes) {
        try {
          const candidate = new MediaRecorder(stream!, { mimeType: mime, videoBitsPerSecond: options.quality === 1080 ? 10_000_000 : 5_000_000 });
          chunks = [];
          candidate.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
          candidate.onerror = () => fail(new Error('瀏覽器錄製失敗，可能記憶體不足。請以 720p 或較短影片重試。'));
          candidate.onstop = () => {
            if (failure) return;
            if (!ending) return fail(new Error('錄製意外停止，請重新匯出。'));
            const type = candidate.mimeType || mime;
            const result = new Blob(chunks, { type: type.split(';')[0] });
            if (!result.size) return fail(new Error('沒有錄製到影片資料，請重新匯出。'));
            resolve(result);
          };
          recorder = candidate;
          candidate.start(500);
          break;
        } catch {
          if (recorder) {
            recorder.ondataavailable = recorder.onerror = recorder.onstop = null;
            if (recorder.state !== 'inactive') recorder.stop();
          }
          recorder = undefined;
        }
      }
      if (!recorder) return reject(new Error('無法啟動影片編碼器，請以 720p 重試或更換瀏覽器。'));
      onStage(`匯出中（${recorder.mimeType.includes('mp4') ? 'MP4' : 'WebM'}）…`);
      let lastTime = 0;
      let lastAdvance = performance.now();
      let previousFrame = lastAdvance;
      let lastCaptured = -1;
      engine!.onTime = (time) => {
        const now = performance.now();
        if (now - previousFrame > 1500 && !ending) return fail(new Error('裝置忙碌導致畫面中斷，請關閉其他程式或改用 720p 重試。'));
        previousFrame = now;
        // Explicit capture also records unchanged images and the final frame.
        if (time - lastCaptured >= 1 / 30 || time >= duration) {
          videoTrack.requestFrame?.();
          lastCaptured = time;
        }
        if (time > lastTime) { lastTime = time; lastAdvance = now; }
        onProgress(Math.min(time / duration, 0.99));
        if (time >= duration) stop();
      };
      engine!.onEnded = stop;
      const started = performance.now();
      timer = setInterval(() => {
        if (ending) return;
        if (performance.now() - lastAdvance > 10_000 || performance.now() - started > duration * 1000 + 30_000) {
          fail(new Error('匯出進度停滯，請確認素材可播放，並以 720p 重試。'));
        } else if (engine!.audioCtx.state !== 'running') {
          fail(new Error('音訊被瀏覽器中斷，請保持分頁在前景後重新匯出。'));
        }
      }, 1000);
      videoTrack.requestFrame?.();
      void engine!.play().catch((error: unknown) => fail(error instanceof Error ? error : new Error(String(error))));
    });
    onStage('檢查輸出影片…');
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    try {
      video.preload = 'auto';
      video.src = url;
      await waitForReady(video, ['loadeddata', 'loadedmetadata'],
        () => video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0,
        () => !!video.error, '輸出影片', scope.signal);
      if (video.videoWidth !== canvas.width || video.videoHeight !== canvas.height) throw new Error('輸出影片尺寸不正確，請降低畫質後重試。');
      // Some WebM recorders do not write a finite duration until the player indexes the file.
      if (Number.isFinite(video.duration) && Math.abs(video.duration - duration) > Math.max(1, duration * 0.02)) {
        throw new Error(`輸出影片長度不完整（預期 ${duration.toFixed(1)} 秒，實際 ${video.duration.toFixed(1)} 秒），請保持分頁在前景後重新匯出。`);
      }
    } finally {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    }
    if (failure) throw failure;
    signal.throwIfAborted();
    onProgress(1);
    return { blob, ext: blob.type.includes('mp4') ? 'mp4' : 'webm', duration };
  } catch (error) {
    if (failure) throw failure;
    if (error instanceof DOMException && error.name === 'SecurityError') throw new Error('素材的跨網域設定不允許匯出，請下載素材後重新上傳。');
    throw error;
  } finally {
    scope.abort();
    clearTimeout(fontTimer);
    clearTimeout(stopTimer);
    clearInterval(timer);
    signal.removeEventListener('abort', abort);
    document.removeEventListener('visibilitychange', hidden);
    window.removeEventListener('beforeunload', beforeUnload);
    if (recorder) {
      recorder.ondataavailable = recorder.onerror = recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    silence?.stop();
    silence?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    engine?.destroy();
  }
}
