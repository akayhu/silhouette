/// <reference lib="webworker" />
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

type InMsg = { type: 'transcribe'; id: number; model: string; audio: Float32Array; words?: boolean };
type Chunk = { timestamp: [number, number | null]; text: string };

const loaded = new Map<string, Promise<AutomaticSpeechRecognitionPipeline>>();

function load(model: string) {
  if (!loaded.has(model)) {
    const device = 'gpu' in navigator ? 'webgpu' : 'wasm';
    // 模型分成好幾個檔案下載，合併成一個整體進度，數字只會往上
    const files = new Map<string, { loaded: number; total: number }>();
    let shown = 0;
    const make = (dev: 'webgpu' | 'wasm') =>
      pipeline('automatic-speech-recognition', model, {
        device: dev,
        dtype: dev === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
        progress_callback: (p: { status: string; file?: string; progress?: number; loaded?: number; total?: number }) => {
          if (p.status !== 'progress' || !p.file) return;
          files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
          let loadedBytes = 0;
          let totalBytes = 0;
          for (const v of files.values()) {
            loadedBytes += v.loaded;
            totalBytes += v.total;
          }
          shown = Math.max(shown, totalBytes ? (loadedBytes / totalBytes) * 100 : 0);
          self.postMessage({ type: 'download', progress: shown });
        },
      }) as unknown as Promise<AutomaticSpeechRecognitionPipeline>;
    loaded.set(model, make(device).catch(() => make('wasm')));
  }
  return loaded.get(model)!;
}

/**
 * 指定語言時，輸出裡不會有語言標記，transformers.js 會當成英文、用空白切「字」，
 * 中文整句就變成一個字。這裡預設成中文，改成逐字（依 Unicode 字元）切。
 */
function forceChineseWords(asr: AutomaticSpeechRecognitionPipeline) {
  const tok = asr.tokenizer as unknown as { combineTokensIntoWords: (t: number[], lang?: string, ...rest: unknown[]) => unknown; __zhWords?: boolean };
  if (tok.__zhWords) return;
  const original = tok.combineTokensIntoWords.bind(tok);
  tok.combineTokensIntoWords = (tokens, lang, ...rest) => original(tokens, lang ?? 'chinese', ...rest);
  tok.__zhWords = true;
}

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const { id, model, audio, words } = e.data;
  try {
    const options = { language: 'chinese', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 } as const;
    const fallback = () => [{ timestamp: [0, audio.length / 16000] as [number, number], text: '' }];
    if (words) {
      // 逐字時間需要模型輸出 cross-attention；一般版沒有就改用 _timestamped 版本
      for (const name of [model, `${model}_timestamped`]) {
        try {
          const asr = await load(name);
          forceChineseWords(asr);
          self.postMessage({ type: 'status', id, status: 'transcribing' });
          const out = (await asr(audio.slice(), { ...options, return_timestamps: 'word' })) as { text: string; chunks?: Chunk[] };
          return self.postMessage({ type: 'result', id, words: true, model: name, chunks: out.chunks ?? fallback() });
        } catch (err) {
          console.warn(`${name} 無法輸出逐字時間`, err);
        }
      }
    }
    const asr = await load(model);
    self.postMessage({ type: 'status', id, status: 'transcribing' });
    const out = (await asr(audio, { ...options, return_timestamps: true })) as { text: string; chunks?: Chunk[] };
    self.postMessage({ type: 'result', id, words: false, chunks: out.chunks ?? [{ timestamp: [0, audio.length / 16000], text: out.text }] });
  } catch (err) {
    self.postMessage({ type: 'error', id, error: (err as Error).message });
  }
};
