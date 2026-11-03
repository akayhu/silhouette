// ---------- 訂閱（綠界 ECPay 信用卡定期定額，真的會請款） ----------
import { Router } from 'express';
import { randomUUID, randomBytes } from 'node:crypto';
import { db, now } from '../db.mjs';
import { requireAuth, publicUser, grantProMonths } from '../helpers.mjs';
import { ecpayCheckMacValue, ecpayVerifyMac, ecpayDate, ecpayPeriodAction } from '../ecpay.mjs';
import { PRO_PRICE_TWD, APP_URL, ECPAY_MERCHANT_ID, ECPAY_HOST, ECPAY_PERIOD_MONTHS } from '../env.mjs';

const router = Router();

// 建立訂單：導向綠界的收銀台頁面付款。一般訂單會設定「信用卡定期定額」讓綠界之後每月自動扣款；
// 折扣優惠碼訂單只收一次折扣後的金額，不設定定期定額（折抵的錢跟每月自動扣款沒辦法同時用同一張綠界訂單做到）
router.post('/api/billing/ecpay/checkout', requireAuth, (req, res) => {
  if (req.user.plan === 'pro' && req.user.plan_source !== 'trial') return res.status(400).json({ error: '已經是專業版了' });

  let amount = PRO_PRICE_TWD;
  let promoCode = null;
  if (req.body.code) {
    const code = String(req.body.code).trim().slice(0, 20).toUpperCase();
    const promo = db.prepare(`SELECT * FROM promo_codes WHERE code=?`).get(code);
    if (!promo || promo.kind !== 'discount') return res.status(400).json({ error: '優惠碼不存在或已失效' });
    if (db.prepare(`SELECT 1 FROM promo_redemptions WHERE code=? AND user_id=?`).get(code, req.user.id)) {
      return res.status(400).json({ error: '這組優惠碼你已經用過了' });
    }
    amount = Math.max(1, PRO_PRICE_TWD - promo.discount_amount);
    promoCode = code;
  }

  const tradeNo = `T${Date.now().toString(36)}${randomBytes(3).toString('hex')}`.slice(0, 20);
  db.prepare(`INSERT INTO ecpay_orders (trade_no, user_id, amount, status, created_at, promo_code) VALUES (?, ?, ?, 'pending', ?, ?)`).run(
    tradeNo, req.user.id, amount, now(), promoCode,
  );
  const fields = {
    MerchantID: ECPAY_MERCHANT_ID,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: ecpayDate(),
    PaymentType: 'aio',
    TotalAmount: amount,
    TradeDesc: 'Pianke Jianqu Pro Subscription',
    ItemName: '片刻剪趣 專業版（每月）',
    ReturnURL: `${APP_URL}/api/billing/ecpay/notify`,
    ChoosePayment: 'Credit',
    ClientBackURL: `${APP_URL}/account`,
    OrderResultURL: `${APP_URL}/api/billing/ecpay/result`,
    NeedExtraPaidInfo: 'Y',
    EncryptType: 1,
    ...(promoCode
      ? {}
      : {
          PeriodAmount: amount,
          PeriodType: 'M',
          Frequency: ECPAY_PERIOD_MONTHS,
          ExecTimes: 99,
          PeriodReturnURL: `${APP_URL}/api/billing/ecpay/period-notify`,
        }),
  };
  fields.CheckMacValue = ecpayCheckMacValue(fields);
  res.json({ actionUrl: `${ECPAY_HOST}/Cashier/AioCheckOut/V5`, fields });
});

// 綠界付款完成後，伺服器對伺服器送來的通知（跟使用者的瀏覽器無關，不能用 requireAuth）
router.post('/api/billing/ecpay/notify', (req, res) => {
  const body = { ...req.body };
  const receivedMac = body.CheckMacValue;
  delete body.CheckMacValue;
  if (!ecpayVerifyMac(body, receivedMac)) {
    console.error('[ecpay] notify 檢查碼不符', body);
    return res.status(400).send('0|CheckMacValue error');
  }
  const order = db.prepare(`SELECT * FROM ecpay_orders WHERE trade_no=?`).get(body.MerchantTradeNo);
  if (!order) {
    console.error('[ecpay] notify 找不到對應訂單', body.MerchantTradeNo);
    return res.send('1|OK');
  }
  if (order.status === 'pending') {
    if (body.RtnCode === '1') {
      if (order.promo_code) {
        // 折扣優惠碼訂單：一次性付款，只給 1 個月、不會自動續訂
        grantProMonths(db.prepare(`SELECT * FROM users WHERE id=?`).get(order.user_id), 1, 'paid');
        db.prepare(`INSERT INTO promo_redemptions (code, user_id, redeemed_at) VALUES (?, ?, ?)`).run(order.promo_code, order.user_id, now());
      } else {
        const renews = new Date();
        renews.setMonth(renews.getMonth() + ECPAY_PERIOD_MONTHS);
        db.prepare(`UPDATE users SET plan='pro', plan_source='paid', plan_renews_at=?, plan_cancel_at_period_end=0 WHERE id=?`).run(
          renews.toISOString(), order.user_id,
        );
      }
      db.prepare(`INSERT INTO payments (id, user_id, amount, card_last4, created_at) VALUES (?, ?, ?, ?, ?)`).run(
        randomUUID(), order.user_id, Number(body.TradeAmt) || order.amount, body.card4no || null, now(),
      );
      db.prepare(`UPDATE ecpay_orders SET status='paid' WHERE trade_no=?`).run(order.trade_no);
    } else {
      db.prepare(`UPDATE ecpay_orders SET status='failed' WHERE trade_no=?`).run(order.trade_no);
    }
  }
  res.send('1|OK');
});

