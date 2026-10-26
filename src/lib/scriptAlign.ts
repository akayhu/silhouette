import { captionWords, orderedCaptions } from './captions';
import { newCaption } from './timeline';
import type { Caption, CaptionStyle, CaptionWord } from './types';

/**
 * 貼上講稿自動對時：使用者貼上正確的講稿，用語音辨識的逐字時間對齊，
 * 產生「文字是講稿、時間是實際說話時間」的字幕，不會有辨識錯字。
 *
 * 做法：講稿和辨識結果都去掉標點空白後逐字比對（編輯距離對齊，同音錯字當成替換，
 * 漏聽的字依前後時間補上），再依講稿的標點、換行與說話停頓切成字幕句。
 */

const MAX_CHARS = 16;
/** 兩個字之間停頓超過這個秒數就換句 */
const PAUSE = 0.7;
/** 比對時忽略的字元：空白、標點、符號 */
const IGNORED = /[\s\p{P}\p{S}]/u;
const SENTENCE_END = /[。！？!?\n]/;
const SOFT_BREAK = /[，,、；;：:]/;

interface Timed {
  ch: string;
  start: number;
  end: number;
}

/** 辨識結果（字幕）攤成一個一個字，每個字有時間；沒有逐字時間的句子依字數平均分配 */
function recognizedChars(captions: Caption[]): Timed[] {
  const out: Timed[] = [];
  for (const c of orderedCaptions(captions.filter((x) => x.role !== 'flower'))) {
    const words: CaptionWord[] = captionWords(c) ?? [{ text: c.text, start: c.start, end: c.end }];
    for (const w of words) {
      const chars = [...w.text].filter((ch) => !IGNORED.test(ch));
      chars.forEach((ch, k) => {
        const d = (w.end - w.start) / chars.length;
        out.push({ ch: normalizeChar(ch), start: w.start + d * k, end: w.start + d * (k + 1) });
      });
    }
  }
  return out;
}

const normalizeChar = (ch: string) => ch.normalize('NFKC').toLowerCase();

/**
 * 編輯距離對齊，回傳講稿每個字對到的辨識字索引（-1 = 辨識沒有這個字）。
 * 很長的講稿只算對角線附近的帶狀區域，記憶體和時間都不會爆。
 */
export function alignChars(a: string[], b: string[]): number[] {
  const n = a.length;
  const m = b.length;
  const result = new Array<number>(n).fill(-1);
  if (!n || !m) return result;
  const band = n * m <= 16_000_000 ? Math.max(n, m) : Math.max(400, Math.abs(n - m) + 400);
  const center = (i: number) => Math.round((i * m) / n);
  const lo = (i: number) => Math.max(0, center(i) - band);
  const hi = (i: number) => Math.min(m, center(i) + band);
  const INF = 1e9;
  let prev = new Int32Array(m + 1).fill(INF);
  let cur = new Int32Array(m + 1).fill(INF);
  // 0 = 對角（相同或替換）、1 = 上（講稿多一個字）、2 = 左（辨識多一個字）
  const dirs: Uint8Array[] = [];
  for (let j = lo(0); j <= hi(0); j++) prev[j] = j;
  dirs.push(new Uint8Array(hi(0) - lo(0) + 1).fill(2));
  for (let i = 1; i <= n; i++) {
    const l = lo(i);
    const h = hi(i);
    const row = new Uint8Array(h - l + 1);
    cur.fill(INF);
    for (let j = l; j <= h; j++) {
      let best = prev[j] + 1;
      let dir = 1;
      if (j > 0) {
        const diag = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
        if (diag <= best) {
          best = diag;
          dir = 0;
        }
        const left = cur[j - 1] + 1;
        if (left < best) {
          best = left;
          dir = 2;
        }
      }
      cur[j] = best;
      row[j - l] = dir;
    }
    dirs.push(row);
    [prev, cur] = [cur, prev];
  }
  let i = n;
  let j = m;
  while (i > 0 && j >= 0) {
    const l = lo(i);
    const dir = j - l >= 0 && j - l < dirs[i].length ? dirs[i][j - l] : 1;
    if (dir === 0 && j > 0) {
      result[i - 1] = j - 1;
      i--;
      j--;
    } else if (dir === 2 && j > 0) j--;
    else i--;
  }
  return result;
}

