import { MousePointerClick } from 'lucide-react';
import { layoutMain } from '../../lib/timeline';
import type { ProjectData, Transition, TransitionType } from '../../lib/types';
import { Button, useToast } from '../../components/ui';
import { Slider } from '../Inspector';
import { useEditor } from '../store';

const TYPES: { id: TransitionType; label: string; anim: string; flash?: 'white' | 'black' }[] = [
  { id: 'fade', label: '溶解', anim: 'tr-fade' },
  { id: 'flash', label: '閃白', anim: 'tr-swap', flash: 'white' },
  { id: 'dip', label: '閃黑', anim: 'tr-swap', flash: 'black' },
  { id: 'slideLeft', label: '左推', anim: 'tr-slide-left' },
  { id: 'slideRight', label: '右推', anim: 'tr-slide-right' },
  { id: 'slideUp', label: '上推', anim: 'tr-slide-up' },
  { id: 'zoom', label: '拉近', anim: 'tr-zoom' },
  { id: 'blur', label: '模糊', anim: 'tr-blur' },
  { id: 'wipe', label: '擦除', anim: 'tr-wipe' },
  { id: 'circle', label: '圓形展開', anim: 'tr-circle' },
];

const DEFAULT_DURATION = 0.5;

export function TransitionPanel() {
  const toast = useToast();
  const clips = useEditor((s) => s.data.clips);
  const junction = useEditor((s) => s.junction);
  const { commit, live, checkpoint, setJunction } = useEditor.getState();

  const placed = layoutMain(clips);
  const idx = placed.findIndex((c) => c.id === junction && c.index > 0);
  const target = idx > 0 ? placed[idx] : null;
  const junctions = placed.length - 1;
  const current = target?.transition;

  const setFor = (ids: Set<string>, t: Transition | undefined, record = true) => {
    const fn = (d: ProjectData) => ({ ...d, clips: d.clips.map((c, i) => (i > 0 && ids.has(c.id) ? { ...c, transition: t } : c)) });
    record ? commit(fn) : live(fn);
  };
  const allIds = () => new Set(placed.slice(1).map((c) => c.id));

  const pick = (type: TransitionType | null) => {
    const t = type ? { type, duration: current?.duration ?? DEFAULT_DURATION } : undefined;
    if (target) return setFor(new Set([target.id]), t);
    if (!junctions) return toast('主軌至少要有兩個片段才能加轉場', 'error');
    setFor(allIds(), t);
    toast(type ? `已套用到全部 ${junctions} 個接點` : '已移除全部轉場', 'success');
  };

  return (
    <div className="p-4">
      <h2 className="text-sm font-extrabold">轉場</h2>
      <p className="mt-1 text-xs text-ink-mute">讓兩個片段之間的切換更順。轉場時前後兩段會重疊播放。</p>

      <div className="mt-3 rounded-2xl bg-sunken/70 p-3 text-xs">
        {target ? (
          <div className="flex items-center justify-between">
            <span className="font-bold">
              片段 {idx} → 片段 {idx + 1}
            </span>
            <button className="font-semibold text-ink-mute hover:text-ink" onClick={() => setJunction(null)}>
              取消選取
            </button>
          </div>
        ) : (
          <div className="flex gap-2 text-ink-soft">
            <MousePointerClick className="size-4 shrink-0 text-brand" />
            <span>
              點時間軸主軌上兩個片段之間的 <b className="text-brand">◇</b> 來選擇接點。
              {junctions > 0 && <>沒有選擇時，點下方效果會套用到全部 {junctions} 個接點。</>}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Tile label="無" active={!!target && !current} onClick={() => pick(null)} />
        {TYPES.map((t) => (
          <Tile key={t.id} label={t.label} anim={t.anim} flash={t.flash} active={current?.type === t.id} onClick={() => pick(t.id)} />
        ))}
      </div>

      {target && current && (
        <div className="mt-5 space-y-3">
          <Slider
            label="轉場長度"
            value={current.duration}
            min={0.2}
            max={2}
            step={0.1}
            format={(v) => `${v.toFixed(1)} 秒`}
            onStart={checkpoint}
            onChange={(v) => setFor(new Set([target.id]), { ...current, duration: v }, false)}
          />
          {target.overlap + 0.01 < current.duration && (
            <p className="text-[11px] text-ink-mute">片段太短，實際轉場長度為 {target.overlap.toFixed(1)} 秒（最多佔片段的一半）。</p>
          )}
          <Button variant="secondary" size="sm" className="w-full" onClick={() => (setFor(allIds(), current), toast(`已套用到全部 ${junctions} 個接點`, 'success'))}>
            把這個轉場套用到全部接點
          </Button>
        </div>
      )}

      {placed.some((c) => c.index > 0 && c.transition) && (
        <button className="mt-3 w-full rounded-xl py-2 text-xs font-bold text-red-600 hover:bg-red-50" onClick={() => setFor(allIds(), undefined)}>
          移除全部轉場
        </button>
      )}
    </div>
  );
}

function Tile({ label, anim, flash, active, onClick }: { label: string; anim?: string; flash?: 'white' | 'black'; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} data-active={active} className="tr-tile group text-center">
      <div className={`relative aspect-[4/3] overflow-hidden rounded-xl border-2 transition ${active ? 'border-brand' : 'border-transparent group-hover:border-brand/40'}`}>
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#c9d4ff,#a99dff)]" />
        {anim ? (
          <>
            <div className="tr-b absolute inset-0 bg-[linear-gradient(135deg,#ffd9cb,#ff9a7a)]" style={{ animationName: anim }} />
            {flash && <div className="tr-flash absolute inset-0" style={{ animationName: 'tr-flash', background: flash === 'white' ? '#fff' : '#1f1d2b' }} />}
          </>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-lg font-black text-white/90">∅</div>
        )}
      </div>
      <div className={`mt-1 text-[11px] font-bold ${active ? 'text-brand' : 'text-ink-soft'}`}>{label}</div>
    </button>
  );
}
