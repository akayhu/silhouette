import { isEmphasis, planAutoEffects, type AutoEffectPlan } from './autoEffects';
import { DEFAULT_CLIP_FILTER, FILTER_PRESETS } from './filters';
import { uid } from './format';
import { captionTrackKeys, isLocked, layoutMain, mainDuration, newCaption } from './timeline';
import { pickTemplate } from './autoPick';
import { recommendMusic } from './musicRecommend';
import { SMART_TEMPLATES, type SmartTemplate } from './templates';
import type { AudioClip, Caption, LibraryTrack, MediaItem, ProjectData } from './types';

/**
 * 智能剪輯：一鍵完成剪空拍、上字幕、特寫轉場（沿用 AI 自動剪輯），
 * 再依模板換上字幕樣式、加花字、配樂、音效和濾鏡。
 * 重新套用時，上一次加的花字、模板配樂與音效會先移除，不會越疊越多。
 */

export interface SmartEditResult {
  data: ProjectData;
  counts: AutoEffectPlan['counts'] & { flowers: number; sfx: number; music: string | null; filter: string | null; captionStyled: number };
  /** 實際套用的模板（一鍵自動剪輯由內容挑的） */
  template: SmartTemplate;
  /** 一鍵自動剪輯挑模板時命中的內容關鍵字；沒命中或不是自動挑的就是空陣列 */
  matched: string[];
}

const SFX_VOLUME = 0.7;

/** 花字只取重點句最有力的一小段：去掉開頭語助詞，切在第一個驚嘆號，最多 9 個字 */
function flowerText(text: string) {
  let t = text.replace(/^[\s嗯啊呃哦喔欸那個就是然後，,。]+/, '').trim();
  const bang = t.search(/[!！]/);
  if (bang >= 0) t = t.slice(0, bang + 1);
  const chars = [...t];
  return chars.length > 9 ? chars.slice(0, 9).join('') : t;
}

/**
 * tplOrAuto 傳 'auto'：先剪空拍、剪掉講錯重講、辨識字幕，再依字幕內容挑模板，
 * 配樂也改用內容比對（不是模板固定的那首）。
 */
