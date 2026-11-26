import type { Backdrop } from './types';

/**
 * 畫面背景：影片沒有佔滿畫布時露出的部分。沒有設定時是「同一畫面模糊放大」（引擎原本的做法）；
 * 這裡畫的是使用者另外選的純色、漸層或圓點。
 */

export const BACKDROP_PRESETS: { id: string; name: string; value: Backdrop | null }[] = [
  { id: 'blur', name: '模糊放大', value: null },
  { id: 'black', name: '純黑', value: { style: 'solid', color: '#000000' } },
  { id: 'white', name: '米白', value: { style: 'solid', color: '#f4f1ea' } },
  { id: 'navy-dots', name: '深藍圓點', value: { style: 'dots', color: '#10162e', color2: '#2f3f7a' } },
  { id: 'dark-dots', name: '深灰圓點', value: { style: 'dots', color: '#1b1c20', color2: '#3a3d46' } },
  { id: 'sunset', name: '暖橘漸層', value: { style: 'gradient', color: '#ff9a5a', color2: '#d4425f' } },
  { id: 'ocean', name: '藍紫漸層', value: { style: 'gradient', color: '#2b6cf0', color2: '#5b2bb5' } },
  { id: 'mint', name: '薄荷漸層', value: { style: 'gradient', color: '#b8f0d8', color2: '#4fb59a' } },
];

export const backdropId = (b: Backdrop | undefined) =>
  !b ? 'blur' : BACKDROP_PRESETS.find((p) => p.value && p.value.style === b.style && p.value.color === b.color && p.value.color2 === b.color2)?.id ?? 'custom';

export function drawBackdrop(ctx: CanvasRenderingContext2D, b: Backdrop, W: number, H: number) {
  if (b.style === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
    g.addColorStop(0, b.color);
    g.addColorStop(1, b.color2 ?? b.color);
    ctx.fillStyle = g;
  } else ctx.fillStyle = b.color;
  ctx.fillRect(0, 0, W, H);
  if (b.style !== 'dots') return;
  // 交錯排列的圓點，間距跟著畫面寬度，預覽和匯出看起來一樣
  const gap = W / 22;
  const r = gap * 0.16;
  ctx.fillStyle = b.color2 ?? '#ffffff';
  ctx.beginPath();
  for (let row = 0, y = gap / 2; y < H + gap; row++, y += gap) {
    for (let x = row % 2 ? gap : gap / 2; x < W + gap; x += gap) {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}
