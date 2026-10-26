// 片刻剪趣 本機後端：會員、訂閱（模擬付款）、專案、媒體上傳、文字朗讀（macOS say）
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
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
const SESSION_DAYS = 30;
const TRIAL_DAYS = 7;

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
`);

const now = () => new Date().toISOString();

// 舊資料庫補欄位：role（user／admin）、plan_source（paid 自己付費／admin 管理者開通）
const userColumns = db.prepare(`PRAGMA table_info(users)`).all().map((c) => c.name);
if (!userColumns.includes('role')) db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`);
if (!userColumns.includes('plan_source')) db.exec(`ALTER TABLE users ADD COLUMN plan_source TEXT`);

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
function refreshPlan(user) {
  if (user.plan === 'pro' && user.plan_renews_at && new Date(user.plan_renews_at) < new Date()) {
    if (user.plan_cancel_at_period_end) {
      db.prepare(`UPDATE users SET plan='free', plan_renews_at=NULL, plan_cancel_at_period_end=0 WHERE id=?`).run(user.id);
      return { ...user, plan: 'free', plan_renews_at: null, plan_cancel_at_period_end: 0 };
    }
    const next = new Date(user.plan_renews_at);
    next.setMonth(next.getMonth() + 1);
    db.prepare(`UPDATE users SET plan_renews_at=? WHERE id=?`).run(next.toISOString(), user.id);
    db.prepare(`INSERT INTO payments (id, user_id, amount, card_last4, created_at) VALUES (?, ?, ?, ?, ?)`).run(
      randomUUID(), user.id, PRO_PRICE_TWD, 'auto', user.plan_renews_at,
    );
    return { ...user, plan_renews_at: next.toISOString() };
  }
  return user;
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

const app = express();
app.use(express.json({ limit: '10mb' }));

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
app.post('/api/auth/register', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Email 格式不正確' });
  if (!name) return res.status(400).json({ error: '請輸入名稱' });
  if (password.length < 8) return res.status(400).json({ error: '密碼至少需要 8 個字元' });
  if (db.prepare(`SELECT 1 FROM users WHERE email=?`).get(email)) {
    return res.status(409).json({ error: '這個 Email 已經註冊過了' });
  }
  const id = randomUUID();
  const trialEnds = new Date(Date.now() + TRIAL_DAYS * 86400_000).toISOString();
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, plan, plan_source, plan_renews_at, plan_cancel_at_period_end, created_at)
     VALUES (?, ?, ?, ?, 'pro', 'trial', ?, 1, ?)`,
  ).run(id, email, name, hashPassword(password), trialEnds, now());
  createSession(res, id);
  res.json({ user: publicUser(db.prepare(`SELECT * FROM users WHERE id=?`).get(id)) });
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare(`SELECT * FROM users WHERE email=?`).get(email);
  if (!user || !verifyPassword(String(req.body.password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Email 或密碼錯誤' });
  }
  createSession(res, user.id);
  res.json({ user: publicUser(refreshPlan(user)) });
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

// ---------- 訂閱（模擬付款，之後可換成 Stripe Checkout） ----------
app.post('/api/billing/checkout', requireAuth, (req, res) => {
  const card = String(req.body.cardNumber || '').replace(/\s/g, '');
  if (!/^\d{13,19}$/.test(card)) return res.status(400).json({ error: '卡號格式不正確' });
  if (req.user.plan === 'pro' && req.user.plan_source !== 'trial') return res.status(400).json({ error: '已經是專業版了' });
  const inTrial = req.user.plan_source === 'trial' && req.user.plan_renews_at && new Date(req.user.plan_renews_at) > new Date();
  const renews = inTrial ? new Date(req.user.plan_renews_at) : new Date();
  renews.setMonth(renews.getMonth() + 1);
  db.prepare(`UPDATE users SET plan='pro', plan_source='paid', plan_renews_at=?, plan_cancel_at_period_end=0 WHERE id=?`).run(
    renews.toISOString(), req.user.id,
  );
  db.prepare(`INSERT INTO payments (id, user_id, amount, card_last4, created_at) VALUES (?, ?, ?, ?, ?)`).run(
    randomUUID(), req.user.id, PRO_PRICE_TWD, card.slice(-4), now(),
  );
  res.json({ user: publicUser(db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user.id)) });
});

app.post('/api/billing/cancel', requireAuth, (req, res) => {
  db.prepare(`UPDATE users SET plan_cancel_at_period_end=1 WHERE id=?`).run(req.user.id);
  res.json({ user: publicUser(db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user.id)) });
});

app.post('/api/billing/resume', requireAuth, (req, res) => {
  db.prepare(`UPDATE users SET plan_cancel_at_period_end=0 WHERE id=?`).run(req.user.id);
  res.json({ user: publicUser(db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user.id)) });
});

app.get('/api/billing/payments', requireAuth, (req, res) => {
  res.json({
    payments: db
      .prepare(`SELECT id, amount, card_last4 AS cardLast4, created_at AS createdAt FROM payments WHERE user_id=? ORDER BY created_at DESC`)
      .all(req.user.id),
  });
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
    if (![0, 1, 3, 6, 12].includes(months)) return res.status(400).json({ error: '開通期間不正確' });
    let renews = null;
    if (months) {
      const base = user.plan === 'pro' && user.plan_renews_at && new Date(user.plan_renews_at) > new Date() ? new Date(user.plan_renews_at) : new Date();
      base.setMonth(base.getMonth() + months);
      renews = base.toISOString();
    }
    db.prepare(`UPDATE users SET plan='pro', plan_source='admin', plan_renews_at=?, plan_cancel_at_period_end=? WHERE id=?`).run(renews, months ? 1 : 0, user.id);
  } else if (req.body.action === 'revoke') {
    db.prepare(`UPDATE users SET plan='free', plan_source=NULL, plan_renews_at=NULL, plan_cancel_at_period_end=0 WHERE id=?`).run(user.id);
  } else {
    return res.status(400).json({ error: '不支援的操作' });
  }
  res.json({ ok: true });
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
  const data = { aspect, media: [], clips: [], audio: [], captions: [], stickers: [], overlays: [], duration: 0 };
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

// ---------- 媒體上傳（串流寫入，不佔記憶體） ----------
app.post('/api/projects/:id/media', requireAuth, (req, res) => {
  const row = ownProject(req, res);
  if (!row) return;
  const original = decodeURIComponent(String(req.headers['x-filename'] || 'file'));
  const ext = path.extname(original).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
  const dir = path.join(UPLOAD_DIR, req.user.id, row.id);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${randomUUID()}${ext}`;
  const out = fs.createWriteStream(path.join(dir, fileName));
  req.pipe(out);
  out.on('finish', () => res.json({ url: `/uploads/${req.user.id}/${row.id}/${fileName}` }));
  out.on('error', () => res.status(500).json({ error: '上傳失敗' }));
});

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
