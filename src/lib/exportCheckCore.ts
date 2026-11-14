/**
 * 匯出後檢查的判斷邏輯（純計算）：拿匯出檔的畫面和聲音，跟預覽比對，抓出「匯出看起來成功、其實壞掉」的情況。
 * 畫面不是用「有沒有黑畫面」判斷（淡出、黑底照片本來就可能是黑的），而是跟同一時間點的預覽比，差太多才算有問題。
 */

export interface ExportIssue {
  level: 'warn' | 'error';
  text: string;
}

/** 平均亮度 0～255（rgba 排列的像素資料） */
export function meanLuma(rgba: ArrayLike<number>): number {
  const n = Math.floor(rgba.length / 4);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += 0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2];
  return sum / n;
}

export interface FrameSample {
  /** 時間軸秒數 */
  t: number;
  /** 匯出檔那一格的平均亮度 */
  out: number;
  /** 預覽（引擎）畫出來同一格的平均亮度 */
  src: number;
}

/** 亮度差超過這個值（滿分 255）就算畫面對不上 */
const LUMA_DIFF = 45;

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function frameIssues(samples: FrameSample[]): ExportIssue[] {
  const bad = samples.filter((s) => Math.abs(s.out - s.src) > LUMA_DIFF);
  if (!bad.length) return [];
  const black = bad.filter((s) => s.out < 10 && s.src > 30);
  if (bad.length === samples.length && black.length === bad.length) return [{ level: 'error', text: '匯出的影片整支都是黑畫面，預覽卻有畫面。請重新匯出，或改用 720p 再試。' }];
  const where = bad.slice(0, 3).map((s) => fmt(s.t)).join('、');
  const kind = black.length === bad.length ? '是黑畫面' : '跟預覽的亮度差很多';
  return [{ level: 'warn', text: `匯出的影片在 ${where} 附近${kind}，預覽看起來不是這樣。建議播一下確認，必要時重新匯出。` }];
}

export interface AudioStats {
  rms: number;
  peak: number;
  /** 幾乎滿格（被削平）的取樣佔全部的比例 */
  clipRatio: number;
}

export function audioStats(samples: Float32Array): AudioStats {
  let sum = 0;
  let peak = 0;
  let clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    sum += v * v;
    if (v > peak) peak = v;
    if (v >= 0.995) clipped++;
  }
  return { rms: samples.length ? Math.sqrt(sum / samples.length) : 0, peak, clipRatio: samples.length ? clipped / samples.length : 0 };
}

const SILENT_RMS = 0.0005;
const CLIP_RATIO = 0.002;

/** stats 是 null：匯出檔裡找不到音軌。expectsAudio：專案裡有會出聲音的片段 */
export function audioIssues(stats: AudioStats | null, expectsAudio: boolean): ExportIssue[] {
  if (!stats) return expectsAudio ? [{ level: 'warn', text: '匯出的影片沒有聲音。專案裡有口白或音樂的話，請確認沒有被靜音；素材本來就沒有聲音的話可以忽略。' }] : [];
  const out: ExportIssue[] = [];
  if (expectsAudio && stats.rms < SILENT_RMS) out.push({ level: 'warn', text: '匯出的影片整段都是靜音。專案裡有口白或音樂的話，請確認沒有被靜音；素材本來就沒有聲音的話可以忽略。' });
  if (stats.clipRatio > CLIP_RATIO) out.push({ level: 'warn', text: `聲音有爆音：約 ${(stats.clipRatio * 100).toFixed(1)}% 的聲音被削平。可以回編輯器把口白、配樂或整體音量調小一點再匯出。` });
  return out;
}
