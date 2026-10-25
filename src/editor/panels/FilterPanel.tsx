import { useEffect, useState } from 'react';
import { DEFAULT_CLIP_FILTER, FILTER_PRESETS, filterThumbnail, type ClipFilter, type FilterId } from '../../lib/filters';
import { clipAt, layoutMain } from '../../lib/timeline';
import type { ProjectData } from '../../lib/types';
import { Button, useToast } from '../../components/ui';
import { Slider } from '../Inspector';
import { useEditor } from '../store';

const ADJUSTMENTS: { key: keyof ClipFilter; label: string; min: number; max: number; format?: (v: number) => string }[] = [
  { key: 'brightness', label: '亮度', min: -50, max: 50 },
  { key: 'contrast', label: '對比', min: -50, max: 50 },
  { key: 'saturation', label: '飽和度', min: -50, max: 50 },
  { key: 'temperature', label: '色溫', min: -50, max: 50, format: (v) => (v === 0 ? '0' : v > 0 ? `暖 ${v}` : `冷 ${-v}`) },
  { key: 'vignette', label: '暗角', min: 0, max: 100 },
  { key: 'grain', label: '顆粒', min: 0, max: 100 },
];

export function FilterPanel() {
  const toast = useToast();
  const data = useEditor((s) => s.data);
  const time = useEditor((s) => s.time);
  const selection = useEditor((s) => s.selection);
  const { commit, live, checkpoint } = useEditor.getState();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  // 處理對象：選取中的主軌片段，否則是播放頭所在的片段
  const placed = layoutMain(data.clips);
  const clip = (selection?.type === 'clip' && placed.find((c) => c.id === selection.id)) || clipAt(placed, time);
  const media = clip ? data.media.find((m) => m.id === clip.mediaId) : undefined;
  const filter = { ...DEFAULT_CLIP_FILTER, ...clip?.filter };

  // 用這段素材的縮圖產生每個濾鏡的預覽圖
  useEffect(() => {
    if (!media?.thumb) return setThumbs({});
    const img = new Image();
    img.onload = () => {
      const out: Record<string, string> = {};
      for (const p of FILTER_PRESETS) out[p.id] = filterThumbnail(img, img.naturalWidth, img.naturalHeight, { ...DEFAULT_CLIP_FILTER, preset: p.id });
      setThumbs(out);
    };
    img.src = media.thumb;
  }, [media?.id, media?.thumb]);

  if (!clip || !media || media.kind === 'audio') {
    return (
      <div className="p-4">
        <h2 className="text-sm font-extrabold">濾鏡</h2>
        <div className="mt-4 rounded-2xl border-2 border-dashed border-line p-6 text-center text-xs leading-relaxed text-ink-soft">
          把播放頭移到要套用的影片上，
          <br />
          或在時間軸點選主軌片段。
        </div>
      </div>
    );
  }

  const set = (patch: Partial<ClipFilter>, record = true) => {
    const fn = (d: ProjectData) => ({ ...d, clips: d.clips.map((c) => (c.id === clip.id ? { ...c, filter: { ...DEFAULT_CLIP_FILTER, ...c.filter, ...patch } } : c)) });
    record ? commit(fn) : live(fn);
  };
  const pick = (preset: FilterId) => set({ preset, intensity: preset === filter.preset ? filter.intensity : 1 });
  const applyAll = () => {
    commit((d) => ({ ...d, clips: d.clips.map((c) => ({ ...c, filter: { ...filter } })) }));
    toast(`已套用到全部 ${data.clips.length} 個片段`, 'success');
  };
  const index = placed.findIndex((c) => c.id === clip.id) + 1;

  return (
    <div className="p-4">
      <h2 className="text-sm font-extrabold">濾鏡</h2>
      <p className="mt-1 text-xs text-ink-mute">原創色彩風格，無版權問題。套用在單一片段，也可以一鍵套用到全部。</p>

      <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-sunken/70 p-2.5">
        {media.thumb && <img src={media.thumb} alt="" className="h-10 w-14 rounded-lg object-cover" />}
        <div className="min-w-0 text-xs">
          <div className="truncate font-bold">片段 {index}：{media.name}</div>
          <div className="text-ink-mute">目前：{FILTER_PRESETS.find((p) => p.id === filter.preset)?.name}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {FILTER_PRESETS.map((p) => {
          const active = filter.preset === p.id;
          return (
            <button key={p.id} onClick={() => pick(p.id)} className="group text-center">
              <div className={`aspect-square overflow-hidden rounded-xl border-2 bg-sunken transition ${active ? 'border-brand' : 'border-transparent group-hover:border-brand/40'}`}>
                {thumbs[p.id] ? <img src={thumbs[p.id]} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full animate-pulse bg-sunken" />}
              </div>
              <div className={`mt-1 text-[11px] font-bold ${active ? 'text-brand' : 'text-ink-soft'}`}>{p.name}</div>
            </button>
          );
        })}
      </div>

      {filter.preset !== 'none' && (
        <div className="mt-4">
          <Slider label="濾鏡強度" value={Math.round(filter.intensity * 100)} min={0} max={100} format={(v) => `${v}%`} onStart={checkpoint} onChange={(v) => set({ intensity: v / 100 }, false)} />
        </div>
      )}

      <div className="mt-5 border-t border-line pt-4">
        <div className="mb-3 text-xs font-extrabold text-ink-soft">調整</div>
        <div className="space-y-3">
          {ADJUSTMENTS.map((a) => (
            <Slider
              key={a.key}
              label={a.label}
              value={filter[a.key] as number}
              min={a.min}
              max={a.max}
              format={a.format}
              onStart={checkpoint}
              onChange={(v) => set({ [a.key]: v }, false)}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={() => commit((d) => ({ ...d, clips: d.clips.map((c) => (c.id === clip.id ? { ...c, filter: undefined } : c)) }))}>
          重設
        </Button>
        <Button size="sm" onClick={applyAll} disabled={data.clips.length < 2}>
          套用到全部片段
        </Button>
      </div>
    </div>
  );
}
