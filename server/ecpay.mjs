// 綠界 ECPay 檢查碼、下單工具函式與「信用卡定期定額訂單作業」API
import { createHash, timingSafeEqual } from 'node:crypto';
import { ECPAY_HASH_KEY, ECPAY_HASH_IV, ECPAY_HOST, ECPAY_MERCHANT_ID } from './env.mjs';

// 把字串編碼成跟 .NET UrlEncode 一致的格式：JS 的 encodeURIComponent 本來就不會
// 編碼 ~ 和 '，但 .NET 會，所以這三個差異要手動補上；空白 .NET 編成 +，JS 編成 %20。
export function ecpayUrlEncode(str) {
  return encodeURIComponent(str).replace(/~/g, '%7E').replace(/%20/g, '+').replace(/'/g, '%27');
}

// 依綠界「檢查碼機制」規則計算 CheckMacValue：參數依欄位名稱排序、前後加上
// HashKey／HashIV、URL encode、轉小寫、SHA256、轉大寫
export function ecpayCheckMacValue(data) {
  const keys = Object.keys(data).sort((a, b) => {
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    return al > bl ? 1 : al < bl ? -1 : 0;
  });
  const raw = keys.map((k) => `${k}=${data[k]}`).join('&');
  const wrapped = `HashKey=${ECPAY_HASH_KEY}&${raw}&HashIV=${ECPAY_HASH_IV}`;
  const encoded = ecpayUrlEncode(wrapped).toLowerCase();
  return createHash('sha256').update(encoded).digest('hex').toUpperCase();
}

// 驗證綠界送回的 CheckMacValue：一般字串比對（!==）會在第一個不同字元就提前返回，
// 理論上可被時序攻擊猜出正確簽章，跟驗密碼一樣要用 constant-time 比對
export function ecpayVerifyMac(data, receivedMac) {
  const expected = Buffer.from(ecpayCheckMacValue(data));
  const received = Buffer.from(String(receivedMac || ''));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// yyyy/MM/dd HH:mm:ss（綠界要求的時間格式，用本機時間）
export function ecpayDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 跟綠界「信用卡定期定額訂單作業」API 溝通（補授權 ReAuth／終止 Cancel）
export async function ecpayPeriodAction(tradeNo, action) {
  const fields = {
    MerchantID: ECPAY_MERCHANT_ID,
    MerchantTradeNo: tradeNo,
    Action: action,
    TimeStamp: Math.floor(Date.now() / 1000),
  };
  fields.CheckMacValue = ecpayCheckMacValue(fields);
  const resp = await fetch(`${ECPAY_HOST}/Cashier/CreditCardPeriodAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = Object.fromEntries(new URLSearchParams(text));
  }
  if (String(data.RtnCode) !== '1') throw new Error(data.RtnMsg || '綠界回應失敗：' + text);
  return data;
}
