// ---------- 管理後台 ----------
import { Router } from 'express';
import { db, now } from '../db.mjs';
import { requireAuth, requireAdmin, grantProMonths, generatePromoCode, hashPassword, logAdminAction, deleteUserCompletely } from '../helpers.mjs';
import { UPLOAD_DIR, MAX_PROMO_DISCOUNT_TWD, PRO_PRICE_TWD } from '../env.mjs';

const router = Router();

// 「每一天」以台灣時間（UTC+8）計算
const TW_DAY = `date(created_at, '+8 hours')`;
const twToday = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

router.get('/api/admin/stats', requireAuth, requireAdmin, (req, res) => {
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

// 會員、優惠碼列表共用的可選每頁筆數
const ADMIN_PAGE_SIZES = [10, 20, 30, 50, 100];
router.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  const filters = {
    pro: `AND u.plan = 'pro' AND COALESCE(u.plan_source,'') != 'trial'`,
    trial: `AND u.plan = 'pro' AND u.plan_source = 'trial'`,
    free: `AND u.plan = 'free'`,
  };
  const planFilter = filters[req.query.plan] ?? '';
  const pageSize = ADMIN_PAGE_SIZES.includes(Number(req.query.pageSize)) ? Number(req.query.pageSize) : 20;
  const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
  const where = `WHERE (u.email LIKE ? OR u.name LIKE ?) ${planFilter}`;
  const total = db.prepare(`SELECT COUNT(*) AS n FROM users u ${where}`).get(q, q).n;
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.plan, u.plan_source AS planSource, u.plan_renews_at AS planRenewsAt,
              u.plan_cancel_at_period_end AS cancelAtPeriodEnd, u.created_at AS createdAt,
              (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects,
              (SELECT COALESCE(SUM(amount),0) FROM payments y WHERE y.user_id = u.id) AS totalPaid,
              (SELECT MAX(created_at) FROM payments y WHERE y.user_id = u.id) AS lastPaymentAt
       FROM users u
       ${where}
       ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(q, q, pageSize, (page - 1) * pageSize);
  res.json({ users: rows.map((r) => ({ ...r, cancelAtPeriodEnd: Boolean(r.cancelAtPeriodEnd) })), total, page, pageSize });
});

// 管理者直接開通或取消付費：開通不會產生付款紀錄，到期自動回到免費版
router.patch('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.params.id);
  if (!user) return res.status(404).json({ error: '找不到這個會員' });
  // 跟刪除會員一樣擋掉其他管理者帳號：不然管理者（或被盜用的 session）能改掉另一個
  // 管理者的密碼、順便登出對方所有裝置，等於鎖死對方帳號
  if (user.role === 'admin' && user.id !== req.user.id) return res.status(400).json({ error: '不能對其他管理者帳號執行這個操作' });
  if (req.body.action === 'grant') {
    const months = Number(req.body.months);
    if (!Number.isInteger(months) || months < 0 || months > 12) return res.status(400).json({ error: '開通期間不正確' });
    if (months === 0) {
      db.prepare(`UPDATE users SET plan='pro', plan_source='admin', plan_renews_at=NULL, plan_cancel_at_period_end=0 WHERE id=?`).run(user.id);
    } else {
      grantProMonths(user, months, 'admin');
    }
    logAdminAction(req.user, 'grant', user, { months });
  } else if (req.body.action === 'revoke') {
    db.prepare(`UPDATE users SET plan='free', plan_source=NULL, plan_renews_at=NULL, plan_cancel_at_period_end=0 WHERE id=?`).run(user.id);
    logAdminAction(req.user, 'revoke', user);
  } else if (req.body.action === 'reset-password') {
    const password = String(req.body.password || '');
    if (password.length < 8) return res.status(400).json({ error: '密碼至少需要 8 個字元' });
    db.prepare(`UPDATE users SET password_hash=? WHERE id=?`).run(hashPassword(password), user.id);
    // 管理者改密碼後，把這個帳號目前的登入都登出，確保新密碼立刻生效
    db.prepare(`DELETE FROM sessions WHERE user_id=?`).run(user.id);
    logAdminAction(req.user, 'reset-password', user);
  } else {
    return res.status(400).json({ error: '不支援的操作' });
  }
  res.json({ ok: true });
});

// 管理者產生優惠碼：免費升級 1~12 個月，不會產生付款紀錄；同一組碼每個人都能用，但每人限用一次
// kind='months'：免費升級 1~12 個月。kind='discount'：折抵綠界實際扣款金額（最多折 MAX_PROMO_DISCOUNT_TWD 元，且要小於原價）
router.post('/api/admin/promo-codes', requireAuth, requireAdmin, (req, res) => {
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
  logAdminAction(req.user, 'create-promo-code', null, { code, kind, months, discountAmount });
  res.json({ code: { code, kind, months, discountAmount, createdAt, redemptions: 0 } });
});

router.get('/api/admin/promo-codes', requireAuth, requireAdmin, (req, res) => {
  const pageSize = ADMIN_PAGE_SIZES.includes(Number(req.query.pageSize)) ? Number(req.query.pageSize) : 20;
  const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM promo_codes`).get().n;
  const codes = db
    .prepare(
      `SELECT p.code, p.kind, p.months, p.discount_amount AS discountAmount, p.created_at AS createdAt,
              (SELECT COUNT(*) FROM promo_redemptions r WHERE r.code = p.code) AS redemptions
       FROM promo_codes p ORDER BY p.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(pageSize, (page - 1) * pageSize);
  res.json({ codes, total, page, pageSize });
});

// 刪除會員：連同專案、上傳檔案、自訂聲音與登入狀態；付款紀錄保留以維持營收報表正確
router.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.params.id);
  if (!user) return res.status(404).json({ error: '找不到這個會員' });
  if (user.id === req.user.id) return res.status(400).json({ error: '不能刪除自己的帳號' });
  if (user.role === 'admin') return res.status(400).json({ error: '不能刪除管理者帳號' });
  try {
    deleteUserCompletely(user, { uploadDir: UPLOAD_DIR });
  } catch (err) {
    return res.status(500).json({ error: '刪除失敗：' + err.message });
  }
  logAdminAction(req.user, 'delete-user', user);
  res.json({ ok: true });
});

router.get('/api/admin/audit-log', requireAuth, requireAdmin, (req, res) => {
  const pageSize = ADMIN_PAGE_SIZES.includes(Number(req.query.pageSize)) ? Number(req.query.pageSize) : 20;
  const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM admin_audit_log`).get().n;
  const rows = db
    .prepare(
      `SELECT id, admin_email AS adminEmail, action, target_user_id AS targetUserId, target_email AS targetEmail, detail, created_at AS createdAt
       FROM admin_audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(pageSize, (page - 1) * pageSize);
  res.json({
    entries: rows.map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })),
    total,
    page,
    pageSize,
  });
});

export default router;
