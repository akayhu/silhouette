import type { ReactNode } from 'react';
import { DEFAULT_HIGHLIGHT } from '../lib/engine';
import { captionWords } from '../lib/captions';
import { ArrowDown, ArrowUp, AudioLines, Copy, Film, Layers, MousePointerClick, RotateCcw, Smile, Trash2, Type } from 'lucide-react';
import { stickerDef, stickerUrl } from '../lib/stickers';
import { uid } from '../lib/format';
import { aspectSize, clipLength, DEFAULT_OVERLAY_TRANSFORM, DEFAULT_TRANSFORM, layoutMain, overlayEnd, overlayLaneCount, placeOverlayLane, removeItems, removeMainClip, transformOf } from '../lib/timeline';
import { formatTime } from '../lib/format';
import type { CaptionAnimation, CaptionShadow, CaptionStyle, ClipMotion, ClipTransform, OverlayClip, ProjectData, StickerAnimation, StickerItem } from '../lib/types';
import { Button } from '../components/ui';
import { ColorPicker } from '../components/ColorPicker';
import { useEditor } from './store';
import { TranslationField } from './TranslationField';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const MOTIONS: { id: ClipMotion; label: string }[] = [
  { id: 'none', label: '無' },
  { id: 'zoomIn', label: '慢慢放大' },
  { id: 'zoomOut', label: '慢慢縮小' },
  { id: 'punch', label: '特寫推近' },
  { id: 'shake', label: '震動' },
];
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
  { id: 'karaoke', label: '卡拉 OK' },
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
        <Section title="動態效果">
          <Chips
            options={MOTIONS}
            value={clip.motion ?? 'none'}
            onChange={(motion) => commit((d) => ({ ...d, clips: d.clips.map((c) => (c.id === clip.id ? { ...c, motion: motion === 'none' ? undefined : motion } : c)) }))}
          />
          <p className="mt-2 text-[11px] text-ink-mute">播放這段時的運鏡，「AI 自動剪輯」也會自動設定。</p>
        </Section>
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

  if (selection.type === 'sticker') return <StickerInspector id={selection.id} />;
  if (selection.type === 'overlay') return <OverlayInspector id={selection.id} />;

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
        <TranslationField caption={c} />
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
          <ColorRow label="文字" value={s.color} onStart={checkpoint} onChange={(color, rec) => setStyle({ color }, rec)} />
          <ColorRow label="描邊" value={s.stroke} onStart={checkpoint} onChange={(stroke, rec) => setStyle({ stroke }, rec)} />
          <div>
            <div className="mb-1.5 text-xs font-semibold text-ink-soft">底色</div>
            <div className="flex gap-1.5">
              <Swatch active={!s.background} onClick={() => setStyle({ background: null })} label="無">
                <span className="text-[10px] font-bold text-ink-mute">無</span>
              </Swatch>
              {['rgba(255,255,255,0.92)', 'rgba(255,225,74,0.95)', 'rgba(212,44,34,0.94)', 'rgba(31,29,43,0.7)'].map((bg) => (
                <Swatch key={bg} active={s.background === bg} onClick={() => setStyle({ background: bg })} label={bg} color={bg} />
              ))}
              <ColorPicker value={s.background ?? '#ffffff'} onStart={checkpoint} onChange={(background, rec) => setStyle({ background }, rec)} label="底色" />
            </div>
          </div>
        </div>
      </Section>
      <Section title="陰影">
        <ShadowControls value={s.shadow} onStart={checkpoint} onChange={(shadow, record) => setStyle({ shadow }, record)} />
      </Section>
      <Section
        title="位置"
        aside={
          <button onClick={() => setStyle({ x: 0.5 })} disabled={(s.x ?? 0.5) === 0.5} className="text-[11px] font-bold text-brand disabled:text-ink-mute">
            水平置中
          </button>
        }
      >
        <div className="space-y-3">
          <Slider label="水平位置" value={Math.round((s.x ?? 0.5) * 100)} min={0} max={100} format={hFormat} onStart={checkpoint} onChange={(v) => setStyle({ x: v / 100 }, false)} />
          <Slider label="垂直位置" value={Math.round(s.y * 100)} min={5} max={95} format={(v) => (v < 35 ? '上方' : v > 65 ? '下方' : '中間')} onStart={checkpoint} onChange={(v) => setStyle({ y: v / 100 }, false)} />
          <p className="text-[11px] text-ink-mute">也可以直接在右邊的預覽畫面上拖曳字幕。</p>
        </div>
      </Section>
      <Section title="進場動畫">
        <Chips options={ANIMS} value={s.animation} onChange={(animation) => setStyle({ animation })} />
        {s.animation === 'karaoke' && (
          <div className="mt-3 space-y-2">
            <ColorRow label="唸到的字" value={s.highlight ?? DEFAULT_HIGHLIGHT} onStart={checkpoint} onChange={(highlight, rec) => setStyle({ highlight }, rec)} />
            <p className="text-[11px] leading-relaxed text-ink-mute">{captionWords(c) ? '依實際說話的時間逐字亮起。' : '這句沒有逐字時間，會依字幕長度平均亮起；重新產生 AI 字幕就能對準說話的時間。'}</p>
          </div>
        )}
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

