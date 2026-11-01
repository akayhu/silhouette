// 片刻剪趣 本機後端：會員、訂閱（綠界 ECPay 金流）、專案、媒體上傳、文字朗讀（macOS say）
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, randomUUID, createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.SILHOUETTE_DATA_DIR || path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PORT = Number(process.env.PORT || 8787);
const FREE_MONTHLY_PROJECTS = 3;
const PRO_PRICE_TWD = 399;
// 折扣優惠碼最多折這麼多錢（確保扣款金額一定是正數）
const MAX_PROMO_DISCOUNT_TWD = 300;
const SESSION_DAYS = 30;

// ---------- 綠界 ECPay 金流設定 ----------
// 沒設定環境變數時，預設用綠界公開的測試環境帳號（僅供測試，不會真的請款）
const ECPAY_ENV = process.env.ECPAY_ENV === 'production' ? 'production' : 'test';
const ECPAY_MERCHANT_ID = process.env.ECPAY_MERCHANT_ID || '2000132';
const ECPAY_HASH_KEY = process.env.ECPAY_HASH_KEY || '5294y06JbISpM5x9';
const ECPAY_HASH_IV = process.env.ECPAY_HASH_IV || 'v77hoKGq4kWxNNIS';
const ECPAY_HOST = ECPAY_ENV === 'production' ? 'https://payment.ecpay.com.tw' : 'https://payment-stage.ecpay.com.tw';
// 使用者實際瀏覽這個網站的網址（正式上線請設成正式網域；本機開發預設 Vite 的網址）
const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
// 定期定額每期月數固定為 1（每月扣款一次）
const ECPAY_PERIOD_MONTHS = 1;
const TRIAL_DAYS = 7;

// ---------- 註冊信箱驗證（Resend） ----------
// 沒設定 RESEND_API_KEY 時（本機開發預設），驗證信連結只會印在後端 log，方便開發測試
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || '片刻剪趣 <onboarding@resend.dev>';
const EMAIL_VERIFICATION_HOURS = 24;

// ---------- Google 登入／註冊 ----------
// 沒設定這兩個環境變數時，前端會顯示「需要先設定」的提示，不影響一般 Email 註冊
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = `${APP_URL}/api/auth/google/callback`;

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    plan_renews_at TEXT,
    plan_cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    thumbnail TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS project_creations (
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS exports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    file TEXT NOT NULL,
    meta TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    card_last4 TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ecpay_orders (
    trade_no TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    promo_code TEXT
  );
  CREATE TABLE IF NOT EXISTS promo_codes (
    code TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'months',
    months INTEGER NOT NULL,
    discount_amount INTEGER,
    created_by TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS promo_redemptions (
    code TEXT NOT NULL,
    user_id TEXT NOT NULL,
    redeemed_at TEXT NOT NULL,
    PRIMARY KEY (code, user_id)
  );
  CREATE TABLE IF NOT EXISTS email_verifications (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const now = () => new Date().toISOString();

// 舊資料庫補欄位：role（user／admin）、plan_source（paid 自己付費／admin 管理者開通）
const userColumns = db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
if (!userColumns.includes('role')) db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
if (!userColumns.includes('plan_source')) db.exec(`ALTER TABLE users ADD COLUMN plan_source TEXT`);

// 舊資料庫補欄位：優惠碼加上「折扣金額」類型、訂單記錄用了哪組優惠碼
const promoColumns = db.prepare(`PRAGMA table_info(promo_codes)`).all().map((c) => c.name);
if (!promoColumns.includes('kind')) db.exec(`ALTER TABLE promo_codes ADD COLUMN kind TEXT NOT NULL DEFAULT 'months'`);
if (!promoColumns.includes('discount_amount')) db.exec(`ALTER TABLE promo_codes ADD COLUMN discount_amount INTEGER`);
const ecpayOrderColumns = db.prepare(`PRAGMA table_info(ecpay_orders)`).all().map((c) => c.name);
if (!ecpayOrderColumns.includes('promo_code')) db.exec(`ALTER TABLE ecpay_orders ADD COLUMN promo_code TEXT`);

// 舊資料庫補欄位：Email 驗證（舊帳號視為已驗證，避免這次改動把既有使用者鎖在外面）
if (!userColumns.includes('email_verified_at')) {
  db.exec(`ALTER TABLE users ADD COLUMN email_verified_at TEXT`);
  db.exec(`UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL`);
}

// 舊資料庫補欄位：Google 登入帳號的 Google 使用者 ID（用來比對是否已經綁過）
if (!userColumns.includes('google_id')) db.exec(`ALTER TABLE users ADD COLUMN google_id TEXT`);

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').filter(Boolean).map((part) => {
      const i = part.indexOf('=');
      return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
    }),
  );
}

function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`,
  );
}

function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

// 到期未續訂的專業版自動降回免費版
// 到期就降回免費版：真正的續訂由綠界定期定額的 PeriodReturnURL 通知觸發，
// 會在到期前延長 plan_renews_at；這裡只負責「沒有收到續訂通知」時的降級。
function refreshPlan(user) {
  if (user.plan === 'pro' && user.plan_renews_at && new Date(user.plan_renews_at) < new Date()) {
    db.prepare(`UPDATE users SET plan='free', plan_renews_at=NULL, plan_cancel_at_period_end=0 WHERE id=?`).run(user.id);
    return { ...user, plan: 'free', plan_renews_at: null, plan_cancel_at_period_end: 0 };
  }
  return user;
}

// 免費把使用者升級成專業版 N 個月（管理者開通、優惠碼兌換共用）：
// 原本還在有效期內就從原到期日續算，否則從現在起算；不會產生付款紀錄
function grantProMonths(user, months, source) {
  const base = user.plan === 'pro' && user.plan_renews_at && new Date(user.plan_renews_at) > new Date() ? new Date(user.plan_renews_at) : new Date();
  base.setMonth(base.getMonth() + months);
  const renews = base.toISOString();
  db.prepare(`UPDATE users SET plan='pro', plan_source=?, plan_renews_at=?, plan_cancel_at_period_end=1 WHERE id=?`).run(source, renews, user.id);
  return renews;
}

// 優惠碼不用容易看錯的字元（0/O、1/I/L）
const PROMO_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generatePromoCode() {
  const pick = () => PROMO_ALPHABET[randomBytes(1)[0] % PROMO_ALPHABET.length];
  const group = () => Array.from({ length: 4 }, pick).join('');
  for (let i = 0; i < 20; i++) {
    const code = `${group()}-${group()}`;
    if (!db.prepare(`SELECT 1 FROM promo_codes WHERE code=?`).get(code)) return code;
  }
  throw new Error('無法產生唯一的優惠碼，請再試一次');
}

function publicUser(user) {
  const used = db
    // 以建立紀錄計算，刪掉專案不會退回額度
    .prepare(`SELECT COUNT(*) AS n FROM project_creations WHERE user_id=? AND created_at >= ?`)
    .get(user.id, startOfMonth()).n;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    role: user.role ?? 'user',
    planSource: user.plan_source ?? null,
    planRenewsAt: user.plan_renews_at,
    cancelAtPeriodEnd: Boolean(user.plan_cancel_at_period_end),
    createdAt: user.created_at,
    usage: {
      projectsThisMonth: used,
      projectLimit: user.plan === 'pro' ? null : FREE_MONTHLY_PROJECTS,
    },
  };
}

// ---------- 綠界 ECPay 檢查碼與下單工具函式 ----------
// 把字串編碼成跟 .NET UrlEncode 一致的格式：JS 的 encodeURIComponent 本來就不會
// 編碼 ~ 和 '，但 .NET 會，所以這三個差異要手動補上；空白 .NET 編成 +，JS 編成 %20。
function ecpayUrlEncode(str) {
  return encodeURIComponent(str).replace(/~/g, '%7E').replace(/%20/g, '+').replace(/'/g, '%27');
}

// 依綠界「檢查碼機制」規則計算 CheckMacValue：參數依欄位名稱排序、前後加上
// HashKey／HashIV、URL encode、轉小寫、SHA256、轉大寫
function ecpayCheckMacValue(data) {
  const keys = Object.keys(data).sort((a, b) => {
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    return al > bl ? 1 : al < bl ? -1 : 0;
  });
  const raw = keys.map((k) => `${k}=${data[k]}`).join('&');
  const wrapped = `HashKey=${ECPAY_HASH_KEY}&${raw}&HashIV=${ECPAY_HASH_IV}`;
  const encoded = ecpayUrlEncode(wrapped).toLowerCase();
  return createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

// yyyy/MM/dd HH:mm:ss（綠界要求的時間格式，用本機時間）
function ecpayDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 寄出註冊驗證信；沒設定 RESEND_API_KEY 時改印在 log，方便本機開發測試整個流程
async function sendVerificationEmail(email, name, token) {
  const link = `${APP_URL}/api/auth/verify?token=${token}`;
  if (!RESEND_API_KEY) {
    console.log(`[驗證信：尚未設定 RESEND_API_KEY，僅印出連結] ${email} -> ${link}`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: email,
        subject: '請完成「片刻剪趣」帳號驗證',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2>嗨 ${name}，歡迎加入片刻剪趣</h2>
            <p>請點擊下方按鈕完成信箱驗證，開通你的帳號（含 7 天免費專業版試用）。</p>
            <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;border-radius:999px;text-decoration:none;font-weight:bold">驗證我的帳號</a></p>
            <p style="color:#888;font-size:13px">這組連結 ${EMAIL_VERIFICATION_HOURS} 小時內有效。如果不是你本人註冊，請忽略這封信。</p>
          </div>`,
      }),
    });
    if (!res.ok) console.error('寄送驗證信失敗', res.status, await res.text());
  } catch (err) {
    console.error('寄送驗證信失敗', err);
  }
}

