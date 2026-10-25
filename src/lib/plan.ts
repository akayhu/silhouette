import type { User } from './types';

/** 新會員註冊即享的專業版試用天數（和後端 TRIAL_DAYS 一致） */
export const TRIAL_DAYS = 7;

export const isTrial = (u: User | null | undefined) => u?.plan === 'pro' && u.planSource === 'trial';
/** 真正付費（或管理者開通）的專業版，不含試用 */
export const isPaidPro = (u: User | null | undefined) => u?.plan === 'pro' && u.planSource !== 'trial';
/** 試用期已結束、目前回到免費版 */
export const trialEnded = (u: User | null | undefined) => u?.plan === 'free' && u.planSource === 'trial';

export function trialDaysLeft(u: User | null | undefined) {
  if (!isTrial(u) || !u!.planRenewsAt) return 0;
  return Math.max(0, Math.ceil((Date.parse(u!.planRenewsAt) - Date.now()) / 86400_000));
}
