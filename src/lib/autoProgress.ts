/**
 * 一鍵自動剪輯的步驟進度：把處理中的訊息對應到固定的幾個步驟，讓使用者知道做到哪。
 * 多支片段時偵測、辨識會來回出現，所以步驟只會往前，不會倒退。
 */

export const AUTO_STEPS = ['偵測空拍與口誤', '辨識語音、產生字幕', '依內容挑模板', '加特寫、轉場與貼紙', '花字、配樂與音效'] as const;

const RULES: [RegExp, number][] = [
  [/^偵測空拍/, 0],
  [/下載語音模型|辨識人聲/, 1],
  [/^挑選模板/, 2],
  [/分析聲音起伏|安排運鏡|挑選轉場/, 3],
  [/套用模板/, 4],
];

export interface AutoProgress {
  step: number;
  detail: string;
}

export function nextAutoProgress(prev: AutoProgress | null, message: string): AutoProgress {
  const hit = RULES.find(([re]) => re.test(message))?.[1];
  const current = prev?.step ?? 0;
  const step = hit === undefined ? current : Math.max(current, hit);
  // 步驟沒往前、訊息又是前面步驟的（下一支片段又回到偵測）時，仍顯示實際在做的事
  return { step, detail: message };
}