function createEmailVerification(userId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + EMAIL_VERIFICATION_HOURS * 3600_000).toISOString();
  db.prepare(`INSERT INTO email_verifications (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`).run(token, userId, expires, now());
  return token;
}

const app = express();
app.use(express.json({ limit: '10mb' }));
// 綠界的付款通知是用 application/x-www-form-urlencoded POST 回來的
app.use(express.urlencoded({ extended: false }));

app.use((req, _res, next) => {
  const { sid } = parseCookies(req.headers.cookie);
  if (sid) {
    const row = db
      .prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token=? AND s.expires_at > ?`)
      .get(sid, now());
    if (row) req.user = refreshPlan(row);
  }
  next();
});

const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: '請先登入' }));
const requireAdmin = (req, res, next) =>
  req.user?.role === 'admin' ? next() : res.status(req.user ? 403 : 401).json({ error: '需要管理者權限' });
const requirePro = (req, res, next) =>
  req.user?.plan === 'pro' ? next() : res.status(402).json({ error: '此功能僅限專業版', code: 'UPGRADE_REQUIRED' });

function createSession(res, userId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`).run(token, userId, expires);
  setSessionCookie(res, token);
}

// ---------- 會員 ----------
app.post('/api/auth/register', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Email 格式不正確' });
  if (!name) return res.status(400).json({ error: '請輸入名稱' });
  if (password.length < 8) return res.status(400).json({ error: '密碼至少需要 8 個字元' });
  if (db.prepare(`SELECT 1 FROM users WHERE email=?`).get(email)) {
    return res.status(409).json({ error: '這個 Email 已經註冊過了' });
  }
  // 註冊後先不給 7 天試用、也不自動登入，要等點了信箱裡的驗證連結才開通，避免隨便註冊隨便用
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, email, name, hashPassword(password), now());
  await sendVerificationEmail(email, name, createEmailVerification(id));
  res.json({ pending: true, email });
});

app.get('/api/auth/verify', async (req, res) => {
  const token = String(req.query.token || '');
  const row = db.prepare(`SELECT * FROM email_verifications WHERE token=?`).get(token);
  if (!row || new Date(row.expires_at) < new Date()) {
    return res.redirect(`${APP_URL}/login?verify=invalid`);
  }
  const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(row.user_id);
  db.prepare(`DELETE FROM email_verifications WHERE token=?`).run(token);
  if (!user) return res.redirect(`${APP_URL}/login?verify=invalid`);
  if (!user.email_verified_at) {
    const trialEnds = new Date(Date.now() + TRIAL_DAYS * 86400_000).toISOString();
    db.prepare(
      `UPDATE users SET email_verified_at=?, plan='pro', plan_source='trial', plan_renews_at=?, plan_cancel_at_period_end=1 WHERE id=?`,
    ).run(now(), trialEnds, user.id);
  }
  createSession(res, user.id);
  res.redirect(`${APP_URL}/dashboard?verified=1`);
});

app.post('/api/auth/resend-verification', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare(`SELECT * FROM users WHERE email=?`).get(email);
  if (!user) return res.status(404).json({ error: '找不到這個帳號' });
  if (user.email_verified_at) return res.status(400).json({ error: '這個帳號已經驗證過了，請直接登入' });
  const last = db.prepare(`SELECT created_at FROM email_verifications WHERE user_id=? ORDER BY created_at DESC LIMIT 1`).get(user.id);
  if (last && Date.now() - new Date(last.created_at).getTime() < 60_000) {
    return res.status(429).json({ error: '驗證信剛寄出不久，請稍後再試' });
  }
  await sendVerificationEmail(user.email, user.name, createEmailVerification(user.id));
  res.json({ ok: true });
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare(`SELECT * FROM users WHERE email=?`).get(email);
  if (!user || !verifyPassword(String(req.body.password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Email 或密碼錯誤' });
  }
  if (!user.email_verified_at) {
    return res.status(403).json({ error: '請先完成信箱驗證才能登入', code: 'EMAIL_NOT_VERIFIED' });
  }
  createSession(res, user.id);
  res.json({ user: publicUser(refreshPlan(user)) });
});

// ---------- Google 登入／註冊：標準 OAuth2 授權碼流程，不經過第三方套件 ----------
app.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).send('尚未設定 Google 登入（GOOGLE_CLIENT_ID）');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('prompt', 'select_account');
  res.redirect(url.toString());
});

