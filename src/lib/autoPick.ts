// 一鍵自動剪輯：依字幕內容挑模板。規則式關鍵字比對，純前端算，不呼叫任何 AI API
import type { SmartTemplate } from './templates';
import type { Caption } from './types';

/** 模板 id → 內容關鍵字；字幕裡命中越多，越像那種類型的影片 */
const TEMPLATE_KEYWORDS: Record<string, string[]> = {
  food: ['好吃', '美食', '餐廳', '老闆', '小吃', '攤', '必吃', '排隊', '開動', '口味', '招牌'],
  talk: ['重點', '三個', '第一', '第二', '第三', '為什麼', '原因', '其實', '分享', '方法', '建議', '觀念'],
  tech: ['開箱', '科技', '手機', '電腦', '功能', '規格', '評測', '產品', '螢幕'],
  shopeepick: ['蝦皮', '折扣', '優惠', '限時', '下單', '連結', '價格', '划算', '好物'],
  travel: ['旅行', '出遊', '景點', '機票', '住宿', '行程', '出發', '自由行'],
  camp: ['露營', '野營', '帳篷', '營地', '營火'],
  beachsunset: ['海邊', '沙灘', '夕陽', '日落', '浪'],
  pool: ['泳池', '游泳', '夏天', '消暑'],
  cute: ['可愛', '萌', '貓', '寶貝'],
  puppyplay: ['狗', '狗狗', '毛孩', '散步', '寵物'],
  kids: ['小孩', '寶寶', '親子', '孩子', '遊戲'],
  familytime: ['家人', '爸爸', '媽媽', '全家', '家庭'],
  friends: ['朋友', '聚會', '大家', '一起'],
  hype: ['運動', '健身', '衝', '比賽', '加油', '燃燒', '訓練'],
  motivate: ['夢想', '堅持', '努力', '目標', '成長', '挑戰', '突破'],
  graduation: ['畢業', '學校', '同學', '典禮'],
  wedding: ['婚禮', '新娘', '新郎', '我願意', '結婚'],
  festival: ['節日', '慶祝', '活動', '跨年', '煙火', '演唱會'],
  neonparty: ['派對', '夜店', '嗨', '跳舞'],
  citypop: ['夜晚', '夜景', '城市', '霓虹'],
  cafe: ['咖啡', '拿鐵', '甜點', '下午茶', '咖啡廳'],
  study: ['讀書', '考試', '筆記', '專注', '念書'],
  sad: ['再見', '想念', '難過', '離別', '失去', '告別'],
  story: ['回憶', '以前', '小時候', '老照片', '記得'],
  mystery: ['秘密', '真相', '揭密', '神秘', '探索'],
  countdown: ['倒數', '開獎', '抽獎', '揭曉'],
  vlog: ['日常', '今天', '早上', '一天', 'vlog', 'Vlog', '生活'],
  rainyday: ['下雨', '雨天', '雨'],
  springbloom: ['櫻花', '花開', '春天', '賞花'],
  streetstyle: ['穿搭', '街拍', '潮', '搭配'],
};

/** 沒有任何關鍵字命中時的預設：多半是對著鏡頭講話的口播，用最不搶戲的知識口播 */
const FALLBACK = 'talk';

export interface PickedTemplate {
  template: SmartTemplate;
  /** 命中哪些關鍵字，給使用者看為什麼挑這個；沒命中時是空陣列 */
  matched: string[];
}

/** 依字幕內容挑最像的模板；同分時取關鍵字清單排在前面的（越常見的類型越前面） */
export function pickTemplate(captions: Pick<Caption, 'text' | 'role'>[], templates: SmartTemplate[]): PickedTemplate {
  const text = captions.filter((c) => c.role !== 'flower').map((c) => c.text).join('');
  let best: { id: string; matched: string[] } | null = null;
  for (const [id, words] of Object.entries(TEMPLATE_KEYWORDS)) {
    if (!templates.some((t) => t.id === id)) continue;
    const matched = words.filter((w) => text.includes(w));
    if (matched.length > (best?.matched.length ?? 0)) best = { id, matched };
  }
  const id = best?.id ?? FALLBACK;
  const template = templates.find((t) => t.id === id) ?? templates[0];
  return { template, matched: best?.matched ?? [] };
}

export const AUTO_PICK_TEMPLATE_IDS = Object.keys(TEMPLATE_KEYWORDS);

const INTENT_KEY = 'pianke.intentTemplate';
const INTENT_TTL = 7 * 24 * 3600_000;

/** 首頁選了「我要剪這種影片」：記下對應模板，進編輯器開智能剪輯時預先選好（存在這台瀏覽器，7 天內有效） */
export function rememberIntentTemplate(id: string) {
  try {
    localStorage.setItem(INTENT_KEY, JSON.stringify({ id, at: Date.now() }));
  } catch {
    /* 無痕模式等存不了就算了 */
  }
}

/** 取出並清掉記下的模板；過期、壞掉或模板已不存在就回傳 null */
export function takeIntentTemplate(templates: SmartTemplate[]): SmartTemplate | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    localStorage.removeItem(INTENT_KEY);
    const saved = JSON.parse(raw) as { id?: unknown; at?: unknown };
    if (typeof saved.id !== 'string' || typeof saved.at !== 'number' || Date.now() - saved.at > INTENT_TTL) return null;
    return templates.find((t) => t.id === saved.id) ?? null;
  } catch {
    return null;
  }
}
