// ---------- 會員：註冊、信箱驗證、Google 登入、忘記密碼、登入/登出 ----------
import { Router } from 'express';
import { randomUUID, randomBytes } from 'node:crypto';
import { db, now } from '../db.mjs';
import {
  hashPassword,
  verifyPassword,
  parseCookies,
  createSession,
  refreshPlan,
  publicUser,
  requireAuth,
  rateLimit,
} from '../helpers.mjs';
import { sendVerificationEmail, sendPasswordResetEmail, sendAccountExistsEmail, createEmailVerification, createPasswordReset } from '../mail.mjs';
import { APP_URL, COOKIE_SECURE, TRIAL_DAYS, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } from '../env.mjs';

const router = Router();

const loginLimiter = rateLimit(15 * 60_000, 10);
const registerLimiter = rateLimit(60 * 60_000, 5);
const forgotPasswordLimiter = rateLimit(60 * 60_000, 5);
const resendVerificationLimiter = rateLimit(60 * 60_000, 5);
const resetPasswordLimiter = rateLimit(15 * 60_000, 10);

router.post('/api/auth/register', registerLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Email 格式不正確' });
  if (!name) return res.status(400).json({ error: '請輸入名稱' });
  if (password.length < 8) return res.status(400).json({ error: '密碼至少需要 8 個字元' });

  // 不管這個 Email 是不是已經註冊過，API 回應都一樣，避免被用來試探哪些 Email 已經有帳號
  // （跟忘記密碼的設計一致）；真的已經有帳號的話，改成寄信通知本人，而不是透過回應內容洩漏
  const existing = db.prepare(`SELECT * FROM users WHERE email=?`).get(email);
  if (existing) {
    if (existing.email_verified_at) {
      await sendAccountExistsEmail(email, existing.name);
    } else {
      // 還沒驗證過的舊註冊：當作重新寄一次驗證信，對本人比較有幫助
      await sendVerificationEmail(email, existing.name, createEmailVerification(existing.id));
    }
    return res.json({ pending: true, email });
  }

  // 註冊後先不給 7 天試用、也不自動登入，要等點了信箱裡的驗證連結才開通，避免隨便註冊隨便用
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, email, name, hashPassword(password), now());
  await sendVerificationEmail(email, name, createEmailVerification(id));
  res.json({ pending: true, email });
});

router.get('/api/auth/verify', async (req, res) => {
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
  createSession(res, user.id, req);
  res.redirect(`${APP_URL}/dashboard?verified=1`);
});

router.post('/api/auth/resend-verification', resendVerificationLimiter, async (req, res) => {
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

// 忘記密碼：不管帳號存不存在都回一樣的訊息，避免被用來試探哪些 Email 有註冊
router.post('/api/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare(`SELECT * FROM users WHERE email=?`).get(email);
  if (user) {
    const last = db.prepare(`SELECT created_at FROM password_resets WHERE user_id=? ORDER BY created_at DESC LIMIT 1`).get(user.id);
    if (!last || Date.now() - new Date(last.created_at).getTime() >= 60_000) {
      await sendPasswordResetEmail(user.email, user.name, createPasswordReset(user.id));
    }
  }
  res.json({ ok: true });
});

router.post('/api/auth/reset-password', resetPasswordLimiter, (req, res) => {
  const token = String(req.body.token || '');
  const password = String(req.body.password || '');
  if (password.length < 8) return res.status(400).json({ error: '密碼至少需要 8 個字元' });
  const row = db.prepare(`SELECT * FROM password_resets WHERE token=?`).get(token);
  if (!row || new Date(row.expires_at) < new Date()) {
    return res.status(400).json({ error: '重設連結已失效或過期，請重新申請一次' });
  }
  db.prepare(`UPDATE users SET password_hash=? WHERE id=?`).run(hashPassword(password), row.user_id);
  db.prepare(`DELETE FROM password_resets WHERE token=?`).run(token);
  // 重設密碼後，把這個帳號其他裝置的登入都登出，比較安全
  db.prepare(`DELETE FROM sessions WHERE user_id=?`).run(row.user_id);
  const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(row.user_id);
  createSession(res, user.id, req);
  res.json({ user: publicUser(refreshPlan(user)) });
});

router.post('/api/auth/login', loginLimiter, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare(`SELECT * FROM users WHERE email=?`).get(email);
  if (!user || !verifyPassword(String(req.body.password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Email 或密碼錯誤' });
  }
  if (!user.email_verified_at) {
    return res.status(403).json({ error: '請先完成信箱驗證才能登入', code: 'EMAIL_NOT_VERIFIED' });
  }
  createSession(res, user.id, req);
  res.json({ user: publicUser(refreshPlan(user)) });
});

// ---------- Google 登入／註冊：標準 OAuth2 授權碼流程，不經過第三方套件 ----------
router.get('/api/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).send('尚未設定 Google 登入（GOOGLE_CLIENT_ID）');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('prompt', 'select_account');
  res.redirect(url.toString());
});

router.get('/api/auth/google/callback', async (req, res) => {
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
    createSession(res, user.id, req);
    res.redirect(`${APP_URL}/dashboard${isNew ? '?verified=1' : ''}`);
  } catch (err) {
    console.error('Google 登入失敗', err);
    res.redirect(`${APP_URL}/login?google=error`);
  }
});

router.post('/api/auth/logout', (req, res) => {
  const { sid } = parseCookies(req.headers.cookie);
  if (sid) db.prepare(`DELETE FROM sessions WHERE token=?`).run(sid);
  res.setHeader('Set-Cookie', `sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${COOKIE_SECURE}`);
  res.json({ ok: true });
});

router.get('/api/auth/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

router.patch('/api/auth/me', requireAuth, (req, res) => {
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

// ---------- 登入裝置：使用者自己能看到有效的登入紀錄，並登出其他裝置 ----------
router.get('/api/auth/sessions', requireAuth, (req, res) => {
  const { sid } = parseCookies(req.headers.cookie);
  const rows = db
    .prepare(
      `SELECT id, token, user_agent AS userAgent, ip, created_at AS createdAt
       FROM sessions WHERE user_id=? AND expires_at > ? ORDER BY created_at DESC`,
    )
    .all(req.user.id, now());
  res.json({
    sessions: rows.map((r) => ({ id: r.id, userAgent: r.userAgent, ip: r.ip, createdAt: r.createdAt, current: r.token === sid })),
  });
});

router.delete('/api/auth/sessions/:id', requireAuth, (req, res) => {
  const row = db.prepare(`SELECT token FROM sessions WHERE id=? AND user_id=?`).get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: '找不到這個登入紀錄' });
  db.prepare(`DELETE FROM sessions WHERE id=?`).run(req.params.id);
  // 如果登出的剛好是自己目前這個裝置，順便把 cookie 清掉
  const { sid } = parseCookies(req.headers.cookie);
  if (row.token === sid) res.setHeader('Set-Cookie', `sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${COOKIE_SECURE}`);
  res.json({ ok: true });
});

export default router;
