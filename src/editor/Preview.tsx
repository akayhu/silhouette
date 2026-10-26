import { useEffect, useRef, useState, type RefObject } from 'react';
import { Loader2, Maximize2, Pause, Play, SkipBack } from 'lucide-react';
import { formatTime } from '../lib/format';
import { clipAt, layoutMain, overlayEnd, overlayTransform, transformOf } from '../lib/timeline';
import { EraseOverlay } from './EraseOverlay';
import { captionBox, drawnRect, stickerPose } from '../lib/engine';
import { useEditor } from './store';

export function Preview({
  canvasRef,
  togglePlay,
  seek,
  loading,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  togglePlay: () => void;
  seek: (t: number) => void;
  loading: boolean;
}) {
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const duration = useEditor((s) => s.data.duration);
  const aspect = useEditor((s) => s.data.aspect);
  const empty = useEditor((s) => s.data.clips.length === 0 && s.data.captions.length === 0);
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  // 讓畫布在可用空間內等比例縮放
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 點到字幕就選取並拖曳到想要的位置；靠近水平中央會自動吸附置中。回傳 false 代表沒點到字幕
  const dragCaption = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = useEditor.getState();
    if (st.data.locks?.caption) return false;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const hit = [...st.data.captions].reverse().find((c) => {
      if (st.time < c.start || st.time >= c.end) return false;
      const b = captionBox(c, canvas.width, canvas.height);
      return Math.abs(px - b.cx) < b.w / 2 && Math.abs(py - b.cy) < b.h / 2;
    });
    if (!hit) return false;
    st.select({ type: 'caption', id: hit.id });
    const box = captionBox(hit, canvas.width, canvas.height);
    // 從目前畫出來的位置開始拖（原本的值可能超出可移動範圍）
    const startX = box.cx / canvas.width;
    const startY = box.cy / canvas.height;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
      if (!moved) {
        st.checkpoint();
        moved = true;
      }
      let x = Math.min(box.maxX, Math.max(box.minX, startX + (ev.clientX - x0) / rect.width));
      const y = Math.min(box.maxY, Math.max(box.minY, startY + (ev.clientY - y0) / rect.height));
      if (Math.abs(x - 0.5) < 0.02) x = 0.5;
      useEditor.getState().live((d) => ({ ...d, captions: d.captions.map((c) => (c.id === hit.id ? { ...c, style: { ...c.style, x, y } } : c)) }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return true;
  };

  // 點到貼紙就選取並拖曳它（最上層的優先）；回傳 false 代表沒點到貼紙
  const dragSticker = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (useEditor.getState().data.locks?.sticker) return false;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const st = useEditor.getState();
    const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const hit = [...st.data.stickers].reverse().find((s) => {
      if (st.time < s.start || st.time >= s.end) return false;
      const pose = stickerPose(s, st.time, canvas.width, canvas.height, false);
      return Math.abs(px - pose.cx) < pose.size / 2 && Math.abs(py - pose.cy) < pose.size / 2;
    });
    if (!hit) return false;
    st.select({ type: 'sticker', id: hit.id });
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
      if (!moved) {
        st.checkpoint();
        moved = true;
      }
      const x = Math.min(1, Math.max(0, hit.x + (ev.clientX - x0) / rect.width));
      const y = Math.min(1, Math.max(0, hit.y + (ev.clientY - y0) / rect.height));
      useEditor.getState().live((d) => ({ ...d, stickers: d.stickers.map((s) => (s.id === hit.id ? { ...s, x, y } : s)) }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return true;
  };

  const dragOverlay = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = useEditor.getState();
    if (st.data.locks?.overlay) return false;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const hit = [...st.data.overlays]
      .filter((o) => st.time >= o.start && st.time < overlayEnd(o))
      .sort((a, b) => b.lane - a.lane)
      .find((o) => {
        const m = st.data.media.find((x) => x.id === o.mediaId);
        if (!m?.width || !m.height) return false;
        const r = drawnRect(overlayTransform(o), m.width, m.height, canvas.width, canvas.height);
        return Math.abs(px - r.cx) < r.dw / 2 && Math.abs(py - r.cy) < r.dh / 2;
      });
    if (!hit) return false;
    st.select({ type: 'overlay', id: hit.id });
    const start = overlayTransform(hit);
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
      if (!moved) {
        st.checkpoint();
        moved = true;
      }
      const x = start.x + (ev.clientX - x0) / rect.width;
      const y = start.y + (ev.clientY - y0) / rect.height;
      useEditor.getState().live((d) => ({ ...d, overlays: d.overlays.map((o) => (o.id === hit.id ? { ...o, transform: { ...overlayTransform(o), x, y } } : o)) }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return true;
  };

  // 在預覽上拖曳：移動播放頭所在片段的畫面位置；沒有移動就當作點擊播放／暫停
  const dragFrame = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (dragCaption(e)) return;
    if (dragSticker(e)) return;
    if (dragOverlay(e)) return;
    const st = useEditor.getState();
    // 主軌鎖定時不移動畫面，只保留點一下播放／暫停
    const clip = st.data.locks?.main ? null : clipAt(layoutMain(st.data.clips), st.time);
    const rect = e.currentTarget.getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const start = clip ? transformOf(clip) : null;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!clip || !start) return;
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      if (!moved) {
        st.checkpoint();
        st.select({ type: 'clip', id: clip.id });
        moved = true;
      }
      const snap = (v: number) => (Math.abs(v) < 0.02 ? 0 : v);
      const x = snap(start.x + (ev.clientX - x0) / rect.width);
      const y = snap(start.y + (ev.clientY - y0) / rect.height);
      useEditor.getState().live((d) => ({
        ...d,
        clips: d.clips.map((c) => (c.id === clip.id ? { ...c, transform: { ...transformOf(c), x, y } } : c)),
      }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) togglePlay();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const [aw, ah] = aspect === '9:16' ? [9, 16] : aspect === '16:9' ? [16, 9] : [1, 1];
  const scale = Math.min(box.w / aw, box.h / ah);
  const size = { width: Math.floor(aw * scale), height: Math.floor(ah * scale) };

  return (
    <section className="flex w-[clamp(320px,32vw,520px)] shrink-0 flex-col border-l border-line">
      <div ref={stageRef} className="relative m-4 mb-2 flex-1">
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative overflow-hidden rounded-2xl shadow-pop ring-1 ring-line" style={size}>
            <canvas ref={canvasRef} className="block h-full w-full cursor-move touch-none" onPointerDown={dragFrame} />
            <EraseOverlay canvasW={canvasRef.current?.width ?? 0} canvasH={canvasRef.current?.height ?? 0} cssW={size.width} />
            {empty && !loading && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
                <div className="rounded-2xl bg-surface/90 px-4 py-3 text-sm font-semibold text-ink-soft shadow-card">
                  從左側「素材」上傳影片，
                  <br />
                  加到時間軸就會出現在這裡
                </div>
              </div>
            )}
            {loading && (
              <div className="absolute inset-0 grid place-items-center bg-sunken">
                <Loader2 className="size-6 animate-spin text-ink-mute" />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-3 pb-3">
        <span className="w-20 text-right font-mono text-xs font-semibold text-ink tabular-nums">{formatTime(time, true)}</span>
        <button onClick={() => seek(0)} className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-surface" aria-label="回到開頭">
          <SkipBack className="size-4" />
        </button>
        <button onClick={togglePlay} className="grid size-11 place-items-center rounded-full bg-brand text-white shadow-[0_6px_16px_-6px_rgb(91_76_245/0.8)] transition hover:bg-brand-hover active:scale-95" aria-label={playing ? '暫停' : '播放'}>
          {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="ml-0.5 size-5" fill="currentColor" />}
        </button>
        <button
          onClick={() => canvasRef.current?.requestFullscreen?.()}
          className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-surface"
          aria-label="全螢幕"
        >
          <Maximize2 className="size-4" />
        </button>
        <span className="w-20 font-mono text-xs font-semibold text-ink-mute tabular-nums">{formatTime(duration, true)}</span>
      </div>
    </section>
  );
}
