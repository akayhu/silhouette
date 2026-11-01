// 環境變數與衍生常數：集中在這裡，其他模組只讀取、不直接碰 process.env
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.SILHOUETTE_DATA_DIR || path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const PORT = Number(process.env.PORT || 8787);
export const FREE_MONTHLY_PROJECTS = 3;
export const PRO_PRICE_TWD = 399;
// 折扣優惠碼最多折這麼多錢（確保扣款金額一定是正數）
export const MAX_PROMO_DISCOUNT_TWD = 300;
export const SESSION_DAYS = 30;

// ---------- 綠界 ECPay 金流設定 ----------
// 沒設定環境變數時，預設用綠界公開的測試環境帳號（僅供測試，不會真的請款）
export const ECPAY_ENV = process.env.ECPAY_ENV === 'production' ? 'production' : 'test';
export const ECPAY_MERCHANT_ID = process.env.ECPAY_MERCHANT_ID || '2000132';
export const ECPAY_HASH_KEY = process.env.ECPAY_HASH_KEY || '5294y06JbISpM5x9';
export const ECPAY_HASH_IV = process.env.ECPAY_HASH_IV || 'v77hoKGq4kWxNNIS';
export const ECPAY_HOST = ECPAY_ENV === 'production' ? 'https://payment.ecpay.com.tw' : 'https://payment-stage.ecpay.com.tw';
// 使用者實際瀏覽這個網站的網址（正式上線請設成正式網域；本機開發預設 Vite 的網址）
export const APP_URL = (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
// 定期定額每期月數固定為 1（每月扣款一次）
export const ECPAY_PERIOD_MONTHS = 1;
export const TRIAL_DAYS = 7;

// ---------- 註冊信箱驗證（Resend） ----------
// 沒設定 RESEND_API_KEY 時（本機開發預設），驗證信連結只會印在後端 log，方便開發測試
export const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
export const RESEND_FROM = process.env.RESEND_FROM || '片刻剪趣 <onboarding@resend.dev>';
export const EMAIL_VERIFICATION_HOURS = 24;
export const PASSWORD_RESET_HOURS = 1;

// ---------- Google 登入／註冊 ----------
// 沒設定這兩個環境變數時，前端會顯示「需要先設定」的提示，不影響一般 Email 註冊
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
export const GOOGLE_REDIRECT_URI = `${APP_URL}/api/auth/google/callback`;

// 正式環境（APP_URL 是 https）才加 Secure，本機 http://localhost 開發不受影響
export const COOKIE_SECURE = APP_URL.startsWith('https://') ? '; Secure' : '';
