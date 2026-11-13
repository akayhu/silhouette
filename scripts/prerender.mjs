// 建置後執行：把公開頁面預先產生成靜態 HTML，並輸出 robots.txt、sitemap.xml
//   dist/index.html          首頁（含完整內容）
//   dist/pricing/index.html  價格頁
//   dist/app.html            空的外殼，給登入後頁面與 404 使用
// 設定正式網址：SITE_URL=https://你的網域 npm run build（或寫在 .env 的 VITE_SITE_URL）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SSR = path.join(ROOT, 'dist-ssr');

function readEnvSiteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  if (process.env.VITE_SITE_URL) return process.env.VITE_SITE_URL;
  for (const f of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, 'utf8').match(/^VITE_SITE_URL\s*=\s*["']?([^"'\s]+)/m);
    if (m) return m[1];
  }
  return '';
}
const SITE_URL = readEnvSiteUrl().replace(/\/+$/, '');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const setTag = (html, re, tag) => (re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`));

const entry = fs.readdirSync(SSR).find((f) => /^entry-server\.(m?js)$/.test(f));
const { render, PUBLIC_ROUTES, PRERENDER_ROUTES, SITE_NAME, faqs, siteInfoMissing } = await import(pathToFileURL(path.join(SSR, entry)).href);
const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

// 外殼：沒有預先產生的內容，前端載入後自己決定標題和 noindex
fs.writeFileSync(path.join(DIST, 'app.html'), template.replace('<!--app-html-->', ''));

for (const route of PRERENDER_ROUTES) {
  const meta = PUBLIC_ROUTES[route];
  let html = template.replace('<!--app-html-->', render(route));
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`);
  html = setTag(html, /<meta name="description"[^>]*>/, `<meta name="description" content="${esc(meta.description)}" />`);
  html = setTag(html, /<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(meta.title)}" />`);
  html = setTag(html, /<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(meta.description)}" />`);
  html = setTag(html, /<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(meta.title)}" />`);
  html = setTag(html, /<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(meta.description)}" />`);
  if (SITE_URL) {
    const url = SITE_URL + route;
    html = setTag(html, /<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}" />`);
    html = setTag(html, /<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}" />`);
    html = html.replace(/(<meta (?:property="og:image"|name="twitter:image") content=")\//g, `$1${SITE_URL}/`);
  }
  const out = route === '/' ? path.join(DIST, 'index.html') : path.join(DIST, route.slice(1), 'index.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`預先產生 ${route} → ${path.relative(ROOT, out)}`);
}

if (siteInfoMissing().length) console.warn(`⚠ src/lib/siteInfo.ts 還有沒填的營運資訊（${siteInfoMissing().join('、')}）：關於我們、隱私權政策、服務條款會顯示「待補」，正式上線前請填寫。`);

const robots = ['User-agent: *', 'Allow: /', 'Disallow: /api/'];
if (SITE_URL) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = Object.keys(PUBLIC_ROUTES)
    .map((r) => `  <url><loc>${SITE_URL}${r}</loc><lastmod>${today}</lastmod></url>`)
    .join('\n');
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  robots.push('', `Sitemap: ${SITE_URL}/sitemap.xml`);
  console.log('已產生 sitemap.xml');
} else {
  console.warn('⚠ 沒有設定 SITE_URL：不會輸出 canonical、og:url 和 sitemap.xml。正式上線前請用 SITE_URL=https://你的網域 npm run build');
}
fs.writeFileSync(path.join(DIST, 'robots.txt'), robots.join('\n') + '\n');

// llms.txt（llmstxt.org 標準）：給 AI 聊天／搜尋引擎（ChatGPT、Perplexity、Claude 等）一份乾淨的網站摘要
// 連結用相對路徑；有設定 SITE_URL 時才改成絕對網址
const link = (p) => (SITE_URL ? SITE_URL + p : p);
const llms = [
  `# ${SITE_NAME}`,
  '',
  `> ${PUBLIC_ROUTES['/'].description}`,
  '',
  '## 產品頁面',
  '',
  ...Object.entries(PUBLIC_ROUTES).map(([route, meta]) => `- [${meta.title.split('｜')[0]}](${link(route)}): ${meta.description}`),
  '',
  '## 價格',
  '',
  '- 免費版：每月 3 個專案，匯出 720p（含浮水印）',
  '- 專業版：新台幣 399 元／月，不限專案數量，匯出 1080p 無浮水印，AI 功能不限次數，不綁約可隨時取消',
  '- 新會員註冊即享 7 天專業版試用，不需信用卡',
  '',
  '## 常見問題',
  '',
  ...faqs.flatMap(([q, a]) => [`Q: ${q}`, `A: ${a}`, '']),
  '## 其他資訊',
  '',
  '- 僅支援最新版 Chrome 或 Edge 瀏覽器',
  '- 影片、圖片與音樂留在使用者的瀏覽器裡，不會上傳到伺服器；帳戶只保存專案的剪輯內容、字幕與設定',
  '- 語音辨識、翻譯、影片算圖與匯出都在使用者的瀏覽器裡執行',
].join('\n');
fs.writeFileSync(path.join(DIST, 'llms.txt'), llms + '\n');
console.log('已產生 llms.txt');

fs.rmSync(SSR, { recursive: true, force: true });
