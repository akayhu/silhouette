// 使用者自助下載資料與刪除帳號：原本只有管理者能代為刪除會員，使用者自己沒有管道
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.mjs';

test('下載自己的資料、用 Email 確認刪除自己的帳號', async () => {
  const server = await startTestServer();
  try {
    const email = 'self-service@example.test';
    await server.request('/api/auth/register', { email, password: 'test-password-123', name: '自助測試' });
    const token = await server.findLink('/api/auth/verify');
    await server.request(`/api/auth/verify?token=${token}`);
    const userId = server.db.prepare(`SELECT id FROM users WHERE email=?`).get(email).id;
    await server.request('/api/projects', { name: '我的專案', aspect: '9:16' });

    // 下載自己的資料：包含帳號資訊與剛建立的專案，不含密碼雜湊
    const exportRes = await server.request('/api/auth/export-data');
    assert.equal(exportRes.status, 200);
    const exported = await exportRes.json();
    assert.equal(exported.account.email, email);
    assert.equal(exported.account.password_hash, undefined);
    assert.equal(exported.projects.length, 1);
    assert.equal(exported.projects[0].name, '我的專案');

    // Email 打錯或空白不能刪除
    const wrongEmail = await server.request('/api/auth/me', { confirmEmail: 'not-my-email@example.test' }, 'DELETE');
    assert.equal(wrongEmail.status, 400);
    const stillThere = server.db.prepare(`SELECT COUNT(*) AS n FROM users WHERE id=?`).get(userId);
    assert.equal(stillThere.n, 1);

    // 輸入正確的 Email（忽略大小寫跟前後空白）才能刪除
    const del = await server.request('/api/auth/me', { confirmEmail: `  ${email.toUpperCase()}  ` }, 'DELETE');
    assert.equal(del.status, 200);
    const gone = server.db.prepare(`SELECT COUNT(*) AS n FROM users WHERE id=?`).get(userId);
    assert.equal(gone.n, 0);
    const goneProjects = server.db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE user_id=?`).get(userId);
    assert.equal(goneProjects.n, 0);

    // 刪除後這個 session 已經失效，之後的請求變成未登入
    const me = await (await server.request('/api/auth/me')).json();
    assert.equal(me.user, null);
  } finally {
    await server.stop();
  }
});