app.get('/api/auth/google/callback', async (req, res) => {
  const code = String(req.query.code || '');
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !code) return res.redirect(`${APP_URL}/login?google=error`);
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenBody = await tokenRes.json();
    if (!tokenRes.ok || !tokenBody.id_token) throw new Error(tokenBody.error_description || '換取權杖失敗');
    // id_token 是直接從 Google 的 token endpoint（HTTPS、server-to-server）換來的，不需要另外驗簽
    const payload = JSON.parse(Buffer.from(tokenBody.id_token.split('.')[1], 'base64url').toString('utf8'));
    if (!payload.email || !payload.email_verified) throw new Error('Google 帳號沒有已驗證的 Email');
    const email = String(payload.email).toLowerCase();

    let user = db.prepare(`SELECT * FROM users WHERE google_id=? OR email=?`).get(payload.sub, email);
    let isNew = false;
    if (!user) {
      isNew = true;
      const id = randomUUID();
      const trialEnds = new Date(Date.now() + TRIAL_DAYS * 86400_000).toISOString();
      db.prepare(
        `INSERT INTO users (id, email, name, password_hash, google_id, email_verified_at, plan, plan_source, plan_renews_at, plan_cancel_at_period_end, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pro', 'trial', ?, 1, ?)`,
      ).run(id, email, payload.name || email.split('@')[0], hashPassword(randomBytes(32).toString('hex')), payload.sub, now(), trialEnds, now());
      user = db.prepare(`SELECT * FROM users WHERE id=?`).get(id);
    } else if (!user.google_id || !user.email_verified_at) {
      // 既有帳號第一次用 Google 登入：補上 google_id，並視同已驗證（Google 已經確認過這個 Email）
      db.prepare(`UPDATE users SET google_id=?, email_verified_at=COALESCE(email_verified_at, ?) WHERE id=?`).run(payload.sub, now(), user.id);
      user = db.prepare(`SELECT * FROM users WHERE id=?`).get(user.id);
    }
    createSession(res, user.id);
    res.redirect(`${APP_URL}/dashboard${isNew ? '?verified=1' : ''}`);
  } catch (err) {
    console.error('Google 登入失敗', err);
    res.redirect(`${APP_URL}/login?google=error`);
  }
});

