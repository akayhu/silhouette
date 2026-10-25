import type { ReactNode } from 'react';
import { AudioLines, Film, MousePointerClick, RotateCcw, Trash2, Type } from 'lucide-react';
import { aspectSize, clipLength, DEFAULT_TRANSFORM, layoutMain, removeItems, removeMainClip, transformOf } from '../lib/timeline';
import { formatTime } from '../lib/format';
import type { CaptionAnimation, CaptionStyle, ClipTransform, ProjectData } from '../lib/types';
import { Button } from '../components/ui';
import { useEditor } from './store';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
export const CAPTION_COLORS = ['#ffffff', '#ffe14a', '#ff7a59', '#7cf0c4', '#a9a2ff', '#1f1d2b'];
const FONTS = [
  { id: 'Noto Sans TC', label: '思源黑體' },
  { id: 'Noto Serif TC', label: '思源宋體' },
  { id: 'Plus Jakarta Sans', label: 'Jakarta（英文）' },
];
const ANIMS: { id: CaptionAnimation; label: string }[] = [
  { id: 'none', label: '無' },
  { id: 'fade', label: '淡入' },
  { id: 'pop', label: '彈出' },
  { id: 'slide', label: '上滑' },
  { id: 'typewriter', label: '打字機' },
];

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="border-b border-line px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-extrabold tracking-wide text-ink-soft">{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  );
}

