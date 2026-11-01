// Resend 交易型信件：註冊驗證信、密碼重設信
import { randomBytes } from 'node:crypto';
import { db, now } from './db.mjs';
import { RESEND_API_KEY, RESEND_FROM, APP_URL, EMAIL_VERIFICATION_HOURS, PASSWORD_RESET_HOURS } from './env.mjs';

// 用 Resend 寄出交易型通知信；沒設定 RESEND_API_KEY 時改印連結在 log，方便本機開發測試整個流程
async function sendTransactionalEmail(email, subject, html, devLogPrefix, link) {
  if (!RESEND_API_KEY) {
    console.log(`[${devLogPrefix}：尚未設定 RESEND_API_KEY，僅印出連結] ${email} -> ${link}`);
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: RESEND_FROM, to: email, subject, html }),
    });
    if (!res.ok) console.error(`寄送${devLogPrefix}失敗`, res.status, await res.text());
  } catch (err) {
    console.error(`寄送${devLogPrefix}失敗`, err);
  }
}

export async function sendVerificationEmail(email, name, token) {
  const link = `${APP_URL}/api/auth/verify?token=${token}`;
  await sendTransactionalEmail(
    email,
    '請完成「片刻剪趣」帳號驗證',
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>嗨 ${name}，歡迎加入片刻剪趣</h2>
        <p>請點擊下方按鈕完成信箱驗證，開通你的帳號（含 7 天免費專業版試用）。</p>
        <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;border-radius:999px;text-decoration:none;font-weight:bold">驗證我的帳號</a></p>
        <p style="color:#888;font-size:13px">這組連結 ${EMAIL_VERIFICATION_HOURS} 小時內有效。如果不是你本人註冊，請忽略這封信。</p>
      </div>`,
    '驗證信',
    link,
  );
}

export async function sendPasswordResetEmail(email, name, token) {
  const link = `${APP_URL}/reset-password?token=${token}`;
  await sendTransactionalEmail(
    email,
    '重設「片刻剪趣」密碼',
    `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>嗨 ${name}，收到重設密碼的請求</h2>
        <p>請點擊下方按鈕設定新密碼。如果不是你本人操作，請忽略這封信，你的密碼不會被更改。</p>
        <p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#111;color:#fff;border-radius:999px;text-decoration:none;font-weight:bold">重設密碼</a></p>
        <p style="color:#888;font-size:13px">這組連結 ${PASSWORD_RESET_HOURS} 小時內有效。</p>
      </div>`,
    '密碼重設信',
    link,
  );
}

export function createEmailVerification(userId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + EMAIL_VERIFICATION_HOURS * 3600_000).toISOString();
  db.prepare(`INSERT INTO email_verifications (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`).run(token, userId, expires, now());
  return token;
}

export function createPasswordReset(userId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + PASSWORD_RESET_HOURS * 3600_000).toISOString();
  db.prepare(`INSERT INTO password_resets (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`).run(token, userId, expires, now());
  return token;
}
