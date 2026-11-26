import { useEffect, useRef } from 'react';
import { BACKDROP_PRESETS, backdropId, drawBackdrop } from '../../lib/backdrop';
import { transformOf } from '../../lib/timeline';
import type { Backdrop } from '../../lib/types';
import { Slider } from '../Inspector';
import { useEditor } from '../store';
import { ensureUnlocked } from '../locks';

function Swatch({ value }: { value: Backdrop | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = value && ref.current?.getContext('2d');
    if (ctx) drawBackdrop(ctx, value, 90, 90);
  }, [value]);
  if (!value) return <div className="h-full w-full bg-gradient-to-br from-[#8a8f99] via-[#c9ccd2] to-[#6b7079] blur-[3px]" />;
  return <canvas ref={ref} width={90} height={90} className="h-full w-full" />;
}

/** 畫面背景：整個專案共用一個，影片沒佔滿畫布時露出來 */
export function BackdropSection() {
  const backdrop = useEditor((s) => s.data.backdrop);
  const clips = useEditor((s) => s.data.clips);
  const { commit, live, checkpoint } = useEditor.getState();
  const current = backdropId(backdrop);
  const scale = clips.length ? Math.round(transformOf(clips[0]).scale * 100) : 100;

  const pick = (value: Backdrop | null) => commit((d) => ({ ...d, backdrop: value ?? undefined }));
  // 影片縮小才露得出背景：一次調整所有主軌片段
  const resize = (percent: number) => {
    if (!ensureUnlocked('main')) return;
    live((d) => ({ ...d, clips: d.clips.map((c) => ({ ...c, transform: { ...transformOf(c), scale: percent / 100 } })) }));
  };

  return (
    <>
      <h2 className="text-sm font-extrabold">背景</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-mute">影片沒有佔滿畫面時露出的部分，整支影片共用。預設是把同一畫面模糊放大。</p>
      <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="背景樣式">
        {BACKDROP_PRESETS.map((p) => {
          const active = current === p.id;
          return (
            <button key={p.id} onClick={() => pick(p.value)} aria-pressed={active} className="group text-center">
              <div className={`aspect-square overflow-hidden rounded-xl border-2 transition ${active ? 'border-brand' : 'border-line group-hover:border-brand/40'}`}>
                <Swatch value={p.value} />
              </div>
              <div className={`mt-1 truncate text-[11px] font-bold ${active ? 'text-brand' : 'text-ink-soft'}`}>{p.name}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-4">
        <Slider label="影片大小" value={scale} min={50} max={100} format={(v) => `${v}%`} onStart={checkpoint} onChange={resize} />
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-mute">縮小所有主軌片段，上下留出放標題和字幕的空間。橫式影片放進直式畫面時，本來就會露出背景。</p>
      </div>
    </>
  );
}