export function Slider({ label, value, min, max, step = 1, format, onChange, onStart }: { label: string; value: number; min: number; max: number; step?: number; format?: (v: number) => string; onChange: (v: number) => void; onStart?: () => void }) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-xs font-semibold text-ink-soft">
        <span>{label}</span>
        <span className="tabular-nums text-ink">{format ? format(value) : value}</span>
      </div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onPointerDown={onStart} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Chips<T extends string | number>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.id)}
          onClick={() => onChange(o.id)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${value === o.id ? 'bg-brand text-white' : 'bg-sunken text-ink-soft hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Inspector() {
  const selection = useEditor((s) => s.selection);
  const selected = useEditor((s) => s.selected);
  const data = useEditor((s) => s.data);
  const { commit, live, checkpoint, select } = useEditor.getState();

  if (selected.length > 1) return <MultiInspector />;

  if (!selection)
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <MousePointerClick className="mx-auto size-8 text-ink-mute/60" />
          <p className="mt-3 text-sm font-semibold text-ink-soft">在時間軸點選片段或字幕</p>
          <p className="mt-1 text-xs text-ink-mute">就能在這裡調整屬性</p>
        </div>
      </div>
    );

  if (selection.type === 'clip') {
    const clip = layoutMain(data.clips).find((c) => c.id === selection.id);
    if (!clip) return null;
    const m = data.media.find((x) => x.id === clip.mediaId);
    const update = (patch: Partial<typeof clip>) => live((d) => ({ ...d, clips: d.clips.map((c) => (c.id === clip.id ? { ...c, ...patch } : c)) }));
    return (
      <div>
        <Section title="影片片段">
          <div className="truncate text-sm font-bold">{m?.name}</div>
          <div className="mt-1 text-xs text-ink-mute">
            時間軸 {formatTime(clip.start, true)} – {formatTime(clip.end, true)}
            {m?.kind === 'video' && ` ・ 來源 ${formatTime(clip.in, true)} – ${formatTime(clip.out, true)}`}
          </div>
        </Section>
        <FrameSection clipId={clip.id} />
        {m?.kind === 'video' && (
          <>
            <Section title="變速">
              <Chips options={SPEEDS.map((s) => ({ id: s, label: `${s}x` }))} value={clip.speed} onChange={(speed) => commit((d) => ({ ...d, clips: d.clips.map((c) => (c.id === clip.id ? { ...c, speed } : c)) }))} />
            </Section>
            <Section title="音量">
              <Slider label="原音音量" value={Math.round(clip.volume * 100)} min={0} max={200} format={(v) => `${v}%`} onStart={checkpoint} onChange={(v) => update({ volume: v / 100 })} />
            </Section>
          </>
        )}
        {m?.kind === 'image' && (
          <Section title="顯示時間">
            <Slider label="長度" value={clip.out} min={0.5} max={30} step={0.1} format={(v) => `${v.toFixed(1)} 秒`} onStart={checkpoint} onChange={(v) => update({ out: v })} />
          </Section>
        )}
        <div className="p-4">
          <Button variant="danger" className="w-full" onClick={() => (commit((d) => removeMainClip(d, clip.id)), select(null))}>
            <Trash2 className="size-4" /> 刪除片段
          </Button>
        </div>
      </div>
    );
  }

  if (selection.type === 'audio') {
    const a = data.audio.find((x) => x.id === selection.id);
    if (!a) return null;
    const m = data.media.find((x) => x.id === a.mediaId);
    return (
      <div>
        <Section title={m?.origin === 'tts' ? '朗讀配音' : m?.origin === 'library' ? '音樂庫' : '音訊'}>
          <div className="truncate text-sm font-bold">{m?.name}</div>
          <div className="mt-1 text-xs text-ink-mute">
            {formatTime(a.start, true)} – {formatTime(a.start + clipLength(a), true)}
          </div>
        </Section>
        <Section title="音量">
          <Slider label="音量" value={Math.round(a.volume * 100)} min={0} max={200} format={(v) => `${v}%`} onStart={checkpoint} onChange={(v) => live((d) => ({ ...d, audio: d.audio.map((x) => (x.id === a.id ? { ...x, volume: v / 100 } : x)) }))} />
        </Section>
        <Section title="淡入淡出">
          <div className="space-y-3">
            <Slider label="淡入" value={a.fadeIn ?? 0} min={0} max={Math.min(5, clipLength(a) / 2)} step={0.1} format={(v) => (v ? `${v.toFixed(1)} 秒` : '無')} onStart={checkpoint} onChange={(v) => live((d) => ({ ...d, audio: d.audio.map((x) => (x.id === a.id ? { ...x, fadeIn: v } : x)) }))} />
            <Slider label="淡出" value={a.fadeOut ?? 0} min={0} max={Math.min(5, clipLength(a) / 2)} step={0.1} format={(v) => (v ? `${v.toFixed(1)} 秒` : '無')} onStart={checkpoint} onChange={(v) => live((d) => ({ ...d, audio: d.audio.map((x) => (x.id === a.id ? { ...x, fadeOut: v } : x)) }))} />
          </div>
        </Section>
        <div className="p-4">
          <Button variant="danger" className="w-full" onClick={() => (commit((d) => ({ ...d, audio: d.audio.filter((x) => x.id !== a.id) })), select(null))}>
            <Trash2 className="size-4" /> 刪除音訊
          </Button>
        </div>
      </div>
    );
  }

  const c = data.captions.find((x) => x.id === selection.id);
  if (!c) return null;
  const setText = (text: string) => live((d) => ({ ...d, captions: d.captions.map((x) => (x.id === c.id ? { ...x, text } : x)) }));
  const setStyle = (patch: Partial<CaptionStyle>, record = true) => {
    const fn = (d: typeof data) => ({ ...d, captions: d.captions.map((x) => (x.id === c.id ? { ...x, style: { ...x.style, ...patch } } : x)) });
    record ? commit(fn) : live(fn);
  };
  const s = c.style;
  return (
    <div>
      <Section title="字幕內容" aside={<span className="text-[11px] text-ink-mute">{formatTime(c.start, true)} – {formatTime(c.end, true)}</span>}>
        <textarea
          className="h-20 w-full resize-none rounded-xl border border-line bg-surface p-2.5 text-sm outline-none focus:border-brand"
          value={c.text}
          onFocus={checkpoint}
          onChange={(e) => setText(e.target.value)}
        />
      </Section>
      <Section title="字型">
        <select className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm" value={s.font} onChange={(e) => setStyle({ font: e.target.value })}>
          {FONTS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <div className="mt-3 space-y-3">
          <Slider label="大小" value={s.size} min={28} max={140} onStart={checkpoint} onChange={(v) => setStyle({ size: v }, false)} />
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
            <input type="checkbox" checked={s.bold} onChange={(e) => setStyle({ bold: e.target.checked })} className="accent-brand" /> 粗體
          </label>
        </div>
      </Section>
      <Section title="顏色">
        <div className="space-y-3">
          <ColorRow label="文字" value={s.color} onChange={(color) => setStyle({ color })} />
          <ColorRow label="描邊" value={s.stroke} onChange={(stroke) => setStyle({ stroke })} />
          <div>
            <div className="mb-1.5 text-xs font-semibold text-ink-soft">底色</div>
            <div className="flex gap-1.5">
              <Swatch active={!s.background} onClick={() => setStyle({ background: null })} label="無">
                <span className="text-[10px] font-bold text-ink-mute">無</span>
              </Swatch>
              {['rgba(255,255,255,0.92)', 'rgba(255,225,74,0.95)', 'rgba(91,76,245,0.92)', 'rgba(31,29,43,0.7)'].map((bg) => (
                <Swatch key={bg} active={s.background === bg} onClick={() => setStyle({ background: bg })} label={bg} color={bg} />
              ))}
            </div>
          </div>
        </div>
      </Section>
      <Section title="位置">
        <Slider label="垂直位置" value={Math.round(s.y * 100)} min={5} max={95} format={(v) => (v < 35 ? '上方' : v > 65 ? '下方' : '中間')} onStart={checkpoint} onChange={(v) => setStyle({ y: v / 100 }, false)} />
      </Section>
      <Section title="進場動畫">
        <Chips options={ANIMS} value={s.animation} onChange={(animation) => setStyle({ animation })} />
      </Section>
      <div className="space-y-2 p-4">
        <Button variant="secondary" className="w-full" onClick={() => commit((d) => ({ ...d, captions: d.captions.map((x) => ({ ...x, style: { ...s } })) }))}>
          把這個樣式套用到全部字幕
        </Button>
        <Button variant="danger" className="w-full" onClick={() => (commit((d) => ({ ...d, captions: d.captions.filter((x) => x.id !== c.id) })), select(null))}>
          <Trash2 className="size-4" /> 刪除字幕
        </Button>
      </div>
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-ink-soft">{label}</div>
      <div className="flex items-center gap-1.5">
        {CAPTION_COLORS.map((c) => (
          <Swatch key={c} color={c} active={value.toLowerCase() === c} onClick={() => onChange(c)} label={c} />
        ))}
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-7 cursor-pointer rounded-lg border border-line bg-surface p-0.5" aria-label={`自訂${label}顏色`} />
      </div>
    </div>
  );
}

function Swatch({ color, active, onClick, label, children }: { color?: string; active: boolean; onClick: () => void; label: string; children?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`grid size-7 place-items-center rounded-lg border transition ${active ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:scale-105'}`}
      style={color ? { background: color } : undefined}
    >
      {children}
    </button>
  );
}

