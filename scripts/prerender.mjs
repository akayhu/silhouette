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
const { render, PUBLIC_ROUTES, PRERENDER_ROUTES } = await import(pathToFileURL(path.join(SSR, entry)).href);
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
fs.rmSync(SSR, { recursive: true, force: true });
