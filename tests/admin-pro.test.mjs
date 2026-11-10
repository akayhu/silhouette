import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.mjs';

async function registerAndVerify(server, email) {
  await server.request('/api/auth/register', { email, password: 'test-password-123', name: '測試' });
  const token = await server.findLink('/api/auth/verify');
  await server.request(`/api/auth/verify?token=${token}`);
  return email;
}

test('管理者帳號永遠是專業版、不限期，不受到期日限制', async () => {
  const server = await startTestServer();
  try {
    await registerAndVerify(server, 'admin-pro@example.test');
    const id = server.db.prepare(`SELECT id FROM users WHERE email=?`).get('admin-pro@example.test').id;

    // 還不是管理者時，剛註冊走的是 7 天試用（plan='pro'），不是這次要測的情境；
    // 直接把資料庫改成已經到期的免費方案，模擬一個「本來就不是專業版」的一般帳號
    server.db.prepare(`UPDATE users SET plan='free', plan_source=NULL, plan_renews_at=NULL WHERE id=?`).run(id);
    const beforeAdmin = await server.request('/api/auth/me');
    const beforeUser = (await beforeAdmin.json()).user;
    assert.equal(beforeUser.plan, 'free');
    assert.equal(beforeUser.role, 'user');

    // 設成管理者，資料庫裡的 plan 欄位完全不動（還是 free）
    server.db.prepare(`UPDATE users SET role='admin' WHERE id=?`).run(id);
    const afterAdmin = await server.request('/api/auth/me');
    const afterUser = (await afterAdmin.json()).user;
    assert.equal(afterUser.role, 'admin');
    assert.equal(afterUser.plan, 'pro', '管理者帳號應該永遠顯示專業版');
    assert.equal(afterUser.planRenewsAt, null, '管理者的專業版不應該有到期日');
    assert.equal(afterUser.usage.projectLimit, null, '管理者不該有專案數量上限');

    // 資料庫裡的 plan 欄位本身沒有被改寫（永遠是 pro 是「算出來的」，不是真的改了付款方案）
    const row = server.db.prepare(`SELECT plan FROM users WHERE id=?`).get(id);
    assert.equal(row.plan, 'free');

    // 改名字之後重新查詢（PATCH /api/auth/me 會重新從資料庫撈一次），管理者還是要維持專業版
    const patched = await server.request('/api/auth/me', { name: '改過的名字' }, 'PATCH');
    assert.equal((await patched.json()).user.plan, 'pro');
  } finally {
    await server.stop();
  }
});

test('一般會員（不是管理者）專業版到期後，仍然會照原本的邏輯自動降回免費版', async () => {
  const server = await startTestServer();
  try {
    await registerAndVerify(server, 'expired-pro@example.test');
    const id = server.db.prepare(`SELECT id FROM users WHERE email=?`).get('expired-pro@example.test').id;
    const past = new Date(Date.now() - 86400_000).toISOString();
    server.db.prepare(`UPDATE users SET plan='pro', plan_source='paid', plan_renews_at=? WHERE id=?`).run(past, id);

    const res = await server.request('/api/auth/me');
    const user = (await res.json()).user;
    assert.equal(user.plan, 'free', '一般會員到期後應該照舊自動降回免費版');
  } finally {
    await server.stop();
  }
});
