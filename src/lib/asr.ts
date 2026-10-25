export const ASR_MODELS = [
  { id: 'onnx-community/whisper-base', label: '快速（約 80 MB）' },
  { id: 'onnx-community/whisper-small', label: '精準（約 250 MB）' },
] as const;

export interface Segment {
  start: number;
  end: number;
  text: string;
}

type Progress = (info: { phase: 'download' | 'transcribing'; progress?: number }) => void;

let worker: Worker | null = null;
let seq = 0;
let converter: Promise<(s: string) => string> | null = null;
/** 簡轉繁字典很大，第一次用到時才載入 */
const getConverter = () => (converter ??= import('opencc-js').then((m) => m.Converter({ from: 'cn', to: 'tw' })));

function getWorker() {
  worker ??= new Worker(new URL('./asr.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/** 在瀏覽器內用 Whisper 辨識 16kHz 單聲道音訊，第一次會下載模型並快取 */
export async function transcribe(audio: Float32Array, model: string, onProgress: Progress): Promise<Segment[]> {
  const toTraditional = await getConverter();
  const w = getWorker();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === 'download') return onProgress({ phase: 'download', progress: m.progress });
      if (m.id !== id) return;
      if (m.type === 'status') onProgress({ phase: 'transcribing' });
      if (m.type === 'error') {
        w.removeEventListener('message', handler);
        reject(new Error(m.error));
      }
      if (m.type === 'result') {
        w.removeEventListener('message', handler);
        const total = audio.length / 16000;
        resolve(
          (m.chunks as { timestamp: [number, number | null]; text: string }[])
            .map((c) => ({ start: c.timestamp[0], end: c.timestamp[1] ?? total, text: toTraditional(c.text.trim()) }))
            .filter((s) => s.text && s.end > s.start && !HALLUCINATION.test(s.text))
            .flatMap(splitLong),
        );
      }
    };
    w.addEventListener('message', handler);
    w.postMessage({ type: 'transcribe', id, model, audio }, [audio.buffer]);
  });
}

const MAX_CHARS = 16;

/** Whisper 在音樂、提示音等非語音片段常會「聽到」的訓練資料字樣 */
const HALLUCINATION = /字幕(製作|提供|由|志願者)|Amara|明鏡|點點欄目|不吝點[贊讚]|請訂閱/;

/** 太長的句子依標點切成短句，時間依字數比例分配 */
function splitLong(seg: Segment): Segment[] {
  const parts = seg.text
    .split(/(?<=[，。！？、,.!?；;])/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => {
      const chars = [...p];
      if (chars.length <= MAX_CHARS) return [p];
      const out: string[] = [];
      for (let i = 0; i < chars.length; i += MAX_CHARS) out.push(chars.slice(i, i + MAX_CHARS).join(''));
      return out;
    });
  if (parts.length <= 1) return [{ ...seg, text: stripTrailing(seg.text) }];
  const total = parts.reduce((n, p) => n + [...p].length, 0);
  let t = seg.start;
  return parts.map((p) => {
    const d = ((seg.end - seg.start) * [...p].length) / total;
    const s = { start: t, end: t + d, text: stripTrailing(p) };
    t += d;
    return s;
  });
}

const stripTrailing = (s: string) => s.replace(/[，。、,.；;]+$/, '');

/** 只有語助詞的片段（嗯、啊、呃…）視為口誤停頓 */
export const isFiller = (text: string) => /^[\s嗯啊呃哦喔噢額欸誒唉恩那個就是然後\.,，。…~～]+$/.test(text) && text.trim().length > 0;
