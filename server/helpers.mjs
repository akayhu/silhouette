// 跨路由共用的工具函式與中介層：密碼、session、會員方案、限流
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { db, now } from './db.mjs';
import { FREE_MONTHLY_PROJECTS, SESSION_DAYS, COOKIE_SECURE } from './env.mjs';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = scryptSync(password, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

export function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').filter(Boolean).map((part) => {
      const i = part.indexOf('=');
      return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
    }),
  );
}

export function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${COOKIE_SECURE}`,
  );
}

// req 可以省略（目前沒有用到的地方），但有傳入的話會記下裝置資訊，讓使用者在帳戶設定能看到「登入裝置」
export function createSession(res, userId, req) {
  const token = randomBytes(32).toString('hex');
  const id = randomUUID();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  const userAgent = req ? String(req.headers['user-agent'] || '').slice(0, 300) : null;
  const ip = req?.ip || null;
  db.prepare(`INSERT INTO sessions (token, id, user_id, expires_at, created_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    token, id, userId, expires, now(), userAgent, ip,
  );
  setSessionCookie(res, token);
}

export function startOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

// 到期未續訂的專業版自動降回免費版
// 到期就降回免費版：真正的續訂由綠界定期定額的 PeriodReturnURL 通知觸發，
// 會在到期前延長 plan_renews_at；這裡只負責「沒有收到續訂通知」時的降級。
export function refreshPlan(user) {
  if (user.plan === 'pro' && user.plan_renews_at && new Date(user.plan_renews_at) < new Date()) {
    db.prepare(`UPDATE users SET plan='free', plan_renews_at=NULL, plan_cancel_at_period_end=0 WHERE id=?`).run(user.id);
    return { ...user, plan: 'free', plan_renews_at: null, plan_cancel_at_period_end: 0 };
  }
  return user;
}

// 免費把使用者升級成專業版 N 個月（管理者開通、優惠碼兌換共用）：
// 原本還在有效期內就從原到期日續算，否則從現在起算；不會產生付款紀錄
export function grantProMonths(user, months, source) {
  const base = user.plan === 'pro' && user.plan_renews_at && new Date(user.plan_renews_at) > new Date() ? new Date(user.plan_renews_at) : new Date();
  base.setMonth(base.getMonth() + months);
  const renews = base.toISOString();
  db.prepare(`UPDATE users SET plan='pro', plan_source=?, plan_renews_at=?, plan_cancel_at_period_end=1 WHERE id=?`).run(source, renews, user.id);
  return renews;
}

// 優惠碼不用容易看錯的字元（0/O、1/I/L）
const PROMO_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generatePromoCode() {
  const pick = () => PROMO_ALPHABET[randomBytes(1)[0] % PROMO_ALPHABET.length];
  const group = () => Array.from({ length: 4 }, pick).join('');
  for (let i = 0; i < 20; i++) {
    const code = `${group()}-${group()}`;
    if (!db.prepare(`SELECT 1 FROM promo_codes WHERE code=?`).get(code)) return code;
  }
  throw new Error('無法產生唯一的優惠碼，請再試一次');
}

export function publicUser(user) {
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

// 管理後台的操作稽核紀錄：誰（admin）在什麼時候對誰（targetUser，可以沒有，例如產生優惠碼）做了什麼。
// detail 是跟這個動作相關、非機密的補充資訊（例如開通的月數、優惠碼內容），絕對不要放密碼
export function logAdminAction(admin, action, targetUser, detail) {
  db.prepare(
    `INSERT INTO admin_audit_log (id, admin_id, admin_email, action, target_user_id, target_email, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), admin.id, admin.email, action, targetUser?.id ?? null, targetUser?.email ?? null, detail ? JSON.stringify(detail) : null, now());
}

// 從 cookie 讀 session，把使用者掛到 req.user 上；要掛在所有路由之前
export function attachUser(req, _res, next) {
  const { sid } = parseCookies(req.headers.cookie);
  if (sid) {
    const row = db
      .prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token=? AND s.expires_at > ?`)
      .get(sid, now());
    if (row) req.user = refreshPlan(row);
  }
  next();
}

export const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: '請先登入' }));
export const requireAdmin = (req, res, next) =>
  req.user?.role === 'admin' ? next() : res.status(req.user ? 403 : 401).json({ error: '需要管理者權限' });
export const requirePro = (req, res, next) =>
  req.user?.plan === 'pro' ? next() : res.status(402).json({ error: '此功能僅限專業版', code: 'UPGRADE_REQUIRED' });

// ---------- 簡單的記憶體限流器：避免登入、註冊、忘記密碼這類端點被暴力嘗試或濫用 ----------
// 同一個 IP 在時間窗內呼叫同一個路由超過上限就擋掉；只用在單一伺服器部署，多台主機水平擴展時
// 各台主機各自計算，不會共用額度（這個規模的流量還不需要接 Redis 之類的共用儲存）
const rateLimiterMaps = [];
export function rateLimit(windowMs, max) {
  const hits = new Map();
  rateLimiterMaps.push(hits);
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const t = Date.now();
    let hit = hits.get(key);
    if (!hit || hit.resetAt < t) {
      hit = { count: 0, resetAt: t + windowMs };
      hits.set(key, hit);
    }
    hit.count++;
    if (hit.count > max) return res.status(429).json({ error: '請求太頻繁，請稍後再試' });
    next();
  };
}
// 定期清掉過期紀錄，避免 Map 無限長大
setInterval(() => {
  const t = Date.now();
  for (const hits of rateLimiterMaps) for (const [key, hit] of hits) if (hit.resetAt < t) hits.delete(key);
}, 10 * 60_000).unref();
