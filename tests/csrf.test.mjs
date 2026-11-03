// CSRF 防護（Origin／Referer 檢查）：只在已登入、且是會改資料的方法時才檢查
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.mjs';

test('CSRF：已登入時跨站 Origin 會被擋下，本站 Origin 或沒有 Origin 都放行，未登入請求不受影響', async () => {
  const server = await startTestServer();
  try {
    const email = 'csrf-test@example.test';
    await server.request('/api/auth/register', { email, password: 'test-password-123', name: '測試使用者' });
    const token = await server.findLink('/api/auth/verify');
    await server.request(`/api/auth/verify?token=${token}`);

    // 已登入 + Origin 跟本站一致：放行
    const sameOrigin = await fetch(`${server.base}/api/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: server.cookie, Origin: 'http://localhost:5173' },
      body: JSON.stringify({ name: '改名' }),
    });
    assert.equal(sameOrigin.status, 200);
    assert.equal((await sameOrigin.json()).user.name, '改名');

    // 已登入 + Origin 是別的網站：擋下來
    const crossOrigin = await fetch(`${server.base}/api/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: server.cookie, Origin: 'https://evil.example.com' },
      body: JSON.stringify({ name: '攻擊者改名' }),
    });
    assert.equal(crossOrigin.status, 403);
    const afterAttack = await (await server.request('/api/auth/me')).json();
    assert.equal(afterAttack.user.name, '改名'); // 沒有被攻擊請求改掉

    // 已登入 + 沒有 Origin／Referer（非瀏覽器用戶端，或被代理拿掉）：放行
    const noOrigin = await fetch(`${server.base}/api/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: server.cookie },
      body: JSON.stringify({ name: '沒有來源標頭' }),
    });
    assert.equal(noOrigin.status, 200);

    // 未登入（沒有 session）：跨站 Origin 也不受影響，註冊照樣成功——這類路由本來就沒有身分可以被冒用
    const registerCrossOrigin = await fetch(`${server.base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example.com' },
      body: JSON.stringify({ email: 'another-csrf-test@example.test', password: 'test-password-123', name: '另一人' }),
    });
    assert.equal(registerCrossOrigin.status, 200);

    // GET 這類不改資料的方法不檢查 Origin，即使跨站也看得到自己的資料
    const crossOriginGet = await fetch(`${server.base}/api/auth/me`, {
      headers: { Cookie: server.cookie, Origin: 'https://evil.example.com' },
    });
    assert.equal(crossOriginGet.status, 200);
  } finally {
    await server.stop();
  }
});
