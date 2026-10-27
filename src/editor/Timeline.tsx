import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { AudioLines, Film, Layers, Lock, LockOpen, Redo2, Smile, SquareSplitHorizontal, Trash2, Type, Undo2, ZoomIn, ZoomOut, Pause, Play } from 'lucide-react';
import type { TrimSide } from '../lib/timeline';
import { clipLength, compactLanes, layoutMain, MIN_CLIP, moveMainClip, overlayEnd, overlayLaneCount, placeOverlayLane, TRACK_LABELS, trackOf } from '../lib/timeline';
import { formatTime } from '../lib/format';
import type { AudioClip, Caption, TrackKey } from '../lib/types';
import { stickerDef, stickerUrl } from '../lib/stickers';
import { useEditor, type SelItem } from './store';
import { IconBtn } from './Editor';

const PAD = 16;
const GUTTER = 96;
const SNAP_PX = 8;

/** 拖曳工具：第一次移動才寫入復原點，單純點擊不會產生歷史紀錄 */
function useDrag() {
  const zoom = useEditor((s) => s.zoom);
  return (e: RPointerEvent, onMove: (dt: number) => void, onEnd?: (moved: boolean) => void) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const x0 = e.clientX;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - x0) < 3) return;
      if (!moved) {
        useEditor.getState().checkpoint();
        moved = true;
      }
      onMove((ev.clientX - x0) / zoom);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onEnd?.(moved);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
}

/** 向左／向右裁剪的圖示：中間那條是播放頭，虛線那半邊是會被剪掉的部分 */
function TrimIcon({ side }: { side: TrimSide }) {
  const cut = side === 'left' ? 'M3 6.5h9v11H3z' : 'M12 6.5h9v11h-9z';
  const keep = side === 'left' ? 'M12 6.5h9v11h-9z' : 'M3 6.5h9v11H3z';
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
      <path d={cut} strokeDasharray="2 2.2" strokeWidth={1.6} />
      <path d={keep} fill="currentColor" fillOpacity={0.45} />
      <path d="M12 2.5v19" strokeLinecap="round" strokeWidth={2.2} />
    </svg>
  );
}