// 九宮格對齊：x、y 為畫面中心相對畫布中心的位移
const ALIGN: { x: number; y: number; label: string }[] = [-1, 0, 1].flatMap((row) =>
  [-1, 0, 1].map((col) => ({ x: col, y: row, label: `${['上', '中', '下'][row + 1]}${['左', '中', '右'][col + 1]}` })),
);

function FrameSection({ clipId }: { clipId: string }) {
  const clip = useEditor((s) => s.data.clips.find((c) => c.id === clipId));
  const media = useEditor((s) => s.data.media.find((m) => m.id === clip?.mediaId));
  const aspect = useEditor((s) => s.data.aspect);
  const { live, commit, checkpoint } = useEditor.getState();
  if (!clip) return null;
  const tf = transformOf(clip);
  const set = (patch: Partial<ClipTransform>, record = false) => {
    const fn = (d: ReturnType<typeof useEditor.getState>['data']) => ({
      ...d,
      clips: d.clips.map((c) => (c.id === clipId ? { ...c, transform: { ...transformOf(c), ...patch } } : c)),
    });
    record ? commit(fn) : live(fn);
  };
  // 依實際畫面大小推算靠邊時的位移，讓「靠右」剛好貼齊右邊
  const { width: W, height: H } = aspectSize(aspect, 1080);
  const sw = media?.width ?? W;
  const sh = media?.height ?? H;
  const base = tf.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  const edgeX = (1 - (sw * base * tf.scale) / W) / 2;
  const edgeY = (1 - (sh * base * tf.scale) / H) / 2;
  const isDefault = JSON.stringify(tf) === JSON.stringify(DEFAULT_TRANSFORM);

  return (
    <Section
      title="畫面"
      aside={
        <button
          onClick={() => set(DEFAULT_TRANSFORM, true)}
          disabled={isDefault}
          className="flex items-center gap-1 text-[11px] font-bold text-ink-soft hover:text-brand disabled:opacity-40"
        >
          <RotateCcw className="size-3" /> 重設
        </button>
      }
    >
      <div className="mb-1.5 text-xs font-semibold text-ink-soft">顯示方式</div>
      <Chips
        options={[
          { id: 'contain', label: '完整顯示' },
          { id: 'cover', label: '填滿畫面' },
        ]}
        value={tf.fit}
        onChange={(fit) => set({ fit }, true)}
      />
      <div className="mt-4 mb-1.5 text-xs font-semibold text-ink-soft">快速對齊</div>
      <div className="grid w-fit grid-cols-3 gap-1">
        {ALIGN.map((a) => {
          const x = a.x * edgeX;
          const y = a.y * edgeY;
          const active = Math.abs(tf.x - x) < 0.001 && Math.abs(tf.y - y) < 0.001;
          return (
            <button
              key={a.label}
              title={a.label}
              aria-label={`對齊${a.label}`}
              onClick={() => set({ x, y }, true)}
              className={`grid size-8 place-items-center rounded-lg border transition ${active ? 'border-brand bg-brand-soft' : 'border-line hover:border-brand/50'}`}
            >
              <span className={`size-2 rounded-sm ${active ? 'bg-brand' : 'bg-ink-mute/50'}`} />
            </button>
          );
        })}
      </div>
      <div className="mt-4 space-y-3">
        <Slider label="縮放" value={Math.round(tf.scale * 100)} min={10} max={300} format={(v) => `${v}%`} onStart={checkpoint} onChange={(v) => set({ scale: v / 100 })} />
        <Slider label="水平位置" value={Math.round(tf.x * 100)} min={-100} max={100} format={(v) => (v === 0 ? '置中' : v > 0 ? `右 ${v}` : `左 ${-v}`)} onStart={checkpoint} onChange={(v) => set({ x: v / 100 })} />
        <Slider label="垂直位置" value={Math.round(tf.y * 100)} min={-100} max={100} format={(v) => (v === 0 ? '置中' : v > 0 ? `下 ${v}` : `上 ${-v}`)} onStart={checkpoint} onChange={(v) => set({ y: v / 100 })} />
        <Slider label="旋轉" value={tf.rotation} min={-180} max={180} format={(v) => `${v}°`} onStart={checkpoint} onChange={(v) => set({ rotation: v })} />
      </div>
      <p className="mt-3 text-[11px] text-ink-mute">也可以直接在預覽畫面上拖曳影片調整位置。</p>
    </Section>
  );
}

