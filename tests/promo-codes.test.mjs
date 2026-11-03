import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from './helpers/server.mjs';

/** 註冊並完成信箱驗證，回傳 email；呼叫前後 cookie 會變成這個剛登入的帳號 */
async function registerAndVerify(server, email) {
  await server.request('/api/auth/register', { email, password: 'test-password-123', name: '測試' });
  const token = await server.findLink('/api/auth/verify');
  await server.request(`/api/auth/verify?token=${token}`);
  return email;
}

test('優惠碼產生與兌換、管理者重設密碼與刪除帳號', async () => {
  const server = await startTestServer();
  try {
    // 建立一個一般會員和一個管理者（直接在資料庫把 role 改成 admin，密碼還是透過正常註冊流程設定）
    await registerAndVerify(server, 'member@example.test');
    const memberId = server.db.prepare(`SELECT id FROM users WHERE email=?`).get('member@example.test').id;

    await registerAndVerify(server, 'admin@example.test');
    server.db.prepare(`UPDATE users SET role='admin' WHERE email=?`).run('admin@example.test');
    // cookie 目前是管理者的（最後一次驗證信箱時登入的就是管理者）

    // 管理者產生「免費月數」優惠碼
    const createMonths = await server.request('/api/admin/promo-codes', { kind: 'months', months: 2 });
    assert.equal(createMonths.status, 200);
    const monthsCode = (await createMonths.json()).code.code;

    // 管理者產生「折扣金額」優惠碼
    const createDiscount = await server.request('/api/admin/promo-codes', { kind: 'discount', discountAmount: 100 });
    assert.equal(createDiscount.status, 200);
    const discountCode = (await createDiscount.json()).code.code;

    // 月數、折扣金額的範圍驗證
    const badMonths = await server.request('/api/admin/promo-codes', { kind: 'months', months: 13 });
    assert.equal(badMonths.status, 400);
    const badDiscount = await server.request('/api/admin/promo-codes', { kind: 'discount', discountAmount: 399 });
    assert.equal(badDiscount.status, 400);

    // 切回一般會員身分（重新登入）
    await server.request('/api/auth/login', { email: 'member@example.test', password: 'test-password-123' });

    // 查詢優惠碼：只回傳類型，不會真的兌換
    const checkMonths = await server.request('/api/billing/promo/check', { code: monthsCode });
    assert.deepEqual(await checkMonths.json(), { kind: 'months', months: 2 });
    const checkDiscount = await server.request('/api/billing/promo/check', { code: discountCode });
    assert.deepEqual(await checkDiscount.json(), { kind: 'discount', discountAmount: 100 });
    const checkMissing = await server.request('/api/billing/promo/check', { code: 'NOPE-NOPE' });
    assert.equal(checkMissing.status, 400);

    // 兌換免費月數：直接升級，不經過金流
    const redeem = await server.request('/api/billing/promo/redeem', { code: monthsCode });
    assert.equal(redeem.status, 200);
    const redeemed = await redeem.json();
    assert.equal(redeemed.months, 2);
    assert.equal(redeemed.user.plan, 'pro');
    assert.equal(redeemed.user.planSource, 'promo');

    // 同一個人不能兌換第二次
    const redeemAgain = await server.request('/api/billing/promo/redeem', { code: monthsCode });
    assert.equal(redeemAgain.status, 400);

    // 折扣碼不能走「免費兌換」這條路（要走綠界結帳）
    const redeemDiscount = await server.request('/api/billing/promo/redeem', { code: discountCode });
    assert.equal(redeemDiscount.status, 400);

    // 切回管理者，確認兌換次數有算到
    await server.request('/api/auth/login', { email: 'admin@example.test', password: 'test-password-123' });
    const list = await (await server.request('/api/admin/promo-codes')).json();
    const monthsRow = list.codes.find((c) => c.code === monthsCode);
    assert.equal(monthsRow.redemptions, 1);

    // 管理者幫一般會員重設密碼
    const resetPw = await server.request(`/api/admin/users/${memberId}`, { action: 'reset-password', password: 'brand-new-password-123' }, 'PATCH');
    assert.equal(resetPw.status, 200);

    // 太短的新密碼會被擋
    const resetPwShort = await server.request(`/api/admin/users/${memberId}`, { action: 'reset-password', password: 'short' }, 'PATCH');
    assert.equal(resetPwShort.status, 400);

    // 舊密碼失效、新密碼可以登入
    const loginOld = await server.request('/api/auth/login', { email: 'member@example.test', password: 'test-password-123' });
    assert.equal(loginOld.status, 401);
    const loginNew = await server.request('/api/auth/login', { email: 'member@example.test', password: 'brand-new-password-123' });
    assert.equal(loginNew.status, 200);

    // 重設密碼後，該帳號原本的 session 應該已經失效（管理者改密碼時會登出對方的裝置）
    const stillMember = server.db.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id=?`).get(memberId);
    assert.equal(stillMember.n, 1); // 只剩剛剛 loginNew 這次新建立的 session

    // 切回管理者刪除這個會員，連同殘留資料一起清掉
    await server.request('/api/auth/login', { email: 'admin@example.test', password: 'test-password-123' });
    const del = await server.request(`/api/admin/users/${memberId}`, undefined, 'DELETE');
    assert.equal(del.status, 200);
    const gone = server.db.prepare(`SELECT COUNT(*) AS n FROM users WHERE id=?`).get(memberId);
    assert.equal(gone.n, 0);
    const leftoverRedemptions = server.db.prepare(`SELECT COUNT(*) AS n FROM promo_redemptions WHERE user_id=?`).get(memberId);
    assert.equal(leftoverRedemptions.n, 0);

    // 管理者不能刪除自己或其他管理者帳號
    const adminId = server.db.prepare(`SELECT id FROM users WHERE email=?`).get('admin@example.test').id;
    const deleteSelf = await server.request(`/api/admin/users/${adminId}`, undefined, 'DELETE');
    assert.equal(deleteSelf.status, 400);

    // 管理者不能重設「另一個管理者」的密碼（也不能開通／撤銷），避免被盜用的管理者帳號鎖死別人
    await registerAndVerify(server, 'other-admin@example.test');
    const otherAdminId = server.db.prepare(`SELECT id FROM users WHERE email=?`).get('other-admin@example.test').id;
    server.db.prepare(`UPDATE users SET role='admin' WHERE id=?`).run(otherAdminId);
    await server.request('/api/auth/login', { email: 'admin@example.test', password: 'test-password-123' });
    const resetOtherAdmin = await server.request(`/api/admin/users/${otherAdminId}`, { action: 'reset-password', password: 'brand-new-password-123' }, 'PATCH');
    assert.equal(resetOtherAdmin.status, 400);
    const grantOtherAdmin = await server.request(`/api/admin/users/${otherAdminId}`, { action: 'grant', months: 1 }, 'PATCH');
    assert.equal(grantOtherAdmin.status, 400);
  } finally {
    await server.stop();
  }
});

test('一般會員不能呼叫管理 API', async () => {
  const server = await startTestServer();
  try {
    await registerAndVerify(server, 'plain-member@example.test');
    const stats = await server.request('/api/admin/stats');
    assert.equal(stats.status, 403);
    const createCode = await server.request('/api/admin/promo-codes', { kind: 'months', months: 1 });
    assert.equal(createCode.status, 403);
  } finally {
    await server.stop();
  }
});
