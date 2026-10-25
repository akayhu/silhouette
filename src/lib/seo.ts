/**
 * 搜尋引擎相關設定：每個公開頁面的標題、描述，以及私人頁面的 noindex。
 * 前端切換頁面時用 applySeo 更新 <head>；建置時 scripts/prerender.mjs 也讀同一份資料寫進靜態 HTML。
 */

export const SITE_NAME = '片刻剪趣';
/** 正式網址，例如 https://pianke.tw（建置時用 VITE_SITE_URL 設定；沒設就不輸出 canonical 等絕對網址） */
export const SITE_URL = ((import.meta.env?.VITE_SITE_URL as string | undefined) ?? '').replace(/\/+$/, '');
export const OG_IMAGE = '/og-image.png';

export type SeoMeta = { title: string; description: string; noindex?: boolean };

/** 可以被搜尋的公開頁面 */
export const PUBLIC_ROUTES: Record<string, SeoMeta> = {
  '/': {
    title: '片刻剪趣｜免費線上短影音剪輯：AI 自動字幕、智能口播、文字轉語音',
    description:
      '免安裝的線上短影音剪輯工具。AI 自動上繁體中文字幕、自動剪掉停頓、台灣腔文字轉語音，還有疊加子母畫面、去浮水印、無版權配樂、貼紙濾鏡轉場。免費註冊送 7 天專業版。',
  },
  '/pricing': {
    title: '價格方案｜片刻剪趣 線上短影音剪輯',
    description: '片刻剪趣免費版可以一直使用；專業版每月 NT$399，不限專案、1080p 無浮水印匯出、AI 字幕與配音不限次數。新會員免費試用 7 天，不需信用卡。',
  },
  '/register': {
    title: '免費註冊｜片刻剪趣',
    description: '免費註冊片刻剪趣，立即享有 7 天專業版，線上剪輯短影音、AI 自動字幕與配音全部開放，不需信用卡。',
  },
};

const PRIVATE_TITLES: [RegExp, string][] = [
  [/^\/login/, '登入'],
  [/^\/dashboard/, '我的專案'],
  [/^\/account/, '帳戶設定'],
  [/^\/checkout/, '升級專業版'],
  [/^\/editor\//, '編輯器'],
  [/^\/admin/, '管理後台'],
];

/** 已知但不公開的頁面（登入後才看得到）；其他沒列到的網址就是 404 */
export const isAppRoute = (path: string) => PRIVATE_TITLES.some(([re]) => re.test(path));

export function seoFor(path: string): SeoMeta {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  const pub = PUBLIC_ROUTES[clean];
  if (pub) return pub;
  const priv = PRIVATE_TITLES.find(([re]) => re.test(clean));
  if (priv) return { title: `${priv[1]}｜${SITE_NAME}`, description: PUBLIC_ROUTES['/'].description, noindex: true };
  return { title: `找不到這個頁面｜${SITE_NAME}`, description: PUBLIC_ROUTES['/'].description, noindex: true };
}

function setMeta(attr: 'name' | 'property', key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content === null) return el?.remove();
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (href === null) return el?.remove();
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

/** 前端換頁時同步 <head> */
export function applySeo(path: string) {
  const meta = seoFor(path);
  const url = SITE_URL && !meta.noindex ? SITE_URL + (path.length > 1 ? path.replace(/\/+$/, '') : '/') : null;
  document.title = meta.title;
  setMeta('name', 'description', meta.description);
  setMeta('name', 'robots', meta.noindex ? 'noindex, nofollow' : null);
  setMeta('property', 'og:title', meta.title);
  setMeta('property', 'og:description', meta.description);
  setMeta('property', 'og:url', url);
  setMeta('name', 'twitter:title', meta.title);
  setMeta('name', 'twitter:description', meta.description);
  setCanonical(url);
}