app.post('/api/auth/logout', (req, res) => {
  const { sid } = parseCookies(req.headers.cookie);
  if (sid) db.prepare(`DELETE FROM sessions WHERE token=?`).run(sid);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

app.patch('/api/auth/me', requireAuth, (req, res) => {
  const name = String(req.body.name ?? req.user.name).trim();
  if (!name) return res.status(400).json({ error: '請輸入名稱' });
  db.prepare(`UPDATE users SET name=? WHERE id=?`).run(name, req.user.id);
  if (req.body.newPassword) {
    if (!verifyPassword(String(req.body.currentPassword || ''), req.user.password_hash)) {
      return res.status(400).json({ error: '目前密碼不正確' });
    }
    if (String(req.body.newPassword).length < 8) return res.status(400).json({ error: '新密碼至少需要 8 個字元' });
    db.prepare(`UPDATE users SET password_hash=? WHERE id=?`).run(hashPassword(String(req.body.newPassword)), req.user.id);
  }
  res.json({ user: publicUser(db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user.id)) });
});

// ---------- 訂閱（綠界 ECPay 信用卡定期定額，真的會請款） ----------

// 跟綠界「信用卡定期定額訂單作業」API 溝通（補授權 ReAuth／終止 Cancel）
async function ecpayPeriodAction(tradeNo, action) {
  const fields = {
    MerchantID: ECPAY_MERCHANT_ID,
    MerchantTradeNo: tradeNo,
    Action: action,
    TimeStamp: Math.floor(Date.now() / 1000),
  };
  fields.CheckMacValue = ecpayCheckMacValue(fields);
  const resp = await fetch(`${ECPAY_HOST}/Cashier/CreditCardPeriodAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = Object.fromEntries(new URLSearchParams(text));
  }
  if (String(data.RtnCode) !== '1') throw new Error(data.RtnMsg || '綠界回應失敗：' + text);
  return data;
}

// 建立訂單：導向綠界的收銀台頁面付款。一般訂單會設定「信用卡定期定額」讓綠界之後每月自動扣款；
// 折扣優惠碼訂單只收一次折扣後的金額，不設定定期定額（折抵的錢跟每月自動扣款沒辦法同時用同一張綠界訂單做到）
app.post('/api/billing/ecpay/checkout', requireAuth, (req, res) => {
  if (req.user.plan === 'pro' && req.user.plan_source !== 'trial') return res.status(400).json({ error: '已經是專業版了' });

  let amount = PRO_PRICE_TWD;
  let promoCode = null;
  if (req.body.code) {
    const code = String(req.body.code).trim().toUpperCase();
    const promo = db.prepare(`SELECT * FROM promo_codes WHERE code=?`).get(code);
    if (!promo || promo.kind !== 'discount') return res.status(400).json({ error: '優惠碼不存在或已失效' });
    if (db.prepare(`SELECT 1 FROM promo_redemptions WHERE code=? AND user_id=?`).get(code, req.user.id)) {
      return res.status(400).json({ error: '這組優惠碼你已經用過了' });
    }
    amount = Math.max(1, PRO_PRICE_TWD - promo.discount_amount);
    promoCode = code;
  }

  const tradeNo = `T${Date.now().toString(36)}${randomBytes(3).toString('hex')}`.slice(0, 20);
  db.prepare(`INSERT INTO ecpay_orders (trade_no, user_id, amount, status, created_at, promo_code) VALUES (?, ?, ?, 'pending', ?, ?)`).run(
    tradeNo, req.user.id, amount, now(), promoCode,
  );
  const fields = {
    MerchantID: ECPAY_MERCHANT_ID,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: ecpayDate(),
    PaymentType: 'aio',
    TotalAmount: amount,
    TradeDesc: 'Pianke Jianqu Pro Subscription',
    ItemName: '片刻剪趣 專業版（每月）',
    ReturnURL: `${APP_URL}/api/billing/ecpay/notify`,
    ChoosePayment: 'Credit',
    ClientBackURL: `${APP_URL}/account`,
    OrderResultURL: `${APP_URL}/api/billing/ecpay/result`,
    NeedExtraPaidInfo: 'Y',
    EncryptType: 1,
    ...(promoCode
      ? {}
      : {
          PeriodAmount: amount,
          PeriodType: 'M',
          Frequency: ECPAY_PERIOD_MONTHS,
          ExecTimes: 99,
          PeriodReturnURL: `${APP_URL}/api/billing/ecpay/period-notify`,
        }),
  };
  fields.CheckMacValue = ecpayCheckMacValue(fields);
  res.json({ actionUrl: `${ECPAY_HOST}/Cashier/AioCheckOut/V5`, fields });
});

// 綠界付款完成後，伺服器對伺服器送來的通知（跟使用者的瀏覽器無關，不能用 requireAuth）
app.post('/api/billing/ecpay/notify', (req, res) => {
  const body = { ...req.body };
  const receivedMac = body.CheckMacValue;
  delete body.CheckMacValue;
  if (receivedMac !== ecpayCheckMacValue(body)) {
    console.error('[ecpay] notify 檢查碼不符', body);
    return res.status(400).send('0|CheckMacValue error');
  }
  const order = db.prepare(`SELECT * FROM ecpay_orders WHERE trade_no=?`).get(body.MerchantTradeNo);
  if (!order) {
    console.error('[ecpay] notify 找不到對應訂單', body.MerchantTradeNo);
    return res.send('1|OK');
  }
  if (order.status === 'pending') {
    if (body.RtnCode === '1') {
      if (order.promo_code) {
        // 折扣優惠碼訂單：一次性付款，只給 1 個月、不會自動續訂
        grantProMonths(db.prepare(`SELECT * FROM users WHERE id=?`).get(order.user_id), 1, 'paid');
        db.prepare(`INSERT INTO promo_redemptions (code, user_id, redeemed_at) VALUES (?, ?, ?)`).run(order.promo_code, order.user_id, now());
      } else {
        const renews = new Date();
        renews.setMonth(renews.getMonth() + ECPAY_PERIOD_MONTHS);
        db.prepare(`UPDATE users SET plan='pro', plan_source='paid', plan_renews_at=?, plan_cancel_at_period_end=0 WHERE id=?`).run(
          renews.toISOString(), order.user_id,
        );
      }
      db.prepare(`INSERT INTO payments (id, user_id, amount, card_last4, created_at) VALUES (?, ?, ?, ?, ?)`).run(
        randomUUID(), order.user_id, Number(body.TradeAmt) || order.amount, body.card4no || null, now(),
      );
      db.prepare(`UPDATE ecpay_orders SET status='paid' WHERE trade_no=?`).run(order.trade_no);
    } else {
      db.prepare(`UPDATE ecpay_orders SET status='failed' WHERE trade_no=?`).run(order.trade_no);
    }
  }
  res.send('1|OK');
});

// 定期定額每一期扣款的通知（第一期也會走這個通知，由 ReturnURL 另外處理首期）
app.post('/api/billing/ecpay/period-notify', (req, res) => {
  const body = { ...req.body };
  const receivedMac = body.CheckMacValue;
  delete body.CheckMacValue;
  if (receivedMac !== ecpayCheckMacValue(body)) {
    console.error('[ecpay] period-notify 檢查碼不符', body);
    return res.status(400).send('0|CheckMacValue error');
  }
  const order = db.prepare(`SELECT * FROM ecpay_orders WHERE trade_no=?`).get(body.MerchantTradeNo);
  if (order && body.RtnCode === '1' && body.SimulatePaid !== '1' && Number(body.TotalSuccessTimes) > 1) {
    const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(order.user_id);
    if (user) {
      const renews = new Date();
      renews.setMonth(renews.getMonth() + ECPAY_PERIOD_MONTHS);
      db.prepare(`UPDATE users SET plan='pro', plan_source='paid', plan_renews_at=? WHERE id=?`).run(renews.toISOString(), user.id);
      db.prepare(`INSERT INTO payments (id, user_id, amount, card_last4, created_at) VALUES (?, ?, ?, ?, ?)`).run(
        randomUUID(), user.id, Number(body.Amount) || order.amount, null, now(),
      );
    }
  }
  res.send('1|OK');
});

// 使用者付款完刷卡後，瀏覽器被導回這裡（綠界用 POST 導回，跟上面的伺服器通知是分開的兩條路徑）
app.post('/api/billing/ecpay/result', (_req, res) => {
  res.redirect('/account?upgraded=1');
});

app.post('/api/billing/cancel', requireAuth, async (req, res) => {
  // 折扣優惠碼的訂單是一次性付款，沒有在綠界設定定期定額，不用也不能呼叫終止 API
  const order = db
    .prepare(`SELECT * FROM ecpay_orders WHERE user_id=? AND status='paid' AND promo_code IS NULL ORDER BY created_at DESC LIMIT 1`)
    .get(req.user.id);
  if (order) {
    try {
      await ecpayPeriodAction(order.trade_no, 'Cancel');
    } catch (e) {
      console.error('[ecpay] 終止定期定額失敗', e);
      return res.status(502).json({ error: '向金流商終止訂閱失敗，請稍後再試' });
    }
  }
  db.prepare(`UPDATE users SET plan_cancel_at_period_end=1 WHERE id=?`).run(req.user.id);
  res.json({ user: publicUser(db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user.id)) });
});

app.get('/api/billing/payments', requireAuth, (req, res) => {
  res.json({
    payments: db
      .prepare(`SELECT id, amount, card_last4 AS cardLast4, created_at AS createdAt FROM payments WHERE user_id=? ORDER BY created_at DESC`)
      .all(req.user.id),
  });
});

// 查詢優惠碼：不會兌換，單純回傳這組碼是「免費月數」還是「折扣金額」，前端依類型決定接下來要怎麼做
app.post('/api/billing/promo/check', requireAuth, (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: '請輸入優惠碼' });
  const promo = db.prepare(`SELECT * FROM promo_codes WHERE code=?`).get(code);
  if (!promo) return res.status(400).json({ error: '優惠碼不存在或已失效' });
  if (db.prepare(`SELECT 1 FROM promo_redemptions WHERE code=? AND user_id=?`).get(code, req.user.id)) {
    return res.status(400).json({ error: '這組優惠碼你已經用過了' });
  }
  if (promo.kind === 'discount') return res.json({ kind: 'discount', discountAmount: promo.discount_amount });
  return res.json({ kind: 'months', months: promo.months });
});

// 兌換「免費月數」優惠碼：直接升級，不用走綠界；同一組碼每個人都能用，但每人限用一次
app.post('/api/billing/promo/redeem', requireAuth, (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: '請輸入優惠碼' });
  const promo = db.prepare(`SELECT * FROM promo_codes WHERE code=?`).get(code);
  if (!promo || promo.kind !== 'months') return res.status(400).json({ error: '優惠碼不存在或已失效' });
  if (db.prepare(`SELECT 1 FROM promo_redemptions WHERE code=? AND user_id=?`).get(code, req.user.id)) {
    return res.status(400).json({ error: '這組優惠碼你已經用過了' });
  }
  grantProMonths(req.user, promo.months, 'promo');
  db.prepare(`INSERT INTO promo_redemptions (code, user_id, redeemed_at) VALUES (?, ?, ?)`).run(code, req.user.id, now());
  res.json({ user: publicUser(db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user.id)), months: promo.months });
});

// ---------- 管理後台 ----------
// 「每一天」以台灣時間（UTC+8）計算
const TW_DAY = `date(created_at, '+8 hours')`;
const twToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

app.get('/api/admin/stats', requireAuth, requireAdmin, (req, res) => {
  const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
  const today = twToday();
  const since = new Date(Date.parse(today) - (days - 1) * 86400_000).toISOString().slice(0, 10);

  const members = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(plan='pro' AND COALESCE(plan_source,'') != 'trial') AS paid,
              SUM(plan='pro' AND plan_source='trial') AS trial,
              SUM(plan='pro' AND plan_source='admin') AS adminGranted,
              SUM(${TW_DAY} = ?) AS newToday
       FROM users WHERE role != 'admin'`,
    )
    .get(today);
  const revenue = db
    .prepare(`SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count, COALESCE(SUM(CASE WHEN ${TW_DAY} = ? THEN amount END),0) AS today FROM payments`)
    .get(today);
  const before = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE ${TW_DAY} < ?`).get(since).total;

  const pay = new Map(
    db.prepare(`SELECT ${TW_DAY} AS day, SUM(amount) AS amount, COUNT(*) AS count FROM payments WHERE ${TW_DAY} >= ? GROUP BY day`).all(since).map((r) => [r.day, r]),
  );
  const signups = new Map(
    db.prepare(`SELECT ${TW_DAY} AS day, COUNT(*) AS n FROM users WHERE role != 'admin' AND ${TW_DAY} >= ? GROUP BY day`).all(since).map((r) => [r.day, r.n]),
  );
  // 補齊沒有資料的日期，並算出到當天為止的累計總金額
  let cumulative = before;
  const daily = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(Date.parse(since) + i * 86400_000).toISOString().slice(0, 10);
    const amount = pay.get(day)?.amount ?? 0;
    cumulative += amount;
    daily.push({ date: day, amount, payments: pay.get(day)?.count ?? 0, signups: signups.get(day) ?? 0, cumulative });
  }

  res.json({
    members: {
      total: members.total ?? 0,
      paid: members.paid ?? 0,
      trial: members.trial ?? 0,
      free: (members.total ?? 0) - (members.paid ?? 0) - (members.trial ?? 0),
      adminGranted: members.adminGranted ?? 0,
      newToday: members.newToday ?? 0,
    },
    revenue: { total: revenue.total, today: revenue.today, payments: revenue.count, inRange: cumulative - before },
    daily,
  });
});

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const filters = {
    pro: `AND u.plan = 'pro' AND COALESCE(u.plan_source,'') != 'trial'`,
    trial: `AND u.plan = 'pro' AND u.plan_source = 'trial'`,
    free: `AND u.plan = 'free'`,
  };
  const planFilter = filters[req.query.plan] ?? '';
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.plan, u.plan_source AS planSource, u.plan_renews_at AS planRenewsAt,
              u.plan_cancel_at_period_end AS cancelAtPeriodEnd, u.created_at AS createdAt,
              (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects,
              (SELECT COALESCE(SUM(amount),0) FROM payments y WHERE y.user_id = u.id) AS totalPaid,
              (SELECT MAX(created_at) FROM payments y WHERE y.user_id = u.id) AS lastPaymentAt
       FROM users u
       WHERE (u.email LIKE ? OR u.name LIKE ?) ${planFilter}
       ORDER BY u.created_at DESC LIMIT 500`,
    )
    .all(q, q);
  res.json({ users: rows.map((r) => ({ ...r, cancelAtPeriodEnd: Boolean(r.cancelAtPeriodEnd) })) });
});

