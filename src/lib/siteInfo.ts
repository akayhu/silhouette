/**
 * 網站營運資訊：關於我們、隱私權政策、服務條款、退款聯絡都讀這一份。
 * 上線前把空字串填好（建置時還空著會印出警告），所有頁面會一起更新。
 */
export const SITE_INFO = {
  /** 營運主體名稱（公司或個人）；有統一編號可以一起寫，例如「某某有限公司（統編 12345678）」 */
  operator: '',
  /** 客服與退款聯絡用的 Email */
  contactEmail: '',
  /** 條款與政策的最後更新日期 */
  updated: '2026-11-13',
};

export const siteInfoMissing = () => (['operator', 'contactEmail'] as const).filter((k) => !SITE_INFO[k]);
