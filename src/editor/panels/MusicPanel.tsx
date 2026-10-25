import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Pause, Play, Plus, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { formatTime, uid } from '../../lib/format';
import { mainDuration } from '../../lib/timeline';
import type { LibraryTrack, MediaItem } from '../../lib/types';
import { useToast } from '../../components/ui';
import { Chips } from '../Inspector';
import { useEditor } from '../store';

type Tab = 'music' | 'sfx';

/** 把音樂庫的曲目加到音訊軌：同一首只建立一次素材，配樂會自動配合影片長度並淡出 */
function addTrack(track: LibraryTrack) {
  const { data, time, commit, select } = useEditor.getState();
  const existing = data.media.find((m) => m.url === track.url);
  const media: MediaItem = existing ?? { id: uid(), name: track.title, kind: 'audio', url: track.url, duration: track.duration, origin: 'library' };
  const isMusic = track.category === 'music';
  const remaining = mainDuration(data.clips) - time;
  const out = isMusic && remaining > 1 ? Math.min(track.duration, remaining) : track.duration;
  const clip = {
    id: uid(),
    mediaId: media.id,
    start: time,
    in: 0,
    out,
    volume: isMusic ? 0.5 : 1,
    fadeIn: isMusic ? 0.5 : 0,
    fadeOut: isMusic ? Math.min(2, out / 4) : 0,
  };
  commit((d) => ({ ...d, media: existing ? d.media : [...d.media, media], audio: [...d.audio, clip] }));
  select({ type: 'audio', id: clip.id });
}

export function MusicPanel() {
  const toast = useToast();
  const [items, setItems] = useState<LibraryTrack[] | null>(null);
  const [license, setLicense] = useState('');
  const [tab, setTab] = useState<Tab>('music');
  const [mood, setMood] = useState('全部');
  const [query, setQuery] = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [added, setAdded] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    api
      .music()
      .then((r) => {
        setItems(r.items);
        setLicense(r.license);
      })
      .catch((e) => toast(e.message, 'error'));
    return () => audio.current?.pause();
  }, []);

  const inTab = useMemo(() => (items ?? []).filter((t) => t.category === tab), [items, tab]);
  const moods = useMemo(() => ['全部', ...new Set(inTab.map((t) => t.mood))], [inTab]);
  const list = inTab.filter((t) => (mood === '全部' || t.mood === mood) && (!query || `${t.title}${t.desc}${t.mood}`.includes(query)));

  const toggle = (t: LibraryTrack) => {
    if (playing === t.id) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    audio.current?.pause();
    const a = new Audio(t.url);
    a.volume = 0.8;
    a.ontimeupdate = () => setProgress(a.currentTime / (a.duration || t.duration));
    a.onended = () => setPlaying(null);
    a.play().catch(() => setPlaying(null));
    audio.current = a;
    setProgress(0);
    setPlaying(t.id);
  };

  const add = (t: LibraryTrack) => {
    addTrack(t);
    setAdded(t.id);
    setTimeout(() => setAdded((x) => (x === t.id ? null : x)), 1500);
  };

  return (
    <div className="p-4">
      <h2 className="text-sm font-extrabold">音樂庫</h2>
      <p className="mt-1 text-xs text-ink-mute">無版權音樂，可免費用於個人與商業影片。</p>

      <div className="mt-3 grid grid-cols-2 rounded-xl bg-sunken p-0.5">
        {(['music', 'sfx'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => (setTab(t), setMood('全部'))}
            className={`rounded-[10px] py-1.5 text-xs font-bold transition ${tab === t ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`}
          >
            {t === 'music' ? '配樂' : '音效'}
          </button>
        ))}
      </div>

      <label className="mt-3 flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-brand">
        <Search className="size-4 text-ink-mute" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋名稱或風格" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
      </label>
      <div className="mt-3">
        <Chips options={moods.map((m) => ({ id: m, label: m }))} value={mood} onChange={setMood} />
      </div>

      <ul className="mt-4 space-y-2">
        {items === null && (
          <li className="flex items-center justify-center gap-2 py-8 text-xs text-ink-mute">
            <Loader2 className="size-4 animate-spin" /> 載入中…
          </li>
        )}
        {items !== null && list.length === 0 && <li className="py-8 text-center text-xs text-ink-mute">找不到符合的{tab === 'music' ? '配樂' : '音效'}</li>}
        {list.map((t) => {
          const active = playing === t.id;
          return (
            <li key={t.id} className={`rounded-2xl border p-2.5 transition ${active ? 'border-brand/50 bg-brand-soft/30' : 'border-line bg-surface hover:border-brand/30'}`}>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => toggle(t)}
                  className={`grid size-9 shrink-0 place-items-center rounded-full transition ${active ? 'bg-brand text-white' : 'bg-sunken text-ink hover:bg-brand-soft hover:text-brand'}`}
                  aria-label={active ? `暫停 ${t.title}` : `試聽 ${t.title}`}
                >
                  {active ? <Pause className="size-4" fill="currentColor" /> : <Play className="ml-0.5 size-4" fill="currentColor" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{t.title}</div>
                  <div className="text-[11px] text-ink-mute">
                    {t.mood}
                    {t.bpm ? ` · ${t.bpm} BPM` : ''} · {formatTime(t.duration)}
                  </div>
                </div>
                <button
                  onClick={() => add(t)}
                  className={`grid size-8 shrink-0 place-items-center rounded-lg text-white transition ${added === t.id ? 'bg-mint' : 'bg-brand hover:bg-brand-hover'}`}
                  aria-label={`把 ${t.title} 加到音訊軌`}
                >
                  {added === t.id ? <Check className="size-4" /> : <Plus className="size-4" />}
                </button>
              </div>
              <Waveform peaks={t.peaks} progress={active ? progress : 0} />
              {tab === 'music' && <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{t.desc}</p>}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11px] leading-relaxed text-ink-mute">
        {license} 配樂加入時會從播放頭開始，自動配合影片長度並淡出。
      </p>
    </div>
  );
}

function Waveform({ peaks, progress }: { peaks: number[]; progress: number }) {
  return (
    <div className="mt-2 flex h-6 items-center gap-[2px]" aria-hidden>
      {peaks.map((p, i) => (
        <span
          key={i}
          className={`flex-1 rounded-full ${i / peaks.length < progress ? 'bg-brand' : 'bg-track-audio-edge/35'}`}
          style={{ height: `${Math.max(12, p * 100)}%` }}
        />
      ))}
    </div>
  );
}
