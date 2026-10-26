import type { Caption, CaptionStyle, ProjectData } from './types';
import { uid } from './format';

export interface CaptionRule { from: string; to: string }
export interface CaptionCue { start: number; end: number; text: string }
const ms = (value: number) => Math.round(value * 1000) / 1000;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const orderedCaptions = (captions: Caption[]) => [...captions].sort((a, b) => a.start - b.start || a.end - b.end);
export const matchesCaption = (caption: Caption, query: string, matchCase: boolean) => matchCase ? caption.text.includes(query) : new RegExp(escape(query), 'iu').test(caption.text);

export function replaceCaptionText(captions: Caption[], ids: Set<string>, find: string, replacement: string, matchCase = false) {
  if (!find) throw new Error('請先輸入搜尋文字。');
  const pattern = new RegExp(escape(find), matchCase ? 'gu' : 'giu');
  let occurrences = 0, changed = 0;
  const next = captions.map((caption) => {
    if (!ids.has(caption.id)) return caption;
    const text = caption.text.replace(pattern, () => { occurrences++; return replacement; });
    if (text === caption.text) return caption;
    changed++; return { ...caption, text };
  });
  return { captions: changed ? next : captions, occurrences, changed };
}

export function shiftCaptions(captions: Caption[], ids: Set<string>, offset: number) {
  if (!Number.isFinite(offset)) throw new Error('請輸入有效的平移秒數。');
  if (!offset || !ids.size) return captions;
  const target = captions.filter((c) => ids.has(c.id));
  if (target.some((c) => ms(c.start + offset) < 0)) throw new Error('平移後有字幕早於 0 秒；請調整秒數，所有字幕均未修改。');
  if (target.some((c) => ms(c.end + offset) > 359999.999)) throw new Error('平移後超過 99 小時，所有字幕均未修改。');
  return captions.map((c) => ids.has(c.id) ? { ...c, start: ms(c.start + offset), end: ms(c.end + offset) } : c);
}

export function mergeCaptions(captions: Caption[], ids: Set<string>) {
  const selected = orderedCaptions(captions.filter((c) => ids.has(c.id)));
  if (selected.length < 2) throw new Error('請至少勾選兩句字幕。');
  if (selected.some((c) => c.role !== selected[0].role)) throw new Error('請分開合併一般字幕與花字。');
  const sameRole = orderedCaptions(captions.filter((c) => c.role === selected[0].role));
  const positions = selected.map((c) => sameRole.findIndex((x) => x.id === c.id));
  if (positions.some((p, i) => i > 0 && p !== positions[i - 1] + 1)) throw new Error('只能合併相鄰字幕，請一併勾選中間的句子。');
  const first = selected[0];
  const merged = { ...first, end: Math.max(...selected.map((c) => c.end)), text: selected.map((c) => c.text.trim()).join('\n') };
  return { captions: captions.flatMap((c) => c.id === first.id ? [merged] : ids.has(c.id) ? [] : [c]), id: first.id };
}

const segments = (text: string) => [...new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' }).segment(text)];
export function splitCaptionText(caption: Caption, caret: number, time?: number): [Caption, Caption] {
  const parts = segments(caption.text);
  const index = parts.findIndex((p) => p.index === caret);
  if (index <= 0 || caret >= caption.text.length) throw new Error('請將文字游標放在句子中間再拆句。');
  const left = caption.text.slice(0, caret).trim(), right = caption.text.slice(caret).trim();
  if (!left || !right) throw new Error('拆句後的兩句都需要有文字。');
  const at = ms(time ?? caption.start + (caption.end - caption.start) * index / parts.length);
  if (at - caption.start < 0.1 - 1e-8 || caption.end - at < 0.1 - 1e-8) throw new Error('拆句後每句至少需保留 0.1 秒，請先延長字幕或調整拆句位置。');
  return [{ ...caption, end: at, text: left }, { ...caption, id: uid(), start: at, text: right, style: structuredClone(caption.style) }];
}
export function splitCaptionByTime(caption: Caption, time: number) {
  const parts = segments(caption.text);
  if (parts.length < 2 || time <= caption.start || time >= caption.end) throw new Error('此處無法拆句。');
  const index = Math.max(1, Math.min(parts.length - 1, Math.round((time - caption.start) / (caption.end - caption.start) * parts.length)));
  return splitCaptionText(caption, parts[index].index, time);
}

export function parseCaptionRules(text: string): CaptionRule[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length > 100) throw new Error('每個專案最多可儲存 100 筆校正詞。');
  const seen = new Set<string>();
  return lines.map((line, i) => {
    const at = line.indexOf('=>');
    if (at < 1) throw new Error(`第 ${i + 1} 筆請使用「錯字 => 正確文字」。`);
    const from = line.slice(0, at).trim(), to = line.slice(at + 2).trim();
    if (!from || from.length > 128 || to.length > 512) throw new Error(`第 ${i + 1} 筆校正詞長度無效。`);
    if (seen.has(from)) throw new Error(`校正詞「${from}」重複，請保留一筆。`);
    seen.add(from); return { from, to };
  });
}
export function applyCaptionRules(captions: Caption[], ids: Set<string>, rules: CaptionRule[]) {
  if (!rules.length) return { captions, changed: 0 };
  const dictionary = new Map(rules.map((r) => [r.from, r.to]));
  if ([...dictionary.keys()].some((s) => !s)) throw new Error('校正詞不能為空白。');
  const pattern = new RegExp([...dictionary.keys()].sort((a, b) => b.length - a.length).map(escape).join('|'), 'gu');
  let changed = 0;
  const next = captions.map((c) => {
    if (!ids.has(c.id)) return c;
    const text = c.text.replace(pattern, (word) => dictionary.get(word)!);
    if (text === c.text) return c;
    changed++; return { ...c, text };
  });
  return { captions: changed ? next : captions, changed };
}