export interface ScriptAlignResult {
  captions: Caption[];
  /** 講稿有幾個字對到辨識結果（完全相同） */
  matched: number;
  /** 講稿總字數（不含標點空白） */
  total: number;
}

/**
 * 講稿 + 辨識字幕 → 新字幕。convert：比對前把講稿轉成和辨識結果相同的字形（例如簡轉繁），只用於比對。
 */
export function alignScript(script: string, recognized: Caption[], style: CaptionStyle | undefined, convert: (s: string) => string = (s) => s): ScriptAlignResult {
  const timed = recognizedChars(recognized);
  // 講稿拆成「字 + 後面跟著的標點空白」，開頭的標點（例如「）併到下一個字
  const tokens: { text: string; key: string }[] = [];
  let lead = '';
  for (const ch of script.replace(/\r\n?/g, '\n').trim()) {
    if (IGNORED.test(ch) && ch !== '\n') {
      if (tokens.length && !/[「『（(“‘《〈【]/.test(ch)) tokens[tokens.length - 1].text += ch;
      else lead += ch;
    } else if (ch === '\n') {
      if (tokens.length) tokens[tokens.length - 1].text += '\n';
    } else {
      tokens.push({ text: lead + ch, key: ch });
      lead = '';
    }
  }
  if (!tokens.length) return { captions: [], matched: 0, total: 0 };

  const keys = tokens.map((t) => {
    const c = convert(t.key);
    return normalizeChar([...c].length === 1 ? c : t.key);
  });
  const map = alignChars(
    keys,
    timed.map((t) => t.ch),
  );
  const matched = map.filter((j, i) => j >= 0 && timed[j].ch === keys[i]).length;

  // 每個講稿字的時間：對到的字直接用；沒對到的依前後對到的字內插
  const starts = map.map((j) => (j >= 0 ? timed[j].start : NaN));
  const ends = map.map((j) => (j >= 0 ? timed[j].end : NaN));
  const first = timed[0]?.start ?? 0;
  const last = timed[timed.length - 1]?.end ?? tokens.length * 0.25;
  for (let i = 0; i < tokens.length; ) {
    if (!Number.isNaN(starts[i])) {
      i++;
      continue;
    }
    let k = i;
    while (k < tokens.length && Number.isNaN(starts[k])) k++;
    const from = i > 0 ? ends[i - 1] : first;
    const to = k < tokens.length ? starts[k] : Math.max(last, from + (k - i) * 0.2);
    const step = Math.max(0, to - from) / (k - i);
    for (let x = i; x < k; x++) {
      starts[x] = from + step * (x - i);
      ends[x] = from + step * (x - i + 1);
    }
    i = k;
  }

  // 切句：講稿的句號問號換行一定換句；逗號處夠長才換；說話停頓也換；最多 16 字
  const captions: Caption[] = [];
  let cur: number[] = [];
  const flush = () => {
    if (!cur.length) return;
    const words: CaptionWord[] = cur.map((i, k) => {
      const next = cur[k + 1];
      // 一個字的結束時間延到下一個字開始（沒有停頓時），亮起和剪輯都比較連續
      const end = next !== undefined && starts[next] - ends[i] < PAUSE ? starts[next] : ends[i];
      return { text: tokens[i].text.replace(/\n/g, ''), start: starts[i], end: Math.max(end, starts[i] + 0.02) };
    });
    // 句尾標點與空白不顯示
    const lastWord = words[words.length - 1];
    lastWord.text = lastWord.text.replace(/[\s，。、,.；;：:]+$/u, '') || lastWord.text.trim();
    const kept = words.filter((w) => w.text);
    if (kept.length) {
      const c = newCaption(kept[0].start, kept[kept.length - 1].end, kept.map((w) => w.text).join(''), style);
      captions.push({ ...c, words: kept });
    }
    cur = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const prev = cur[cur.length - 1];
    if (prev !== undefined) {
      const length = cur.length;
      const t = tokens[prev].text;
      if (SENTENCE_END.test(t) || starts[i] - ends[prev] > PAUSE || length >= MAX_CHARS || (SOFT_BREAK.test(t) && length >= 6)) flush();
    }
    cur.push(i);
  }
  flush();
  return { captions, matched, total: tokens.length };
}
