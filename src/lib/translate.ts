/**
 * 字幕翻譯（雙語字幕）：在瀏覽器裡用翻譯模型把中文字幕翻成英文，第一次會下載模型並快取。
 * 之後要加其他語言，在 TRANSLATE_TARGETS 加一筆模型即可。
 */
export const TRANSLATE_TARGETS = [{ id: 'en', label: '英文', model: 'Xenova/opus-mt-zh-en' }] as const;
export type TranslateTarget = (typeof TRANSLATE_TARGETS)[number]['id'];

type Progress = (info: { phase: 'download' | 'translating'; progress: number }) => void;

let worker: Worker | null = null;
let seq = 0;

function getWorker() {
  worker ??= new Worker(new URL('./translate.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

export function translateTexts(texts: string[], target: TranslateTarget, onProgress: Progress): Promise<string[]> {
  const model = TRANSLATE_TARGETS.find((t) => t.id === target)!.model;
  const w = getWorker();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === 'download') return onProgress({ phase: 'download', progress: m.progress });
      if (m.id !== id) return;
      if (m.type === 'progress') onProgress({ phase: 'translating', progress: (m.done / m.total) * 100 });
      if (m.type === 'error') {
        w.removeEventListener('message', handler);
        reject(new Error(m.error));
      }
      if (m.type === 'result') {
        w.removeEventListener('message', handler);
        resolve(m.texts);
      }
    };
    w.addEventListener('message', handler);
    w.postMessage({ id, model, texts });
  });
}
