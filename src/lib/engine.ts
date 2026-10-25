import type { Caption, ClipTransform, MediaItem, ProjectData, StickerItem, TransitionType } from './types';
import { stickerImage } from './stickers';
import { drawFilterOverlays, filterCss, resolveFilter } from './filters';
import { applyErase } from './erase';
import { activeClips, clipLength, layoutMain, totalDuration, transformOf, type PlacedClip } from './timeline';

interface MediaNode {
  el: HTMLMediaElement;
  gain: GainNode;
}

export interface EngineOptions {
  /** true：聲音送到喇叭（預覽）；false：只送到錄製串流（匯出） */
  speakers: boolean;
  watermark: boolean;
}

const DRIFT_PLAYING = 0.3;
const DRIFT_PAUSED = 0.03;

/**
 * 依時間軸把畫面畫到 canvas、同步各個 <video>/<audio>。
 * 預覽與匯出共用同一套繪製邏輯，所以匯出結果和預覽一致。
 */
export class Engine {
  readonly ctx: CanvasRenderingContext2D;
  readonly audioCtx = new AudioContext();
  readonly recordDest: MediaStreamAudioDestinationNode;
  private data!: ProjectData;
  private placed: PlacedClip[] = [];
  /** 每個影片素材最多兩個播放器（key：素材 id#0／#1），相鄰片段輪流使用，轉場時才能同時播放 */
  private videos = new Map<string, MediaNode>();
  private layers: [HTMLCanvasElement, HTMLCanvasElement] | null = null;
  private audios = new Map<string, MediaNode>();
  private images = new Map<string, HTMLImageElement>();
  private mediaById = new Map<string, MediaItem>();
  /** 按住「比較原圖」時暫時不套用去浮水印 */
  bypassErase = false;
  private raf = 0;
  private clockStartWall = 0;
  private clockStartTime = 0;
  time = 0;
  playing = false;
  duration = 0;
  onTime?: (t: number) => void;
  onEnded?: () => void;

