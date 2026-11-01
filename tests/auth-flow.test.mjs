import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.mjs';

test('註冊要先驗證信箱才能登入；忘記密碼可以重設並讓舊密碼失效', async () => {
  const server = await startTestServer();
  try {
    const email = 'flow-test@example.test';

    // 註冊：不會馬上登入，也不會直接給試用
    const register = await server.request('/api/auth/register', { email, password: 'first-password-123', name: '流程測試' });
    assert.equal(register.status, 200);
    assert.deepEqual(await register.json(), { pending: true, email });

    // 驗證前不能登入
    const blocked = await server.request('/api/auth/login', { email, password: 'first-password-123' });
    assert.equal(blocked.status, 403);
    assert.equal((await blocked.json()).code, 'EMAIL_NOT_VERIFIED');

    // 從伺服器輸出取得驗證連結（沒設定 RESEND_API_KEY 時不會真的寄信）並完成驗證
    const verifyToken = await server.findLink('/api/auth/verify');
    const verify = await server.request(`/api/auth/verify?token=${verifyToken}`);
    assert.equal(verify.status, 302);
    assert.equal(verify.headers.get('location'), 'http://localhost:5173/dashboard?verified=1');

    // 驗證完成會直接登入（帶 7 天試用）
    const me = await (await server.request('/api/auth/me')).json();
    assert.equal(me.user.email, email);
    assert.equal(me.user.plan, 'pro');
    assert.equal(me.user.planSource, 'trial');

    // 同一組 token 不能重複使用
    const reuse = await server.request(`/api/auth/verify?token=${verifyToken}`);
    assert.equal(reuse.headers.get('location'), 'http://localhost:5173/login?verify=invalid');

    // 無效 token 也導回錯誤頁，不會壞掉
    const invalid = await server.request('/api/auth/verify?token=not-a-real-token');
    assert.equal(invalid.headers.get('location'), 'http://localhost:5173/login?verify=invalid');

    // 密碼錯誤登入失敗
    const wrongPassword = await server.request('/api/auth/login', { email, password: 'wrong-password' });
    assert.equal(wrongPassword.status, 401);

    // 重複註冊同一個 Email 會被擋
    const duplicate = await server.request('/api/auth/register', { email, password: 'another-password-123', name: '重複註冊' });
    assert.equal(duplicate.status, 409);

    // 忘記密碼：寄重設信，從輸出取得連結並設定新密碼
    const forgot = await server.request('/api/auth/forgot-password', { email });
    assert.equal(forgot.status, 200);
    const resetToken = await server.findLink('/reset-password');
    const reset = await server.request('/api/auth/reset-password', { token: resetToken, password: 'second-password-456' });
    assert.equal(reset.status, 200);
    assert.equal((await reset.json()).user.email, email);

    // 重設連結只能用一次
    const reuseReset = await server.request('/api/auth/reset-password', { token: resetToken, password: 'third-password-789' });
    assert.equal(reuseReset.status, 400);

    // 太短的密碼會被擋
    const tooShort = await server.request('/api/auth/reset-password', { token: resetToken, password: 'short' });
    assert.equal(tooShort.status, 400);

    // 舊密碼失效，新密碼可以登入
    const oldPassword = await server.request('/api/auth/login', { email, password: 'first-password-123' });
    assert.equal(oldPassword.status, 401);
    const newPassword = await server.request('/api/auth/login', { email, password: 'second-password-456' });
    assert.equal(newPassword.status, 200);

    // 忘記密碼不管帳號存不存在都回一樣的訊息，不會洩漏帳號是否存在
    const unknownEmail = await server.request('/api/auth/forgot-password', { email: 'nobody-here@example.test' });
    assert.equal(unknownEmail.status, 200);
    assert.deepEqual(await unknownEmail.json(), { ok: true });
  } finally {
    await server.stop();
  }
});