// 定期定額每一期扣款的通知（第一期也會走這個通知，由 ReturnURL 另外處理首期）
router.post('/api/billing/ecpay/period-notify', (req, res) => {
  const body = { ...req.body };
  const receivedMac = body.CheckMacValue;
  delete body.CheckMacValue;
  if (!ecpayVerifyMac(body, receivedMac)) {
    console.error('[ecpay] period-notify 檢查碼不符', body);
    return res.status(400).send('0|CheckMacValue error');
  }
  const order = db.prepare(`SELECT * FROM ecpay_orders WHERE trade_no=?`).get(body.MerchantTradeNo);
  if (order && body.RtnCode === '1' && body.SimulatePaid !== '1' && Number(body.TotalSuccessTimes) > 1) {
    const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(order.user_id);
    if (user) {
      const renews = new Date();
      renews.setMonth(renews.getMonth() + ECPAY_PERIOD_MONTHS);
      db.prepare(`UPDATE users SET plan='pro', plan_source='paid', plan_renews_at=? WHERE id=?`).run(renews.toISOString(), user.id);
      db.prepare(`INSERT INTO payments (id, user_id, amount, card_last4, created_at) VALUES (?, ?, ?, ?, ?)`).run(
        randomUUID(), user.id, Number(body.Amount) || order.amount, null, now(),
      );
    }
  }
  res.send('1|OK');
});

// 使用者付款完刷卡後，瀏覽器被導回這裡（綠界用 POST 導回，跟上面的伺服器通知是分開的兩條路徑）
router.post('/api/billing/ecpay/result', (_req, res) => {
  res.redirect('/account?upgraded=1');
});

router.post('/api/billing/cancel', requireAuth, async (req, res) => {
  // 折扣優惠碼的訂單是一次性付款，沒有在綠界設定定期定額，不用也不能呼叫終止 API
  const order = db
    .prepare(`SELECT * FROM ecpay_orders WHERE user_id=? AND status='paid' AND promo_code IS NULL ORDER BY created_at DESC LIMIT 1`)
    .get(req.user.id);
  if (order) {
    try {
      await ecpayPeriodAction(order.trade_no, 'Cancel');
    } catch (e) {
      console.error('[ecpay] 終止定期定額失敗', e);
      return res.status(502).json({ error: '向金流商終止訂閱失敗，請稍後再試' });
    }
  }
  db.prepare(`UPDATE users SET plan_cancel_at_period_end=1 WHERE id=?`).run(req.user.id);
  res.json({ user: publicUser(db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user.id)) });
});

router.get('/api/billing/payments', requireAuth, (req, res) => {
  res.json({
    payments: db
      .prepare(`SELECT id, amount, card_last4 AS cardLast4, created_at AS createdAt FROM payments WHERE user_id=? ORDER BY created_at DESC`)
      .all(req.user.id),
  });
});

// 查詢優惠碼：不會兌換，單純回傳這組碼是「免費月數」還是「折扣金額」，前端依類型決定接下來要怎麼做
router.post('/api/billing/promo/check', requireAuth, (req, res) => {
  const code = String(req.body.code || '').trim().slice(0, 20).toUpperCase();
  if (!code) return res.status(400).json({ error: '請輸入優惠碼' });
  const promo = db.prepare(`SELECT * FROM promo_codes WHERE code=?`).get(code);
  if (!promo) return res.status(400).json({ error: '優惠碼不存在或已失效' });
  if (db.prepare(`SELECT 1 FROM promo_redemptions WHERE code=? AND user_id=?`).get(code, req.user.id)) {
    return res.status(400).json({ error: '這組優惠碼你已經用過了' });
  }
  if (promo.kind === 'discount') return res.json({ kind: 'discount', discountAmount: promo.discount_amount });
  return res.json({ kind: 'months', months: promo.months });
});

// 兌換「免費月數」優惠碼：直接升級，不用走綠界；同一組碼每個人都能用，但每人限用一次
router.post('/api/billing/promo/redeem', requireAuth, (req, res) => {
  const code = String(req.body.code || '').trim().slice(0, 20).toUpperCase();
  if (!code) return res.status(400).json({ error: '請輸入優惠碼' });
  const promo = db.prepare(`SELECT * FROM promo_codes WHERE code=?`).get(code);
  if (!promo || promo.kind !== 'months') return res.status(400).json({ error: '優惠碼不存在或已失效' });
  if (db.prepare(`SELECT 1 FROM promo_redemptions WHERE code=? AND user_id=?`).get(code, req.user.id)) {
    return res.status(400).json({ error: '這組優惠碼你已經用過了' });
  }
  grantProMonths(req.user, promo.months, 'promo');
  db.prepare(`INSERT INTO promo_redemptions (code, user_id, redeemed_at) VALUES (?, ?, ?)`).run(code, req.user.id, now());
  res.json({ user: publicUser(db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user.id)), months: promo.months });
});

export default router;
