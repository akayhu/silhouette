/**
 * 濾鏡：全部是自訂的色彩參數組合（亮度、對比、飽和、色溫、暗角、顆粒…），
 * 不使用任何第三方圖片或 LUT，沒有版權問題。
 * 預覽與匯出共用同一套繪製流程。
 */

export type FilterId =
  | 'none' | 'fresh' | 'warm' | 'japan' | 'vintage' | 'film' | 'mono' | 'punchy'
  | 'cool' | 'food' | 'night' | 'pastel' | 'summer' | 'autumn' | 'midnight'
  | 'noir' | 'teal' | 'golden' | 'sakura' | 'matcha' | 'street'
  | 'cream' | 'cyber' | 'forest' | 'dusk' | 'polaroid' | 'arctic' | 'mocha' | 'neon' | 'clear';

export interface FilterParams {
  brightness: number; // 1 = 原樣
  contrast: number;
  saturate: number;
  sepia: number; // 0–1
  grayscale: number; // 0–1
  hue: number; // 度
  temperature: number; // -100（冷）～ 100（暖）
  tint: number; // 0–100，粉紫色調
  fade: number; // 0–1，提亮暗部（霧面感）
  vignette: number; // 0–1
  grain: number; // 0–1
}

/** 片段上儲存的濾鏡設定：預設濾鏡＋強度＋微調 */
export interface ClipFilter {
  preset: FilterId;
  intensity: number; // 0–1
  brightness: number; // -50～50（%）
  contrast: number;
  saturation: number;
  temperature: number; // -50～50
  vignette: number; // 0～100
  grain: number; // 0～100
}

export const DEFAULT_CLIP_FILTER: ClipFilter = {
  preset: 'none',
  intensity: 1,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  vignette: 0,
  grain: 0,
};

const NEUTRAL: FilterParams = { brightness: 1, contrast: 1, saturate: 1, sepia: 0, grayscale: 0, hue: 0, temperature: 0, tint: 0, fade: 0, vignette: 0, grain: 0 };

export const FILTER_PRESETS: { id: FilterId; name: string; params: Partial<FilterParams> }[] = [
  { id: 'none', name: '原圖', params: {} },
  { id: 'fresh', name: '清新', params: { brightness: 1.06, contrast: 0.98, saturate: 1.12, temperature: -12, fade: 0.05 } },
  { id: 'warm', name: '暖陽', params: { brightness: 1.04, saturate: 1.1, temperature: 30, vignette: 0.15 } },
  { id: 'japan', name: '日系', params: { brightness: 1.1, contrast: 0.88, saturate: 0.85, temperature: -6, fade: 0.16 } },
  { id: 'vintage', name: '復古', params: { sepia: 0.35, contrast: 1.05, saturate: 0.85, fade: 0.12, grain: 0.3, vignette: 0.3 } },
  { id: 'film', name: '膠片', params: { contrast: 1.1, saturate: 0.95, temperature: 10, grain: 0.4, fade: 0.08, vignette: 0.2 } },
  { id: 'mono', name: '黑白', params: { grayscale: 1, contrast: 1.15 } },
  { id: 'punchy', name: '高對比', params: { contrast: 1.25, saturate: 1.2 } },
  { id: 'cool', name: '冷調', params: { temperature: -28, contrast: 1.1, saturate: 0.9 } },
  { id: 'food', name: '美食', params: { saturate: 1.3, temperature: 18, brightness: 1.05, contrast: 1.05 } },
  { id: 'night', name: '夜景', params: { contrast: 1.15, saturate: 1.15, temperature: -16, vignette: 0.3 } },
  { id: 'pastel', name: '粉嫩', params: { brightness: 1.08, saturate: 0.9, tint: 30, fade: 0.12 } },
  { id: 'summer', name: '夏日', params: { saturate: 1.25, brightness: 1.05, hue: -5, temperature: 6 } },
  { id: 'autumn', name: '秋意', params: { sepia: 0.2, temperature: 24, saturate: 1.05 } },
  { id: 'midnight', name: '午夜藍', params: { temperature: -40, contrast: 1.05, saturate: 0.8, vignette: 0.2 } },
  { id: 'noir', name: '黑色電影', params: { grayscale: 0.92, contrast: 1.3, vignette: 0.4, grain: 0.25 } },
  { id: 'teal', name: '藍調', params: { temperature: -35, contrast: 1.12, saturate: 1.15 } },
  { id: 'golden', name: '黃金時刻', params: { temperature: 45, brightness: 1.08, fade: 0.1, vignette: 0.1 } },
  { id: 'sakura', name: '櫻花', params: { tint: 45, brightness: 1.1, saturate: 0.95 } },
  { id: 'matcha', name: '抹茶', params: { hue: -22, saturate: 0.85, temperature: 8, brightness: 1.02 } },
  { id: 'street', name: '街拍', params: { contrast: 1.2, saturate: 0.85, grain: 0.35, vignette: 0.25 } },
  { id: 'cream', name: '奶油', params: { brightness: 1.1, contrast: 0.92, saturate: 0.88, tint: 18, fade: 0.14 } },
  { id: 'cyber', name: '賽博', params: { temperature: -45, saturate: 1.35, contrast: 1.2, hue: 6 } },
  { id: 'forest', name: '森林', params: { hue: -14, saturate: 1.1, contrast: 1.08, temperature: -4 } },
  { id: 'dusk', name: '黃昏', params: { temperature: 38, saturate: 1.15, contrast: 0.95, vignette: 0.2, fade: 0.06 } },
  { id: 'polaroid', name: '拍立得', params: { sepia: 0.18, contrast: 0.9, saturate: 0.8, fade: 0.2, vignette: 0.35, grain: 0.3 } },
  { id: 'arctic', name: '極地', params: { temperature: -55, brightness: 1.05, saturate: 0.75, contrast: 1.05 } },
  { id: 'mocha', name: '摩卡', params: { sepia: 0.25, temperature: 20, contrast: 1.1, saturate: 0.9 } },
  { id: 'neon', name: '霓虹夜', params: { saturate: 1.4, contrast: 1.25, temperature: -20, vignette: 0.3 } },
  { id: 'clear', name: '透徹', params: { contrast: 1.12, saturate: 1.08 } },
];