  constructor(readonly canvas: HTMLCanvasElement, private opts: EngineOptions) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.recordDest = this.audioCtx.createMediaStreamDestination();
    // canvas 用到的字型不會自動下載，先載入再重畫
    Promise.all(
      ['800 40px "Noto Sans TC"', '500 40px "Noto Sans TC"', '800 40px "Noto Serif TC"', '800 40px "Plus Jakarta Sans"'].map((f) =>
        document.fonts.load(f, '片刻剪趣字幕Aa').catch(() => []),
      ),
    ).then(() => !this.playing && this.render());
  }

  setBypassErase(on: boolean) {
    this.bypassErase = on;
    if (!this.playing) this.render();
  }

  setWatermark(on: boolean) {
    this.opts.watermark = on;
    if (!this.playing) this.render();
  }

  setData(data: ProjectData) {
    this.data = data;
    this.placed = layoutMain(data.clips);
    this.duration = totalDuration(data);
    const byId = new Map(data.media.map((m) => [m.id, m]));
    this.mediaById = byId;

    for (const c of this.placed) {
      const m = byId.get(c.mediaId);
      const key = slotKey(c);
      if (m?.kind === 'video' && !this.videos.has(key)) this.videos.set(key, this.mediaNode('video', m.url));
    }
    for (const m of data.media) {
      if (m.kind === 'image' && !this.images.has(m.id)) {
        const img = new Image();
        img.src = m.url;
        img.onload = () => !this.playing && this.render();
        this.images.set(m.id, img);
      }
    }
    for (const a of data.audio) {
      const m = byId.get(a.mediaId);
      if (m && !this.audios.has(a.id)) this.audios.set(a.id, this.mediaNode('audio', m.url));
    }
    for (const [id, node] of this.audios) {
      if (!data.audio.some((a) => a.id === id)) {
        node.el.pause();
        node.el.removeAttribute('src');
        this.audios.delete(id);
      }
    }
    if (this.time > this.duration) this.time = this.duration;
    if (!this.playing) this.seek(this.time);
  }

  private mediaNode(kind: 'video' | 'audio', url: string): MediaNode {
    const el = document.createElement(kind);
    el.src = url;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    if (el instanceof HTMLVideoElement) {
      el.playsInline = true;
      el.addEventListener('seeked', () => !this.playing && this.render());
      el.addEventListener('loadeddata', () => !this.playing && this.render());
    }
    const gain = this.audioCtx.createGain();
    this.audioCtx.createMediaElementSource(el).connect(gain);
    gain.connect(this.recordDest);
    if (this.opts.speakers) gain.connect(this.audioCtx.destination);
    return { el, gain };
  }

  async play() {
    if (this.playing) return;
    if (this.time >= this.duration - 0.02) this.time = 0;
    await this.audioCtx.resume();
    this.playing = true;
    this.clockStartWall = performance.now();
    this.clockStartTime = this.time;
    const tick = () => {
      if (!this.playing) return;
      const t = this.clockStartTime + (performance.now() - this.clockStartWall) / 1000;
      if (t >= this.duration) {
        this.time = this.duration;
        this.pause();
        this.render();
        this.onTime?.(this.time);
        this.onEnded?.();
        return;
      }
      this.time = t;
      this.sync();
      this.render();
      this.onTime?.(t);
      this.raf = requestAnimationFrame(tick);
    };
    this.sync();
    this.raf = requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    for (const n of [...this.videos.values(), ...this.audios.values()]) n.el.pause();
  }

  seek(t: number) {
    this.time = Math.max(0, Math.min(t, this.duration));
    if (this.playing) {
      this.clockStartWall = performance.now();
      this.clockStartTime = this.time;
    }
    this.sync();
    this.render();
    this.onTime?.(this.time);
  }

  /** 等到目前畫面所需的影片都可以播放（匯出開始前用） */
  async ready() {
    const waits = [...this.videos.values()].map(
      ({ el }) =>
        new Promise<void>((resolve) => {
          if (el.readyState >= 3) return resolve();
          el.addEventListener('canplay', () => resolve(), { once: true });
          setTimeout(resolve, 8000);
        }),
    );
    await Promise.all(waits);
  }

  private syncNode(node: MediaNode, target: number, rate: number, volume: number) {
    const { el } = node;
    node.gain.gain.value = volume;
    if (el.playbackRate !== rate) el.playbackRate = rate;
    const drift = Math.abs(el.currentTime - target);
    if (this.playing) {
      if (el.paused) {
        el.currentTime = target;
        el.play().catch(() => {});
      } else if (drift > DRIFT_PLAYING) {
        el.currentTime = target;
      }
    } else {
      if (!el.paused) el.pause();
      if (drift > DRIFT_PAUSED) el.currentTime = target;
    }
  }

  private sync() {
    const t = this.time;
    const active = activeClips(this.placed, t);
    const p = transitionProgress(active, t);
    const used = new Set<string>();
    active.forEach((c, i) => {
      const node = this.videos.get(slotKey(c));
      if (!node) return;
      // 轉場中聲音交叉淡化
      const fade = active.length === 2 ? (i === 0 ? 1 - p : p) : 1;
      this.syncNode(node, c.in + (t - c.start) * c.speed, c.speed, c.volume * fade);
      used.add(slotKey(c));
    });
    // 預先把下一段跳到開頭，接續時不會卡
    const next = this.placed.find((c) => c.start > t && c.start - t < 1.2 && !used.has(slotKey(c)));
    if (next) {
      const node = this.videos.get(slotKey(next));
      if (node) {
        if (!node.el.paused) node.el.pause();
        if (!node.el.seeking && Math.abs(node.el.currentTime - next.in) > 0.05) node.el.currentTime = next.in;
        used.add(slotKey(next));
      }
    }
    for (const [key, node] of this.videos) if (!used.has(key) && !node.el.paused) node.el.pause();
    for (const a of this.data.audio) {
      const node = this.audios.get(a.id);
      if (!node) continue;
      const len = clipLength(a);
      const local = t - a.start;
      if (local >= 0 && local < len) {
        const fade = Math.min(1, a.fadeIn ? local / a.fadeIn : 1, a.fadeOut ? (len - local) / a.fadeOut : 1);
        this.syncNode(node, a.in + local, 1, a.volume * Math.max(0, fade));
      } else if (!node.el.paused) node.el.pause();
    }
  }

  render() {
    if (!this.data) return;
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const active = activeClips(this.placed, this.time);
    const sources = active.map((c) => this.frameSource(c));
    // 影片還在跳轉時保留上一格畫面，避免閃白
    if (sources.some((s) => !s)) return;

    ctx.save();
    ctx.fillStyle = '#ece9e2';
    ctx.fillRect(0, 0, W, H);

    if (active.length === 1) {
      this.drawClip(ctx, active[0], sources[0]!, W, H);
    } else if (active.length === 2) {
      // 轉場：兩段各畫到自己的圖層，再依轉場效果合成
      this.layers ??= [document.createElement('canvas'), document.createElement('canvas')];
      const [la, lb] = this.layers.map((l) => {
        if (l.width !== W) l.width = W;
        if (l.height !== H) l.height = H;
        return l;
      });
      this.drawClip(la.getContext('2d')!, active[0], sources[0]!, W, H);
      this.drawClip(lb.getContext('2d')!, active[1], sources[1]!, W, H);
      composite(ctx, la, lb, active[1].transition?.type ?? 'fade', transitionProgress(active, this.time), W, H);
    }

    // 貼紙在影像之上、字幕之下
    for (const st of this.data.stickers ?? []) {
      if (this.time < st.start || this.time >= st.end) continue;
      const img = stickerImage(st.stickerId, () => !this.playing && this.render());
      if (!img) continue;
      const pose = stickerPose(st, this.time, W, H, this.playing);
      ctx.save();
      ctx.globalAlpha = st.opacity * pose.alpha;
      ctx.translate(pose.cx, pose.cy);
      ctx.rotate((pose.rotation * Math.PI) / 180);
      ctx.drawImage(img, -pose.size / 2, -pose.size / 2, pose.size, pose.size);
      ctx.restore();
    }

    for (const c of this.data.captions) {
      if (this.time >= c.start && this.time < c.end) drawCaption(ctx, c, this.time, W, H, this.playing);
    }
    if (this.opts.watermark) drawWatermark(ctx, W, H);
    ctx.restore();
  }

  /** 畫一個片段的畫面：模糊背景＋依畫面設定擺放的影像（含去浮水印） */
  private drawClip(ctx: CanvasRenderingContext2D, clip: PlacedClip, source: { el: CanvasImageSource; size: [number, number] }, W: number, H: number) {
    const [sw, sh] = source.size;
    const tf = transformOf(clip);
    const { cx, cy, dw, dh } = drawnRect(tf, sw, sh, W, H);
    // 去浮水印：以輸出大小處理（不超過原始解析度），預覽與匯出都套用
    let el: CanvasImageSource = source.el;
    const regions = this.mediaById.get(clip.mediaId)?.erase;
    if (regions?.length && !this.bypassErase) {
      el = applyErase(source.el, Math.max(2, Math.round(Math.min(sw, dw))), Math.max(2, Math.round(Math.min(sh, dh))), regions);
    }
    // 濾鏡：CSS 濾鏡處理亮度／對比／飽和等，其餘用疊加層
    const fp = resolveFilter(clip.filter);
    const css = filterCss(fp);
    // 背景：同一畫面放大模糊，避免黑邊
    const cover = Math.max(W / sw, H / sh);
    ctx.save();
    ctx.filter = `blur(${Math.round(W / 24)}px) brightness(0.9) ${css}`;
    ctx.drawImage(el, (W - sw * cover) / 2 - 20, (H - sh * cover) / 2 - 20, sw * cover + 40, sh * cover + 40);
    ctx.filter = css || 'none';
    ctx.translate(cx, cy);
    ctx.rotate((tf.rotation * Math.PI) / 180);
    ctx.drawImage(el, -dw / 2, -dh / 2, dw, dh);
    ctx.filter = 'none';
    drawFilterOverlays(ctx, -dw / 2, -dh / 2, dw, dh, fp, this.time);
    ctx.restore();
  }

  private frameSource(clip: PlacedClip): { el: CanvasImageSource; size: [number, number] } | null {
    const v = this.videos.get(slotKey(clip))?.el as HTMLVideoElement | undefined;
    if (v && v.readyState >= 2 && v.videoWidth) return { el: v, size: [v.videoWidth, v.videoHeight] };
    const img = this.images.get(clip.mediaId);
    if (img?.complete && img.naturalWidth) return { el: img, size: [img.naturalWidth, img.naturalHeight] };
    return null;
  }

  destroy() {
    this.pause();
    for (const n of [...this.videos.values(), ...this.audios.values()]) {
      n.el.removeAttribute('src');
      n.el.load();
    }
    this.videos.clear();
    this.audios.clear();
    this.audioCtx.close().catch(() => {});
  }
}

