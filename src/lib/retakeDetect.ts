import type { Segment } from './asr';

/**
 * 重複口白（NG 重錄）偵測：講錯一句話通常會停頓一下、重講一次意思很接近的句子。
 * 比對字幕文字的編輯距離（純文字演算法，不用額外的語意模型），抓到時只留後面那次（通常是講對的版本）。
 */

/** 超過這個間隔（秒）就不當成同一次重錄，避免把後面無關但剛好用詞相似的句子也算進去 */
const RETAKE_WINDOW = 20;
/** 相似度（1 − 編輯距離 ÷ 較長字串長度）達到這個比例才算「講了兩次」 */
const SIMILAR_THRESHOLD = 0.6;
/** 太短的句子（「嗯」「對」之類）很容易誤判相似，不列入比對 */
const MIN_CHARS = 3;

function levenshtein(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (!n) return m;
  if (!m) return n;
  let prev = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    const cur = new Array(m + 1);
    cur[0] = i;
    for (let j = 1; j <= m; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    prev = cur;
  }
  return prev[m];
}

const normalize = (s: string) => s.replace(/[\s，,。.！!？?、；;：:]/g, '');

export interface RetakePair {
  /** 前一次（NG，建議剪掉）在 segments 裡的索引 */
  earlierIndex: number;
  /** 後一次（建議保留）在 segments 裡的索引 */
  laterIndex: number;
  similarity: number;
}

/** segments 需按時間排序（analyzeRange 的辨識結果本來就是排序好的） */
export function findRetakes(segments: Segment[]): RetakePair[] {
  const pairs: RetakePair[] = [];
  for (let i = 0; i < segments.length; i++) {
    const a = normalize(segments[i].text);
    if (a.length < MIN_CHARS) continue;
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[j].start - segments[i].end > RETAKE_WINDOW) break;
      const b = normalize(segments[j].text);
      if (b.length < MIN_CHARS) continue;
      const similarity = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
      if (similarity >= SIMILAR_THRESHOLD) {
        pairs.push({ earlierIndex: i, laterIndex: j, similarity });
        break; // 找到一次重錄就好，不用再跟更後面的句子比
      }
    }
  }
  return pairs;
}