// 管理者直接開通或取消付費：開通不會產生付款紀錄，到期自動回到免費版
app.patch('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.params.id);
  if (!user) return res.status(404).json({ error: '找不到這個會員' });
  if (req.body.action === 'grant') {
    const months = Number(req.body.months);
    if (!Number.isInteger(months) || months < 0 || months > 12) return res.status(400).json({ error: '開通期間不正確' });
    if (months === 0) {
      db.prepare(`UPDATE users SET plan='pro', plan_source='admin', plan_renews_at=NULL, plan_cancel_at_period_end=0 WHERE id=?`).run(user.id);
    } else {
      grantProMonths(user, months, 'admin');
    }
  } else if (req.body.action === 'revoke') {
    db.prepare(`UPDATE users SET plan='free', plan_source=NULL, plan_renews_at=NULL, plan_cancel_at_period_end=0 WHERE id=?`).run(user.id);
  } else {
    return res.status(400).json({ error: '不支援的操作' });
  }
  res.json({ ok: true });
});

// 管理者產生優惠碼：免費升級 1~12 個月，不會產生付款紀錄；同一組碼每個人都能用，但每人限用一次
// kind='months'：免費升級 1~12 個月。kind='discount'：折抵綠界實際扣款金額（最多折 MAX_PROMO_DISCOUNT_TWD 元，且要小於原價）
app.post('/api/admin/promo-codes', requireAuth, requireAdmin, (req, res) => {
  const kind = req.body.kind === 'discount' ? 'discount' : 'months';
  const code = generatePromoCode();
  const createdAt = now();
  let months = 0;
  let discountAmount = null;
  if (kind === 'months') {
    months = Number(req.body.months);
    if (!Number.isInteger(months) || months < 1 || months > 12) return res.status(400).json({ error: '月數要是 1~12 之間的整數' });
  } else {
    discountAmount = Number(req.body.discountAmount);
    if (!Number.isInteger(discountAmount) || discountAmount < 1 || discountAmount > MAX_PROMO_DISCOUNT_TWD || discountAmount >= PRO_PRICE_TWD) {
      return res.status(400).json({ error: `折扣金額要是 1~${MAX_PROMO_DISCOUNT_TWD} 之間的整數` });
    }
  }
  db.prepare(`INSERT INTO promo_codes (code, kind, months, discount_amount, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    code, kind, months, discountAmount, req.user.id, createdAt,
  );
  res.json({ code: { code, kind, months, discountAmount, createdAt, redemptions: 0 } });
});

app.get('/api/admin/promo-codes', requireAuth, requireAdmin, (req, res) => {
  const codes = db
    .prepare(
      `SELECT p.code, p.kind, p.months, p.discount_amount AS discountAmount, p.created_at AS createdAt,
              (SELECT COUNT(*) FROM promo_redemptions r WHERE r.code = p.code) AS redemptions
       FROM promo_codes p ORDER BY p.created_at DESC`,
    )
    .all();
  res.json({ codes });
});

// 刪除會員：連同專案、上傳檔案、自訂聲音與登入狀態；付款紀錄保留以維持營收報表正確
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.params.id);
  if (!user) return res.status(404).json({ error: '找不到這個會員' });
  if (user.id === req.user.id) return res.status(400).json({ error: '不能刪除自己的帳號' });
  if (user.role === 'admin') return res.status(400).json({ error: '不能刪除管理者帳號' });
  db.exec('BEGIN');
  try {
    for (const t of ['sessions', 'projects', 'voices', 'project_creations', 'exports']) db.prepare(`DELETE FROM ${t} WHERE user_id=?`).run(user.id);
    db.prepare(`DELETE FROM users WHERE id=?`).run(user.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: '刪除失敗：' + err.message });
  }
  fs.rmSync(path.join(UPLOAD_DIR, user.id), { recursive: true, force: true });
  res.json({ ok: true });
});

// ---------- 專案 ----------
const projectRow = (r, withData = false) => ({
  id: r.id,
  name: r.name,
  thumbnail: r.thumbnail,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(withData ? { data: JSON.parse(r.data) } : { aspect: JSON.parse(r.data).aspect, duration: JSON.parse(r.data).duration ?? 0 }),
});

app.get('/api/projects', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT * FROM projects WHERE user_id=? ORDER BY updated_at DESC`).all(req.user.id);
  res.json({ projects: rows.map((r) => projectRow(r)) });
});