/**
 * 貼紙在某個時間點的位置、大小、角度。
 * 「彈出」是進場動畫，暫停編輯時直接顯示完整大小；其他動畫是持續的，暫停時也照時間顯示。
 */
export function stickerPose(s: StickerItem, t: number, W: number, H: number, animateEntrance = true) {
  const local = Math.max(0, t - s.start);
  let size = Math.min(W, H) * 0.3 * s.scale;
  let cx = s.x * W;
  let cy = s.y * H;
  let rotation = s.rotation;
  let alpha = 1;
  const wave = (hz: number) => Math.sin(local * Math.PI * 2 * hz);
  switch (s.animation) {
    case 'pop': {
      if (!animateEntrance) break;
      const p = Math.min(1, local / 0.35);
      const back = 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2);
      size *= Math.max(0, back);
      alpha = Math.min(1, p * 2);
      break;
    }
    case 'bounce':
      cy -= Math.abs(wave(1)) * size * 0.14;
      break;
    case 'wobble':
      rotation += wave(1.5) * 10;
      break;
    case 'pulse':
      size *= 1 + 0.08 * wave(1.2);
      break;
    case 'spin':
      rotation += local * 120;
      break;
    case 'float':
      cy += wave(0.5) * size * 0.06;
      cx += Math.cos(local * Math.PI) * size * 0.03;
      break;
  }
  return { cx, cy, size, rotation, alpha };
}

