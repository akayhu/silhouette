import { useRef, useState } from 'react';
import { ChevronDown, Volume2, VolumeX } from 'lucide-react';
import type { AudioClip, MediaItem, ProjectData } from '../../lib/types';
import { useEditor } from '../store';
import { ensureUnlocked } from '../locks';

/**
 * 聲音大小：一次調整整組聲音（影片原聲、背景音樂、音效、朗讀配音），
 * 也可以展開逐條調整時間軸上的每段聲音。100% 是原本的音量，最大 200%。
 */

type Group = 'video' | 'music' | 'sfx' | 'voice';
const GROUPS: { id: Group; label: string; hint: string }[] = [
  { id: 'video', label: '影片原聲', hint: '主軌與疊加影片本身的聲音' },
  { id: 'music', label: '背景音樂', hint: '配樂與你加入的音樂' },
  { id: 'sfx', label: '音效', hint: '叮、咻等短音效' },
  { id: 'voice', label: '朗讀配音', hint: '文字朗讀產生的人聲' },
];

const groupOfAudio = (m: MediaItem | undefined): Group => (m?.origin === 'tts' ? 'voice' : m && /\/music\/sfx-/.test(m.url) ? 'sfx' : 'music');

function members(d: ProjectData, g: Group) {
  const media = new Map(d.media.map((m) => [m.id, m]));
  if (g === 'video') {
    const isVideo = (id: string) => media.get(id)?.kind === 'video';
    return { clips: d.clips.filter((c) => isVideo(c.mediaId)), overlays: d.overlays.filter((o) => isVideo(o.mediaId)), audio: [] as AudioClip[] };
  }
  return { clips: [], overlays: [], audio: d.audio.filter((a) => groupOfAudio(media.get(a.mediaId)) === g) };
}

function setGroupVolume(d: ProjectData, g: Group, volume: number): ProjectData {
  const m = members(d, g);
  const ids = new Set([...m.clips, ...m.overlays, ...m.audio].map((x) => x.id));
  return {
    ...d,
    clips: d.clips.map((c) => (ids.has(c.id) ? { ...c, volume } : c)),
    overlays: d.overlays.map((o) => (ids.has(o.id) ? { ...o, volume } : o)),
    audio: d.audio.map((a) => (ids.has(a.id) ? { ...a, volume } : a)),
  };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function VolumeRow({
  label,
  hint,
  value,
  mixed,
  onStart,
  onChange,
  onToggleMute,
}: {
  label: string;
  hint?: string;
  value: number;
  mixed?: boolean;
  onStart: () => void;
  onChange: (v: number) => void;
  onToggleMute: () => void;
}) {
  const muted = value === 0;
  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleMute}
          className={`grid size-7 shrink-0 place-items-center rounded-lg transition ${muted ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-sunken hover:text-ink'}`}
          aria-label={muted ? `取消靜音：${label}` : `靜音：${label}`}
          aria-pressed={muted}
          title={muted ? '取消靜音' : '靜音'}
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-bold">{label}</span>
            <span className="shrink-0 font-semibold text-ink-soft tabular-nums">{mixed ? '各自不同' : pct(value)}</span>
          </div>
          {hint && <div className="truncate text-[11px] text-ink-mute">{hint}</div>}
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={200}
        step={5}
        value={Math.round(value * 100)}
        aria-label={`${label}音量`}
        onPointerDown={onStart}
        onKeyDown={onStart}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="mt-1.5 w-full accent-brand"
      />
    </div>
  );
}

export function SoundMixer() {
  const data = useEditor((s) => s.data);
  const [open, setOpen] = useState(false);
  // 記住靜音前的音量，取消靜音時還原
  const before = useRef(new Map<string, number>());
  const { checkpoint, live, select } = useEditor.getState();

  const groups = GROUPS.map((g) => {
    const m = members(data, g.id);
    const vols = [...m.clips, ...m.overlays, ...m.audio].map((x) => x.volume);
    return { ...g, count: vols.length, value: vols[0] ?? 1, mixed: vols.some((v) => Math.abs(v - vols[0]) > 0.001) };
  }).filter((g) => g.count > 0);

  const media = new Map(data.media.map((m) => [m.id, m]));
  const tracks = [...data.audio].sort((a, b) => a.start - b.start);

  const unlocked = (g: Group) => (g === 'video' ? ensureUnlocked('main', 'overlay') : ensureUnlocked('audio'));
  const setGroup = (g: Group, v: number) => live((d) => setGroupVolume(d, g, v));
  const toggleGroup = (g: Group, value: number) => {
    if (!unlocked(g)) return;
    checkpoint();
    const key = 'g:' + g;
    if (value > 0) {
      before.current.set(key, value);
      setGroup(g, 0);
    } else setGroup(g, before.current.get(key) ?? (g === 'music' ? 0.5 : 1));
  };
  const setTrack = (id: string, v: number) => live((d) => ({ ...d, audio: d.audio.map((a) => (a.id === id ? { ...a, volume: v } : a)) }));
  const toggleTrack = (a: AudioClip) => {
    if (!ensureUnlocked('audio')) return;
    checkpoint();
    const key = 't:' + a.id;
    if (a.volume > 0) {
      before.current.set(key, a.volume);
      setTrack(a.id, 0);
    } else setTrack(a.id, before.current.get(key) ?? 1);
  };

  if (!groups.length) return null;

  return (
    <section className="mt-4 rounded-2xl border border-line p-3" aria-label="聲音大小">
      <h3 className="text-xs font-extrabold">聲音大小</h3>
      <div className="mt-3 space-y-4">
        {groups.map((g) => (
          <VolumeRow
            key={g.id}
            label={g.label}
            hint={`${g.hint}・${g.count} 段`}
            value={g.value}
            mixed={g.mixed}
            onStart={() => unlocked(g.id) && checkpoint()}
            onChange={(v) => setGroup(g.id, v)}
            onToggleMute={() => toggleGroup(g.id, g.value)}
          />
        ))}
      </div>
      {tracks.length > 0 && (
        <>
          <button onClick={() => setOpen(!open)} aria-expanded={open} className="mt-4 flex w-full items-center justify-between border-t border-line pt-3 text-xs font-bold text-ink-soft hover:text-ink">
            逐條調整（{tracks.length} 段聲音）
            <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <div className="mt-3 space-y-4">
              {tracks.map((a) => {
                const m = media.get(a.mediaId);
                return (
                  <div key={a.id} onClick={() => select({ type: 'audio', id: a.id })}>
                    <VolumeRow
                      label={m?.name ?? '聲音'}
                      hint={`${GROUPS.find((g) => g.id === groupOfAudio(m))!.label}・從 ${a.start.toFixed(1)} 秒開始`}
                      value={a.volume}
                      onStart={() => ensureUnlocked('audio') && checkpoint()}
                      onChange={(v) => setTrack(a.id, v)}
                      onToggleMute={() => toggleTrack(a)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-ink-mute">100% 是原本的音量。單一片段也可以在時間軸點選後，於右側屬性調整。</p>
    </section>
  );
}
