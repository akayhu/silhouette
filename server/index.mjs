// 片刻剪趣 本機後端：會員、訂閱（綠界 ECPay 金流）、專案、媒體上傳、文字朗讀（macOS say／BreezyVoice）
// 這個檔案只負責組裝：建立 app、掛中介層、掛各路由模組、正式環境的靜態網站，實際邏輯都在各模組裡。
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import './db.mjs'; // 建立資料庫、跑 migration（有 side effect，要在掛路由前先載入）
import { PORT, ROOT } from './env.mjs';
import { attachUser, verifyOrigin } from './helpers.mjs';
import authRoutes from './routes/auth.mjs';
import billingRoutes from './routes/billing.mjs';
import adminRoutes from './routes/admin.mjs';
import projectRoutes from './routes/projects.mjs';
import mediaRoutes from './routes/media.mjs';

const app = express();
// 正式環境部署在反向代理（Fly.io／Zeabur／Railway／nginx）後面時，相信第一層代理加的
// X-Forwarded-For，req.ip 才會是使用者真正的 IP，而不是全部都變成代理自己的 IP
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
// 綠界的付款通知是用 application/x-www-form-urlencoded POST 回來的
app.use(express.urlencoded({ extended: false }));
app.use(attachUser);
app.use(verifyOrigin);

app.use(authRoutes);
app.use(billingRoutes);
app.use(adminRoutes);
app.use(projectRoutes);
app.use(mediaRoutes);

// ---------- 正式環境：提供建置好的網站（npm run build 之後） ----------
// 預先產生的頁面直接回傳；登入後才用的頁面回傳空外殼；其他網址回 404，避免軟 404 被搜尋引擎收錄
const DIST = path.join(ROOT, '..', 'dist');
const APP_ROUTES = [
  /^\/login\/?$/,
  /^\/register\/?$/,
  /^\/forgot-password\/?$/,
  /^\/reset-password\/?$/,
  /^\/dashboard\/?$/,
  /^\/tutorial\/?$/,
  /^\/feature-guide\/?$/,
  /^\/account\/?$/,
  /^\/checkout\/?$/,
  /^\/editor\/[^/]+\/?$/,
  /^\/admin(\/members|\/promo-codes|\/audit-log)?\/?$/,
];
if (fs.existsSync(path.join(DIST, 'app.html'))) {
  app.use('/assets', express.static(path.join(DIST, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(DIST, { index: 'index.html', redirect: false }));
  app.use((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(404).json({ error: '找不到這個網址' });
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: '找不到這個網址' });
    const clean = req.path.replace(/\/+$/, '');
    const pre = path.join(DIST, clean, 'index.html');
    if (clean && !clean.includes('..') && fs.existsSync(pre)) return res.sendFile(pre);
    const known = APP_ROUTES.some((re) => re.test(req.path));
    res.status(known ? 200 : 404).sendFile(path.join(DIST, 'app.html'));
  });
}

const listener = app.listen(PORT, () => console.log(`片刻剪趣 API 已啟動：http://localhost:${listener.address().port}`));
