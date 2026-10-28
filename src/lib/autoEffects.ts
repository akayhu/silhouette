import { decodeAudio, sliceMono } from './media';
import { captionFromWords, clipLength, isLocked, layoutMain, remap, rippleRemove, strip } from './timeline';
import { analyzeRange, complement, type Range } from './autoEdit';
import { uid } from './format';
import type { Caption, CaptionWord, ClipMotion, MediaItem, ProjectData, StickerItem, TransitionType, VideoClip } from './types';

/**
 * AI 自動剪輯：依影片內容加上運鏡（放大／縮小／特寫／震動）、轉場、字幕動畫和貼紙。
 * 「內容」來自三個訊號：音量起伏（大聲、激動的地方）、字幕文字（驚嘆、問句、關鍵字）、片段的素材切換（換場景）。
 */

export type Intensity = 'light' | 'normal' | 'strong';
export interface AutoEffectOptions {
  intensity: Intensity;
  /** 先剪掉沒有人聲的空拍與「嗯、啊」 */
  cut: boolean;
  /** 辨識語音產生字幕（取代目前的字幕） */
  subtitles: boolean;
  motion: boolean;
  transitions: boolean;
  captions: boolean;
  stickers: boolean;
}

export interface AutoEffectPlan {
  data: ProjectData;
  counts: { cuts: number; removed: number; subtitles: number; punch: number; shake: number; zoom: number; transitions: number; captions: number; stickers: number };
}

/** 強度：重點之間至少隔幾秒、貼紙最多幾個 */
const LEVEL: Record<Intensity, { spacing: number; stickerGap: number; maxStickers: number; shake: boolean }> = {
  light: { spacing: 6, stickerGap: 8, maxStickers: 2, shake: false },
  normal: { spacing: 3.5, stickerGap: 5, maxStickers: 5, shake: true },
  strong: { spacing: 2.2, stickerGap: 3, maxStickers: 10, shake: true },
};

const TRANSITION_LEN = 0.4;

const EXCLAIM = /[!！]|哇|超|太|真的|竟然|居然|絕對|一定|必|重點|最/;
const QUESTION = /[?？]|嗎$|呢$|什麼|為什麼|怎麼/;
/** 字幕是不是重點句（驚嘆、強調的語氣） */
export const isEmphasis = (text: string) => EXCLAIM.test(text);

/** 字幕關鍵字 → 貼紙（依序比對，第一個符合的） */
const STICKER_RULES: [RegExp, string][] = [
  [/哈哈|好笑|笑死|搞笑/, 'face-laugh'],
  [/哇|驚|竟然|居然|不敢相信/, 'face-wow'],
  [/愛|喜歡|心動/, 'face-love'],
  [/好吃|美味|必吃|好喝/, 'badge-yummy'],
  [/推薦|大推/, 'badge-recommend'],
  [/必看|重點|注意/, 'badge-mustsee'],
  [/限定|限量|優惠|折扣/, 'badge-limited'],
  [/新品|全新|最新/, 'badge-new'],
  [/訂閱|追蹤/, 'badge-subscribe'],
  [/讚|好棒|厲害|成功/, 'thumbs-up'],
  [/熱|火|爆/, 'fire'],
  [/[?？]/, 'question'],
  [/[!！]/, 'exclaim'],
];

/** 片段的音量曲線（每 0.1 秒一個 RMS 值） */
async function clipEnergy(media: MediaItem, from: number, to: number): Promise<number[]> {
  const buffer = await decodeAudio(media.url).catch(() => null);
  if (!buffer || to - from < 0.3) return [];
  const sr = 4000;
  const samples = await sliceMono(buffer, from, Math.min(to, buffer.duration), sr);
  const win = Math.round(sr * 0.1);
  const rms: number[] = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += samples[j] * samples[j];
    rms.push(Math.sqrt(sum / win));
  }
  return rms;
}

/** 舊時間軸 → 加了轉場後的新時間軸：轉場讓後面的內容往前重疊，之後的項目跟著往前 */
function shiftAfter(junctions: { at: number; overlap: number }[], t: number) {
  return t - junctions.filter((j) => j.at <= t + 0.001).reduce((n, j) => n + j.overlap, 0);
}

