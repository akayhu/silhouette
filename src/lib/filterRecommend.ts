// 濾鏡推薦：分析這段素材縮圖的平均亮度跟冷暖色溫傾向，推薦方向一致的濾鏡；
// 純像素統計（跟 coverSuggest.ts 的亮度取樣同一手法），不呼叫任何 AI 模型
import { FILTER_PRESETS, type FilterId } from './filters';

export interface FilterRecommendation {
  id: FilterId;
  name: string;
  reason: string;
}

// 這幾個濾鏡本身就偏暗／偏亮調性，跟畫面明暗傾向一致時額外加分
const DARK_PRESETS = new Set<FilterId>(['night', 'midnight', 'noir']);
const BRIGHT_PRESETS = new Set<FilterId>(['fresh', 'pastel', 'summer', 'cream']);
const SAMPLE_SIZE = 48;

export function recommendFilters(img: CanvasImageSource, width: number, height: number, count = 3): FilterRecommendation[] {
  if (!width || !height) return [];
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, width, height, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  let r = 0;
  let g = 0;
  let b = 0;
  const n = SAMPLE_SIZE * SAMPLE_SIZE;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  r /= n;
  g /= n;
  b /= n;
  const brightness = (r + g + b) / 3;
  const warmth = r - b; // 正值偏暖，負值偏冷

  const scored = FILTER_PRESETS.filter((p) => p.id !== 'none').map((p) => {
    let score = 0;
    let reason = '';
    const temp = p.params.temperature ?? 0;
    if (temp !== 0 && Math.sign(temp) === Math.sign(warmth)) {
      score += Math.min(Math.abs(temp), 50) / 50;
      reason = warmth > 0 ? '畫面偏暖色調' : '畫面偏冷色調';
    }
    if (brightness < 95 && DARK_PRESETS.has(p.id)) {
      score += 1;
      reason = '畫面偏暗';
    }
    if (brightness > 165 && BRIGHT_PRESETS.has(p.id)) {
      score += 1;
      reason = '畫面明亮';
    }
    return { id: p.id, name: p.name, score, reason };
  });

  return scored
    .filter((p) => p.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, count)
    .map(({ id, name, reason }) => ({ id, name, reason }));
}
