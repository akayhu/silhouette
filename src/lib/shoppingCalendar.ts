/**
 * 電商檔期關鍵字日曆：純本機資料，給「蝦皮分潤」這類開箱／推薦影片提前抓拍片角度用。
 * 國曆固定日期（情人節、雙11…）直接寫 MM-DD；母親節、黑色星期五這種「每年第幾個星期幾」用算的；
 * 農曆節慶（春節、端午、七夕、中秋）日期每年會變動，這裡只給大概月份區間，不假裝精準。
 */

export interface ShoppingMoment {
  id: string;
  name: string;
  /** 國曆固定日期或算得出來的日期，格式 MM-DD；農曆節慶沒有這個欄位 */
  date?: string;
  /** 農曆／浮動節慶：大概落在這個月（1-12），UI 要標示「約」，不是精準日期 */
  approxMonth?: number;
  keywords: string[];
  angle: string;
}

export const SHOPPING_MOMENTS: ShoppingMoment[] = [
  { id: 'newyear', name: '元旦跨年', date: '01-01', keywords: ['跨年戰袍', '保暖小物', '新年手帳'], angle: '跨年必備清單開箱，帶讀者一次買齊' },
  { id: 'cny', name: '春節年貨節', approxMonth: 1, keywords: ['年貨大全', '伴手禮推薦', '居家過年好物'], angle: '年貨開箱／送禮推薦，提前卡檔期曝光' },
  { id: 'valentine', name: '情人節', date: '02-14', keywords: ['情人節禮物', '約會穿搭', '告白小物'], angle: '情人節送禮指南，依預算分級推薦' },
  { id: 'lantern', name: '元宵節', date: '02-15', keywords: ['元宵應景小物', '燈節拍照道具'], angle: '應景小物開箱，搭配拍照打卡角度' },
  { id: 'women', name: '婦女節', date: '03-08', keywords: ['女性保養', '自我犒賞好物'], angle: '犒賞自己系列好物推薦' },
  { id: 'kids', name: '兒童節', date: '04-04', keywords: ['兒童玩具', '親子好物'], angle: '親子開箱，爸媽視角實測' },
  { id: 'labor', name: '勞動節連假', date: '05-01', keywords: ['連假出遊好物', '露營野餐用品'], angle: '連假出遊準備清單，景點＋裝備一起帶' },
  { id: 'mother', name: '母親節', keywords: ['母親節禮物', '媽媽保養品', '按摩小物'], angle: '依預算分級的母親節送禮推薦' },
  { id: 'dragonboat', name: '端午節', approxMonth: 6, keywords: ['粽子開箱', '防蚊消暑好物'], angle: '粽子評比或消暑好物開箱' },
  { id: 'father', name: '父親節', date: '08-08', keywords: ['父親節禮物', '男士保養', '3C 小物'], angle: '爸爸收到會喜歡的禮物推薦' },
  { id: 'qixi', name: '七夕情人節', approxMonth: 8, keywords: ['七夕禮物', '情侶穿搭'], angle: '小資情侶送禮推薦，強調 CP 值' },
  { id: 'midautumn', name: '中秋節', approxMonth: 9, keywords: ['烤肉用品', '月餅開箱', '賞月野餐'], angle: '烤肉用品開箱或月餅試吃評比' },
  { id: 'teacher', name: '教師節', date: '09-28', keywords: ['感謝師恩小禮物'], angle: '送老師不出錯的小禮物推薦' },
  { id: 'national', name: '國慶連假', date: '10-10', keywords: ['連假旅遊用品', '戶外穿搭'], angle: '連假出遊好物，搭配行程規劃' },
  { id: 'halloween', name: '萬聖節', date: '10-31', keywords: ['萬聖節變裝', '派對小物'], angle: '低預算萬聖節變裝開箱' },
  { id: 'double11', name: '雙11購物節', date: '11-11', keywords: ['雙11優惠', '必買清單', '囤貨推薦'], angle: '雙11必買清單，整理真正划算的品項' },
  { id: 'blackfriday', name: '黑色星期五', keywords: ['黑五折扣', '3C 優惠'], angle: '黑五折扣整理，比價＋避雷提醒' },
  { id: 'double12', name: '雙12購物節', date: '12-12', keywords: ['雙12優惠', '年末清單'], angle: '雙12補貨清單，接續雙11沒搶到的' },
  { id: 'christmas', name: '耶誕節', date: '12-25', keywords: ['耶誕禮物', '交換禮物', '耶誕裝飾'], angle: '交換禮物推薦，依價位分類' },
];

/** 當年某月的第 n 個星期幾（weekday 0=週日）；用來算母親節、黑色星期五這種浮動日期 */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month - 1, 1);
  const offset = (7 + weekday - first.getDay()) % 7;
  return new Date(year, month - 1, 1 + offset + (n - 1) * 7);
}

/** 這個節慶在指定年份的日期：固定日期直接讀，浮動節慶用算的，農曆節慶用大概月份的 15 號當代表日 */
function dateInYear(moment: ShoppingMoment, year: number): Date {
  if (moment.id === 'mother') return nthWeekdayOfMonth(year, 5, 0, 2);
  if (moment.id === 'blackfriday') {
    const thanksgiving = nthWeekdayOfMonth(year, 11, 4, 4);
    return new Date(year, 10, thanksgiving.getDate() + 1);
  }
  if (moment.date) {
    const [m, d] = moment.date.split('-').map(Number);
    return new Date(year, m - 1, d);
  }
  return new Date(year, (moment.approxMonth ?? 1) - 1, 15);
}

export interface UpcomingMoment {
  moment: ShoppingMoment;
  /** 今年或明年最近一次發生的日期 */
  date: Date;
  daysUntil: number;
  /** 農曆／浮動節慶沒有精準日期，UI 要標示「約」 */
  approx: boolean;
}

/** 從現在起 withinDays 天內會到的檔期，依日期近到遠排序；給拍片提前準備的時間 */
export function upcomingShoppingMoments(now = new Date(), withinDays = 21): UpcomingMoment[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const results: UpcomingMoment[] = [];
  for (const moment of SHOPPING_MOMENTS) {
    for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
      const date = dateInYear(moment, year);
      const daysUntil = Math.round((date.getTime() - today.getTime()) / 86400000);
      if (daysUntil >= 0 && daysUntil <= withinDays) {
        results.push({ moment, date, daysUntil, approx: !moment.date && moment.id !== 'mother' && moment.id !== 'blackfriday' });
        break;
      }
    }
  }
  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}
