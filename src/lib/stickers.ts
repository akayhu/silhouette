/**
 * 原創貼紙庫：全部以 SVG 手繪，無版權疑慮，可用於商業影片。
 * 不使用系統 emoji（Apple 等 emoji 圖像有著作權）。
 * 統一使用 200×200 的畫布、深色描邊，文字使用系統字型（SVG 當圖片時無法載入網路字型）。
 */

export type StickerCategory = 'face' | 'badge' | 'pointer' | 'deco';

export interface StickerDef {
  id: string;
  name: string;
  category: StickerCategory;
  svg: string;
}

export const STICKER_CATEGORIES: { id: StickerCategory; label: string }[] = [
  { id: 'face', label: '表情' },
  { id: 'badge', label: '標籤' },
  { id: 'pointer', label: '指示' },
  { id: 'deco', label: '裝飾' },
];

const INK = '#1f1d2b';
const FONT = `'PingFang TC','Noto Sans TC','Microsoft JhengHei',sans-serif`;
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${body}</svg>`;

// ---------- 表情：黃色圓臉 ----------
const face = (fill: string, inner: string) =>
  svg(`<circle cx="100" cy="100" r="84" fill="${fill}" stroke="${INK}" stroke-width="8"/>
  <ellipse cx="72" cy="58" rx="22" ry="12" fill="#fff" opacity=".45" transform="rotate(-25 72 58)"/>${inner}`);
const blush = `<ellipse cx="52" cy="118" rx="14" ry="9" fill="#ff8a7a" opacity=".7"/><ellipse cx="148" cy="118" rx="14" ry="9" fill="#ff8a7a" opacity=".7"/>`;
const Y = '#ffd54a';

const faces: StickerDef[] = [
  {
    id: 'face-smile', name: '微笑', category: 'face',
    svg: face(Y, `${blush}<path d="M62 92q12-14 24 0M114 92q12-14 24 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
      <path d="M66 122q34 30 68 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`),
  },
  {
    id: 'face-laugh', name: '大笑', category: 'face',
    svg: face(Y, `<path d="M58 80l22 12-22 12M142 80l-22 12 22 12" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M58 116h84q-6 48-42 48t-42-48z" fill="${INK}"/><path d="M78 148q22-16 44 0q-8 14-22 14t-22-14z" fill="#ff7a7a"/>`),
  },
  {
    id: 'face-love', name: '愛心眼', category: 'face',
    svg: face(Y, `<path d="M74 104c-26-14-24-34-12-36 6-1 10 3 12 8 2-5 6-9 12-8 12 2 14 22-12 36z" fill="#ff4d6d" stroke="${INK}" stroke-width="5" transform="translate(-6 -12)"/>
      <path d="M74 104c-26-14-24-34-12-36 6-1 10 3 12 8 2-5 6-9 12-8 12 2 14 22-12 36z" fill="#ff4d6d" stroke="${INK}" stroke-width="5" transform="translate(58 -12)"/>
      <path d="M70 126q30 28 60 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`),
  },
  {
    id: 'face-wow', name: '驚訝', category: 'face',
    svg: face(Y, `<circle cx="72" cy="84" r="11" fill="${INK}"/><circle cx="128" cy="84" r="11" fill="${INK}"/>
      <path d="M58 60q14-10 26-4M142 60q-14-10-26-4" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
      <ellipse cx="100" cy="136" rx="16" ry="20" fill="${INK}"/>`),
  },
  {
    id: 'face-cry', name: '大哭', category: 'face',
    svg: face(Y, `<path d="M58 84q14 8 28 0M114 84q14 8 28 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
      <path d="M62 90v74M138 90v74" stroke="#5cc8ff" stroke-width="14" stroke-linecap="round"/>
      <path d="M78 140q22-22 44 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`),
  },
  {
    id: 'face-cool', name: '酷', category: 'face',
    svg: face(Y, `<path d="M40 80h120v10q-4 26-30 26t-26-24h-8q0 24-26 24t-30-26z" fill="${INK}"/>
      <path d="M58 88l12-6M118 88l12-6" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>
      <path d="M78 138q26 14 48-6" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`),
  },
  {
    id: 'face-wink', name: '眨眼', category: 'face',
    svg: face(Y, `${blush}<circle cx="72" cy="88" r="10" fill="${INK}"/><path d="M114 90q12-10 26 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
      <path d="M66 122q34 30 68 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><path d="M118 138q8 14 18 4" fill="#ff7a7a" stroke="${INK}" stroke-width="5"/>`),
  },
  {
    id: 'face-angry', name: '生氣', category: 'face',
    svg: face('#ff8a5c', `<path d="M56 70l30 14M144 70l-30 14" stroke="${INK}" stroke-width="9" stroke-linecap="round"/>
      <circle cx="74" cy="96" r="9" fill="${INK}"/><circle cx="126" cy="96" r="9" fill="${INK}"/>
      <path d="M72 146q28-24 56 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`),
  },
  {
    id: 'face-sweat', name: '尷尬', category: 'face',
    svg: face(Y, `<path d="M60 92q12-10 24 0M116 92q12-10 24 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
      <path d="M66 128h68" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
      <path d="M156 38q14 20 4 30q-10 8-18-2q-6-10 14-28z" fill="#5cc8ff" stroke="${INK}" stroke-width="5"/>`),
  },
];

