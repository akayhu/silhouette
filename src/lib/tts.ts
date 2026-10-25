import { api, type TtsResult } from './api';

export type TtsProgress = { stage: 'loading' | 'speaking' | 'queued'; done: number; total: number };

/**
 * 產生朗讀語音。系統語音會直接回傳；台灣腔 AI 人聲是背景工作，
 * 這裡輪詢進度直到完成，期間透過 onProgress 回報「第幾句」。
 */
export async function runTts(
  projectId: string,
  params: { text?: string; segments?: string[]; voice: string; rate: number },
  onProgress?: (p: TtsProgress) => void,
): Promise<TtsResult> {
  const first = await api.tts(projectId, params);
  if (!first.jobId) return first as TtsResult;
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    const job = await api.ttsJob(first.jobId);
    if (job.status === 'error') throw new Error(job.error || 'AI 語音產生失敗');
    if (job.status === 'done' && job.result) return job.result;
    onProgress?.({ stage: job.stage as TtsProgress['stage'], done: job.done, total: job.total });
  }
}

export function progressLabel(p: TtsProgress | null) {
  if (!p) return '產生中…';
  if (p.stage === 'loading' || p.stage === 'queued') return '載入 AI 模型中…';
  return `AI 朗讀中 ${Math.min(p.done + 1, p.total)}/${p.total} 句`;
}

/** 把錄音或音檔轉成 16kHz 單聲道 16-bit WAV（AI 語音複製需要的格式），最長 15 秒 */
export async function toPromptWav(input: Blob, maxSeconds = 15): Promise<{ wav: Blob; seconds: number }> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await input.arrayBuffer());
  ctx.close();
  const seconds = Math.min(decoded.duration, maxSeconds);
  const sr = 16000;
  const off = new OfflineAudioContext(1, Math.ceil(seconds * sr), sr);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start(0, 0, seconds);
  const pcm = (await off.startRendering()).getChannelData(0);
  // 正規化音量，讓小聲的錄音也能用
  let peak = 0;
  for (const v of pcm) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? Math.min(4, 0.9 / peak) : 1;
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((v, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v * gain)) * 0x7fff, true));
  return { wav: new Blob([buf], { type: 'audio/wav' }), seconds };
}