app.post('/api/projects', requireAuth, (req, res) => {
  const user = publicUser(req.user);
  if (user.usage.projectLimit !== null && user.usage.projectsThisMonth >= user.usage.projectLimit) {
    return res.status(402).json({ error: `免費版每月最多建立 ${FREE_MONTHLY_PROJECTS} 個專案`, code: 'UPGRADE_REQUIRED' });
  }
  const id = randomUUID();
  const aspect = ['9:16', '16:9', '1:1'].includes(req.body.aspect) ? req.body.aspect : '9:16';
  const data = { aspect, media: [], clips: [], audio: [], captions: [], stickers: [], overlays: [], markers: [], duration: 0 };
  const name = String(req.body.name || '').trim() || '未命名專案';
  db.prepare(`INSERT INTO projects (id, user_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id, req.user.id, name, JSON.stringify(data), now(), now(),
  );
  db.prepare(`INSERT INTO project_creations (user_id, created_at) VALUES (?, ?)`).run(req.user.id, now());
  res.json({ project: projectRow(db.prepare(`SELECT * FROM projects WHERE id=?`).get(id), true) });
});

function ownProject(req, res) {
  const row = db.prepare(`SELECT * FROM projects WHERE id=? AND user_id=?`).get(req.params.id, req.user.id);
  if (!row) res.status(404).json({ error: '找不到這個專案' });
  return row;
}

app.get('/api/projects/:id', requireAuth, (req, res) => {
  const row = ownProject(req, res);
  if (row) res.json({ project: projectRow(row, true) });
});

app.patch('/api/projects/:id', requireAuth, (req, res) => {
  const row = ownProject(req, res);
  if (!row) return;
  if (req.body.expectedUpdatedAt !== undefined && typeof req.body.expectedUpdatedAt !== 'string') {
    return res.status(400).json({ error: '專案版本無效' });
  }
  if (req.body.expectedUpdatedAt !== undefined && req.body.expectedUpdatedAt !== row.updated_at) {
    return res.status(409).json({ error: '專案已被其他分頁或裝置更新', code: 'PROJECT_CONFLICT' });
  }
  const name = req.body.name !== undefined ? String(req.body.name).trim() || row.name : row.name;
  const data = req.body.data !== undefined ? JSON.stringify(req.body.data) : row.data;
  const thumbnail = req.body.thumbnail !== undefined ? req.body.thumbnail : row.thumbnail;
  // Monotonic tokens also distinguish two writes received within the same millisecond.
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString();
  const result = db.prepare(`UPDATE projects SET name=?, data=?, thumbnail=?, updated_at=? WHERE id=? AND updated_at=?`).run(name, data, thumbnail, updatedAt, row.id, row.updated_at);
  if (!result.changes) return res.status(409).json({ error: '專案已被更新', code: 'PROJECT_CONFLICT' });
  if (req.body.data !== undefined) cleanUnusedFiles(req.user.id, row.id, req.body.data);
  res.json({ project: projectRow(db.prepare(`SELECT * FROM projects WHERE id=?`).get(row.id)) });
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
  const row = ownProject(req, res);
  if (!row) return;
  db.prepare(`DELETE FROM projects WHERE id=?`).run(row.id);
  db.prepare(`DELETE FROM exports WHERE project_id=?`).run(row.id);
  fs.rmSync(path.join(UPLOAD_DIR, req.user.id, row.id), { recursive: true, force: true });
  res.json({ ok: true });
});

// ---------- 素材 ----------
// 本機優先：使用者的影片、圖片、音樂只存在自己的電腦，伺服器不再接收素材上傳。
// 伺服器上只剩朗讀產生的音訊（前端拿到後會存到本機）與改版前上傳的舊素材；
// 專案存檔時，刪掉專案資料夾裡不再被使用的檔案。
const UNUSED_GRACE_MS = 10 * 60 * 1000;

function cleanUnusedFiles(userId, projectId, data) {
  const dir = path.join(UPLOAD_DIR, userId, projectId);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const prefix = `/uploads/${userId}/${projectId}/`;
  const used = new Set((data?.media ?? []).map((m) => (typeof m?.url === 'string' && m.url.startsWith(prefix) ? m.url.slice(prefix.length) : null)).filter(Boolean));
  const now = Date.now();
  for (const e of entries) {
    // 只看專案資料夾第一層的檔案（exports 等子資料夾另外管理）
    if (!e.isFile() || used.has(e.name)) continue;
    const file = path.join(dir, e.name);
    try {
      // 剛產生的檔案（例如朗讀結果還沒下載到本機）先不刪
      if (now - fs.statSync(file).mtimeMs > UNUSED_GRACE_MS) fs.rmSync(file, { force: true });
    } catch {
      /* 刪不掉下次存檔再試 */
    }
  }
}

// ---------- 匯出的成品（存到帳戶，每個專案只留最近幾支） ----------
const EXPORTS_PER_PROJECT = 3;
const MAX_EXPORT_BYTES = 2 * 1024 ** 3;

const exportRow = (r) => ({
  ...JSON.parse(r.meta),
  id: r.id,
  size: r.size,
  createdAt: r.created_at,
  url: `/uploads/${r.user_id}/${r.project_id}/exports/${r.file}`,
});

/** 只接受匯出視窗會送的欄位，避免任意內容寫進資料庫 */
function exportMeta(raw) {
  let m;
  try {
    m = JSON.parse(decodeURIComponent(String(raw || '')));
  } catch {
    return null;
  }
  const num = (v, min, max) => (Number.isFinite(v) && v >= min && v <= max ? v : null);
  const meta = {
    ext: ['mp4', 'webm'].includes(m?.ext) ? m.ext : null,
    width: num(m?.width, 16, 8192),
    height: num(m?.height, 16, 8192),
    quality: [720, 1080].includes(m?.quality) ? m.quality : null,
    fps: [24, 30, 60].includes(m?.fps) ? m.fps : null,
    bitrate: ['high', 'standard', 'small'].includes(m?.bitrate) ? m.bitrate : null,
    duration: num(m?.duration, 0, 24 * 3600),
    mode: ['offline', 'realtime'].includes(m?.mode) ? m.mode : null,
  };
  return Object.values(meta).every((v) => v !== null) ? meta : null;
}

app.get('/api/projects/:id/exports', requireAuth, (req, res) => {
  const row = ownProject(req, res);
  if (!row) return;
  const rows = db.prepare(`SELECT * FROM exports WHERE project_id=? AND user_id=? ORDER BY created_at DESC`).all(row.id, req.user.id);
  res.json({ exports: rows.map(exportRow) });
});

app.post('/api/projects/:id/exports', requireAuth, (req, res) => {
  const row = ownProject(req, res);
  if (!row) return;
  const meta = exportMeta(req.headers['x-export-meta']);
  if (!meta) return res.status(400).json({ error: '匯出資訊不完整' });
  if (Number(req.headers['content-length']) > MAX_EXPORT_BYTES) return res.status(413).json({ error: '影片太大，無法存到帳戶' });
  const id = randomUUID();
  const dir = path.join(UPLOAD_DIR, req.user.id, row.id, 'exports');
  fs.mkdirSync(dir, { recursive: true });
  const file = `${id}.${meta.ext}`;
  const temp = path.join(dir, `${id}.part`);
  const out = fs.createWriteStream(temp);
  let size = 0;
  let failed = false;
  const abort = (status, error) => {
    if (failed) return;
    failed = true;
    out.destroy();
    fs.rmSync(temp, { force: true });
    if (!res.headersSent) res.status(status).json({ error });
  };
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_EXPORT_BYTES) {
      abort(413, '影片太大，無法存到帳戶');
      req.destroy();
    }
  });
  req.on('aborted', () => abort(400, '上傳中斷'));
  req.pipe(out);
  out.on('error', () => abort(500, '儲存失敗'));
  out.on('finish', () => {
    if (failed) return;
    if (!size) return abort(400, '沒有收到影片');
    fs.renameSync(temp, path.join(dir, file));
    db.prepare(`INSERT INTO exports (id, user_id, project_id, file, meta, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      id, req.user.id, row.id, file, JSON.stringify(meta), size, now(),
    );
    // 超過數量就刪掉最舊的
    const old = db.prepare(`SELECT * FROM exports WHERE project_id=? AND user_id=? ORDER BY created_at DESC LIMIT -1 OFFSET ?`).all(row.id, req.user.id, EXPORTS_PER_PROJECT);
    for (const o of old) {
      db.prepare(`DELETE FROM exports WHERE id=?`).run(o.id);
      fs.rmSync(path.join(dir, o.file), { force: true });
    }
    res.json({ export: exportRow(db.prepare(`SELECT * FROM exports WHERE id=?`).get(id)) });
  });
});