// ---------- 標籤：有字的徽章 ----------
const text = (t: string, size: number, fill = '#fff', y = 112, stroke = INK) =>
  `<text x="100" y="${y}" font-family="${FONT}" font-weight="900" font-size="${size}" text-anchor="middle" fill="${fill}" stroke="${stroke}" stroke-width="6" paint-order="stroke" stroke-linejoin="round">${t}</text>`;
const burst = (fill: string, points = 14, r1 = 92, r2 = 72) => {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (Math.PI * i) / points - Math.PI / 2;
    pts.push(`${(100 + r * Math.cos(a)).toFixed(1)},${(100 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`;
};

const badges: StickerDef[] = [
  { id: 'badge-mustsee', name: '必看', category: 'badge', svg: svg(`${burst('#ff4d4d')}${text('必看！', 46, '#fff', 116)}`) },
  {
    id: 'badge-yummy', name: '超好吃', category: 'badge',
    svg: svg(`<rect x="14" y="58" width="172" height="84" rx="42" fill="#ff7a59" stroke="${INK}" stroke-width="8" transform="rotate(-6 100 100)"/>${text('超好吃', 44, '#fff', 116)}`),
  },
  {
    id: 'badge-recommend', name: '推薦', category: 'badge',
    svg: svg(`<rect x="20" y="60" width="160" height="80" rx="40" fill="#5b4cf5" stroke="${INK}" stroke-width="8"/>
      <path d="M50 82l6 13 14 2-10 10 2 14-12-7-12 7 2-14-10-10 14-2z" fill="#ffd54a" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>${text('推薦', 42, '#fff', 116).replace('x="100"', 'x="118"')}`),
  },
  { id: 'badge-new', name: 'NEW', category: 'badge', svg: svg(`${burst('#ffd54a', 16, 92, 76)}${text('NEW', 50, '#ff4d4d', 118)}`) },
  {
    id: 'badge-limited', name: '限時', category: 'badge',
    svg: svg(`<path d="M30 60h108l34 40-34 40H30z" fill="#ff4d6d" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/><circle cx="146" cy="100" r="8" fill="#fff" stroke="${INK}" stroke-width="5"/>${text('限時', 44, '#fff', 116).replace('x="100"', 'x="84"')}`),
  },
  {
    id: 'badge-hot', name: 'HOT', category: 'badge',
    svg: svg(`<path d="M100 18c10 34 54 46 54 100a54 54 0 0 1-108 0c0-28 16-40 22-58 8 18 14 22 20 24-4-26 4-48 12-66z" fill="#ff6b3d" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
      <path d="M100 96c4 16 26 22 26 46a26 26 0 0 1-52 0c0-14 8-20 12-30 4 8 8 10 10 10-2-12 2-20 4-26z" fill="#ffd54a"/>${text('HOT', 40, '#fff', 172)}`),
  },
  {
    id: 'badge-like', name: '讚', category: 'badge',
    svg: svg(`<path d="M24 40h152a16 16 0 0 1 16 16v76a16 16 0 0 1-16 16H86l-34 30v-30H24a16 16 0 0 1-16-16V56a16 16 0 0 1 16-16z" fill="#fff" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>${text('讚啦！', 46, '#5b4cf5', 112, '#fff')}`),
  },
  {
    id: 'badge-checkin', name: '打卡', category: 'badge',
    svg: svg(`<path d="M100 186s-62-58-62-104a62 62 0 0 1 124 0c0 46-62 104-62 104z" fill="#19b38a" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
      <circle cx="100" cy="84" r="40" fill="#fff" stroke="${INK}" stroke-width="6"/>${text('打卡', 34, '#19b38a', 96, '#fff')}`),
  },
  {
    id: 'badge-subscribe', name: '記得訂閱', category: 'badge',
    svg: svg(`<rect x="8" y="64" width="184" height="72" rx="36" fill="#ff4d4d" stroke="${INK}" stroke-width="8"/>
      <path d="M24 116h28M30 116v-18a8 8 0 0 1 16 0v18M38 120v4" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>${text('記得訂閱', 30, '#fff', 111, '#ff4d4d').replace('x="100"', 'x="122"')}`),
  },
  { id: 'badge-cp', name: 'CP值高', category: 'badge', svg: svg(`${burst('#7cf0c4', 12, 90, 74)}${text('CP值', 40, INK, 96, '#fff')}${text('超高', 40, '#ff4d4d', 140, '#fff')}`) },
];

// ---------- 指示：箭頭、圈選、底線 ----------
const pointers: StickerDef[] = [
  {
    id: 'arrow-right', name: '箭頭（右）', category: 'pointer',
    svg: svg(`<path d="M24 120c40-60 90-70 130-48" fill="none" stroke="${INK}" stroke-width="22" stroke-linecap="round"/>
      <path d="M24 120c40-60 90-70 130-48" fill="none" stroke="#ff4d4d" stroke-width="12" stroke-linecap="round"/>
      <path d="M128 44l40 32-46 18z" fill="#ff4d4d" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>`),
  },
  {
    id: 'arrow-down', name: '箭頭（下）', category: 'pointer',
    svg: svg(`<path d="M100 16v110" stroke="${INK}" stroke-width="30" stroke-linecap="round"/><path d="M100 16v110" stroke="#ffd54a" stroke-width="18" stroke-linecap="round"/>
      <path d="M52 110h96l-48 70z" fill="#ffd54a" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`),
  },
  {
    id: 'circle-mark', name: '紅圈', category: 'pointer',
    svg: svg(`<path d="M150 46C114 18 34 34 24 92s54 92 110 76 62-80 18-118c-14-12-34-16-50-14" fill="none" stroke="#ff4d4d" stroke-width="12" stroke-linecap="round"/>`),
  },
  {
    id: 'underline', name: '底線', category: 'pointer',
    svg: svg(`<path d="M14 110c40-14 90-18 172-6M30 136c50-10 96-10 140-2" fill="none" stroke="#ff4d4d" stroke-width="12" stroke-linecap="round"/>`),
  },
  {
    id: 'cursor', name: '點擊', category: 'pointer',
    svg: svg(`<path d="M60 30l90 72-40 6 22 44-18 8-22-44-32 26z" fill="#fff" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
      <path d="M36 30l-14-12M40 56H20M58 14V0" stroke="#ff7a59" stroke-width="8" stroke-linecap="round"/>`),
  },
  { id: 'exclaim', name: '驚嘆號', category: 'pointer', svg: svg(`${burst('#ff4d4d', 10, 90, 66)}<rect x="88" y="44" width="24" height="70" rx="12" fill="#fff" stroke="${INK}" stroke-width="6"/><circle cx="100" cy="140" r="14" fill="#fff" stroke="${INK}" stroke-width="6"/>`) },
  {
    id: 'question', name: '問號', category: 'pointer',
    svg: svg(`<circle cx="100" cy="96" r="80" fill="#5b4cf5" stroke="${INK}" stroke-width="8"/>
      <path d="M72 76a28 28 0 1 1 40 26c-8 4-12 10-12 18v6" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round"/><circle cx="100" cy="150" r="10" fill="#fff"/>`),
  },
];

// ---------- 裝飾 ----------
const heartPath = 'M100 172C40 128 16 96 16 66c0-28 22-46 46-46 18 0 30 10 38 24 8-14 20-24 38-24 24 0 46 18 46 46 0 30-24 62-84 106z';
const starPath = (cx: number, cy: number, r1: number, r2: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (Math.PI * i) / 5 - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
};

const decos: StickerDef[] = [
  { id: 'heart', name: '愛心', category: 'deco', svg: svg(`<path d="${heartPath}" fill="#ff4d6d" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/><path d="M48 60q6-16 22-18" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".7"/>`) },
  { id: 'star', name: '星星', category: 'deco', svg: svg(`<polygon points="${starPath(100, 106, 88, 40)}" fill="#ffd54a" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`) },
  {
    id: 'sparkles', name: '閃亮', category: 'deco',
    svg: svg(`<path d="M86 20q10 56 62 66-52 10-62 66-10-56-62-66 52-10 62-66z" fill="#ffd54a" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
      <path d="M156 112q5 26 30 31-25 5-30 31-5-26-30-31 25-5 30-31z" fill="#7cd7ff" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
      <path d="M150 18q3 16 18 19-15 3-18 19-3-16-18-19 15-3 18-19z" fill="#ff8ab3" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`),
  },
  {
    id: 'fire', name: '火焰', category: 'deco',
    svg: svg(`<path d="M100 10c14 40 66 56 66 112a66 66 0 0 1-132 0c0-34 20-50 28-72 10 22 18 28 24 30-4-32 4-50 14-70z" fill="#ff6b3d" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
      <path d="M100 92c6 20 34 28 34 58a34 34 0 0 1-68 0c0-18 10-26 14-38 6 10 10 14 12 14-2-16 2-24 8-34z" fill="#ffd54a"/>`),
  },
  {
    id: 'crown', name: '皇冠', category: 'deco',
    svg: svg(`<path d="M24 150l-8-92 50 40 34-62 34 62 50-40-8 92z" fill="#ffd54a" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
      <rect x="24" y="150" width="152" height="24" rx="6" fill="#ffb800" stroke="${INK}" stroke-width="8"/><circle cx="100" cy="122" r="12" fill="#ff4d6d" stroke="${INK}" stroke-width="5"/>`),
  },
  {
    id: 'music', name: '音符', category: 'deco',
    svg: svg(`<path d="M74 140V44l96-22v96" fill="none" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/><path d="M74 64l96-22" stroke="${INK}" stroke-width="22"/>
      <ellipse cx="54" cy="142" rx="28" ry="22" fill="#5b4cf5" stroke="${INK}" stroke-width="8"/><ellipse cx="150" cy="120" rx="28" ry="22" fill="#ff7a59" stroke="${INK}" stroke-width="8"/>`),
  },
  {
    id: 'thumbs-up', name: '比讚', category: 'deco',
    svg: svg(`<path d="M66 86l34-60c18 0 24 16 20 32l-6 24h46a16 16 0 0 1 16 18l-12 64a18 18 0 0 1-18 14H66z" fill="#ffd54a" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
      <rect x="22" y="84" width="40" height="96" rx="8" fill="#5b4cf5" stroke="${INK}" stroke-width="8"/>`),
  },
  { id: 'lightning', name: '閃電', category: 'deco', svg: svg(`<path d="M118 10L40 112h50l-18 78 88-112h-52z" fill="#ffd54a" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`) },
  {
    id: 'bubble', name: '對話框', category: 'deco',
    svg: svg(`<path d="M30 30h140a20 20 0 0 1 20 20v76a20 20 0 0 1-20 20h-74l-44 36 8-36H30a20 20 0 0 1-20-20V50a20 20 0 0 1 20-20z" fill="#fff" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
      <circle cx="62" cy="88" r="11" fill="${INK}"/><circle cx="100" cy="88" r="11" fill="${INK}"/><circle cx="138" cy="88" r="11" fill="${INK}"/>`),
  },
];

export const STICKERS: StickerDef[] = [...faces, ...badges, ...pointers, ...decos];
const byId = new Map(STICKERS.map((s) => [s.id, s]));
export const stickerDef = (id: string) => byId.get(id);

export const stickerUrl = (s: StickerDef) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.svg)}`;

/** 貼紙圖片快取（canvas 繪製用），載入完成後呼叫 onLoad 重畫 */
const images = new Map<string, HTMLImageElement>();
export function stickerImage(id: string, onLoad?: () => void) {
  let img = images.get(id);
  if (!img) {
    const def = byId.get(id);
    if (!def) return null;
    img = new Image();
    img.src = stickerUrl(def);
    if (onLoad) img.onload = onLoad;
    images.set(id, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}
