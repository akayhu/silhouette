import { drawCaption, Engine } from './engine';
import { aspectSize } from './timeline';
import type { Caption, CaptionStyle, ProjectData, VideoCover } from './types';

/**
 * 影片封面：取時間軸上某一格畫面（或一張圖片），疊上封面標題。
 * 用同一套引擎繪製，封面和影片裡的畫面、濾鏡、美肌完全一樣。
 */

/** 封面標題樣式：比字幕大、放在畫面上方 */
export const COVER_PRESETS: { name: string; style: CaptionStyle }[] = [
  { name: '大字白邊', style: { font: 'Noto Sans TC', size: 128, color: '#ffffff', stroke: '#16171b', background: null, bold: true, y: 0.22, x: 0.5, animation: 'none' } },
  { name: '亮黃標題', style: { font: 'Noto Sans TC', size: 128, color: '#ffe14a', stroke: '#16171b', background: null, bold: true, y: 0.22, x: 0.5, animation: 'none' } },
  { name: '紅底白字', style: { font: 'Noto Sans TC', size: 110, color: '#ffffff', stroke: '#16171b', background: 'rgba(212,44,34,0.96)', bold: true, y: 0.2, x: 0.5, animation: 'none' } },
  { name: '白底黑字', style: { font: 'Noto Sans TC', size: 104, color: '#16171b', stroke: '#16171b', background: 'rgba(255,255,255,0.95)', bold: true, y: 0.2, x: 0.5, animation: 'none' } },
  {
    name: '霓虹光暈',
    style: { font: 'Noto Sans TC', size: 128, color: '#ffffff', stroke: '#ff2bd6', background: null, bold: true, y: 0.22, x: 0.5, animation: 'none', shadow: { color: '#ff4fd8', opacity: 1, blur: 60, distance: 0, angle: 90 } },
  },
  { name: '明體雜誌', style: { font: 'Noto Serif TC', size: 120, color: '#ffffff', stroke: '#16171b', background: null, bold: true, y: 0.24, x: 0.5, animation: 'none', shadow: { color: '#000000', opacity: 0.45, blur: 30, distance: 6, angle: 90 } } },
];

export const defaultCover = (): VideoCover => ({ source: 'frame', time: 0, title: '', style: { ...COVER_PRESETS[0].style }, inVideo: false });

/** 匯出時封面在影片開頭顯示多久 */
export const COVER_IN_VIDEO_SECONDS = 0.1;

/**
 * 畫出封面（指定寬高）。frame：用引擎畫出那一格；image：圖片等比例填滿畫面。
 * 回傳一張新的 canvas，可以直接下載、做縮圖，或匯出時放在影片開頭。
 */
export async function renderCover(data: ProjectData, cover: VideoCover, width: number, height: number, opts: { signal?: AbortSignal; watermark?: boolean } = {}): Promise<HTMLCanvasElement> {
  const { signal, watermark = false } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const image = cover.source === 'image' ? data.media.find((m) => m.id === cover.mediaId && m.kind === 'image') : undefined;
  if (image?.url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = image.url;
    await img.decode();
    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.fillStyle = '#16171b';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
  } else {
    // 用引擎畫出那一格（含濾鏡、貼紙、字幕）；放進匯出影片時，免費版照樣有浮水印
    const engine = new Engine(canvas, { speakers: false, watermark });
    try {
      engine.setData({ ...data, cover: undefined });
      await engine.ready(signal);
      await engine.renderAt(Math.min(Math.max(0, cover.time), Math.max(0, engine.duration - 0.01)), signal);
    } finally {
      engine.destroy();
    }
  }
  if (cover.title.trim()) {
    const title: Caption = { id: 'cover-title', start: 0, end: 1, text: cover.title, style: { ...cover.style, animation: 'none' } };
    await document.fonts.load(`900 40px "${cover.style.font}"`).catch(() => []);
    drawCaption(ctx, title, 0.5, width, height, false);
  }
  return canvas;
}

/** 依專案比例決定封面尺寸（短邊 1080） */
export const coverSize = (data: ProjectData) => aspectSize(data.aspect, 1080);

/** 列表用的小縮圖（JPEG data URL） */
export function coverThumb(canvas: HTMLCanvasElement) {
  const c = document.createElement('canvas');
  const scale = 320 / Math.max(canvas.width, canvas.height);
  c.width = Math.round(canvas.width * scale);
  c.height = Math.round(canvas.height * scale);
  c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.75);
}
