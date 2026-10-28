import type { EraseRegion } from './types';

/**
 * 去浮水印：把畫面中指定的區域補掉。
 * - blur：高斯模糊
 * - mosaic：馬賽克
 * 每一格畫面即時處理，預覽與匯出共用。
 */

let work: HTMLCanvasElement | null = null;
let scratch: HTMLCanvasElement | null = null;

const canvas = (ref: HTMLCanvasElement | null, w: number, h: number) => {
  const c = ref ?? document.createElement('canvas');
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return c;
};

/** 把 source 畫到 w×h 的工作畫布上並處理各區域，回傳處理後的畫布 */
export function applyErase(source: CanvasImageSource, w: number, h: number, regions: EraseRegion[]): HTMLCanvasElement {
  work = canvas(work, w, h);
  const ctx = work.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, w, h);
  for (const r of regions) {
    const x = Math.max(0, Math.floor(r.x * w));
    const y = Math.max(0, Math.floor(r.y * h));
    const rw = Math.min(w - x, Math.ceil(r.w * w));
    const rh = Math.min(h - y, Math.ceil(r.h * h));
    if (rw < 2 || rh < 2) continue;
    if (r.mode === 'blur') blurRegion(ctx, x, y, rw, rh);
    else mosaicRegion(ctx, x, y, rw, rh);
  }
  return work;
}

function blurRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const pad = Math.ceil(Math.max(w, h) * 0.25) + 4;
  const sx = Math.max(0, x - pad);
  const sy = Math.max(0, y - pad);
  const sw = Math.min(ctx.canvas.width - sx, w + pad * 2);
  const sh = Math.min(ctx.canvas.height - sy, h + pad * 2);
  scratch = canvas(scratch, sw, sh);
  const s = scratch.getContext('2d')!;
  s.clearRect(0, 0, sw, sh);
  s.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.filter = `blur(${Math.max(4, Math.round(Math.min(w, h) / 4))}px)`;
  ctx.drawImage(scratch, sx, sy);
  ctx.restore();
}

function mosaicRegion(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const cell = Math.max(6, Math.round(Math.min(w, h) / 6));
  const tw = Math.max(1, Math.round(w / cell));
  const th = Math.max(1, Math.round(h / cell));
  scratch = canvas(scratch, tw, th);
  const s = scratch.getContext('2d')!;
  s.drawImage(ctx.canvas, x, y, w, h, 0, 0, tw, th);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch, 0, 0, tw, th, x, y, w, h);
  ctx.restore();
}

// ---------- 自動偵測 ----------

const STRONG_EDGE = 60;

/**
 * 燒在畫面上的字幕：每句的字不同，但總是出現在同一條水平帶（通常在下方，少數在上方）。
 * 這些列在「有字的那幾格」裡，強邊緣密度會遠高於畫面其他地方；而每個像素不會每格都有邊緣（字一直在換），
 * 以此和固定不動的 Logo 區分。
 */
function findSubtitleBands(freq: Float32Array, rowDens: Float32Array, W: number, H: number, S: number) {
  // 每一列取邊緣最多的一半畫格做平均（字幕不是每一格都有，句子之間會空白）
  const score = new Float32Array(H);
  const vals = new Float32Array(S);
  for (let y = 0; y < H; y++) {
    for (let s = 0; s < S; s++) vals[s] = rowDens[s * H + y] / W;
    vals.sort();
    let sum = 0;
    for (let s = Math.floor(S / 2); s < S; s++) sum += vals[s];
    score[y] = sum / (S - Math.floor(S / 2));
  }
  const ref = [...score].sort((a, b) => a - b)[Math.floor(H / 2)];
  const thr = Math.max(0.05, ref * 3);
  const allowed = (y: number) => y < H * 0.22 || y > H * 0.5;

  const bands: { y0: number; y1: number; score: number }[] = [];
  let start = -1;
  let gap = 0;
  for (let y = 0; y <= H; y++) {
    const on = y < H && allowed(y) && score[y] > thr;
    if (on) {
      if (start < 0) start = y;
      gap = 0;
    } else if (start >= 0 && ++gap > 2) {
      const y1 = y - gap;
      let sc = 0;
      for (let k = start; k <= y1; k++) sc += score[k];
      bands.push({ y0: start, y1, score: sc / (y1 - start + 1) });
      start = -1;
      gap = 0;
    }
  }

  const out: { x: number; y: number; w: number; h: number; kind: 'subtitle'; score: number }[] = [];
  for (const b of bands) {
    const bh = b.y1 - b.y0 + 1;
    if (bh < H * 0.012 || bh > H * 0.22) continue;
    // 水平範圍：這條帶裡常出現邊緣的欄
    const col = new Float32Array(W);
    let max = 0;
    let strong = 0;
    let stable = 0;
    for (let x = 0; x < W; x++) {
      for (let y = b.y0; y <= b.y1; y++) {
        const f = freq[y * W + x] / S;
        col[x] += f;
        if (f > 0.3) strong++;
        if (f > 0.9) stable++;
      }
      max = Math.max(max, col[x]);
    }
    let x0 = -1;
    let x1 = -1;
    for (let x = 0; x < W; x++)
      if (col[x] > max * 0.12) {
        if (x0 < 0) x0 = x;
        x1 = x;
      }
    if (x0 < 0 || x1 - x0 < W * 0.2) continue;
    // 明顯的邊緣大多每一格都在＝固定不動的文字（交給 Logo 偵測），不是會換句的字幕
    if (strong && stable / strong > 0.5) continue;
    const padY = Math.max(3, bh * 0.3);
    const padX = W * 0.03;
    const y = Math.max(0, b.y0 - padY);
    const xx = Math.max(0, x0 - padX);
    out.push({
      x: xx / W,
      y: y / H,
      w: (Math.min(W, x1 + padX) - xx) / W,
      h: (Math.min(H, b.y1 + padY) - y) / H,
      kind: 'subtitle',
      score: b.score,
    });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ score: _score, ...r }) => r);
}

