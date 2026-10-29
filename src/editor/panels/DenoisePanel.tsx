import { DEFAULT_CLIP_DENOISE } from '../../lib/denoise';
import { clipAt, layoutMain } from '../../lib/timeline';
import type { ClipDenoise, ProjectData } from '../../lib/types';
import { Button, useToast } from '../../components/ui';
import { Slider } from '../Inspector';
import { useEditor } from '../store';
import { LockedBanner } from '../locks';

const PRESETS: { id: string; name: string; strength: number }[] = [
  { id: 'light', name: '輕度', strength: 30 },
  { id: 'normal', name: '標準', strength: DEFAULT_CLIP_DENOISE.strength },
  { id: 'strong', name: '強力', strength: 90 },
];

export function DenoisePanel() {
  const toast = useToast();
  const data = useEditor((s) => s.data);
  const time = useEditor((s) => s.time);
  const selection = useEditor((s) => s.selection);
  const { commit, live, checkpoint } = useEditor.getState();

  // 只處理主軌片段：選取中的，否則是播放頭所在的
  const placed = layoutMain(data.clips);
  const clip = (selection?.type === 'clip' && placed.find((c) => c.id === selection.id)) || clipAt(placed, time);
  const locked = !!data.locks?.main;
  const media = clip ? data.media.find((m) => m.id === clip.mediaId) : undefined;
  const strength = clip?.denoise?.strength ?? 0;

  if (!clip || !media || media.kind !== 'video') {
    return (
      <div className="p-4">
        <h2 className="text-sm font-extrabold">降噪</h2>
        <div className="mt-4 rounded-2xl border-2 border-dashed border-line p-6 text-center text-xs leading-relaxed text-ink-soft">
          把播放頭移到主軌的影片上，
          <br />
          或在時間軸點選主軌片段。
        </div>
      </div>
    );
  }

  const set = (next: ClipDenoise | undefined, record = true) => {
    const fn = (d: ProjectData): ProjectData => ({ ...d, clips: d.clips.map((c) => (c.id === clip.id ? { ...c, denoise: next } : c)) });
    record ? commit(fn) : live(fn);
  };
  const mainOpen = !data.locks?.main;
  const applyAll = () => {
    commit((d) => ({ ...d, clips: d.clips.map((c) => ({ ...c, denoise: clip.denoise })) }));
    toast(`已套用到全部 ${data.clips.length} 個片段`, 'success');
  };
  const label = `片段 ${placed.findIndex((c) => c.id === clip.id) + 1}`;
  const activePreset = PRESETS.find((p) => p.strength === strength)?.id ?? (strength === 0 ? 'none' : 'custom');

  return (
    <div className="p-4">
      <h2 className="text-sm font-extrabold">降噪</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-mute">把主軌影片的人聲清乾淨一點，接近錄音室效果。預覽和匯出都會套用。</p>

      <LockedBanner track="main" />

      <fieldset disabled={locked} className={locked ? 'pointer-events-none opacity-50' : ''}>
        <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-sunken/70 p-2.5">
          {media.thumb && <img src={media.thumb} alt="" className="h-10 w-14 rounded-lg object-cover" />}
          <div className="min-w-0 text-xs">
            <div className="truncate font-bold">
              {label}：{media.name}
            </div>
            <div className="text-ink-mute">目前：{strength === 0 ? '未開啟' : `強度 ${strength}`}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-1.5">
          <button
            onClick={() => set(undefined)}
            aria-pressed={activePreset === 'none'}
            className={`rounded-xl border-2 py-2 text-xs font-bold transition ${activePreset === 'none' ? 'border-brand bg-brand-soft/60 text-brand' : 'border-line text-ink-soft hover:border-ink-mute/40'}`}
          >
            關閉
          </button>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => set({ strength: p.strength })}
              aria-pressed={activePreset === p.id}
              className={`rounded-xl border-2 py-2 text-xs font-bold transition ${activePreset === p.id ? 'border-brand bg-brand-soft/60 text-brand' : 'border-line text-ink-soft hover:border-ink-mute/40'}`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="mt-5">
          <Slider
            label="強度"
            value={strength}
            min={0}
            max={100}
            onStart={checkpoint}
            onChange={(v) => set(v > 0 ? { strength: v } : undefined, false)}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" onClick={() => set(undefined)} disabled={strength === 0}>
            重設
          </Button>
          <Button size="sm" onClick={applyAll} disabled={data.clips.length < 2 || !mainOpen}>
            套用到全部片段
          </Button>
        </div>
        <ul className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-ink-mute">
          <li>・濾掉手機收音常見的低頻悶響，講話停頓時自動壓低背景雜訊，加一點人聲增豔</li>
          <li>・如果背景雜訊整段都跟講話疊在一起（不只是停頓時才有），效果會比較有限——這類訊號處理沒辦法把雜訊從人聲裡「分離」出來</li>
          <li>・強度太高、講話忽大忽小的片段，句子開頭可能會被輕微吃掉，建議先試標準強度</li>
        </ul>
      </fieldset>
    </div>
  );
}
