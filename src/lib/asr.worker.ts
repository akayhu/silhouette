/// <reference lib="webworker" />
import { pipeline, type AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

type InMsg = { type: 'transcribe'; id: number; model: string; audio: Float32Array };

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

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const { id, model, audio } = e.data;
  try {
    const asr = await load(model);
    self.postMessage({ type: 'status', id, status: 'transcribing' });
    const out = (await asr(audio, {
      language: 'chinese',
      task: 'transcribe',
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    })) as { text: string; chunks?: { timestamp: [number, number | null]; text: string }[] };
    self.postMessage({ type: 'result', id, chunks: out.chunks ?? [{ timestamp: [0, audio.length / 16000], text: out.text }] });
  } catch (err) {
    self.postMessage({ type: 'error', id, error: (err as Error).message });
  }
};