/** 第 0 步：分析每段影片的人聲，剪掉空拍、產生字幕 */
async function cutAndCaption(d: ProjectData, opts: AutoEffectOptions, counts: AutoEffectPlan['counts'], onProgress?: (text: string) => void): Promise<ProjectData> {
  const doCut = opts.cut && !isLocked(d, 'main');
  const doSubs = opts.subtitles && !isLocked(d, 'caption');
  if (!doCut && !doSubs) return d;
  const media = new Map(d.media.map((m) => [m.id, m]));
  const placed = layoutMain(d.clips);
  const videos = placed.filter((c) => media.get(c.mediaId)?.kind === 'video');
  const cuts: Range[] = [];
  const lines: { start: number; end: number; text: string; words?: CaptionWord[] }[] = [];
  for (const [n, c] of videos.entries()) {
    const label = videos.length > 1 ? `（${n + 1}/${videos.length}）` : '';
    const r = await analyzeRange(media.get(c.mediaId)!, c.in, c.out, (stage, progress) =>
      onProgress?.(stage === 'download' ? `下載語音模型 ${Math.round(progress ?? 0)}%（只有第一次）` : stage === 'speech' ? `辨識人聲${label}` : `偵測空拍${label}`),
    );
    const toT = (src: number) => c.start + (src - c.in) / c.speed;
    if (doCut && r.hasSpeech) {
      // 不剪進和前後片段重疊的轉場區
      const lo = c.start + c.overlap;
      const hi = c.end - (placed[c.index + 1]?.overlap ?? 0);
      for (const [a, b] of complement(r.keeps, c.in, c.out)) {
        const ta = Math.max(lo, toT(a));
        const tb = Math.min(hi, toT(b));
        if (tb - ta >= 0.05) cuts.push([ta, tb]);
      }
    }
    for (const s of r.segments) {
      const words = s.words?.map((w) => ({ ...w, start: toT(w.start), end: Math.min(c.end, toT(w.end)) }));
      lines.push({ start: toT(s.start), end: Math.min(c.end, toT(s.end)), text: s.text, words });
    }
  }

  let out = d;
  if (cuts.length) {
    out = rippleRemove(out, cuts);
    counts.cuts = cuts.length;
    counts.removed = cuts.reduce((n, [a, b]) => n + b - a, 0);
  }
  if (doSubs && lines.length) {
    const style = d.captions[0]?.style;
    const captions = lines.flatMap((l) => {
      const start = remap(l.start, cuts);
      const end = remap(l.end, cuts);
      const words = l.words?.map((w) => ({ ...w, start: remap(w.start, cuts), end: remap(w.end, cuts) }));
      return end - start >= 0.2 ? [captionFromWords(start, end, l.text, style, words)] : [];
    });
    out = { ...out, captions };
    counts.subtitles = captions.length;
  }
  return out;
}

