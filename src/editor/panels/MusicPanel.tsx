import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Music, Pause, Play, Plus, Search, Trash2, UploadCloud } from 'lucide-react';
import { api } from '../../lib/api';
import { formatTime, uid } from '../../lib/format';
import { audioPeaks, probe } from '../../lib/media';
import { mainDuration } from '../../lib/timeline';
import type { LibraryTrack, MediaItem } from '../../lib/types';
import { useToast } from '../../components/ui';
import { Chips } from '../Inspector';
import { useEditor } from '../store';
import { ensureUnlocked } from '../locks';

type Tab = 'music' | 'sfx' | 'mine';
const TABS: { id: Tab; label: string }[] = [
  { id: 'music', label: '配樂' },
  { id: 'sfx', label: '音效' },
  { id: 'mine', label: '我的音樂' },
];

/** 把音樂庫的曲目加到音訊軌：同一首只建立一次素材 */
function addTrack(track: LibraryTrack) {
  const existing = useEditor.getState().data.media.find((m) => m.url === track.url);
  const media: MediaItem = existing ?? { id: uid(), name: track.title, kind: 'audio', url: track.url, duration: track.duration, origin: 'library' };
  return placeAudio(media, track.category === 'music');
}

/** 從播放頭放到音訊軌；配樂會自動配合影片長度並淡出，音效保持原長 */
function placeAudio(media: MediaItem, isMusic: boolean) {
  if (!ensureUnlocked('audio')) return false;
  const { data, time, commit, select } = useEditor.getState();
  const existing = data.media.some((m) => m.id === media.id);
  const remaining = mainDuration(data.clips) - time;
  const out = isMusic && remaining > 1 ? Math.min(media.duration, remaining) : media.duration;
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
  const projectId = useEditor((s) => s.projectId);
  const allMedia = useEditor((s) => s.data.media);
  const audioClips = useEditor((s) => s.data.audio);
  const mine = useMemo(() => allMedia.filter((m) => m.kind === 'audio' && m.origin === 'upload'), [allMedia]);
  const usedAudio = useMemo(() => new Set(audioClips.map((a) => a.mediaId)), [audioClips]);
  const [uploading, setUploading] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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

  const toggle = (t: { id: string; url: string; duration: number }) => {
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

  const flash = (id: string) => {
    setAdded(id);
    setTimeout(() => setAdded((x) => (x === id ? null : x)), 1500);
  };
  const add = (t: LibraryTrack) => addTrack(t) !== false && flash(t.id);
  const addMine = (m: MediaItem) => placeAudio(m, true) !== false && flash(m.id);

  // 上傳自己的音樂：存成這個專案的音訊素材，並先算好波形
  const upload = async (files: FileList | File[]) => {
    if (!projectId) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('audio/')) {
        toast(`不是音訊檔：${file.name}`, 'error');
        continue;
      }
      setUploading((u) => [...u, file.name]);
      const local = URL.createObjectURL(file);
      try {
        const [meta, peaks] = await Promise.all([probe(local, 'audio'), audioPeaks(file)]);
        const { url } = await api.upload(projectId, file, file.name);
        const m: MediaItem = { id: uid(), name: file.name.replace(/\.[^.]+$/, ''), kind: 'audio', url, origin: 'upload', peaks, ...meta };
        useEditor.getState().commit((d) => ({ ...d, media: [...d.media, m] }));
        toast(`已上傳「${m.name}」`, 'success');
      } catch (err) {
        toast((err as Error).message || `無法讀取 ${file.name}`, 'error');
      } finally {
        URL.revokeObjectURL(local);
        setUploading((u) => u.filter((x) => x !== file.name));
      }
    }
  };
  const removeMine = (m: MediaItem) => {
    if (playing === m.id) (audio.current?.pause(), setPlaying(null));
    useEditor.getState().commit((d) => ({ ...d, media: d.media.filter((x) => x.id !== m.id), audio: d.audio.filter((a) => a.mediaId !== m.id) }));
  };

  return (
    <div className="p-4">
      <h2 className="text-sm font-extrabold">音樂庫</h2>
      <p className="mt-1 text-xs text-ink-mute">無版權音樂，可免費用於個人與商業影片；也可以上傳自己的音樂。</p>

      <div className="mt-3 grid grid-cols-3 rounded-xl bg-sunken p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => (setTab(t.id), setMood('全部'))}
            className={`rounded-[10px] py-1.5 text-xs font-bold transition ${tab === t.id ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'mine' ? (
        <div className="mt-3">
          <button
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => (e.preventDefault(), setOver(true))}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              upload(e.dataTransfer.files);
            }}
            className={`flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-3 py-5 text-center transition ${over ? 'border-brand bg-brand-soft/40' : 'border-line hover:border-brand/50 hover:bg-sunken/50'}`}
          >
            <UploadCloud className="size-6 text-brand" />
            <span className="text-sm font-bold">上傳音樂</span>
            <span className="text-[11px] text-ink-mute">點一下選擇，或把 MP3、WAV、M4A 拖進來</span>
          </button>
          <input ref={fileInput} type="file" multiple accept="audio/*" className="hidden" onChange={(e) => (e.target.files && upload(e.target.files), (e.target.value = ''))} />

          <ul className="mt-4 space-y-2">
            {uploading.map((name) => (
              <li key={name} className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-3 text-xs text-ink-soft">
                <Loader2 className="size-4 animate-spin text-brand" /> 正在上傳 {name}…
              </li>
            ))}
            {mine.length === 0 && uploading.length === 0 && (
              <li className="flex flex-col items-center gap-2 py-6 text-center text-xs text-ink-mute">
                <Music className="size-6 text-ink-mute/60" />
                還沒有上傳的音樂
              </li>
            )}
            {mine.map((m) => {
              const active = playing === m.id;
              return (
                <li key={m.id} className={`rounded-2xl border p-2.5 transition ${active ? 'border-brand/50 bg-brand-soft/30' : 'border-line bg-surface hover:border-brand/30'}`}>
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => toggle(m)}
                      className={`grid size-9 shrink-0 place-items-center rounded-full transition ${active ? 'bg-brand text-white' : 'bg-sunken text-ink hover:bg-brand-soft hover:text-brand'}`}
                      aria-label={active ? `暫停 ${m.name}` : `試聽 ${m.name}`}
                    >
                      {active ? <Pause className="size-4" fill="currentColor" /> : <Play className="ml-0.5 size-4" fill="currentColor" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{m.name}</div>
                      <div className="text-[11px] text-ink-mute">
                        {formatTime(m.duration)}
                        {usedAudio.has(m.id) && ' · 已在音訊軌'}
                      </div>
                    </div>
                    <button
                      onClick={() => removeMine(m)}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-mute transition hover:bg-red-50 hover:text-red-600"
                      aria-label={`刪除 ${m.name}`}
                      title="從專案移除"
                    >
                      <Trash2 className="size-4" />
                    </button>
                    <button
                      onClick={() => addMine(m)}
                      className={`grid size-8 shrink-0 place-items-center rounded-lg text-white transition ${added === m.id ? 'bg-mint' : 'bg-brand hover:bg-brand-hover'}`}
                      aria-label={`把 ${m.name} 加到音訊軌`}
                    >
                      {added === m.id ? <Check className="size-4" /> : <Plus className="size-4" />}
                    </button>
                  </div>
                  {m.peaks && <Waveform peaks={m.peaks} progress={active ? progress : 0} />}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[11px] leading-relaxed text-ink-mute">
            請上傳你擁有版權或已取得授權的音樂。加入時會從播放頭開始，自動配合影片長度並淡出，之後可以在音訊軌調整。
          </p>
        </div>
      ) : (
        <>
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
        </>
      )}
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