app.delete('/api/projects/:id/exports/:exportId', requireAuth, (req, res) => {
  const row = ownProject(req, res);
  if (!row) return;
  const ex = db.prepare(`SELECT * FROM exports WHERE id=? AND project_id=? AND user_id=?`).get(req.params.exportId, row.id, req.user.id);
  if (!ex) return res.status(404).json({ error: '找不到這支影片' });
  db.prepare(`DELETE FROM exports WHERE id=?`).run(ex.id);
  fs.rmSync(path.join(UPLOAD_DIR, req.user.id, row.id, 'exports', ex.file), { force: true });
  res.json({ ok: true });
});

// 只讓本人讀取自己的檔案；express.static 會處理 Range，影片才能拖曳播放
app.use('/uploads/:userId', (req, res, next) => {
  if (req.user?.id !== req.params.userId) return res.status(403).end();
  next();
}, (req, res, next) => express.static(path.join(UPLOAD_DIR, req.params.userId))(req, res, next));

// ---------- 音樂庫（scripts/generate-music.mjs 產生的原創音樂，公開讀取） ----------
const MUSIC_DIR = path.join(ROOT, 'music');
app.use('/music', express.static(MUSIC_DIR, { maxAge: '7d' }));
app.get('/api/music', requireAuth, (_req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(path.join(MUSIC_DIR, 'library.json'), 'utf8')));
  } catch {
    res.json({ license: '', items: [] });
  }
});

// ---------- 文字朗讀 ----------
// 兩種引擎：macOS 內建語音（快、機械感）與 BreezyVoice 台灣腔 AI 人聲（自然、較慢，需要 tts/ 下的 Python 環境）
db.exec(`
  CREATE TABLE IF NOT EXISTS voices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    prompt_text TEXT NOT NULL,
    file TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

let voiceCache;
async function listSystemVoices() {
  if (voiceCache) return voiceCache;
  try {
    const { stdout } = await run('say', ['-v', '?']);
    voiceCache = stdout
      .split('\n')
      .map((line) => line.match(/^(.+?)\s{2,}(\w\w_\w\w)\s+#\s*(.*)$/))
      .filter((m) => m && /^zh_(TW|CN|HK)$/.test(m[2]))
      .map((m) => ({ id: m[1].trim(), locale: m[2], sample: m[3].trim(), engine: 'system' }))
      .filter((v, i, all) => all.findIndex((x) => x.id === v.id) === i);
  } catch {
    voiceCache = [];
  }
  return voiceCache;
}

const TTS_DIR = path.join(ROOT, '..', 'tts');
const BREEZY_PYTHON = path.join(TTS_DIR, '.venv', 'bin', 'python');
const BREEZY_PORT = 8790;
const breezyAvailable = () => fs.existsSync(BREEZY_PYTHON) && fs.existsSync(path.join(TTS_DIR, 'models', 'BreezyVoice', 'llm.pt'));

function builtinBreezyVoices() {
  try {
    return JSON.parse(fs.readFileSync(path.join(TTS_DIR, 'voices', 'voices.json'), 'utf8')).map((v) => ({
      ...v,
      audio: path.join(TTS_DIR, v.audio),
    }));
  } catch {
    return [];
  }
}

function breezyVoicesFor(userId) {
  const custom = db
    .prepare(`SELECT id, name, prompt_text AS text, file FROM voices WHERE user_id=? ORDER BY created_at`)
    .all(userId)
    .map((v) => ({ id: `custom-${v.id}`, name: v.name, desc: '我的聲音', text: v.text, audio: path.join(UPLOAD_DIR, userId, 'voices', v.file), custom: true }));
  return [...builtinBreezyVoices(), ...custom];
}

app.get('/api/tts/voices', requireAuth, async (req, res) => {
  const breezy = breezyAvailable()
    ? breezyVoicesFor(req.user.id).map((v) => ({ id: v.id, name: v.name, desc: v.desc, locale: 'zh_TW', engine: 'breezy', custom: !!v.custom }))
    : [];
  res.json({ voices: [...breezy, ...(await listSystemVoices())], breezy: breezyAvailable() });
});

// 建立自己的聲音：上傳 16kHz 單聲道 WAV（前端錄音後轉檔），附上朗讀的句子
app.post('/api/voices', requireAuth, requirePro, (req, res) => {
  if (!breezyAvailable()) return res.status(501).json({ error: '尚未安裝台灣腔 AI 語音' });
  const name = decodeURIComponent(String(req.headers['x-voice-name'] || '')).trim().slice(0, 20);
  const text = decodeURIComponent(String(req.headers['x-voice-text'] || '')).trim().slice(0, 200);
  if (!name || !text) return res.status(400).json({ error: '請輸入聲音名稱' });
  const count = db.prepare(`SELECT COUNT(*) AS n FROM voices WHERE user_id=?`).get(req.user.id).n;
  if (count >= 10) return res.status(400).json({ error: '最多可以建立 10 個聲音' });
  const id = randomUUID();
  const dir = path.join(UPLOAD_DIR, req.user.id, 'voices');
  fs.mkdirSync(dir, { recursive: true });
  const out = fs.createWriteStream(path.join(dir, `${id}.wav`));
  req.pipe(out);
  out.on('finish', () => {
    db.prepare(`INSERT INTO voices (id, user_id, name, prompt_text, file, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(id, req.user.id, name, text, `${id}.wav`, now());
    res.json({ voice: { id: `custom-${id}`, name, desc: '我的聲音', locale: 'zh_TW', engine: 'breezy', custom: true } });
  });
  out.on('error', () => res.status(500).json({ error: '上傳失敗' }));
});

app.delete('/api/voices/:id', requireAuth, (req, res) => {
  const id = req.params.id.replace(/^custom-/, '');
  const row = db.prepare(`SELECT * FROM voices WHERE id=? AND user_id=?`).get(id, req.user.id);
  if (!row) return res.status(404).json({ error: '找不到這個聲音' });
  db.prepare(`DELETE FROM voices WHERE id=?`).run(id);
  fs.rmSync(path.join(UPLOAD_DIR, req.user.id, 'voices', row.file), { force: true });
  res.json({ ok: true });
});

// ---- BreezyVoice 常駐服務：第一次用到才啟動，閒置 10 分鐘自動關閉以釋放記憶體 ----
let breezyProc = null;
let breezyReady = null;
let breezyIdle = null;

async function breezyHealth() {
  try {
    return await (await fetch(`http://127.0.0.1:${BREEZY_PORT}/health`)).json();
  } catch {
    return null;
  }
}