const slotKey = (c: PlacedClip) => `${c.mediaId}#${c.index % 2}`;

/** 轉場進度 0→1（只有兩段重疊時才有意義） */
function transitionProgress(active: PlacedClip[], t: number) {
  if (active.length < 2) return 0;
  const [a, b] = active;
  const span = a.end - b.start;
  return span > 0 ? Math.min(1, Math.max(0, (t - b.start) / span)) : 1;
}

const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/** 依轉場效果把前一段（a）與下一段（b）合成到畫布上 */
function composite(ctx: CanvasRenderingContext2D, a: HTMLCanvasElement, b: HTMLCanvasElement, type: TransitionType, raw: number, W: number, H: number) {
  const p = ease(raw);
  ctx.save();
  switch (type) {
    case 'fade':
      ctx.drawImage(a, 0, 0);
      ctx.globalAlpha = p;
      ctx.drawImage(b, 0, 0);
      break;
    case 'flash':
    case 'dip': {
      ctx.drawImage(raw < 0.5 ? a : b, 0, 0);
      ctx.globalAlpha = 1 - Math.abs(raw - 0.5) * 2;
      ctx.fillStyle = type === 'flash' ? '#ffffff' : '#000000';
      ctx.fillRect(0, 0, W, H);
      break;
    }
    case 'slideLeft':
      ctx.drawImage(a, -p * W, 0);
      ctx.drawImage(b, (1 - p) * W, 0);
      break;
    case 'slideRight':
      ctx.drawImage(a, p * W, 0);
      ctx.drawImage(b, -(1 - p) * W, 0);
      break;
    case 'slideUp':
      ctx.drawImage(a, 0, -p * H);
      ctx.drawImage(b, 0, (1 - p) * H);
      break;
    case 'zoom': {
      const za = 1 + p * 0.6;
      ctx.globalAlpha = 1 - p;
      ctx.drawImage(a, (W - W * za) / 2, (H - H * za) / 2, W * za, H * za);
      const zb = 0.7 + 0.3 * p;
      ctx.globalAlpha = p;
      ctx.drawImage(b, (W - W * zb) / 2, (H - H * zb) / 2, W * zb, H * zb);
      break;
    }
    case 'blur': {
      const r = Math.round(Math.min(W, H) / 25);
      ctx.filter = `blur(${Math.round(Math.sin(Math.PI * raw) * r)}px)`;
      ctx.drawImage(a, 0, 0);
      ctx.globalAlpha = p;
      ctx.drawImage(b, 0, 0);
      break;
    }
    case 'wipe':
      ctx.drawImage(a, 0, 0);
      ctx.beginPath();
      ctx.rect(0, 0, W * p, H);
      ctx.clip();
      ctx.drawImage(b, 0, 0);
      break;
    case 'circle':
      ctx.drawImage(a, 0, 0);
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, Math.hypot(W, H) * 0.5 * p, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(b, 0, 0);
      break;
  }
  ctx.restore();
}