/** 多選時的批次編輯：只顯示選取項目共有的設定，改動會套用到每一個 */
function MultiInspector() {
  const selected = useEditor((s) => s.selected);
  const data = useEditor((s) => s.data);
  const time = useEditor((s) => s.time);
  const { commit, live, checkpoint, select } = useEditor.getState();
  const ids = new Set(selected.map((i) => i.id));
  const caps = data.captions.filter((c) => ids.has(c.id));
  const auds = data.audio.filter((a) => ids.has(a.id));
  const clips = data.clips.filter((c) => ids.has(c.id));

  const apply = (fn: (d: ProjectData) => ProjectData, record: boolean) => (record ? commit(fn) : live(fn));
  const setCaps = (patch: Partial<CaptionStyle>, record = true) =>
    apply((d) => ({ ...d, captions: d.captions.map((c) => (ids.has(c.id) ? { ...c, style: { ...c.style, ...patch } } : c)) }), record);
  const setAuds = (patch: Partial<(typeof auds)[number]>, record = false) =>
    apply((d) => ({ ...d, audio: d.audio.map((a) => (ids.has(a.id) ? { ...a, ...patch } : a)) }), record);
  const setClips = (patch: Partial<(typeof clips)[number]>, record = false) =>
    apply((d) => ({ ...d, clips: d.clips.map((c) => (ids.has(c.id) ? { ...c, ...patch } : c)) }), record);

  // 把選取的字幕與音訊整組移到播放頭（最早的項目對齊播放頭）
  const movable = [...caps.map((c) => c.start), ...auds.map((a) => a.start)];
  const earliest = movable.length ? Math.min(...movable) : 0;
  const moveToPlayhead = () => {
    const delta = time - earliest;
    commit((d) => ({
      ...d,
      captions: d.captions.map((c) => (ids.has(c.id) ? { ...c, start: c.start + delta, end: c.end + delta } : c)),
      audio: d.audio.map((a) => (ids.has(a.id) ? { ...a, start: a.start + delta } : a)),
    }));
  };

  const s0 = caps[0]?.style;
  const maxFade = auds.length ? Math.min(5, ...auds.map((a) => clipLength(a) / 2)) : 5;
  const counts = [
    { n: clips.length, label: '影片', icon: Film, cls: 'bg-track-video text-[#4b3be6]' },
    { n: caps.length, label: '字幕', icon: Type, cls: 'bg-track-caption text-[#b2432a]' },
    { n: auds.length, label: '音訊', icon: AudioLines, cls: 'bg-track-audio text-[#0d6b52]' },
  ].filter((c) => c.n);

  return (
    <div>
      <Section title="批次編輯">
        <div className="text-sm font-bold">已選取 {selected.length} 個項目</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {counts.map((c) => (
            <span key={c.label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${c.cls}`}>
              <c.icon className="size-3" /> {c.label} {c.n}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-mute">下面的設定會一次套用到所有選取的項目。拖曳其中一個字幕或音訊，整組會一起移動。</p>
        {movable.length > 0 && (
          <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={moveToPlayhead} disabled={Math.abs(time - earliest) < 0.01}>
            整組移到播放頭（{formatTime(time, true)}）
          </Button>
        )}
      </Section>

      {s0 && (
        <>
          <Section title={`字幕樣式（${caps.length} 句）`}>
            <div className="space-y-3">
              <select className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-sm" value={s0.font} onChange={(e) => setCaps({ font: e.target.value })}>
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <Slider label="大小" value={s0.size} min={28} max={140} onStart={checkpoint} onChange={(v) => setCaps({ size: v }, false)} />
              <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
                <input type="checkbox" checked={s0.bold} onChange={(e) => setCaps({ bold: e.target.checked })} className="accent-brand" /> 粗體
              </label>
              <ColorRow label="文字" value={s0.color} onChange={(color) => setCaps({ color })} />
              <ColorRow label="描邊" value={s0.stroke} onChange={(stroke) => setCaps({ stroke })} />
              <Slider label="垂直位置" value={Math.round(s0.y * 100)} min={5} max={95} format={(v) => (v < 35 ? '上方' : v > 65 ? '下方' : '中間')} onStart={checkpoint} onChange={(v) => setCaps({ y: v / 100 }, false)} />
              <div>
                <div className="mb-1.5 text-xs font-semibold text-ink-soft">進場動畫</div>
                <Chips options={ANIMS} value={s0.animation} onChange={(animation) => setCaps({ animation })} />
              </div>
            </div>
          </Section>
        </>
      )}

      {auds.length > 0 && (
        <Section title={`音訊（${auds.length} 段）`}>
          <div className="space-y-3">
            <Slider label="音量" value={Math.round(auds[0].volume * 100)} min={0} max={200} format={(v) => `${v}%`} onStart={checkpoint} onChange={(v) => setAuds({ volume: v / 100 })} />
            <Slider label="淡入" value={Math.min(auds[0].fadeIn ?? 0, maxFade)} min={0} max={maxFade} step={0.1} format={(v) => (v ? `${v.toFixed(1)} 秒` : '無')} onStart={checkpoint} onChange={(v) => setAuds({ fadeIn: v })} />
            <Slider label="淡出" value={Math.min(auds[0].fadeOut ?? 0, maxFade)} min={0} max={maxFade} step={0.1} format={(v) => (v ? `${v.toFixed(1)} 秒` : '無')} onStart={checkpoint} onChange={(v) => setAuds({ fadeOut: v })} />
          </div>
        </Section>
      )}

      {clips.length > 0 && (
        <Section title={`影片片段（${clips.length} 段）`}>
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-xs font-semibold text-ink-soft">變速</div>
              <Chips options={SPEEDS.map((v) => ({ id: v, label: `${v}x` }))} value={clips[0].speed} onChange={(speed) => setClips({ speed }, true)} />
            </div>
            <Slider label="原音音量" value={Math.round(clips[0].volume * 100)} min={0} max={200} format={(v) => `${v}%`} onStart={checkpoint} onChange={(v) => setClips({ volume: v / 100 })} />
          </div>
        </Section>
      )}

      <div className="p-4">
        <Button variant="danger" className="w-full" onClick={() => (commit((d) => removeItems(d, selected)), select(null))}>
          <Trash2 className="size-4" /> 刪除這 {selected.length} 個項目
        </Button>
      </div>
    </div>
  );
}