/**
 * 浮水印的特徵：在整支影片中位置固定、邊緣一直存在，而背景在變動。
 * 取樣多格畫面，找「每一格都有明顯邊緣、且亮度幾乎不變」的像素，合併成框。
 */
export async function detectWatermarks(url: string, from: number, to: number, onProgress?: (p: number) => void) {
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  await new Promise<void>((res, rej) => {
    video.onloadeddata = () => res();
    video.onerror = () => rej(new Error('無法讀取影片'));
  });
  const W = 320;
  const H = Math.round((W * video.videoHeight) / video.videoWidth);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const SAMPLES = 24;
  const n = W * H;
  const sum = new Float32Array(n);
  const sumSq = new Float32Array(n);
  const minEdge = new Float32Array(n).fill(Infinity);
  const gray = new Float32Array(n);
  // 字幕偵測用：每個像素出現強邊緣的次數、每一格每一列的強邊緣數
  const edgeFreq = new Float32Array(n);
  const rowDens = new Float32Array(SAMPLES * H);
  for (let s = 0; s < SAMPLES; s++) {
    const t = from + ((to - from) * (s + 0.5)) / SAMPLES;
    await new Promise<void>((res) => {
      video.onseeked = () => res();
      video.currentTime = Math.min(t, video.duration - 0.05);
    });
    ctx.drawImage(video, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;
    for (let p = 0; p < n; p++) {
      const g = px[p * 4] * 0.299 + px[p * 4 + 1] * 0.587 + px[p * 4 + 2] * 0.114;
      gray[p] = g;
      sum[p] += g;
      sumSq[p] += g * g;
    }
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        const e = Math.abs(gray[p + 1] - gray[p - 1]) + Math.abs(gray[p + W] - gray[p - W]);
        if (e < minEdge[p]) minEdge[p] = e;
        if (e > STRONG_EDGE) {
          edgeFreq[p]++;
          rowDens[s * H + y]++;
        }
      }
    onProgress?.((s + 1) / SAMPLES);
  }
  video.removeAttribute('src');

  // 候選像素：每一格都有邊緣（minEdge 高）且亮度變化小
  const cand = new Uint8Array(n);
  let staticCount = 0;
  for (let p = 0; p < n; p++) {
    const mean = sum[p] / SAMPLES;
    const std = Math.sqrt(Math.max(0, sumSq[p] / SAMPLES - mean * mean));
    if (std < 4) staticCount++;
    if (minEdge[p] > 28 && minEdge[p] !== Infinity && std < 12) cand[p] = 1;
  }
  const mostlyStatic = staticCount / n > 0.6;

  // 膨脹，把文字的筆畫連成一塊
  const R = 4;
  const grown = new Uint8Array(n);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!cand[y * W + x]) continue;
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < H && xx >= 0 && xx < W) grown[yy * W + xx] = 1;
        }
    }

  // 連通區塊 → 外框
  const label = new Int32Array(n).fill(-1);
  const boxes: { x0: number; y0: number; x1: number; y1: number; hits: number }[] = [];
  for (let p = 0; p < n; p++) {
    if (!grown[p] || label[p] >= 0) continue;
    const id = boxes.length;
    const box = { x0: W, y0: H, x1: 0, y1: 0, hits: 0 };
    const stack = [p];
    label[p] = id;
    while (stack.length) {
      const q = stack.pop()!;
      const x = q % W;
      const y = (q - x) / W;
      box.x0 = Math.min(box.x0, x);
      box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x);
      box.y1 = Math.max(box.y1, y);
      if (cand[q]) box.hits++;
      for (const nq of [q - 1, q + 1, q - W, q + W]) {
        if (nq < 0 || nq >= n || label[nq] >= 0 || !grown[nq]) continue;
        if ((nq === q - 1 && x === 0) || (nq === q + 1 && x === W - 1)) continue;
        label[nq] = id;
        stack.push(nq);
      }
    }
    boxes.push(box);
  }

  const subtitles = findSubtitleBands(edgeFreq, rowDens, W, H, SAMPLES);
  const insideBand = (b: { x0: number; y0: number; x1: number; y1: number }) =>
    subtitles.some((r) => (b.y0 + b.y1) / 2 / H > r.y && (b.y0 + b.y1) / 2 / H < r.y + r.h);

  const logos = boxes
    .map((b) => ({ ...b, area: (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) }))
    .filter((b) => !insideBand(b))
    .filter((b) => b.area > n * 0.0008 && b.area < n * 0.12 && b.hits > 12)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5)
    .map((b) => ({
      x: Math.max(0, (b.x0 - 2) / W),
      y: Math.max(0, (b.y0 - 2) / H),
      w: Math.min(1, (b.x1 - b.x0 + 5) / W),
      h: Math.min(1, (b.y1 - b.y0 + 5) / H),
      kind: 'logo' as const,
    }));
  return { regions: [...logos, ...subtitles], mostlyStatic };
}
