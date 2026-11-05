// 貼紙推薦：規則式比對字幕文字，挑出跟內容相關的貼紙，不呼叫任何 AI API
import { STICKERS, type StickerDef } from './stickers';
import type { Caption } from './types';

// 貼紙 id → 會觸發推薦的關鍵字；大多數標籤貼紙的名字本身就是關鍵字，表情類另外列情緒詞
const KEYWORDS: Record<string, string[]> = {
  'face-laugh': ['哈哈', '笑死', '太好笑', '爆笑'],
  'face-smile': ['很開心', '心情很好', '微笑'],
  'face-love': ['好喜歡', '愛死', '最愛的'],
  'face-cry': ['哭', '難過', '感動到哭'],
  'face-wow': ['太驚訝', '嚇到', '太誇張', '沒想到'],
  'face-angry': ['生氣', '氣死', '超火大'],
  'face-cool': ['好酷', '帥'],
  'badge-yummy': ['好吃', '美味', '必吃'],
  'badge-recommend': ['推薦', '大推'],
  'badge-new': ['新上市', '新推出', '新品'],
  'badge-hot': ['熱門', '爆紅', '超紅'],
  'badge-limited': ['限時', '快搶', '手刀'],
  'badge-free': ['免費', '不用錢'],
  'badge-sale': ['特價', '便宜', '折扣'],
  'badge-checkin': ['打卡', '景點'],
  'badge-share': ['分享出去', '分享給你'],
  'badge-mustsee': ['必看', '一定要看'],
  'badge-cp': ['cp值', 'CP值', '划算'],
  'badge-bestseller': ['熱銷', '銷售冠軍'],
  'badge-today': ['今日限定', '今天限定'],
  'badge-vlog': ['vlog', 'Vlog', '日常紀錄'],
  'badge-subscribe': ['記得訂閱', '按讚訂閱'],
  heart: ['愛心'],
  fire: ['超強', '猛', '太厲害'],
  trophy: ['第一名', '冠軍', '最強'],
  'thumbs-up': ['讚啦', '太棒了'],
};

export interface StickerRecommendation {
  sticker: StickerDef;
  reason: string;
}

/** 依字幕文字猜跟內容相關的貼紙；只在真的比對到關鍵字時推薦，不會硬湊數量 */
export function recommendStickers(captions: Pick<Caption, 'text' | 'role'>[], count = 6): StickerRecommendation[] {
  const text = captions
    .filter((c) => c.role !== 'flower')
    .map((c) => c.text)
    .join('');
  if (!text.trim()) return [];

  const matched: StickerRecommendation[] = [];
  for (const sticker of STICKERS) {
    const words = KEYWORDS[sticker.id];
    if (!words) continue;
    const hit = words.find((w) => text.includes(w));
    if (hit) matched.push({ sticker, reason: `內容提到「${hit}」` });
  }
  return matched.slice(0, count);
}
