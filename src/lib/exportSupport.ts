/** Shared bounded waits: preparation must fail explicitly instead of exporting missing media. */
export function waitForReady(
  target: EventTarget,
  events: string[],
  ready: () => boolean,
  failed: () => boolean,
  label: string,
  signal?: AbortSignal,
  timeout = 30_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      for (const event of events) target.removeEventListener(event, check);
      target.removeEventListener('error', error);
      signal?.removeEventListener('abort', abort);
    };
    const finish = (reason?: Error) => { cleanup(); reason ? reject(reason) : resolve(); };
    const error = () => finish(new Error(`${label}無法載入，請確認素材仍可播放，或重新上傳。`));
    const abort = () => finish(new DOMException('已取消匯出', 'AbortError'));
    const check = () => { if (failed()) error(); else if (ready()) finish(); };
    const timer = setTimeout(() => finish(new Error(`${label}載入逾時，請確認網路後再試。`)), timeout);
    for (const event of events) target.addEventListener(event, check);
    target.addEventListener('error', error);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort(); else check();
  });
}

export const EXPORT_MIMES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];

export function supportedExportMimes(): string[] {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return [];
  return EXPORT_MIMES.filter((mime) => MediaRecorder.isTypeSupported(mime));
}