export function formatCaptionTime(time: number, separator = '.') {
  const value = Math.round(time * 1000);
  const hours = Math.floor(value / 3600000), minutes = Math.floor(value / 60000) % 60, seconds = Math.floor(value / 1000) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}${separator}${String(value % 1000).padStart(3, '0')}`;
}
export function parseCaptionTime(text: string): number {
  const match = text.trim().match(/^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)[.,](\d{3})$/);
  if (!match) throw new Error('時間格式需為 00:01.250 或 00:00:01.250。');
  const value = Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
  if (!Number.isFinite(value) || value > 359999.999) throw new Error('時間超出範圍（最多 99 小時）。');
  return value;
}
export function parseEditTime(text: string) {
  if (/^\d+(?:\.\d{1,3})?$/.test(text.trim())) {
    const time = Number(text); if (Number.isFinite(time) && time <= 359999.999) return time;
  }
  return parseCaptionTime(text);
}
function plainText(text: string) {
  return text.replace(/<\/?(?:b|i|u|c(?:\.[\w-]+)*|v|lang|ruby|rt)(?:[ \t][^>\n]*)?>/gi, '')
    .replace(/<(?:\d{2,}:)?\d{2}:\d{2}\.\d{3}>/g, '')
    .replace(/&(?:amp|lt|gt|nbsp|lrm|rlm|#\d+|#x[\da-f]+);/gi, (entity) => {
      const named: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&lrm;': '\u200e', '&rlm;': '\u200f' };
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
      const code = /^&#x/i.test(entity) ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
    }).trim();
}
export function parseSubtitles(source: string): { cues: CaptionCue[]; warnings: string[] } {
  if (source.length > 2_000_000) throw new Error('字幕檔過大，請使用 2 MB 以內的檔案。');
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) throw new Error('字幕檔沒有內容。');
  const blocks = normalized.split(/\n[ \t]*\n/);
  const vtt = /^WEBVTT(?:[ \t]|\n|$)/.test(normalized);
  if (vtt) {
    if (blocks[0].includes('-->')) throw new Error('WebVTT 檔頭與第一句之間需要空行。');
    blocks.shift();
  }
  const cues: CaptionCue[] = []; const warnings = new Set<string>();
  for (const [i, block] of blocks.entries()) {
    const lines = block.split('\n');
    if (vtt && /^(?:NOTE(?:[ \t].*)?|STYLE|REGION)$/.test(lines[0])) {
      if (/^(?:STYLE|REGION)$/.test(lines[0])) warnings.add('原檔的版面與 CSS 樣式不會匯入。');
      continue;
    }
    const index = lines[0].includes('-->') ? 0 : 1;
    const match = lines[index]?.match(/^(\S+)\s+-->\s+(\S+)(?:[ \t]+(.+))?$/);
    if (!match) throw new Error(`第 ${i + 1} 個字幕區塊的時間格式無效，未匯入任何字幕。`);
    let start: number, end: number;
    try { start = parseCaptionTime(match[1]); end = parseCaptionTime(match[2]); }
    catch { throw new Error(`第 ${i + 1} 個字幕區塊的時間無效，未匯入任何字幕。`); }
    if (end <= start) throw new Error(`第 ${i + 1} 個字幕區塊的結束時間需晚於開始時間。`);
    const payload = lines.slice(index + 1).join('\n');
    const text = plainText(payload);
    if (!text) throw new Error(`第 ${i + 1} 個字幕區塊沒有文字。`);
    if (text !== payload.trim() || match[3]) warnings.add('字幕標記、說話者標籤與位置設定會轉成純文字；匯入後可在編輯器調整樣式。');
    cues.push({ start, end, text });
    if (cues.length > 10000) throw new Error('單次最多可匯入 10,000 句字幕。');
  }
  if (!cues.length) throw new Error('沒有找到可匯入的字幕。');
  return { cues: cues.sort((a, b) => a.start - b.start), warnings: [...warnings] };
}
export function importCaptionCues(data: ProjectData, cues: CaptionCue[], mode: 'append' | 'replace', style: CaptionStyle) {
  if (data.locks?.caption) throw new Error('字幕軌已鎖定，請先解鎖。');
  const imported: Caption[] = cues.map((cue) => ({ ...cue, id: uid(), style: structuredClone(style) }));
  return { ...data, captions: [...(mode === 'append' ? data.captions : data.captions.filter((c) => c.role === 'flower')), ...imported] };
}
export function serializeSubtitles(captions: Caption[], format: 'srt' | 'vtt') {
  if (!captions.length) throw new Error('目前範圍沒有可匯出的字幕。');
  const lines = orderedCaptions(captions).map((c, i) => {
    if (!Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || c.end <= c.start || c.end > 359999.999) throw new Error(`第 ${i + 1} 句的時間無效，請調整後再匯出。`);
    if (!c.text.trim()) throw new Error(`第 ${i + 1} 句沒有文字，請修改或刪除後再匯出。`);
    const text = c.text.trim().replace(/\r\n?/g, '\n').replace(/\n[ \t]*\n+/g, '\n')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const start = Math.round(c.start * 1000) / 1000, end = Math.max(Math.round(c.end * 1000) / 1000, start + 0.001);
    const sep = format === 'srt' ? ',' : '.';
    return `${i + 1}\n${formatCaptionTime(start, sep)} --> ${formatCaptionTime(end, sep)}\n${text}`;
  });
  return (format === 'vtt' ? 'WEBVTT\n\n' : '') + lines.join('\n\n') + '\n';
}