/** 片段畫面在畫布上的中心點與尺寸（預覽的框選圖層也用同一套算法） */
export function drawnRect(tf: ClipTransform, sw: number, sh: number, W: number, H: number) {
  const base = tf.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  return { cx: W / 2 + tf.x * W, cy: H / 2 + tf.y * H, dw: sw * base * tf.scale, dh: sh * base * tf.scale };
}

// ---------- 字幕與浮水印繪製 ----------

const easeOutBack = (x: number) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    lines.push(line);
  }
  return lines;
}

/** animate 為 false（暫停編輯中）時直接顯示完整字幕，方便調整樣式 */
export function drawCaption(ctx: CanvasRenderingContext2D, c: Caption, t: number, W: number, H: number, animate = true) {
  const s = c.style;
  const scale = Math.min(W, H) / 1080;
  const size = s.size * scale;
  const local = animate ? t - c.start : c.end - c.start;
  const p = Math.min(1, local / 0.28);
  let text = c.text;
  let alpha = 1;
  let zoom = 1;
  let dy = 0;
  if (s.animation === 'fade') alpha = p;
  if (s.animation === 'pop') zoom = 0.55 + 0.45 * easeOutBack(p);
  if (s.animation === 'slide') {
    dy = (1 - p) * size * 0.8;
    alpha = p;
  }
  if (s.animation === 'typewriter') {
    const total = Math.min((c.end - c.start) * 0.7, [...c.text].length * 0.07);
    text = [...c.text].slice(0, Math.ceil([...c.text].length * Math.min(1, local / Math.max(total, 0.01)))).join('');
  }

  ctx.save();
  ctx.font = `${s.bold ? 800 : 500} ${size}px "${s.font}", "Noto Sans TC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrap(ctx, text, W * 0.86);
  const lh = size * 1.28;
  const blockH = lines.length * lh;
  const cy = Math.min(H - blockH / 2 - size * 0.4, Math.max(blockH / 2 + size * 0.4, s.y * H)) + dy;
  ctx.globalAlpha = alpha;
  ctx.translate(W / 2, cy);
  ctx.scale(zoom, zoom);

  if (s.background) {
    const widest = Math.max(...wrap(ctx, c.text, W * 0.86).map((l) => ctx.measureText(l).width));
    const padX = size * 0.45;
    const padY = size * 0.22;
    ctx.fillStyle = s.background;
    ctx.beginPath();
    ctx.roundRect(-widest / 2 - padX, -blockH / 2 - padY, widest + padX * 2, blockH + padY * 2, size * 0.3);
    ctx.fill();
  }
  lines.forEach((line, i) => {
    const y = -blockH / 2 + lh * (i + 0.5);
    if (s.stroke && !s.background) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = s.stroke;
      ctx.strokeText(line, 0, y);
    }
    ctx.fillStyle = s.color;
    ctx.fillText(line, 0, y);
  });
  ctx.restore();
}

function drawWatermark(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const size = Math.min(W, H) * 0.035;
  ctx.save();
  ctx.font = `800 ${size}px "Plus Jakarta Sans", "Noto Sans TC", sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = size * 0.18;
  ctx.strokeStyle = 'rgba(31,29,43,0.55)';
  ctx.strokeText('片刻剪趣', W - size * 0.8, H - size * 0.8);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('片刻剪趣', W - size * 0.8, H - size * 0.8);
  ctx.restore();
}
