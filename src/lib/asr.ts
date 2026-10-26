export const ASR_MODELS = [
  { id: 'onnx-community/whisper-base', label: '快速（約 80 MB）' },
  { id: 'onnx-community/whisper-small', label: '精準（約 250 MB）' },
] as const;

export interface Word {
  start: number;
  end: number;
  text: string;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
  /** 逐字時間（和 start／end 同一個時間基準）；模型不支援時沒有 */
  words?: Word[];
}

type Progress = (info: { phase: 'download' | 'transcribing'; progress?: number }) => void;

let worker: Worker | null = null;
let seq = 0;
let converter: Promise<(s: string) => string> | null = null;
/** 簡轉繁字典很大，第一次用到時才載入 */
export const getConverter = () => (converter ??= import('opencc-js').then((m) => m.Converter({ from: 'cn', to: 'tw' })));

function getWorker() {
  worker ??= new Worker(new URL('./asr.worker.ts', import.meta.url), { type: 'module' });
  return worker;
}

/**
 * 在瀏覽器內用 Whisper 辨識 16kHz 單聲道音訊，第一次會下載模型並快取。
 * words：要逐字時間（改文字就剪影片需要）；需要另一個模型版本，不支援時自動退回逐句時間。
 */
export async function transcribe(audio: Float32Array, model: string, onProgress: Progress, opts: { words?: boolean } = {}): Promise<Segment[]> {
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
        if (m.words) return resolve(groupWords(m.chunks, total, toTraditional));
        resolve(
          (m.chunks as { timestamp: [number, number | null]; text: string }[])
            .map((c) => ({ start: c.timestamp[0], end: c.timestamp[1] ?? total, text: toTraditional(c.text.trim()) }))
            .filter((s) => s.text && s.end > s.start && !HALLUCINATION.test(s.text))
            .flatMap(splitLong),
        );
      }
    };
    w.addEventListener('message', handler);
    w.postMessage({ type: 'transcribe', id, model, audio, words: !!opts.words }, [audio.buffer]);
  });
}

const MAX_CHARS = 16;
const charCount = (s: string) => [...s].length;
/** 單字的語助詞（嗯、啊…）自成一段，自動剪輯才能把它剪掉；「然後、就是」常是正常用語，不拆 */
const FILLER_WORD = /^[嗯啊呃哦喔噢額欸誒唉恩][\s，,。.…~～]*$/;

/**
 * 把逐字結果組成字幕句：停頓超過 0.6 秒、句號問號、或超過 16 字就換句，逗號處夠長也換句。
 * 簡轉繁整句轉（詞彙轉換較準），字數不變時再依原本每個字的長度切回去。
 */
function groupWords(chunks: { timestamp: [number, number | null]; text: string }[], total: number, toTraditional: (s: string) => string): Segment[] {
  const raw = chunks
    .map((c, i) => ({ text: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] ?? chunks[i + 1]?.timestamp[0] ?? total }))
    .filter((w) => w.text);
  const joined = raw.map((w) => w.text).join('');
  const converted = toTraditional(joined);
  let offset = 0;
  const chars = [...converted];
  const sameLength = chars.length === charCount(joined);
  const words: Word[] = raw.map((w) => {
    const n = charCount(w.text);
    const text = sameLength ? chars.slice(offset, offset + n).join('') : toTraditional(w.text);
    offset += n;
    return { ...w, end: Math.max(w.end, w.start + 0.02), text };
  });

  const segments: Segment[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    // 句尾標點不顯示在字幕上
    const last = cur[cur.length - 1];
    const cleaned = [...cur.slice(0, -1), { ...last, text: stripTrailing(last.text) }].filter((w) => w.text);
    if (cleaned.length) {
      segments.push({ start: cleaned[0].start, end: cleaned[cleaned.length - 1].end, text: cleaned.map((w) => w.text).join(''), words: cleaned });
    }
    cur = [];
  };
  for (const w of words) {
    const last = cur[cur.length - 1];
    const length = cur.reduce((n, x) => n + charCount(x.text), 0);
    if (last && (w.start - last.end > 0.6 || /[。！？!?]$/.test(last.text) || length + charCount(w.text) > MAX_CHARS || FILLER_WORD.test(w.text) || FILLER_WORD.test(last.text))) flush();
    cur.push(w);
    if (/[，,、；;]$/.test(w.text) && length + charCount(w.text) >= 6) flush();
  }
  flush();
  return segments.filter((s) => s.text && s.end > s.start && !HALLUCINATION.test(s.text));
}

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
