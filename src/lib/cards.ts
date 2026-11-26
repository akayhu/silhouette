import { mainDuration, newCaption, totalDuration } from './timeline';
import type { Caption, CaptionStyle, ProjectData } from './types';

/**
 * 現成圖卡：標題橫幅、段落標籤、下方名牌、結尾卡。用字幕引擎畫，加上後可像字幕一樣改文字和樣式。
 * 圖卡不算「說話的字幕」：不會被匯出成字幕檔、翻譯，重新辨識或套模板也不會被清掉。
 */

export type CardKind = NonNullable<Caption['cardKind']>;

export interface CardPreset {
  kind: CardKind;
  name: string;
  desc: string;
  text: string;
  /** 整支影片只放一張（再按一次會換掉舊的） */
  single: boolean;
  style: CaptionStyle;
}

const base = { font: 'Noto Sans TC', bold: true, x: 0.5, stroke: '#16171b' } as const;

export const CARD_PRESETS: CardPreset[] = [
  { kind: 'banner', name: '標題橫幅', desc: '整支影片頂端固定顯示', text: '輸入你的標題', single: true, style: { ...base, size: 62, color: '#ffffff', background: 'rgba(32,52,201,0.95)', y: 0.1, animation: 'none' } },
  { kind: 'section', name: '段落標籤', desc: '播放頭位置顯示 3 秒', text: '重點一', single: false, style: { ...base, size: 48, color: '#16171b', background: 'rgba(255,225,74,0.97)', y: 0.2, animation: 'slide' } },
  { kind: 'lower', name: '下方名牌', desc: '介紹人名或地點，顯示 3.5 秒', text: '姓名｜職稱', single: false, style: { ...base, size: 46, color: '#16171b', background: 'rgba(255,255,255,0.95)', y: 0.66, animation: 'slide' } },
  { kind: 'handle', name: '帳號浮水印', desc: '整支影片下方固定顯示帳號', text: '@你的帳號', single: true, style: { ...base, size: 36, color: 'rgba(255,255,255,0.78)', stroke: 'rgba(22,23,27,0.6)', background: null, y: 0.93, animation: 'none' } },
  { kind: 'end', name: '結尾卡', desc: '影片最後 2.5 秒的行動呼籲', text: '追蹤看更多', single: true, style: { ...base, size: 100, color: '#ffffff', background: 'rgba(212,44,34,0.96)', y: 0.44, animation: 'pop' } },
];

const SECTION_SEC = 3;
const LOWER_SEC = 3.5;
const END_SEC = 2.5;

/** 依種類決定圖卡的時間範圍（time 是播放頭秒數） */
function range(d: ProjectData, kind: CardKind, time: number): [number, number] {
  // 影片長度以主軌為主，沒有主軌才看其他軌；圖卡自己不算進去，重加才不會越排越後面
  const rest = { ...d, captions: d.captions.filter((c) => c.role !== 'card') };
  const total = mainDuration(d.clips) || totalDuration(rest);
  if (kind === 'banner' || kind === 'handle') return [0, Math.max(3, total)];
  if (kind === 'end') return total >= END_SEC ? [total - END_SEC, total] : [Math.max(0, time), Math.max(0, time) + END_SEC];
  const len = kind === 'section' ? SECTION_SEC : LOWER_SEC;
  const start = total > len ? Math.min(Math.max(0, time), total - len) : Math.max(0, time);
  return [start, start + len];
}

export function addCard(d: ProjectData, kind: CardKind, time: number): { data: ProjectData; id: string } {
  const preset = CARD_PRESETS.find((p) => p.kind === kind)!;
  const old = preset.single ? d.captions.find((c) => c.cardKind === kind) : undefined;
  const [start, end] = range(d, kind, time);
  // 換掉舊的同種圖卡時保留使用者打過的字
  const card: Caption = { ...newCaption(start, end, old?.text ?? preset.text, { ...preset.style }), role: 'card', cardKind: kind };
  const captions = [...d.captions.filter((c) => c !== old), card].sort((a, b) => a.start - b.start);
  return { data: { ...d, captions }, id: card.id };
}
