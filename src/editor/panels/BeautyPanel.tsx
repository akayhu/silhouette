import { BEAUTY_PRESETS } from '../../lib/beauty';
import { clipAt, layoutMain } from '../../lib/timeline';
import type { ClipBeauty, ProjectData, TrackKey } from '../../lib/types';
import { Button, useToast } from '../../components/ui';
import { Slider } from '../Inspector';
import { useEditor } from '../store';
import { LockedBanner } from '../locks';

const NONE: ClipBeauty = { smooth: 0, whiten: 0, rosy: 0 };
const SLIDERS: { key: keyof ClipBeauty; label: string }[] = [
  { key: 'smooth', label: '磨皮' },
  { key: 'whiten', label: '美白' },
  { key: 'rosy', label: '紅潤' },
];
const same = (a: ClipBeauty, b: ClipBeauty) => a.smooth === b.smooth && a.whiten === b.whiten && a.rosy === b.rosy;

export function BeautyPanel() {
  const toast = useToast();
  const data = useEditor((s) => s.data);
  const time = useEditor((s) => s.time);
  const selection = useEditor((s) => s.selection);
  const { commit, live, checkpoint } = useEditor.getState();

  // 處理對象：選取中的疊加片段或主軌片段，否則是播放頭所在的主軌片段
  const placed = layoutMain(data.clips);
  const overlay = selection?.type === 'overlay' ? data.overlays.find((o) => o.id === selection.id) : undefined;
  const clip = overlay ?? ((selection?.type === 'clip' && placed.find((c) => c.id === selection.id)) || clipAt(placed, time));
  const track: TrackKey = overlay ? 'overlay' : 'main';
  const locked = !!data.locks?.[track];
  const media = clip ? data.media.find((m) => m.id === clip.mediaId) : undefined;
  const beauty = { ...NONE, ...clip?.beauty };

  if (!clip || !media || media.kind === 'audio') {
    return (
      <div className="p-4">
        <h2 className="text-sm font-extrabold">美肌</h2>
        <div className="mt-4 rounded-2xl border-2 border-dashed border-line p-6 text-center text-xs leading-relaxed text-ink-soft">
          把播放頭移到有人物的片段上，
          <br />
          或在時間軸點選主軌、疊加片段。
        </div>
      </div>
    );
  }

  // 只改目前這個片段（主軌或疊加）的美肌設定
  const update = (d: ProjectData, next: ClipBeauty | undefined): ProjectData =>
    overlay
      ? { ...d, overlays: d.overlays.map((o) => (o.id === clip.id ? { ...o, beauty: next } : o)) }
      : { ...d, clips: d.clips.map((c) => (c.id === clip.id ? { ...c, beauty: next } : c)) };
  const set = (patch: Partial<ClipBeauty>, record = true) => {
    const fn = (d: ProjectData) => update(d, { ...beauty, ...patch });
    record ? commit(fn) : live(fn);
  };
  const mainOpen = !data.locks?.main;
  const overlayOpen = !data.locks?.overlay;
  const allCount = (mainOpen ? data.clips.length : 0) + (overlayOpen ? data.overlays.length : 0);
  const applyAll = () => {
    commit((d) => ({
      ...d,
      clips: mainOpen ? d.clips.map((c) => ({ ...c, beauty: { ...beauty } })) : d.clips,
      overlays: overlayOpen ? d.overlays.map((o) => ({ ...o, beauty: { ...beauty } })) : d.overlays,
    }));
    toast(`已套用到全部 ${allCount} 個片段`, 'success');
  };
  const label = overlay ? `疊加第 ${overlay.lane + 1} 層` : `片段 ${placed.findIndex((c) => c.id === clip.id) + 1}`;
  const active = BEAUTY_PRESETS.find((p) => same(p.value, beauty))?.id ?? (same(beauty, NONE) ? 'none' : 'custom');

  return (
    <div className="p-4">
      <h2 className="text-sm font-extrabold">美肌</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-mute">磨皮、美白、紅潤，眼睛和輪廓保持清晰。預覽和匯出都會套用。</p>

      <LockedBanner track={track} />

      <fieldset disabled={locked} className={locked ? 'pointer-events-none opacity-50' : ''}>
        <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-sunken/70 p-2.5">
          {media.thumb && <img src={media.thumb} alt="" className="h-10 w-14 rounded-lg object-cover" />}
          <div className="min-w-0 text-xs">
            <div className="truncate font-bold">
              {label}：{media.name}
            </div>
            <div className="text-ink-mute">目前：{active === 'none' ? '未開啟' : active === 'custom' ? '自訂' : BEAUTY_PRESETS.find((p) => p.id === active)?.name}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-1.5">
          {[{ id: 'none', name: '關閉', value: NONE }, ...BEAUTY_PRESETS].map((p) => (
            <button
              key={p.id}
              onClick={() => commit((d) => update(d, p.id === 'none' ? undefined : { ...p.value }))}
              aria-pressed={active === p.id}
              className={`rounded-xl border-2 py-2 text-xs font-bold transition ${active === p.id ? 'border-brand bg-brand-soft/60 text-brand' : 'border-line text-ink-soft hover:border-ink-mute/40'}`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          {SLIDERS.map((s) => (
            <Slider key={s.key} label={s.label} value={beauty[s.key]} min={0} max={100} onStart={checkpoint} onChange={(v) => set({ [s.key]: v }, false)} />
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" onClick={() => commit((d) => update(d, undefined))} disabled={active === 'none'}>
            重設
          </Button>
          <Button size="sm" onClick={applyAll} disabled={allCount < 2}>
            套用到全部片段
          </Button>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-ink-mute">依膚色範圍加強處理，沒有臉部辨識；畫面其他平滑的地方也會被輕微柔化，覺得太糊可以調低磨皮。</p>
      </fieldset>
    </div>
  );
}