export async function planAutoEffects(input: ProjectData, opts: AutoEffectOptions, onProgress?: (text: string) => void): Promise<AutoEffectPlan> {
  const level = LEVEL[opts.intensity];
  const counts = { cuts: 0, removed: 0, subtitles: 0, punch: 0, shake: 0, zoom: 0, transitions: 0, captions: 0, stickers: 0 };
  // 先剪空拍、上字幕，後面的特效依剪好的內容和新字幕來安排
  const d = await cutAndCaption(input, opts, counts, onProgress);
  const media = new Map(d.media.map((m) => [m.id, m]));
  const placed = layoutMain(d.clips);
  const mainOpen = !isLocked(d, 'main');

  // ---------- 1. 找重點時刻（時間軸時間） ----------
  const moments: { t: number; score: number; clipIndex: number }[] = [];
  // 音量以整支影片為基準：剪掉空拍後每段都是說話，單看一段會看不出哪裡特別大聲
  const energy: { c: (typeof placed)[number]; rms: number[] }[] = [];
  for (const c of placed) {
    const m = media.get(c.mediaId);
    if (m?.kind !== 'video') continue;
    onProgress?.(`分析聲音起伏（${c.index + 1}/${placed.length}）`);
    energy.push({ c, rms: await clipEnergy(m, c.in, c.out) });
  }
  const voiced = energy.flatMap((e) => e.rms.filter((v) => v > 0.01)).sort((x, y) => x - y);
  if (voiced.length >= 5) {
    const median = voiced[Math.floor(voiced.length / 2)];
    const bar = Math.max(median * 1.6, voiced[Math.floor(voiced.length * 0.85)]);
    const peaks: { t: number; score: number; clipIndex: number }[] = [];
    for (const { c, rms } of energy) {
      rms.forEach((v, i) => {
        if (v < bar || v < (rms[i - 1] ?? 0) || v < (rms[i + 1] ?? 0)) return;
        const t = c.start + (i * 0.1) / c.speed;
        if (t >= c.start + c.overlap && t < c.end - 0.3) peaks.push({ t, score: v / median, clipIndex: c.index });
      });
    }
    // 由強到弱挑，彼此至少隔 spacing 秒
    for (const p of peaks.sort((x, y) => y.score - x.score)) if (moments.every((o) => Math.abs(o.t - p.t) >= level.spacing)) moments.push(p);
  }
  // 字幕裡的驚嘆、關鍵字也算重點
  for (const cap of d.captions) {
    if (!EXCLAIM.test(cap.text)) continue;
    const c = placed.find((p) => cap.start >= p.start && cap.start < p.end);
    if (c && moments.every((m) => Math.abs(m.t - cap.start) >= level.spacing)) moments.push({ t: cap.start, score: 2, clipIndex: c.index });
  }
  moments.sort((a, b) => a.t - b.t);
  const strongest = [...moments].sort((a, b) => b.score - a.score)[0];

  // ---------- 2. 運鏡：在重點時刻切開，重點那段特寫，其他段落慢慢推近／拉遠 ----------
  let clips: VideoClip[] = d.clips;
  if (opts.motion && mainOpen) {
    onProgress?.('安排運鏡');
    let alt = 0;
    clips = placed.flatMap((c) => {
      const { start, end } = c;
      const base = strip(c);
      const m = media.get(c.mediaId);
      const len = end - start;
      // 已經手動設定過動態的片段不動
      if (c.motion) return [base];
      if (m?.kind === 'image') {
        counts.zoom++;
        return [{ ...base, motion: (alt++ % 2 ? 'zoomOut' : 'zoomIn') as ClipMotion }];
      }
      // 每個重點時刻的特寫範圍：對齊它所在那句字幕（最長 3 秒），沒有字幕就 2.5 秒，之後回到一般運鏡
      const emphasis = moments
        .filter((mo) => mo.clipIndex === c.index)
        .map((mo) => {
          const cap = d.captions.find((cp) => mo.t >= cp.start - 0.3 && mo.t < cp.end);
          let a = cap && mo.t - cap.start < 2 ? cap.start : mo.t - 0.2;
          let b = cap ? cap.end : a + 2.5;
          // 「哇」這種很短的字幕，特寫延續到緊接的下一句
          if (cap && b - a < 1.2) {
            const next = d.captions.find((n) => n !== cap && n.start >= cap.end - 0.05 && n.start - cap.end < 0.3);
            b = next ? next.end : a + 1.5;
          }
          b = Math.min(b, a + 3);
          if (a - start < 0.5) a = start;
          if (end - b < 0.8) b = end;
          return { a, b: Math.min(b, end), hard: !!(level.shake && strongest === mo && mo.score >= 2) };
        })
        .sort((x, y) => x.a - y.a)
        .filter((e, i, list) => e.b - e.a >= 0.6 && list.slice(0, i).every((p) => p.b <= e.a));

      // 切成「一般／重點」交替的段落；太短的一般段落併進重點
      const segs: { a: number; b: number; moment: boolean; hard?: boolean }[] = [];
      let cursor = start;
      for (const e of emphasis) {
        const from = e.a - cursor < 0.4 ? cursor : e.a;
        if (from > cursor) segs.push({ a: cursor, b: from, moment: false });
        segs.push({ a: from, b: e.b, moment: true, hard: e.hard });
        cursor = e.b;
      }
      if (end - cursor >= 0.4) segs.push({ a: cursor, b: end, moment: false });
      else if (segs.length) segs[segs.length - 1].b = end;
      else segs.push({ a: start, b: end, moment: false });

      return segs.map((seg, i) => {
        let motion: ClipMotion = 'none';
        if (seg.moment) {
          motion = seg.hard ? 'shake' : 'punch';
          if (seg.hard) counts.shake++;
          else counts.punch++;
        } else if (seg.b - seg.a >= 2) {
          motion = alt++ % 2 ? 'zoomOut' : 'zoomIn';
          counts.zoom++;
        }
        const piece: VideoClip = {
          ...base,
          id: i === 0 ? base.id : uid(),
          in: c.in + (seg.a - start) * c.speed,
          out: c.in + (seg.b - start) * c.speed,
          motion: motion === 'none' ? undefined : motion,
        };
        // 切開的後段接續前段，不加轉場
        if (i > 0) piece.transition = undefined;
        return piece;
      });
    });
  }

  // ---------- 3. 轉場：只加在換素材（換場景）的地方，依前後的氣氛挑 ----------
  const junctions: { at: number; overlap: number }[] = [];
  if (opts.transitions && mainOpen) {
    onProgress?.('挑選轉場');
    const layout = layoutMain(clips);
    const calm: TransitionType[] = ['fade', 'blur', 'dip', 'wipeUp'];
    const lively: TransitionType[] = ['zoom', 'slideLeft', 'wipe', 'slideUp', 'circle', 'slideDown', 'shutter', 'spin'];
    let ci = 0;
    let li = 0;
    clips = clips.map((c, i) => {
      if (i === 0 || c.transition) return c;
      const prev = clips[i - 1];
      if (prev.mediaId === c.mediaId) return c;
      const at = layout[i].start;
      const nearMoment = moments.some((m) => Math.abs(m.t - at) < 1.2);
      const both = [media.get(prev.mediaId)?.kind, media.get(c.mediaId)?.kind];
      const type: TransitionType = nearMoment ? 'flash' : both.every((k) => k === 'image') ? calm[ci++ % calm.length] : lively[li++ % lively.length];
      const next = { ...c, transition: { type, duration: TRANSITION_LEN } };
      const overlap = Math.min(TRANSITION_LEN, clipLength(prev) / 2, clipLength(c) / 2);
      junctions.push({ at, overlap });
      counts.transitions++;
      return next;
    });
  }

  // 轉場讓後面的內容提早，字幕、貼紙、疊加、音訊跟著往前，保持同步
  const shift = (t: number) => shiftAfter(junctions, t);
  let captions: Caption[] = junctions.length ? d.captions.map((c) => ({ ...c, start: shift(c.start), end: shift(c.end) })) : d.captions;
  let stickers: StickerItem[] = junctions.length ? d.stickers.map((s) => ({ ...s, start: shift(s.start), end: shift(s.end) })) : d.stickers;
  const overlays = junctions.length ? d.overlays.map((o) => ({ ...o, start: shift(o.start) })) : d.overlays;
  const audio = junctions.length ? d.audio.map((a) => ({ ...a, start: shift(a.start) })) : d.audio;

  // ---------- 4. 字幕動畫：驚嘆彈出、問句上滑、其他淡入 ----------
  if (opts.captions && !isLocked(d, 'caption')) {
    captions = captions.map((c) => {
      const animation = EXCLAIM.test(c.text) ? 'pop' : QUESTION.test(c.text) ? 'slide' : 'fade';
      if (c.style.animation === animation) return c;
      counts.captions++;
      return { ...c, style: { ...c.style, animation } };
    });
  }

  // ---------- 5. 貼紙：依字幕關鍵字放在畫面上方，左右交替 ----------
  if (opts.stickers && !isLocked(d, 'sticker')) {
    const added: StickerItem[] = [];
    for (const c of captions) {
      if (added.length >= level.maxStickers) break;
      const rule = STICKER_RULES.find(([re]) => re.test(c.text));
      if (!rule) continue;
      const busy = [...stickers, ...added].some((s) => c.start < s.end + level.stickerGap && s.start < c.start + level.stickerGap);
      if (busy) continue;
      const left = added.length % 2 === 0;
      added.push({
        id: uid(),
        stickerId: rule[1],
        start: c.start,
        end: Math.min(c.end + 0.3, c.start + 2.2),
        x: left ? 0.24 : 0.76,
        y: 0.2,
        scale: 0.55,
        rotation: left ? -8 : 8,
        opacity: 1,
        animation: rule[1].startsWith('face') ? 'bounce' : 'pop',
      });
    }
    counts.stickers = added.length;
    stickers = [...stickers, ...added];
  }

  return { data: { ...d, clips, captions, stickers, overlays, audio }, counts };
}