function ensureBreezy() {
  if (breezyReady) return breezyReady;
  breezyReady = (async () => {
    if (!(await breezyHealth())) {
      breezyProc = spawn(BREEZY_PYTHON, [path.join(TTS_DIR, 'service.py')], {
        env: { ...process.env, BREEZY_PORT: String(BREEZY_PORT), PYTHONUTF8: '1', PYTHONWARNINGS: 'ignore' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      breezyProc.stdout.on('data', (d) => process.stdout.write(`[breezy] ${d}`));
      breezyProc.stderr.on('data', () => {});
      breezyProc.on('exit', () => {
        breezyProc = null;
        breezyReady = null;
      });
    }
    for (let i = 0; i < 180; i++) {
      const h = await breezyHealth();
      if (h?.ready) return;
      if (h?.error) throw new Error('AI 語音模型載入失敗：' + h.error);
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('AI 語音模型啟動逾時');
  })().catch((e) => {
    breezyReady = null;
    throw e;
  });
  return breezyReady;
}

function touchBreezy() {
  clearTimeout(breezyIdle);
  breezyIdle = setTimeout(() => {
    if (!jobs.size || [...jobs.values()].every((j) => j.status !== 'running')) breezyProc?.kill();
  }, 10 * 60_000);
}

process.on('exit', () => breezyProc?.kill());

/** 讀出 WAV 的格式與 PCM 資料（say 的輸出可能夾帶其他 chunk，要逐段找） */
function readWav(buf) {
  let fmt = null;
  let data = null;
  for (let o = 12; o + 8 <= buf.length; ) {
    const id = buf.toString('ascii', o, o + 4);
    const size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(o + 10), sampleRate: buf.readUInt32LE(o + 12), bits: buf.readUInt16LE(o + 22) };
    if (id === 'data') data = buf.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('無法解析語音檔');
  return { ...fmt, data };
}

function writeWav(file, { channels, sampleRate, bits }, data) {
  const header = Buffer.alloc(44);
  const blockAlign = (channels * bits) / 8;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
}

/** 把逐句的 WAV 接成一個檔案，句子之間留一點停頓，回傳每句的起訖秒數 */
function joinSentences(files, texts, outFile, pause = 0) {
  const wavs = files.map((f) => readWav(fs.readFileSync(f)));
  const fmt = wavs[0];
  const bytesPerSec = (fmt.sampleRate * fmt.channels * fmt.bits) / 8;
  const align = (fmt.channels * fmt.bits) / 8;
  const gap = Buffer.alloc(Math.round((pause * bytesPerSec) / align) * align);
  let t = 0;
  const parts = [];
  const segments = wavs.map((w, i) => {
    const start = t;
    t += w.data.length / bytesPerSec;
    parts.push(w.data);
    if (i < wavs.length - 1 && gap.length) {
      parts.push(gap);
      t += gap.length / bytesPerSec;
    }
    return { text: texts[i], start, end: start + w.data.length / bytesPerSec };
  });
  writeWav(outFile, fmt, Buffer.concat(parts));
  return segments;
}

// ---- 朗讀工作：AI 人聲每句要數十秒，改成背景工作，前端輪詢進度 ----
const jobs = new Map();

async function runBreezyJob(job, voice, parts, dir, fileName, userId, projectId) {
  const tmp = parts.map(() => path.join(dir, `.tmp-${randomUUID()}.wav`));
  try {
    job.stage = 'loading';
    await ensureBreezy();
    job.stage = 'speaking';
    for (const [i, text] of parts.entries()) {
      touchBreezy();
      const r = await fetch(`http://127.0.0.1:${BREEZY_PORT}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments: [text], prompt_audio: voice.audio, prompt_text: voice.text, output: tmp[i] }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'AI 語音產生失敗');
      job.done = i + 1;
    }
    const segments = joinSentences(tmp, parts, path.join(dir, fileName), 0.18);
    job.result = { url: `/uploads/${userId}/${projectId}/${fileName}`, segments };
    job.status = 'done';
  } catch (err) {
    job.status = 'error';
    job.error = err.message;
  } finally {
    tmp.forEach((f) => fs.rmSync(f, { force: true }));
    touchBreezy();
    setTimeout(() => jobs.delete(job.id), 30 * 60_000);
  }
}

/**
 * 文字朗讀。傳入 segments（已切好的句子）時逐句合成再接成一個檔案，並回傳每句的起訖秒數。
 * 系統語音直接回傳結果；AI 人聲回傳 jobId，用 GET /api/tts/jobs/:id 查進度。
 */
app.post('/api/projects/:id/tts', requireAuth, requirePro, async (req, res) => {
  const row = ownProject(req, res);
  if (!row) return;
  const parts = (Array.isArray(req.body.segments) ? req.body.segments : [req.body.text])
    .map((t) => String(t ?? '').trim())
    .filter(Boolean)
    .slice(0, 200);
  if (!parts.length || parts.join('').length > 2000) return res.status(400).json({ error: '請輸入 1～2000 字的朗讀文字' });
  const dir = path.join(UPLOAD_DIR, req.user.id, row.id);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `tts-${randomUUID()}.wav`;

  const breezyVoice = breezyAvailable() ? breezyVoicesFor(req.user.id).find((v) => v.id === req.body.voice) : null;
  if (breezyVoice) {
    const job = { id: randomUUID(), userId: req.user.id, status: 'running', stage: 'queued', done: 0, total: parts.length };
    jobs.set(job.id, job);
    runBreezyJob(job, breezyVoice, parts, dir, fileName, req.user.id, row.id);
    return res.json({ jobId: job.id, total: parts.length });
  }

  const voices = await listSystemVoices();
  if (!voices.length) return res.status(501).json({ error: '這台電腦沒有可用的中文語音（需要 macOS）' });
  const voice = voices.find((v) => v.id === req.body.voice)?.id ?? voices[0].id;
  const rate = Math.min(360, Math.max(90, Number(req.body.rate) || 180));
  const tmp = parts.map(() => path.join(dir, `.tmp-${randomUUID()}.wav`));
  try {
    await Promise.all(
      parts.map((t, i) => run('say', ['-v', voice, '-r', String(rate), '-o', tmp[i], '--file-format=WAVE', '--data-format=LEI16@44100', t])),
    );
    const segments = joinSentences(tmp, parts, path.join(dir, fileName));
    res.json({ url: `/uploads/${req.user.id}/${row.id}/${fileName}`, voice, segments });
  } catch (err) {
    res.status(500).json({ error: '語音產生失敗：' + err.message });
  } finally {
    tmp.forEach((f) => fs.rmSync(f, { force: true }));
  }
});

app.get('/api/tts/jobs/:id', requireAuth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.userId !== req.user.id) return res.status(404).json({ error: '找不到這個工作' });
  const { userId, ...rest } = job;
  res.json(rest);
});

// ---------- 正式環境：提供建置好的網站（npm run build 之後） ----------
// 預先產生的頁面直接回傳；登入後才用的頁面回傳空外殼；其他網址回 404，避免軟 404 被搜尋引擎收錄
const DIST = path.join(ROOT, '..', 'dist');
const APP_ROUTES = [/^\/login\/?$/, /^\/register\/?$/, /^\/dashboard\/?$/, /^\/account\/?$/, /^\/checkout\/?$/, /^\/editor\/[^/]+\/?$/, /^\/admin(\/members)?\/?$/];
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
