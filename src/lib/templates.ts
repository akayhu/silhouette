import type { Intensity } from './autoEffects';
import type { CaptionStyle } from './types';
import type { FilterId } from './filters';

/**
 * 智能剪輯模板：每個模板決定字幕樣式、花字樣式、配樂、音效、濾鏡和特效強度。
 * 新增模板只要在 SMART_TEMPLATES 加一筆，面板會自動列出。
 * music／sfx 填音樂庫（server/music/library.json）的 id。
 */
export interface SmartTemplate {
  id: string;
  name: string;
  desc: string;
  /** 卡片預覽用的背景色 */
  swatch: string;
  intensity: Intensity;
  stickers: boolean;
  filter: FilterId | null;
  caption: Omit<CaptionStyle, 'animation'>;
  /** 花字：重點句放大放在畫面上方 */
  flower: CaptionStyle;
  /** 每支影片最多幾個花字、彼此至少隔幾秒 */
  flowerMax: number;
  flowerGap: number;
  music: string;
  /** 有人聲時配樂壓低一點 */
  musicVolume: number;
  sfx: { transition?: string; flower?: string; sticker?: string; intro?: string };
}

const base = { font: 'Noto Sans TC', bold: true, x: 0.5 } as const;

export const SMART_TEMPLATES: SmartTemplate[] = [
  {
    id: 'food',
    name: '美食探店',
    desc: '黃字大字幕、橘紅花字，輕快配樂，換場「咻」一聲',
    swatch: '#ffb347',
    intensity: 'normal',
    stickers: true,
    filter: 'food',
    caption: { ...base, size: 78, color: '#ffe14a', stroke: '#1f1d2b', background: null, y: 0.8 },
    flower: {
      ...base,
      size: 118,
      color: '#ff5a1f',
      stroke: '#ffffff',
      background: null,
      y: 0.2,
      animation: 'pop',
      shadow: { color: '#1f1d2b', opacity: 0.9, blur: 0, distance: 10, angle: 45 },
    },
    flowerMax: 4,
    flowerGap: 4,
    music: 'sunny-morning',
    musicVolume: 0.28,
    sfx: { transition: 'sfx-whoosh', flower: 'sfx-ding', sticker: 'sfx-pop' },
  },
  {
    id: 'talk',
    name: '知識口播',
    desc: '白底黑字字幕、紅底重點花字，安靜配樂不搶話',
    swatch: '#e9ecef',
    intensity: 'light',
    stickers: false,
    filter: null,
    caption: { ...base, size: 66, color: '#1f1d2b', stroke: '#1f1d2b', background: 'rgba(255,255,255,0.92)', y: 0.82 },
    flower: { ...base, size: 92, color: '#ffffff', stroke: '#1f1d2b', background: 'rgba(212,44,34,0.95)', y: 0.18, animation: 'slide' },
    flowerMax: 3,
    flowerGap: 6,
    music: 'quiet-thoughts',
    musicVolume: 0.18,
    sfx: { flower: 'sfx-typing' },
  },
  {
    id: 'vlog',
    name: '日常 Vlog',
    desc: '柔光陰影字幕、日系濾鏡，Lo-fi 配樂與快門聲',
    swatch: '#cfe3d4',
    intensity: 'light',
    stickers: false,
    filter: 'japan',
    caption: {
      ...base,
      size: 70,
      color: '#ffffff',
      stroke: '#1f1d2b',
      background: null,
      y: 0.8,
      shadow: { color: '#000000', opacity: 0.45, blur: 28, distance: 6, angle: 90 },
    },
    flower: {
      ...base,
      font: 'Noto Serif TC',
      size: 100,
      color: '#ffffff',
      stroke: '#5b6b5f',
      background: null,
      y: 0.22,
      animation: 'fade',
      shadow: { color: '#000000', opacity: 0.4, blur: 30, distance: 4, angle: 90 },
    },
    flowerMax: 2,
    flowerGap: 8,
    music: 'afternoon-coffee',
    musicVolume: 0.3,
    sfx: { transition: 'sfx-shutter' },
  },
  {
    id: 'hype',
    name: '熱血動感',
    desc: '霓虹發光花字、強烈特寫與轉場，動感電子配樂',
    swatch: '#3a2b6b',
    intensity: 'strong',
    stickers: true,
    filter: 'punchy',
    caption: { ...base, size: 84, color: '#ffffff', stroke: '#1f1d2b', background: null, y: 0.78 },
    flower: {
      ...base,
      size: 128,
      color: '#ffffff',
      stroke: '#ff2bd6',
      background: null,
      y: 0.2,
      animation: 'pop',
      shadow: { color: '#ff4fd8', opacity: 1, blur: 60, distance: 0, angle: 90 },
    },
    flowerMax: 5,
    flowerGap: 3,
    music: 'city-rhythm',
    musicVolume: 0.32,
    sfx: { intro: 'sfx-riser', transition: 'sfx-whoosh', flower: 'sfx-ding', sticker: 'sfx-pop' },
  },
  {
    id: 'cute',
    name: '可愛萌寵',
    desc: '粉色字幕、粉嫩濾鏡和貼紙，可愛配樂加「啵嚶」音效',
    swatch: '#ffd1e3',
    intensity: 'normal',
    stickers: true,
    filter: 'pastel',
    caption: { ...base, size: 76, color: '#ff6fa8', stroke: '#ffffff', background: null, y: 0.8 },
    flower: {
      ...base,
      size: 112,
      color: '#ffffff',
      stroke: '#ff6fa8',
      background: null,
      y: 0.2,
      animation: 'pop',
      shadow: { color: '#ff6fa8', opacity: 0.6, blur: 0, distance: 8, angle: 45 },
    },
    flowerMax: 4,
    flowerGap: 4,
    music: 'cute-daily',
    musicVolume: 0.3,
    sfx: { flower: 'sfx-boing', sticker: 'sfx-pop', transition: 'sfx-pop' },
  },
];
