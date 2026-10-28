import { useState, type PointerEvent as RPointerEvent } from 'react';
import { Check, X } from 'lucide-react';
import { drawnRect } from '../lib/engine';
import { uid } from '../lib/format';
import { clipAt, layoutMain, transformOf } from '../lib/timeline';
import type { EraseRegion, ProjectData } from '../lib/types';
import { useEditor } from './store';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function updateErase(mediaId: string, fn: (r: EraseRegion[]) => EraseRegion[], record = true) {
  const { commit, live } = useEditor.getState();
  const apply = (d: ProjectData) => ({ ...d, media: d.media.map((m) => (m.id === mediaId ? { ...m, erase: fn(m.erase ?? []) } : m)) });
  record ? commit(apply) : live(apply);
}

/** 預覽畫面上的框選圖層：拖曳空白處新增框，拖曳框移動，右下角縮放 */
export function EraseOverlay({ canvasW, canvasH, cssW }: { canvasW: number; canvasH: number; cssW: number }) {
  const mediaId = useEditor((s) => s.eraseEdit);
  const data = useEditor((s) => s.data);
  const time = useEditor((s) => s.time);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  if (!mediaId) return null;
  const media = data.media.find((m) => m.id === mediaId);
  const placed = layoutMain(data.clips);
  const atHead = clipAt(placed, time);
  const clip = atHead?.mediaId === mediaId ? atHead : placed.find((c) => c.mediaId === mediaId);
  if (!media?.width || !media.height || !clip || !canvasW) return null;

  const { cx, cy, dw, dh } = drawnRect(transformOf(clip), media.width, media.height, canvasW, canvasH);
  const k = cssW / canvasW;
  const frame = { left: (cx - dw / 2) * k, top: (cy - dh / 2) * k, width: dw * k, height: dh * k };
  const regions = media.erase ?? [];

  const toUV = (e: { clientX: number; clientY: number }, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { u: clamp((e.clientX - r.left) / r.width, 0, 1), v: clamp((e.clientY - r.top) / r.height, 0, 1) };
  };

  const track = (onMove: (ev: PointerEvent) => void, onUp?: () => void) => {
    const up = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', up);
      onUp?.();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', up);
  };

  const startDraw = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const el = e.currentTarget;
    const a = toUV(e, el);
    let box = { x: a.u, y: a.v, w: 0, h: 0 };
    track(
      (ev) => {
        const b = toUV(ev, el);
        box = { x: Math.min(a.u, b.u), y: Math.min(a.v, b.v), w: Math.abs(b.u - a.u), h: Math.abs(b.v - a.v) };
        setDraft(box);
      },
      () => {
        setDraft(null);
        if (box.w > 0.01 && box.h > 0.01) updateErase(mediaId, (rs) => [...rs, { id: uid(), ...box, mode: 'blur' }]);
      },
    );
  };

  const startEdit = (e: RPointerEvent, r: EraseRegion, mode: 'move' | 'resize') => {
    e.stopPropagation();
    const el = (e.currentTarget as HTMLElement).closest('[data-frame]') as HTMLElement;
    const a = toUV(e, el);
    let moved = false;
    track((ev) => {
      const b = toUV(ev, el);
      if (!moved) {
        useEditor.getState().checkpoint();
        moved = true;
      }
      const du = b.u - a.u;
      const dv = b.v - a.v;
      updateErase(
        mediaId,
        (rs) =>
          rs.map((x) =>
            x.id !== r.id
              ? x
              : mode === 'move'
                ? { ...x, x: clamp(r.x + du, 0, 1 - r.w), y: clamp(r.y + dv, 0, 1 - r.h) }
                : { ...x, w: clamp(r.w + du, 0.01, 1 - r.x), h: clamp(r.h + dv, 0.01, 1 - r.y) },
          ),
        false,
      );
    });
  };

  const box = (r: { x: number; y: number; w: number; h: number }) => ({
    left: r.x * frame.width,
    top: r.y * frame.height,
    width: r.w * frame.width,
    height: r.h * frame.height,
  });

  return (
    <div className="absolute inset-0 z-20 bg-ink/25">
      <div data-frame className="absolute cursor-crosshair outline-2 outline-dashed outline-white/80" style={frame} onPointerDown={startDraw}>
        {regions.map((r, i) => (
          <div
            key={r.id}
            className="group absolute cursor-move rounded-sm border-2 border-coral bg-coral/15"
            style={box(r)}
            onPointerDown={(e) => startEdit(e, r, 'move')}
          >
            <span className="absolute -top-5 left-0 rounded bg-coral px-1 text-[10px] font-bold text-white">{i + 1}</span>
            <button
              className="absolute -top-2.5 -right-2.5 grid size-5 place-items-center rounded-full bg-white text-ink shadow-card hover:bg-red-50 hover:text-red-600"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => updateErase(mediaId, (rs) => rs.filter((x) => x.id !== r.id))}
              aria-label="刪除這個框"
            >
              <X className="size-3" />
            </button>
            <span className="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-sm border-2 border-coral bg-white" onPointerDown={(e) => startEdit(e, r, 'resize')} />
          </div>
        ))}
        {draft && <div className="pointer-events-none absolute border-2 border-dashed border-white bg-white/20" style={box(draft)} />}
      </div>
      <div className="absolute inset-x-2 top-2 flex items-center gap-2 rounded-xl bg-surface/95 px-3 py-2 text-[11px] font-semibold text-ink shadow-card">
        <span className="flex-1">在畫面上拖曳框出浮水印，框可以拖曳移動、拉右下角調整大小</span>
        <button className="flex items-center gap-1 rounded-lg bg-brand px-2 py-1 font-bold text-white" onClick={() => useEditor.getState().setEraseEdit(null)}>
          <Check className="size-3" /> 完成
        </button>
      </div>
    </div>
  );
}
