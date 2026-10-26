/// <reference lib="webworker" />
import { pipeline, type TranslationPipeline } from '@huggingface/transformers';

type InMsg = { id: number; model: string; texts: string[] };

const loaded = new Map<string, Promise<TranslationPipeline>>();

function load(model: string) {
  if (!loaded.has(model)) {
    const files = new Map<string, { loaded: number; total: number }>();
    let shown = 0;
    loaded.set(
      model,
      pipeline('translation', model, {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (p.status !== 'progress' || !p.file) return;
          files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
          let a = 0;
          let b = 0;
          for (const v of files.values()) {
            a += v.loaded;
            b += v.total;
          }
          shown = Math.max(shown, b ? (a / b) * 100 : 0);
          self.postMessage({ type: 'download', progress: shown });
        },
      }) as unknown as Promise<TranslationPipeline>,
    );
  }
  return loaded.get(model)!;
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const { id, model, texts } = e.data;
  try {
    const translate = await load(model);
    const out: string[] = [];
    // 一句一句翻，才能回報進度；字幕都很短，速度差不多
    for (const [i, text] of texts.entries()) {
      const r = (await translate(text, { max_new_tokens: 96 })) as { translation_text: string }[];
      out.push(r[0]?.translation_text?.trim() ?? '');
      self.postMessage({ type: 'progress', id, done: i + 1, total: texts.length });
    }
    self.postMessage({ type: 'result', id, texts: out });
  } catch (err) {
    self.postMessage({ type: 'error', id, error: (err as Error).message });
  }
};