export function Timeline({ height, seek, split, trim, remove, togglePlay }: { height: number; seek: (t: number) => void; split: () => void; trim: (side: TrimSide) => void; remove: () => void; togglePlay: () => void }) {
  const data = useEditor((s) => s.data);
  const zoom = useEditor((s) => s.zoom);
  const time = useEditor((s) => s.time);
  const playing = useEditor((s) => s.playing);
  const selected = useEditor((s) => s.selected);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const junction = useEditor((s) => s.junction);
  const locks = useEditor((s) => s.data.locks);
  const locked = (t: TrackKey) => !!locks?.[t];
  // 鎖定的軌道：半透明＋斜線底紋，滑鼠顯示禁止符號
  const lockedRow = (t: TrackKey) =>
    locked(t) ? 'bg-[repeating-linear-gradient(135deg,rgb(31_29_43/0.05)_0_6px,transparent_6px_12px)] [&>*]:opacity-55 [&>*]:cursor-not-allowed' : '';
  const { setZoom, select, live, setSelected, toggleSelect } = useEditor.getState();
  const scrollRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const drag = useDrag();
  const [reorder, setReorder] = useState<{ id: string; dx: number } | null>(null);
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const selIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);

  const placed = useMemo(() => layoutMain(data.clips), [data.clips]);
  const media = useMemo(() => new Map(data.media.map((m) => [m.id, m])), [data.media]);
  const x = (t: number) => PAD + t * zoom;
  const width = Math.max((data.duration + 20) * zoom + PAD * 2, 1200);

  // 吸附點：播放頭、片段邊界、字幕邊界
  const snapPoints = (exclude: string | Set<string>) => {
    const skip = (id: string) => (typeof exclude === 'string' ? id === exclude : exclude.has(id));
    const pts = [0, time];
    placed.forEach((c) => pts.push(c.start, c.end));
    data.captions.forEach((c) => !skip(c.id) && pts.push(c.start, c.end));
    data.stickers.forEach((st) => !skip(st.id) && pts.push(st.start, st.end));
    data.overlays.forEach((o) => !skip(o.id) && pts.push(o.start, overlayEnd(o)));
    data.audio.forEach((a) => !skip(a.id) && pts.push(a.start, a.start + clipLength(a)));
    return pts;
  };
  const snap = (t: number, pts: number[]) => {
    const tol = SNAP_PX / zoom;
    let best = t;
    let dist = tol;
    for (const p of pts) if (Math.abs(p - t) < dist) (best = p), (dist = Math.abs(p - t));
    return best;
  };

  // 播放時自動捲動
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const px = x(time);
    if (px > el.scrollLeft + el.clientWidth - 60 || px < el.scrollLeft) el.scrollLeft = px - 80;
  }, [time, playing]);

  const scrub = (e: RPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const toTime = (clientX: number) => Math.max(0, (clientX - rect.left - PAD) / zoom);
    seek(toTime(e.clientX));
    const move = (ev: PointerEvent) => seek(toTime(ev.clientX));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const lanes = useMemo(() => audioLanes(data.audio), [data.audio]);
  const laneCount = Math.max(1, ...lanes.map((l) => l.lane + 1));
  const ovLanes = overlayLaneCount(data.overlays);
  const OV_ROW = 48;
  const OV_TOP = 80;
  const MAIN_TOP = OV_TOP + ovLanes * OV_ROW;
  // 疊加軌畫面上最上面一列是最高層
  const ovRowTop = (lane: number) => OV_TOP + (ovLanes - 1 - lane) * OV_ROW;

  /** 每個項目在軌道區內的位置（框選判斷用）：字幕 0–40、貼紙 40–80、主軌 80–148、音訊從 148 開始 */
  const itemBoxes = () => [
    ...data.captions.map((c) => ({ item: { type: 'caption', id: c.id } as SelItem, x0: x(c.start), x1: x(c.end), y0: 5, y1: 35 })),
    ...data.stickers.map((st) => ({ item: { type: 'sticker', id: st.id } as SelItem, x0: x(st.start), x1: x(st.end), y0: 45, y1: 75 })),
    ...data.overlays.map((o) => ({ item: { type: 'overlay', id: o.id } as SelItem, x0: x(o.start), x1: x(overlayEnd(o)), y0: ovRowTop(o.lane) + 5, y1: ovRowTop(o.lane) + 43 })),
    ...placed.map((c) => ({ item: { type: 'clip', id: c.id } as SelItem, x0: x(c.start), x1: x(c.end), y0: MAIN_TOP + 6, y1: MAIN_TOP + 62 })),
    ...lanes.map(({ clip: a, lane }) => ({ item: { type: 'audio', id: a.id } as SelItem, x0: x(a.start), x1: x(a.start + clipLength(a)), y0: MAIN_TOP + 72 + lane * 40, y1: MAIN_TOP + 106 + lane * 40 })),
  ];

  // 在空白處拖曳＝框選（按住 Shift／⌘ 可以加選）；單純點一下＝移動播放頭並取消選取
  const onBackground = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const tracks = tracksRef.current!;
    const r0 = tracks.getBoundingClientRect();
    const p0 = { x: e.clientX - r0.left, y: e.clientY - r0.top };
    const base = e.shiftKey || e.metaKey || e.ctrlKey ? useEditor.getState().selected : [];
    const boxes = itemBoxes();
    let moved = false;
    const move = (ev: PointerEvent) => {
      const sc = scrollRef.current!;
      const sr = sc.getBoundingClientRect();
      if (ev.clientX > sr.right - 30) sc.scrollLeft += 20;
      if (ev.clientX < sr.left + 30) sc.scrollLeft -= 20;
      const r = tracks.getBoundingClientRect();
      const p1 = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      if (!moved && Math.hypot(p1.x - p0.x, p1.y - p0.y) < 4) return;
      moved = true;
      const box = { left: Math.min(p0.x, p1.x), top: Math.min(p0.y, p1.y), width: Math.abs(p1.x - p0.x), height: Math.abs(p1.y - p0.y) };
      setMarquee(box);
      const hits = boxes
        .filter((b) => !locked(trackOf(b.item.type)))
        .filter((b) => b.x1 > box.left && b.x0 < box.left + box.width && b.y1 > box.top && b.y0 < box.top + box.height)
        .map((b) => b.item);
      setSelected([...base, ...hits.filter((h) => !base.some((s) => s.id === h.id))]);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setMarquee(null);
      if (!moved) {
        if (!base.length) select(null);
        seek(Math.max(0, (p0.x - PAD) / zoom));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /**
   * 按下項目：Shift／⌘ 點選切換加選；已在多選中的項目直接拖曳＝整組一起移動，
   * 沒拖動就只選這一個。回傳 true 代表要繼續處理單一項目的拖曳。
   */
  const press = (e: RPointerEvent, item: SelItem, mode: 'move' | 'left' | 'right') => {
    if (e.button !== 0) return false;
    if (locked(trackOf(item.type))) return false;
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      e.stopPropagation();
      e.preventDefault();
      toggleSelect(item);
      return false;
    }
    const group = useEditor.getState().selected;
    if (mode === 'move' && item.type !== 'clip' && group.length > 1 && group.some((s) => s.id === item.id)) {
      groupMove(e, item, group);
      return false;
    }
    select(item);
    return true;
  };

  // 整組移動：選取中的字幕、貼紙與音訊一起平移（主軌是磁吸排列，不跟著移動）
  const groupMove = (e: RPointerEvent, anchor: SelItem, group: SelItem[]) => {
    const ids = new Set(group.map((g) => g.id));
    const caps = new Map(data.captions.filter((c) => ids.has(c.id)).map((c) => [c.id, c]));
    const stks = new Map(data.stickers.filter((st) => ids.has(st.id)).map((st) => [st.id, st]));
    const ovs = new Map(data.overlays.filter((o) => ids.has(o.id)).map((o) => [o.id, o]));
    const auds = new Map(data.audio.filter((a) => ids.has(a.id)).map((a) => [a.id, a]));
    const minStart = Math.min(
      ...[...caps.values()].map((c) => c.start),
      ...[...stks.values()].map((st) => st.start),
      ...[...ovs.values()].map((o) => o.start),
      ...[...auds.values()].map((a) => a.start),
    );
    const anchorStart = (caps.get(anchor.id) ?? stks.get(anchor.id) ?? ovs.get(anchor.id) ?? auds.get(anchor.id))!.start;
    const pts = snapPoints(ids);
    drag(
      e,
      (dt) => {
        let delta = Math.max(-minStart, dt);
        const snapped = snap(anchorStart + delta, pts);
        if (snapped !== anchorStart + delta && snapped - anchorStart >= -minStart) delta = snapped - anchorStart;
        live((d) => ({
          ...d,
          captions: d.captions.map((c) => (caps.has(c.id) ? { ...c, start: caps.get(c.id)!.start + delta, end: caps.get(c.id)!.end + delta } : c)),
          stickers: d.stickers.map((st) => (stks.has(st.id) ? { ...st, start: stks.get(st.id)!.start + delta, end: stks.get(st.id)!.end + delta } : st)),
          overlays: d.overlays.map((o) => (ovs.has(o.id) ? { ...o, start: ovs.get(o.id)!.start + delta } : o)),
          audio: d.audio.map((a) => (auds.has(a.id) ? { ...a, start: auds.get(a.id)!.start + delta } : a)),
        }));
      },
      (moved) => !moved && select(anchor),
    );
  };

  // ---------- 主軌 ----------
  const startMain = (e: RPointerEvent, id: string, mode: 'move' | 'left' | 'right') => {
    if (!press(e, { type: 'clip', id }, mode)) return;
    const orig = data.clips.find((c) => c.id === id)!;
    const m = media.get(orig.mediaId);
    if (mode === 'move') {
      let lastDx = 0;
      drag(
        e,
        (dt) => {
          lastDx = dt * zoom;
          setReorder({ id, dx: lastDx });
        },
        (moved) => {
          setReorder(null);
          if (!moved) return;
          const p = placed.find((c) => c.id === id)!;
          const center = (p.start + p.end) / 2 + lastDx / zoom;
          const to = placed.filter((c) => c.id !== id && (c.start + c.end) / 2 < center).length;
          live((d) => moveMainClip(d, p.index, to));
        },
      );
      return;
    }
    const isImage = m?.kind === 'image';
    drag(e, (dt) =>
      live((d) => ({
        ...d,
        clips: d.clips.map((c) => {
          if (c.id !== id) return c;
          if (isImage) return { ...c, out: Math.max(0.3, Math.min(600, orig.out + (mode === 'left' ? -dt : dt))) };
          if (mode === 'left') return { ...c, in: Math.max(0, Math.min(orig.out - MIN_CLIP, orig.in + dt * orig.speed)) };
          return { ...c, out: Math.min(m?.duration ?? orig.out, Math.max(orig.in + MIN_CLIP, orig.out + dt * orig.speed)) };
        }),
      })),
    );
  };

  // ---------- 疊加軌 ----------
  const startOverlay = (e: RPointerEvent, id: string, mode: 'move' | 'left' | 'right') => {
    if (!press(e, { type: 'overlay', id }, mode)) return;
    const orig = data.overlays.find((o) => o.id === id)!;
    const m = media.get(orig.mediaId);
    const isImage = m?.kind === 'image';
    const max = isImage ? 600 : (m?.duration ?? orig.out);
    const len = clipLength(orig);
    const pts = snapPoints(id);
    if (mode !== 'move') {
      drag(e, (dt) =>
        live((d) => ({
          ...d,
          overlays: d.overlays.map((o) => {
            if (o.id !== id) return o;
            if (mode === 'left') {
              const startT = snap(orig.start + dt, pts);
              const inPt = isImage
                ? orig.in
                : Math.max(0, Math.min(orig.out - MIN_CLIP * orig.speed, orig.in + (startT - orig.start) * orig.speed));
              const start = isImage ? Math.min(orig.start + len - MIN_CLIP, Math.max(0, startT)) : orig.start + (inPt - orig.in) / orig.speed;
              return { ...o, in: inPt, start, out: isImage ? orig.out - (start - orig.start) : o.out };
            }
            const endT = snap(orig.start + len + dt, pts);
            return { ...o, out: Math.min(max, Math.max(orig.in + MIN_CLIP * orig.speed, orig.in + (endT - orig.start) * orig.speed)) };
          }),
        })),
      );
      return;
    }
    // 移動：同時追蹤水平（時間）與垂直（層級）
    e.stopPropagation();
    e.preventDefault();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
      if (!moved) {
        useEditor.getState().checkpoint();
        moved = true;
      }
      let start = Math.max(0, orig.start + (ev.clientX - x0) / zoom);
      const s1 = snap(start, pts);
      const s2 = snap(start + len, pts) - len;
      start = Math.max(0, s1 !== start ? s1 : s2 !== start ? s2 : start);
      // 往上拖＝升一層，可以拖到最上面新開一層
      const lane = Math.max(0, Math.min(ovLanes, orig.lane - Math.round((ev.clientY - y0) / OV_ROW)));
      live((d) => ({ ...d, overlays: d.overlays.map((o) => (o.id === id ? { ...o, start, lane } : o)) }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // 放開時：撞到同層的片段就插入新的一層，並收掉中間變空的層
      if (moved)
        useEditor.getState().live((d) => {
          const cur = d.overlays.find((o) => o.id === id);
          return { ...d, overlays: cur ? placeOverlayLane(d.overlays, id, cur.lane, orig.lane) : compactLanes(d.overlays) };
        });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ---------- 音訊 ----------
  const startAudio = (e: RPointerEvent, id: string, mode: 'move' | 'left' | 'right') => {
    if (!press(e, { type: 'audio', id }, mode)) return;
    const orig = data.audio.find((a) => a.id === id)!;
    const max = media.get(orig.mediaId)?.duration ?? orig.out;
    const len = clipLength(orig);
    const pts = snapPoints(id);
    drag(e, (dt) =>
      live((d) => ({
        ...d,
        audio: d.audio.map((a) => {
          if (a.id !== id) return a;
          if (mode === 'move') {
            let start = Math.max(0, orig.start + dt);
            const sEnd = snap(start + len, pts);
            start = snap(start, pts) !== start ? snap(start, pts) : sEnd !== start + len ? sEnd - len : start;
            return { ...a, start: Math.max(0, start) };
          }
          if (mode === 'left') {
            const startT = snap(orig.start + dt, pts);
            const inPt = Math.max(0, Math.min(orig.out - MIN_CLIP, orig.in + (startT - orig.start)));
            return { ...a, in: inPt, start: orig.start + (inPt - orig.in) };
          }
          const endT = snap(orig.start + len + dt, pts);
          return { ...a, out: Math.min(max, Math.max(orig.in + MIN_CLIP, orig.out + (endT - orig.start - len))) };
        }),
      })),
    );
  };

  // ---------- 字幕與貼紙（都是有開始、結束時間的區段） ----------
  const startSpan = (e: RPointerEvent, kind: 'caption' | 'sticker', id: string, mode: 'move' | 'left' | 'right') => {
    if (!press(e, { type: kind, id }, mode)) return;
    const key = kind === 'caption' ? 'captions' : 'stickers';
    const orig = (data[key] as { id: string; start: number; end: number }[]).find((c) => c.id === id)!;
    const len = orig.end - orig.start;
    const pts = snapPoints(id);
    drag(e, (dt) =>
      live((d) => ({
        ...d,
        [key]: (d[key] as { id: string; start: number; end: number }[]).map((c) => {
          if (c.id !== id) return c;
          if (mode === 'move') {
            let start = Math.max(0, orig.start + dt);
            const s1 = snap(start, pts);
            const s2 = snap(start + len, pts) - len;
            start = s1 !== start ? s1 : s2 !== start ? s2 : start;
            return { ...c, start: Math.max(0, start), end: Math.max(0, start) + len };
          }
          if (mode === 'left') return { ...c, start: Math.max(0, Math.min(orig.end - MIN_CLIP, snap(orig.start + dt, pts))) };
          return { ...c, end: Math.max(orig.start + MIN_CLIP, snap(orig.end + dt, pts)) };
        }),
      })),
    );
  };

  return (
    <section className="flex shrink-0 flex-col border-t border-line bg-surface select-none" style={{ height }}>
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-3">
        <IconBtn label={playing ? '暫停（空白鍵）' : '播放（空白鍵）'} onClick={togglePlay}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </IconBtn>
        <span className="mx-1 h-5 w-px bg-line" />
        <IconBtn label="復原上一步（⌘Z）" onClick={undo} disabled={!canUndo}>
          <Undo2 className="size-4" />
        </IconBtn>
        <IconBtn label="重做（⇧⌘Z）" onClick={redo} disabled={!canRedo}>
          <Redo2 className="size-4" />
        </IconBtn>
        <span className="mx-1 h-5 w-px bg-line" />
        <IconBtn label="分割（⌘B）" onClick={split}>
          <SquareSplitHorizontal className="size-4" />
        </IconBtn>
        <IconBtn label="向左裁剪：剪掉播放頭左邊（Q）" onClick={() => trim('left')}>
          <TrimIcon side="left" />
        </IconBtn>
        <IconBtn label="向右裁剪：剪掉播放頭右邊（W）" onClick={() => trim('right')}>
          <TrimIcon side="right" />
        </IconBtn>
        <IconBtn label="刪除（Delete）" onClick={remove} disabled={!selected.length}>
          <Trash2 className="size-4" />
        </IconBtn>
        {selected.length > 1 ? (
          <span className="ml-3 flex items-center gap-2 text-xs font-bold text-brand">
            已選取 {selected.length} 個項目
            <button className="rounded-md px-1.5 py-0.5 font-semibold text-ink-mute hover:bg-sunken hover:text-ink" onClick={() => select(null)}>
              取消選取
            </button>
          </span>
        ) : (
          <span className="ml-3 text-xs text-ink-mute">在空白處拖曳可框選多個項目，按住 Shift 點選可加選</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <IconBtn label="縮小" onClick={() => setZoom(zoom / 1.4)}>
            <ZoomOut className="size-4" />
          </IconBtn>
          <input type="range" min={8} max={400} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-28" aria-label="時間軸縮放" />
          <IconBtn label="放大" onClick={() => setZoom(zoom * 1.4)}>
            <ZoomIn className="size-4" />
          </IconBtn>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* 軌道名稱：上方留時間尺的高度（時間尺固定不捲動），下面跟著軌道一起上下捲動 */}
        <div className="flex w-[96px] shrink-0 flex-col border-r border-line bg-canvas text-[11px] font-bold text-ink-soft" style={{ width: GUTTER }}>
          <div className="h-7 shrink-0 border-b border-line bg-surface" />
          <div ref={labelsRef} className="min-h-0 flex-1 overflow-hidden">
          <TrackLabel track="caption" locked={locked('caption')} icon={<Type className="size-3.5" />} label="字幕" h="h-10" />
          <TrackLabel track="sticker" locked={locked('sticker')} icon={<Smile className="size-3.5" />} label="貼紙" h="h-10" />
          {Array.from({ length: ovLanes }, (_, i) => ovLanes - i).map((n) => (
            <TrackLabel key={n} track="overlay" locked={locked('overlay')} icon={<Layers className="size-3.5" />} label={`疊加${ovLanes > 1 ? n : ''}`} h="h-12" />
          ))}
          <TrackLabel track="main" locked={locked('main')} icon={<Film className="size-3.5" />} label="主軌" h="h-[68px]" />
          <TrackLabel track="audio" locked={locked('audio')} icon={<AudioLines className="size-3.5" />} label="音訊" h="" style={{ height: laneCount * 40 + 8 }} />
            {/* 右邊有水平捲軸佔掉高度，這裡多留一點，捲到最底時名稱仍然對齊 */}
            <div className="h-5" aria-hidden />
          </div>
        </div>
        <div
          ref={scrollRef}
          className="relative min-w-0 flex-1 overflow-auto"
          onScroll={(e) => {
            if (labelsRef.current) labelsRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9));
            }
          }}
        >
          <div className="relative" style={{ width }}>
            <Ruler width={width} zoom={zoom} onPointerDown={scrub} />
            <div ref={tracksRef} className="relative" onPointerDown={onBackground}>
              {/* 字幕軌 */}
              <div className={`relative h-10 border-b border-line/60 ${lockedRow('caption')}`}>
                {data.captions.map((c) => (
                  <CaptionBlock key={c.id} c={c} left={x(c.start)} width={(c.end - c.start) * zoom} selected={selIds.has(c.id)} onDown={(e, mode) => startSpan(e, 'caption', c.id, mode)} />
                ))}
              </div>
              {/* 貼紙軌 */}
              <div className={`relative h-10 border-b border-line/60 ${lockedRow('sticker')}`}>
                {data.stickers.map((st) => {
                  const def = stickerDef(st.stickerId);
                  return (
                    <Block
                      key={st.id}
                      left={x(st.start)}
                      width={(st.end - st.start) * zoom}
                      top={5}
                      height={30}
                      selected={selIds.has(st.id)}
                      className="border-track-sticker-edge bg-track-sticker"
                      onDown={(e, mode) => startSpan(e, 'sticker', st.id, mode)}
                    >
                      {def && <img src={stickerUrl(def)} alt="" className="mr-1 size-5 shrink-0" draggable={false} />}
                      <span className="truncate text-[11px] font-bold text-[#8a6100]">{def?.name ?? '貼紙'}</span>
                    </Block>
                  );
                })}
              </div>
              {/* 疊加軌：最上面一列是最高層 */}
              <div className={`relative border-b border-line/60 ${lockedRow('overlay')}`} style={{ height: ovLanes * OV_ROW }}>
                {data.overlays.length === 0 && (
                  <div className="absolute inset-y-1.5 left-4 grid w-80 place-items-center rounded-xl border-2 border-dashed border-line text-xs font-semibold text-ink-mute">
                    在素材按「疊加」，影片就會疊在主軌上方
                  </div>
                )}
                {Array.from({ length: ovLanes - 1 }, (_, i) => (
                  <div key={i} className="pointer-events-none absolute inset-x-0 border-b border-dashed border-line/60" style={{ top: (i + 1) * OV_ROW }} />
                ))}
                {data.overlays.map((o) => {
                  const m = media.get(o.mediaId);
                  return (
                    <Block
                      key={o.id}
                      left={x(o.start)}
                      width={clipLength(o) * zoom}
                      top={ovRowTop(o.lane) - OV_TOP + 5}
                      height={38}
                      selected={selIds.has(o.id)}
                      className="border-track-overlay-edge bg-track-overlay"
                      style={m?.thumb ? { backgroundImage: `url(${m.thumb})`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' } : undefined}
                      onDown={(e, mode) => startOverlay(e, o.id, mode)}
                    >
                      <span className="truncate rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-bold text-ink">
                        {o.speed !== 1 && `${o.speed}x · `}
                        {formatTime(clipLength(o))} {m?.name}
                      </span>
                    </Block>
                  );
                })}
              </div>
              {/* 主軌 */}
              <div className={`relative h-[68px] border-b border-line/60 bg-canvas/50 ${lockedRow('main')}`}>
                {placed.length === 0 && <div className="absolute inset-y-2 left-4 grid w-72 place-items-center rounded-xl border-2 border-dashed border-line text-xs font-semibold text-ink-mute">把素材加進來開始剪輯</div>}
                {placed.map((c) => {
                  const m = media.get(c.mediaId);
                  const dx = reorder?.id === c.id ? reorder.dx : 0;
                  return (
                    <Block
                      key={c.id}
                      left={x(c.start) + dx}
                      width={(c.end - c.start) * zoom}
                      top={6}
                      height={56}
                      selected={selIds.has(c.id)}
                      className={`border-track-video-edge bg-track-video ${dx ? 'z-20 opacity-80 shadow-pop' : ''}`}
                      style={m?.thumb ? { backgroundImage: `url(${m.thumb})`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' } : undefined}
                      onDown={(e, mode) => startMain(e, c.id, mode)}
                    >
                      <span className="truncate rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-bold text-ink">
                        {c.speed !== 1 && `${c.speed}x · `}
                        {formatTime(c.end - c.start)} {m?.name}
                      </span>
                    </Block>
                  );
                })}
                {/* 轉場接點：兩段之間的 ◇，點了到「轉場」分頁設定 */}
                {placed.slice(1).map((c) => {
                  const mid = c.start + c.overlap / 2;
                  const on = !!c.transition;
                  const active = junction === c.id;
                  return (
                    <div key={`j-${c.id}`}>
                      {c.overlap > 0 && (
                        <div
                          className="pointer-events-none absolute top-[6px] z-[15] h-[56px] rounded-md bg-brand/20 ring-1 ring-brand/40"
                          style={{ left: x(c.start), width: c.overlap * zoom }}
                        />
                      )}
                      <button
                        title={on ? '轉場（點擊編輯）' : '加入轉場'}
                        aria-label={on ? '編輯轉場' : '加入轉場'}
                        onPointerDown={(e) => e.stopPropagation()}
                        disabled={locked('main')}
                        onClick={() => useEditor.getState().setJunction(c.id)}
                        className={`absolute top-[22px] z-30 grid size-6 -translate-x-1/2 rotate-45 place-items-center rounded-md border-2 shadow-card transition hover:scale-110 ${
                          active ? 'border-brand bg-brand text-white ring-2 ring-brand/40' : on ? 'border-brand bg-brand text-white' : 'border-ink-mute/40 bg-surface text-ink-soft'
                        }`}
                        style={{ left: x(mid) }}
                      >
                        <span className="-rotate-45 text-[11px] leading-none font-black">{on ? '⇄' : '+'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
              {/* 音訊軌 */}
              <div className={`relative ${lockedRow('audio')}`} style={{ height: laneCount * 40 + 8 }}>
                {lanes.map(({ clip: a, lane }) => {
                  const m = media.get(a.mediaId);
                  return (
                    <Block
                      key={a.id}
                      left={x(a.start)}
                      width={clipLength(a) * zoom}
                      top={4 + lane * 40}
                      height={34}
                      selected={selIds.has(a.id)}
                      className="border-track-audio-edge bg-track-audio"
                      onDown={(e, mode) => startAudio(e, a.id, mode)}
                    >
                      <Wave />
                      <span className="relative truncate text-[10px] font-bold text-[#0d6b52]">{m?.origin === 'tts' ? '🗣 ' : '♪ '}{m?.name}</span>
                    </Block>
                  );
                })}
              </div>
              {marquee && <div className="pointer-events-none absolute z-40 rounded-md border border-brand bg-brand/10" style={marquee} />}
            </div>
            {/* 播放頭 */}
            <div className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-coral" style={{ left: x(time) }}>
              <div className="absolute -top-0 -left-[6px] h-3 w-[13px] rounded-b-[5px] bg-coral" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );

}

function CaptionBlock({ c, left, width, selected, onDown }: { c: Caption; left: number; width: number; selected: boolean; onDown: (e: RPointerEvent, mode: 'move' | 'left' | 'right') => void }) {
  return (
    <Block left={left} width={width} top={5} height={30} selected={selected} className="border-track-caption-edge bg-track-caption" onDown={onDown}>
      <span className="truncate text-[11px] font-bold text-[#b2432a]">{c.text || '（空白字幕）'}</span>
    </Block>
  );
}

function TrackLabel({ track, locked, icon, label, h, style }: { track: TrackKey; locked: boolean; icon: ReactNode; label: string; h: string; style?: React.CSSProperties }) {
  const name = TRACK_LABELS[track];
  return (
    <div className={`group/track flex items-center gap-1.5 border-b border-line/60 pr-1.5 pl-3 ${h} ${locked ? 'text-ink-mute' : ''}`} style={style}>
      {icon}
      <span className="whitespace-nowrap">{label}</span>
      <button
        onClick={() => useEditor.getState().toggleLock(track)}
        title={locked ? `解鎖${name}` : `鎖定${name}`}
        aria-label={locked ? `解鎖${name}` : `鎖定${name}`}
        aria-pressed={locked}
        className={`ml-auto grid size-6 place-items-center rounded-md transition ${
          locked ? 'bg-brand-soft text-brand' : 'text-ink-mute opacity-0 group-hover/track:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100'
        }`}
      >
        {locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
      </button>
    </div>
  );
}

function Block({
  left,
  width,
  top,
  height,
  selected,
  className,
  style,
  children,
  onDown,
}: {
  left: number;
  width: number;
  top: number;
  height: number;
  selected: boolean;
  className: string;
  style?: React.CSSProperties;
  children: ReactNode;
  onDown: (e: RPointerEvent, mode: 'move' | 'left' | 'right') => void;
}) {
  return (
    <div
      className={`group absolute flex cursor-grab items-center overflow-hidden rounded-lg border-2 px-2 active:cursor-grabbing ${className} ${selected ? 'z-10 ring-2 ring-brand ring-offset-1' : ''}`}
      style={{ left, width: Math.max(4, width), top, height, ...style }}
      onPointerDown={(e) => onDown(e, 'move')}
    >
      <span className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize bg-white/0 hover:bg-white/60" onPointerDown={(e) => onDown(e, 'left')} />
      {children}
      <span className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize bg-white/0 hover:bg-white/60" onPointerDown={(e) => onDown(e, 'right')} />
    </div>
  );
}

function Wave() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-40" preserveAspectRatio="none" viewBox="0 0 100 20" aria-hidden>
      <path d="M0 10 Q2 2 4 10 T8 10 T12 10 T16 10 T20 10 T24 10 T28 10 T32 10 T36 10 T40 10 T44 10 T48 10 T52 10 T56 10 T60 10 T64 10 T68 10 T72 10 T76 10 T80 10 T84 10 T88 10 T92 10 T96 10 T100 10" stroke="#19b38a" fill="none" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Ruler({ width, zoom, onPointerDown }: { width: number; zoom: number; onPointerDown: (e: RPointerEvent<HTMLDivElement>) => void }) {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60];
  const major = steps.find((s) => s * zoom >= 70) ?? 120;
  const ticks: number[] = [];
  for (let t = 0; PAD + t * zoom < width; t += major) ticks.push(t);
  return (
    <div className="sticky top-0 z-20 h-7 cursor-pointer border-b border-line bg-surface" onPointerDown={onPointerDown}>
      {ticks.map((t) => (
        <div key={t} className="absolute top-0 h-full" style={{ left: PAD + t * zoom }}>
          <div className="h-2 w-px bg-ink-mute/50" />
          <span className="absolute top-2 -translate-x-1/2 font-mono text-[10px] text-ink-mute">{formatTime(t)}</span>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="absolute top-0 h-1 w-px bg-line" style={{ left: (major * zoom * i) / 5 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** 重疊的音訊片段分到不同列 */
function audioLanes(audio: AudioClip[]) {
  const ends: number[] = [];
  return [...audio]
    .sort((a, b) => a.start - b.start)
    .map((clip) => {
      let lane = ends.findIndex((e) => e <= clip.start + 0.001);
      if (lane < 0) lane = ends.length;
      ends[lane] = clip.start + clipLength(clip);
      return { clip, lane };
    });
}