export async function runSmartEdit(
  input: ProjectData,
  tplOrAuto: SmartTemplate | 'auto',
  library: LibraryTrack[],
  opts: { regenerateCaptions: boolean },
  onProgress?: (text: string) => void,
): Promise<SmartEditResult> {
  const auto = tplOrAuto === 'auto';
  const needSubs = opts.regenerateCaptions || input.captions.filter((c) => c.role !== 'flower').length === 0;
  let working = input;
  let tpl: SmartTemplate;
  let matched: string[] = [];
  let pre: AutoEffectPlan['counts'] | null = null;
  if (auto) {
    // 自動挑模板要先有字幕內容：這一輪只剪空拍、剪口誤與重複口白、辨識字幕（最花時間的語音辨識只跑一次）
    const first = await planAutoEffects(input, { intensity: 'normal', cut: true, subtitles: needSubs, motion: false, transitions: false, captions: false, stickers: false }, onProgress);
    working = first.data;
    pre = first.counts;
    const picked = pickTemplate(working.captions, SMART_TEMPLATES);
    tpl = picked.template;
    matched = picked.matched;
    onProgress?.(`挑選模板「${tpl.name}」`);
  } else {
    tpl = tplOrAuto;
  }
  // 1. 剪空拍、上字幕、特寫、轉場、字幕動畫、貼紙（自動模式前面已經剪好、辨識好了）
  const plan = await planAutoEffects(
    working,
    {
      intensity: tpl.intensity,
      cut: !pre,
      subtitles: !pre && needSubs,
      motion: true,
      transitions: true,
      captions: true,
      stickers: tpl.stickers,
    },
    onProgress,
  );
  let d = plan.data;
  const counts: SmartEditResult['counts'] = { ...plan.counts, flowers: 0, sfx: 0, music: null, filter: null, captionStyled: 0 };
  if (pre) {
    counts.cuts = pre.cuts;
    counts.removed = pre.removed;
    counts.subtitles = pre.subtitles;
  }
  // 字幕依重疊分成好幾列時，只要有任何一列被鎖定就整個不動，避免套用模板蓋過使用者鎖定某一列的用意
  const captionOpen = !captionTrackKeys(d.captions).some((t) => isLocked(d, t));
  // 配樂、音效分成獨立軌道；任一軌鎖定就先不動音訊，避免只套用一半
  const audioOpen = !isLocked(d, 'audio-music') && !isLocked(d, 'audio-sfx');
  onProgress?.('套用模板');

  // 2. 字幕樣式（保留 AI 依內容挑的進場動畫）＋花字
  if (captionOpen) {
    const lines = d.captions.filter((c) => c.role !== 'flower');
    const styled = lines.map((c) => ({ ...c, style: { ...tpl.caption, animation: c.style.animation } }));
    counts.captionStyled = styled.length;
    const flowers: Caption[] = [];
    for (const [i, c] of styled.entries()) {
      if (flowers.length >= tpl.flowerMax) break;
      if (!isEmphasis(c.text)) continue;
      if (flowers.some((f) => Math.abs(f.start - c.start) < tpl.flowerGap)) continue;
      // 語音辨識常把「哇」單獨切成一句，太短就接上緊跟著的下一句
      let source = c.text;
      let end = c.end;
      const next = styled[i + 1];
      if ([...c.text.trim()].length <= 2 && next && next.start - c.end < 0.3) {
        source = c.text.trim() + next.text;
        end = next.end;
      }
      const text = flowerText(source);
      if (!text) continue;
      // 花字只排一行：太長就把字縮小到剛好放得下（字級以短邊 1080 為基準，可用寬度是畫面的 86%）
      const fit = Math.floor(((d.aspect === '16:9' ? 1920 : 1080) * 0.86) / [...text].length);
      const f = newCaption(c.start, Math.min(end + 0.4, c.start + 2.2), text, { ...tpl.flower, size: Math.min(tpl.flower.size, fit) });
      flowers.push({ ...f, role: 'flower' });
    }
    counts.flowers = flowers.length;
    // 花字在畫面上方，同時出現的貼紙移到花字下面，不要疊在一起
    const below = tpl.flower.y + 0.15;
    const stickers = isLocked(d, 'sticker')
      ? d.stickers
      : d.stickers.map((st) =>
      flowers.some((f) => st.start < f.end && f.start < st.end) && Math.abs(st.y - tpl.flower.y) < 0.12 ? { ...st, y: below } : st,
    );
    d = { ...d, captions: [...styled, ...flowers].sort((a, b) => a.start - b.start), stickers };
  }

  // 3. 濾鏡（模板沒有指定就保留原本的）
  if (tpl.filter && !isLocked(d, 'main')) {
    d = { ...d, clips: d.clips.map((c) => ({ ...c, filter: { ...DEFAULT_CLIP_FILTER, preset: tpl.filter!, intensity: 1 } })) };
    counts.filter = FILTER_PRESETS.find((p) => p.id === tpl.filter)?.name ?? null;
  }

  // 4. 配樂與音效
  if (audioOpen) {
    const libUrls = new Set(library.map((t) => t.url));
    // 上一次模板加的音樂、音效先拿掉；使用者自己加的音訊（上傳的、從音樂庫加的）都不動
    const audio: AudioClip[] = d.audio.filter((a) => a.role !== 'template');
    let media: MediaItem[] = d.media;
    const mediaFor = (t: LibraryTrack) => {
      const found = media.find((m) => m.url === t.url);
      if (found) return found;
      const m: MediaItem = { id: uid(), name: t.title, kind: 'audio', url: t.url, duration: t.duration, origin: 'library' };
      media = [...media, m];
      return m;
    };
    const total = mainDuration(d.clips);
    // 自動模式：配樂依字幕內容與語速比對挑；沒有合適的才用模板預設那首
    const song = (auto ? recommendMusic(d, library, 1)[0]?.track : undefined) ?? library.find((t) => t.id === tpl.music);
    if (song && total > 0.5) {
      const m = mediaFor(song);
      // 影片比曲子長就接著重播
      for (let at = 0; at < total - 0.3; at += song.duration) {
        const out = Math.min(song.duration, total - at);
        audio.push({ id: uid(), mediaId: m.id, start: at, in: 0, out, volume: tpl.musicVolume, fadeIn: at === 0 ? 0.6 : 0, fadeOut: at + out >= total - 0.01 ? Math.min(2, out / 3) : 0, role: 'template' });
      }
      counts.music = song.title;
    }
    const sfxAt: { id?: string; t: number }[] = [];
    if (tpl.sfx.intro) sfxAt.push({ id: tpl.sfx.intro, t: 0 });
    if (tpl.sfx.transition) for (const c of layoutMain(d.clips)) if (c.transition && c.index > 0) sfxAt.push({ id: tpl.sfx.transition, t: Math.max(0, c.start - 0.15) });
    if (tpl.sfx.flower) for (const f of d.captions.filter((c) => c.role === 'flower')) sfxAt.push({ id: tpl.sfx.flower, t: f.start });
    const before = new Set(input.stickers.map((s) => s.id));
    if (tpl.sfx.sticker) for (const s of d.stickers.filter((s) => !before.has(s.id))) sfxAt.push({ id: tpl.sfx.sticker, t: s.start });
    const placed: number[] = [];
    for (const { id, t } of sfxAt.sort((a, b) => a.t - b.t)) {
      const fx = library.find((x) => x.id === id);
      // 同一時間附近只留一個音效，避免疊在一起
      if (!fx || placed.some((p) => Math.abs(p - t) < 0.6)) continue;
      const m = mediaFor(fx);
      audio.push({ id: uid(), mediaId: m.id, start: t, in: 0, out: fx.duration, volume: SFX_VOLUME, role: 'template' });
      placed.push(t);
    }
    counts.sfx = placed.length;
    // 換模板後沒再用到的模板音樂／音效素材一併移除，素材庫不會越堆越多
    const used = new Set(audio.map((x) => x.mediaId));
    media = media.filter((m) => !(m.origin === 'library' && libUrls.has(m.url) && !used.has(m.id)));
    d = { ...d, media, audio };
  }

  return { data: d, counts, template: tpl, matched };
}
