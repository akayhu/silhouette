// 資料庫：schema、舊資料庫補欄位的 migration，以及 db 實例本身
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DATA_DIR } from './env.mjs';

export const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
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
  CREATE TABLE IF NOT EXISTS password_resets (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS voices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    prompt_text TEXT NOT NULL,
    file TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

export const now = () => new Date().toISOString();

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

// 舊資料庫補欄位：session 加上裝置資訊，讓使用者自己能看到並登出「登入裝置」
// id 是給前端識別、登出用的非機密代號（不是拿來驗證身分的 token，不怕外洩）
const sessionColumns = db.prepare(`PRAGMA table_info(sessions)`).all().map((c) => c.name);
if (!sessionColumns.includes('id')) {
  db.exec(`ALTER TABLE sessions ADD COLUMN id TEXT`);
  db.exec(`ALTER TABLE sessions ADD COLUMN user_agent TEXT`);
  db.exec(`ALTER TABLE sessions ADD COLUMN ip TEXT`);
  db.exec(`ALTER TABLE sessions ADD COLUMN created_at TEXT`);
  for (const row of db.prepare(`SELECT token FROM sessions WHERE id IS NULL`).all()) {
    db.prepare(`UPDATE sessions SET id=? WHERE token=?`).run(randomUUID(), row.token);
  }
}

// 索引：配合各路由實際會用到的查詢條件（WHERE／ORDER BY），現在資料量小看不出差異，
// 但使用者和訂單變多之後能避免全表掃描；CREATE INDEX IF NOT EXISTS 對新舊資料庫都安全，不需要 migration
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_id ON sessions(id);
  CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_project_creations_user_created ON project_creations(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_exports_project_user_created ON exports(project_id, user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
  CREATE INDEX IF NOT EXISTS idx_payments_tw_day ON payments(date(created_at, '+8 hours'));
  CREATE INDEX IF NOT EXISTS idx_ecpay_orders_user_created ON ecpay_orders(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_email_verifications_user_created ON email_verifications(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_email_verifications_expires_at ON email_verifications(expires_at);
  CREATE INDEX IF NOT EXISTS idx_password_resets_user_created ON password_resets(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_password_resets_expires_at ON password_resets(expires_at);
  CREATE INDEX IF NOT EXISTS idx_voices_user_created ON voices(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_tw_day ON users(date(created_at, '+8 hours'));
`);

// 定期清掉過期資料：session 過期後、信箱驗證信與密碼重設信超過有效期限的 token，
// 不會再被用到（查詢時本來就會被 expires_at 擋掉），留著只是讓資料庫越長越大
function cleanupExpired() {
  const nowIso = now();
  db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(nowIso);
  db.prepare(`DELETE FROM email_verifications WHERE expires_at < ?`).run(nowIso);
  db.prepare(`DELETE FROM password_resets WHERE expires_at < ?`).run(nowIso);
}
cleanupExpired();
setInterval(cleanupExpired, 60 * 60_000).unref();