const presetById = new Map(FILTER_PRESETS.map((p) => [p.id, p]));

/** 把預設濾鏡（依強度內插）和手動微調合併成最終參數 */
export function resolveFilter(f: ClipFilter | undefined): FilterParams | null {
  if (!f) return null;
  const preset = { ...NEUTRAL, ...(presetById.get(f.preset)?.params ?? {}) };
  const k = f.intensity;
  const lerp = (key: keyof FilterParams) => NEUTRAL[key] + (preset[key] - NEUTRAL[key]) * k;
  const p: FilterParams = {
    brightness: lerp('brightness') * (1 + f.brightness / 100),
    contrast: lerp('contrast') * (1 + f.contrast / 100),
    saturate: lerp('saturate') * (1 + f.saturation / 100),
    sepia: lerp('sepia'),
    grayscale: lerp('grayscale'),
    hue: lerp('hue'),
    temperature: lerp('temperature') + f.temperature,
    tint: lerp('tint'),
    fade: lerp('fade'),
    vignette: Math.min(1, lerp('vignette') + f.vignette / 100),
    grain: Math.min(1, lerp('grain') + f.grain / 100),
  };
  const isNeutral = (Object.keys(NEUTRAL) as (keyof FilterParams)[]).every((key) => Math.abs(p[key] - NEUTRAL[key]) < 0.001);
  return isNeutral ? null : p;
}

/** canvas 的 CSS 濾鏡字串（亮度、對比、飽和、褐色、灰階、色相） */
export function filterCss(p: FilterParams | null) {
  if (!p) return '';
  const parts: string[] = [];
  if (p.brightness !== 1) parts.push(`brightness(${p.brightness.toFixed(3)})`);
  if (p.contrast !== 1) parts.push(`contrast(${p.contrast.toFixed(3)})`);
  if (p.saturate !== 1) parts.push(`saturate(${p.saturate.toFixed(3)})`);
  if (p.sepia) parts.push(`sepia(${p.sepia.toFixed(3)})`);
  if (p.grayscale) parts.push(`grayscale(${p.grayscale.toFixed(3)})`);
  if (p.hue) parts.push(`hue-rotate(${p.hue.toFixed(1)}deg)`);
  return parts.join(' ');
}

let grainTile: HTMLCanvasElement | null = null;
function grain() {
  if (grainTile) return grainTile;
  grainTile = document.createElement('canvas');
  grainTile.width = grainTile.height = 160;
  const g = grainTile.getContext('2d')!;
  const img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return grainTile;
}

/** CSS 濾鏡做不到的部分：色溫、色調、霧面、暗角、顆粒，以疊加層畫在影像範圍內 */
export function drawFilterOverlays(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: FilterParams | null, time = 0) {
  if (!p) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (p.temperature) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = Math.min(1, Math.abs(p.temperature) / 70);
    ctx.fillStyle = p.temperature > 0 ? '#ff9a3c' : '#3c8cff';
    ctx.fillRect(x, y, w, h);
  }
  if (p.tint) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = Math.min(1, p.tint / 80);
    ctx.fillStyle = '#ff6fae';
    ctx.fillRect(x, y, w, h);
  }
  if (p.fade) {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(1, p.fade * 2);
    ctx.fillStyle = 'rgb(70,70,78)';
    ctx.fillRect(x, y, w, h);
  }
  if (p.grain) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = p.grain * 0.45;
    const pattern = ctx.createPattern(grain(), 'repeat')!;
    // 每格畫面錯開位置，顆粒才會「動」起來
    const off = Math.floor(time * 24) * 37;
    pattern.setTransform(new DOMMatrix().translate(off % 160, (off * 3) % 160));
    ctx.fillStyle = pattern;
    ctx.fillRect(x, y, w, h);
  }
  if (p.vignette) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.hypot(w, h) / 2;
    const grad = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${(p.vignette * 0.75).toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

/** 在小畫布上套用濾鏡，給濾鏡選單當縮圖（和實際效果一致） */
export function filterThumbnail(source: CanvasImageSource, sw: number, sh: number, f: ClipFilter, size = 96) {
  const c = document.createElement('canvas');
  const scale = size / Math.max(sw, sh);
  c.width = Math.max(1, Math.round(sw * scale));
  c.height = Math.max(1, Math.round(sh * scale));
  const ctx = c.getContext('2d')!;
  const p = resolveFilter(f);
  ctx.filter = filterCss(p) || 'none';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  ctx.filter = 'none';
  drawFilterOverlays(ctx, 0, 0, c.width, c.height, p);
  return c.toDataURL('image/jpeg', 0.8);
}