function ColorRow({ label, value, onChange, onStart }: { label: string; value: string; onChange: (v: string, record: boolean) => void; onStart: () => void }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-ink-soft">{label}</div>
      <div className="flex items-center gap-1.5">
        {CAPTION_COLORS.map((c) => (
          <Swatch key={c} color={c} active={value.toLowerCase() === c} onClick={() => onChange(c, true)} label={c} />
        ))}
        <ColorPicker value={value} onChange={onChange} onStart={onStart} label={`${label}顏色`} />
      </div>
    </div>
  );
}

/** 字幕水平位置的文字說明 */
const hFormat = (v: number) => (v === 50 ? '置中' : v < 50 ? `偏左 ${50 - v}` : `偏右 ${v - 50}`);

const SHADOW_PRESETS: { id: string; label: string; value: CaptionShadow | null }[] = [
  { id: 'none', label: '無', value: null },
  { id: 'soft', label: '柔和', value: { color: '#000000', opacity: 0.45, blur: 28, distance: 6, angle: 90 } },
  { id: 'drop', label: '投影', value: { color: '#000000', opacity: 0.85, blur: 0, distance: 10, angle: 45 } },
  { id: 'glow', label: '發光', value: { color: '#ffe14a', opacity: 0.95, blur: 45, distance: 0, angle: 90 } },
  { id: 'neon', label: '霓虹', value: { color: '#ff4fd8', opacity: 1, blur: 60, distance: 0, angle: 90 } },
];
const SHADOW_COLORS = ['#000000', '#1f1d2b', '#ffffff', '#ffe14a', '#ff4fd8', '#5b4cf5'];
const sameShadow = (a: CaptionShadow, b: CaptionShadow) => (Object.keys(a) as (keyof CaptionShadow)[]).every((k) => a[k] === b[k]);

/** 字幕陰影：先選預設，再微調顏色、透明度、模糊、距離、角度 */
function ShadowControls({ value, onChange, onStart }: { value?: CaptionShadow | null; onChange: (v: CaptionShadow | null, record: boolean) => void; onStart: () => void }) {
  const preset = !value ? 'none' : (SHADOW_PRESETS.find((p) => p.value && sameShadow(p.value, value))?.id ?? 'custom');
  const set = (patch: Partial<CaptionShadow>, record = false) => value && onChange({ ...value, ...patch }, record);
  return (
    <div className="space-y-3">
      <Chips
        options={[...SHADOW_PRESETS.map((p) => ({ id: p.id, label: p.label })), ...(preset === 'custom' ? [{ id: 'custom', label: '自訂' }] : [])]}
        value={preset}
        onChange={(id) => id !== 'custom' && onChange(SHADOW_PRESETS.find((p) => p.id === id)!.value, true)}
      />
      {value && (
        <>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-ink-soft">陰影顏色</div>
            <div className="flex items-center gap-1.5">
              {SHADOW_COLORS.map((c) => (
                <Swatch key={c} color={c} active={value.color.toLowerCase() === c} onClick={() => set({ color: c }, true)} label={c} />
              ))}
              <ColorPicker value={value.color} alpha={false} onStart={onStart} onChange={(color, rec) => set({ color }, rec)} label="陰影顏色" />
            </div>
          </div>
          <Slider label="透明度" value={Math.round(value.opacity * 100)} min={0} max={100} format={(v) => `${v}%`} onStart={onStart} onChange={(v) => set({ opacity: v / 100 })} />
          <Slider label="模糊" value={value.blur} min={0} max={100} onStart={onStart} onChange={(v) => set({ blur: v })} />
          <Slider label="距離" value={value.distance} min={0} max={40} onStart={onStart} onChange={(v) => set({ distance: v })} />
          <Slider label="角度" value={value.angle} min={0} max={359} format={(v) => `${v}°`} onStart={onStart} onChange={(v) => set({ angle: v })} />
        </>
      )}
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

function FrameSection({ clipId, kind = 'clip' }: { clipId: string; kind?: 'clip' | 'overlay' }) {
  const isOverlay = kind === 'overlay';
  const clip = useEditor((s) => (isOverlay ? s.data.overlays.find((c) => c.id === clipId) : s.data.clips.find((c) => c.id === clipId)));
  const media = useEditor((s) => s.data.media.find((m) => m.id === clip?.mediaId));
  const aspect = useEditor((s) => s.data.aspect);
  const { live, commit, checkpoint } = useEditor.getState();
  if (!clip) return null;
  const DEFAULT = isOverlay ? DEFAULT_OVERLAY_TRANSFORM : DEFAULT_TRANSFORM;
  const tf = { ...DEFAULT, ...clip.transform };
  const set = (patch: Partial<ClipTransform>, record = false) => {
    const fn = (d: ProjectData): ProjectData =>
      isOverlay
        ? { ...d, overlays: d.overlays.map((c) => (c.id === clipId ? { ...c, transform: { ...DEFAULT, ...c.transform, ...patch } } : c)) }
        : { ...d, clips: d.clips.map((c) => (c.id === clipId ? { ...c, transform: { ...transformOf(c), ...patch } } : c)) };
    record ? commit(fn) : live(fn);
  };
  // 依實際畫面大小推算靠邊時的位移，讓「靠右」剛好貼齊右邊
  const { width: W, height: H } = aspectSize(aspect, 1080);
  const sw = media?.width ?? W;
  const sh = media?.height ?? H;
  const base = tf.fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
  const edgeX = (1 - (sw * base * tf.scale) / W) / 2;
  const edgeY = (1 - (sh * base * tf.scale) / H) / 2;
  const isDefault = JSON.stringify(tf) === JSON.stringify(DEFAULT);

  return (
    <Section
      title="畫面"
      aside={
        <button
          onClick={() => set(DEFAULT, true)}
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
  const stks = data.stickers.filter((st) => ids.has(st.id));
  const ovs = data.overlays.filter((o) => ids.has(o.id));

  const apply = (fn: (d: ProjectData) => ProjectData, record: boolean) => (record ? commit(fn) : live(fn));
  const setCaps = (patch: Partial<CaptionStyle>, record = true) =>
    apply((d) => ({ ...d, captions: d.captions.map((c) => (ids.has(c.id) ? { ...c, style: { ...c.style, ...patch } } : c)) }), record);
  const setAuds = (patch: Partial<(typeof auds)[number]>, record = false) =>
    apply((d) => ({ ...d, audio: d.audio.map((a) => (ids.has(a.id) ? { ...a, ...patch } : a)) }), record);
  const setClips = (patch: Partial<(typeof clips)[number]>, record = false) =>
    apply((d) => ({ ...d, clips: d.clips.map((c) => (ids.has(c.id) ? { ...c, ...patch } : c)) }), record);

  // 把選取的字幕與音訊整組移到播放頭（最早的項目對齊播放頭）
  const movable = [...caps.map((c) => c.start), ...stks.map((st) => st.start), ...ovs.map((o) => o.start), ...auds.map((a) => a.start)];
  const earliest = movable.length ? Math.min(...movable) : 0;
  const moveToPlayhead = () => {
    const delta = time - earliest;
    commit((d) => ({
      ...d,
      captions: d.captions.map((c) => (ids.has(c.id) ? { ...c, start: c.start + delta, end: c.end + delta } : c)),
      stickers: d.stickers.map((st) => (ids.has(st.id) ? { ...st, start: st.start + delta, end: st.end + delta } : st)),
      overlays: d.overlays.map((o) => (ids.has(o.id) ? { ...o, start: o.start + delta } : o)),
      audio: d.audio.map((a) => (ids.has(a.id) ? { ...a, start: a.start + delta } : a)),
    }));
  };
  const setStks = (patch: Partial<StickerItem>, record = true) =>
    apply((d) => ({ ...d, stickers: d.stickers.map((st) => (ids.has(st.id) ? { ...st, ...patch } : st)) }), record);

  const s0 = caps[0]?.style;
  const maxFade = auds.length ? Math.min(5, ...auds.map((a) => clipLength(a) / 2)) : 5;
  const counts = [
    { n: clips.length, label: '影片', icon: Film, cls: 'bg-track-video text-ink-soft' },
    { n: caps.length, label: '字幕', icon: Type, cls: 'bg-track-caption text-[#b2432a]' },
    { n: stks.length, label: '貼紙', icon: Smile, cls: 'bg-track-sticker text-[#8a6100]' },
    { n: ovs.length, label: '疊加', icon: Layers, cls: 'bg-track-overlay text-[#1f5fbf]' },
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
              <ColorRow label="文字" value={s0.color} onStart={checkpoint} onChange={(color, rec) => setCaps({ color }, rec)} />
              <ColorRow label="描邊" value={s0.stroke} onStart={checkpoint} onChange={(stroke, rec) => setCaps({ stroke }, rec)} />
              <div>
                <div className="mb-1.5 text-xs font-semibold text-ink-soft">陰影</div>
                <ShadowControls value={s0.shadow} onStart={checkpoint} onChange={(shadow, record) => setCaps({ shadow }, record)} />
              </div>
              <Slider label="水平位置" value={Math.round((s0.x ?? 0.5) * 100)} min={0} max={100} format={hFormat} onStart={checkpoint} onChange={(v) => setCaps({ x: v / 100 }, false)} />
              <Slider label="垂直位置" value={Math.round(s0.y * 100)} min={5} max={95} format={(v) => (v < 35 ? '上方' : v > 65 ? '下方' : '中間')} onStart={checkpoint} onChange={(v) => setCaps({ y: v / 100 }, false)} />
              <div>
                <div className="mb-1.5 text-xs font-semibold text-ink-soft">進場動畫</div>
                <Chips options={ANIMS} value={s0.animation} onChange={(animation) => setCaps({ animation })} />
              </div>
              {s0.animation === 'karaoke' && (
                <ColorRow label="唸到的字" value={s0.highlight ?? DEFAULT_HIGHLIGHT} onStart={checkpoint} onChange={(highlight, rec) => setCaps({ highlight }, rec)} />
              )}
            </div>
          </Section>
        </>
      )}

      {stks.length > 0 && (
        <Section title={`貼紙（${stks.length} 個）`}>
          <div className="space-y-3">
            <Slider label="大小" value={Math.round(stks[0].scale * 100)} min={20} max={300} format={(v) => `${v}%`} onStart={checkpoint} onChange={(v) => setStks({ scale: v / 100 }, false)} />
            <Slider label="透明度" value={Math.round(stks[0].opacity * 100)} min={10} max={100} format={(v) => `${v}%`} onStart={checkpoint} onChange={(v) => setStks({ opacity: v / 100 }, false)} />
            <div>
              <div className="mb-1.5 text-xs font-semibold text-ink-soft">動畫</div>
              <Chips options={STICKER_ANIMS} value={stks[0].animation} onChange={(animation) => setStks({ animation })} />
            </div>
          </div>
        </Section>
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

export const STICKER_ANIMS: { id: StickerAnimation; label: string }[] = [
  { id: 'none', label: '無' },
  { id: 'pop', label: '彈出' },
  { id: 'bounce', label: '跳動' },
  { id: 'wobble', label: '搖擺' },
  { id: 'pulse', label: '呼吸' },
  { id: 'spin', label: '旋轉' },
  { id: 'float', label: '漂浮' },
];

function StickerInspector({ id }: { id: string }) {
  const st = useEditor((s) => s.data.stickers.find((x) => x.id === id));
  const { commit, live, checkpoint, select } = useEditor.getState();
  if (!st) return null;
  const def = stickerDef(st.stickerId);
  const set = (patch: Partial<StickerItem>, record = false) => {
    const fn = (d: ProjectData) => ({ ...d, stickers: d.stickers.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
    record ? commit(fn) : live(fn);
  };
  const duplicate = () => {
    const copy = { ...st, id: uid(), x: Math.min(0.9, st.x + 0.08), y: Math.min(0.9, st.y + 0.08) };
    commit((d) => ({ ...d, stickers: [...d.stickers, copy] }));
    select({ type: 'sticker', id: copy.id });
  };
  return (
    <div>
      <Section title="貼紙" aside={<span className="text-[11px] text-ink-mute">{formatTime(st.start, true)} – {formatTime(st.end, true)}</span>}>
        <div className="flex items-center gap-3">
          {def && <img src={stickerUrl(def)} alt="" className="size-14 rounded-xl bg-sunken p-1.5" />}
          <div>
            <div className="text-sm font-bold">{def?.name ?? '貼紙'}</div>
            <div className="text-[11px] text-ink-mute">在右側預覽畫面可以直接拖曳位置</div>
          </div>
        </div>
      </Section>
      <Section title="外觀">
        <div className="space-y-3">
          <Slider label="大小" value={Math.round(st.scale * 100)} min={20} max={300} format={(v) => `${v}%`} onStart={checkpoint} onChange={(v) => set({ scale: v / 100 })} />
          <Slider label="旋轉" value={st.rotation} min={-180} max={180} format={(v) => `${v}°`} onStart={checkpoint} onChange={(v) => set({ rotation: v })} />
          <Slider label="透明度" value={Math.round(st.opacity * 100)} min={10} max={100} format={(v) => `${v}%`} onStart={checkpoint} onChange={(v) => set({ opacity: v / 100 })} />
        </div>
      </Section>
      <Section title="位置" aside={<button className="text-[11px] font-bold text-ink-soft hover:text-brand" onClick={() => set({ x: 0.5, y: 0.5 }, true)}>置中</button>}>
        <div className="space-y-3">
          <Slider label="水平" value={Math.round(st.x * 100)} min={0} max={100} format={(v) => `${v}%`} onStart={checkpoint} onChange={(v) => set({ x: v / 100 })} />
          <Slider label="垂直" value={Math.round(st.y * 100)} min={0} max={100} format={(v) => `${v}%`} onStart={checkpoint} onChange={(v) => set({ y: v / 100 })} />
        </div>
      </Section>
      <Section title="動畫">
        <Chips options={STICKER_ANIMS} value={st.animation} onChange={(animation) => set({ animation }, true)} />
      </Section>
      <div className="grid grid-cols-2 gap-2 p-4">
        <Button variant="secondary" onClick={duplicate}>
          <Copy className="size-4" /> 複製一個
        </Button>
        <Button variant="danger" onClick={() => (commit((d) => ({ ...d, stickers: d.stickers.filter((x) => x.id !== id) })), select(null))}>
          <Trash2 className="size-4" /> 刪除
        </Button>
      </div>
    </div>
  );
}

function OverlayInspector({ id }: { id: string }) {
  const o = useEditor((s) => s.data.overlays.find((x) => x.id === id));
  const media = useEditor((s) => s.data.media.find((m) => m.id === o?.mediaId));
  const lanes = useEditor((s) => overlayLaneCount(s.data.overlays));
  const { commit, live, checkpoint, select } = useEditor.getState();
  if (!o) return null;
  const set = (patch: Partial<OverlayClip>, record = false) => {
    const fn = (d: ProjectData) => ({ ...d, overlays: d.overlays.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
    record ? commit(fn) : live(fn);
  };
  // 換層後收掉空的層，層級保持連續
  const moveLane = (delta: number) =>
    commit((d) => ({ ...d, overlays: placeOverlayLane(d.overlays, id, o.lane + delta, o.lane) }));
  return (
    <div>
      <Section title={`疊加片段・第 ${o.lane + 1} 層`} aside={<span className="text-[11px] text-ink-mute">{formatTime(o.start, true)} – {formatTime(overlayEnd(o), true)}</span>}>
        <div className="truncate text-sm font-bold">{media?.name}</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" onClick={() => moveLane(1)} disabled={o.lane >= lanes}>
            <ArrowUp className="size-3.5" /> 上移一層
          </Button>
          <Button variant="secondary" size="sm" onClick={() => moveLane(-1)} disabled={o.lane === 0}>
            <ArrowDown className="size-3.5" /> 下移一層
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-ink-mute">上層的畫面會蓋在下層上面；也可以在時間軸上下拖曳換層。</p>
      </Section>
      <FrameSection clipId={o.id} kind="overlay" />
      <Section title="外觀">
        <Slider label="透明度" value={Math.round(o.opacity * 100)} min={5} max={100} format={(v) => `${v}%`} onStart={checkpoint} onChange={(v) => set({ opacity: v / 100 })} />
      </Section>
      {media?.kind === 'video' && (
        <>
          <Section title="變速">
            <Chips options={SPEEDS.map((v) => ({ id: v, label: `${v}x` }))} value={o.speed} onChange={(speed) => set({ speed }, true)} />
          </Section>
          <Section title="音量">
            <Slider label="原音音量" value={Math.round(o.volume * 100)} min={0} max={200} format={(v) => `${v}%`} onStart={checkpoint} onChange={(v) => set({ volume: v / 100 })} />
          </Section>
        </>
      )}
      <div className="p-4">
        <Button variant="danger" className="w-full" onClick={() => (commit((d) => ({ ...d, overlays: d.overlays.filter((x) => x.id !== id) })), select(null))}>
          <Trash2 className="size-4" /> 刪除疊加片段
        </Button>
      </div>
    </div>
  );
}
