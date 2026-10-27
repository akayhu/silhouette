import { useEffect, useMemo, useRef, useState } from 'react';
import { isMissing, isOnServer, moveToDevice, relinkFiles, saveLocalFile, storageUsage } from '../../lib/localMedia';
import { AlertTriangle, Film, HardDrive, ImageIcon, Layers, Loader2, Music, Plus, Sparkles, Trash2, UploadCloud } from 'lucide-react';
import { formatTime, uid } from '../../lib/format';
import { kindOf, probe, videoPoster } from '../../lib/media';
import type { MediaItem, ProjectData } from '../../lib/types';
import { ProBadge, useToast, useUpgrade } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useAutoEdit } from '../AutoEditDialog';
import { useEditor } from '../store';
import { ensureUnlocked } from '../locks';
import { DEFAULT_OVERLAY_TRANSFORM, freeOverlayLane } from '../../lib/timeline';

export function addToTimeline(m: MediaItem) {
  if (!ensureUnlocked(m.kind === 'audio' ? 'audio' : 'main')) return;
  const { commit, time } = useEditor.getState();
  if (m.kind === 'audio') {
    commit((d) => ({ ...d, audio: [...d.audio, { id: uid(), mediaId: m.id, start: time, in: 0, out: m.duration, volume: 1 }] }));
  } else {
    commit((d) => ({ ...d, clips: [...d.clips, { id: uid(), mediaId: m.id, in: 0, out: m.duration, speed: 1, volume: 1 }] }));
  }
}

/** 疊加到主軌上方：從播放頭開始，找沒被佔用的最低層；佔滿就往上疊一層 */
export function addToOverlay(m: MediaItem) {
  if (!ensureUnlocked('overlay')) return;
  const { commit, time, select, data } = useEditor.getState();
  const len = m.kind === 'image' ? 3 : m.duration;
  const lane = freeOverlayLane(data.overlays, time, time + len);
  // 每往上一層位置稍微錯開，疊起來看得出層次
  const offset = Math.min(lane, 3) * 0.06;
  const item = {
    id: uid(),
    mediaId: m.id,
    start: time,
    in: 0,
    out: len,
    speed: 1,
    volume: 1,
    lane,
    opacity: 1,
    transform: { ...DEFAULT_OVERLAY_TRANSFORM, x: 0.18 - offset, y: -0.22 + offset },
  };
  commit((d) => ({ ...d, overlays: [...d.overlays, item] }));
  select({ type: 'overlay', id: item.id });
}

const AUTO_KEY = 'pianke.autoEdit';
const readAuto = () => {
  try {
    return localStorage.getItem(AUTO_KEY) !== 'off';
  } catch {
    return true;
  }
};

export function MediaPanel() {
  const projectId = useEditor((s) => s.projectId)!;
  const media = useEditor((s) => s.data.media);
  const clips = useEditor((s) => s.data.clips);
  const audio = useEditor((s) => s.data.audio);
  const used = useMemo(() => new Set([...clips.map((c) => c.mediaId), ...audio.map((a) => a.mediaId)]), [clips, audio]);
  const [uploading, setUploading] = useState<{ name: string }[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const upgrade = useUpgrade();
  const { user } = useAuth();
  const isPro = user?.plan === 'pro';
  // 上傳影片後自動剪空拍、上字幕（專業版）；開關記在這台瀏覽器
  const [autoOn, setAutoOn] = useState(readAuto);
  const autoEdit = isPro && autoOn;
  const toggleAuto = (on: boolean) => {
    if (on && !isPro) return upgrade('上傳後自動剪輯是專業版功能，會自動剪掉空拍並加上字幕。');
    setAutoOn(on);
    try {
      localStorage.setItem(AUTO_KEY, on ? 'on' : 'off');
    } catch {
      /* 無法儲存就只在這次有效 */
    }
  };

  const upload = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const kind = kindOf(file);
      if (!kind) {
        toast(`不支援的檔案：${file.name}`, 'error');
        continue;
      }
      const item = { name: file.name };
      setUploading((u) => [...u, item]);
      const local = URL.createObjectURL(file);
      try {
        const meta = await probe(local, kind);
        const thumb = kind === 'video' ? await videoPoster(local) : kind === 'image' ? await imageThumb(local) : undefined;
        // 本機優先：檔案只存在這台裝置，不上傳到伺服器
        const id = uid();
        const { url, local: stored } = await saveLocalFile(id, file, file.name);
        const m: MediaItem = { id, name: file.name.replace(/\.[^.]+$/, ''), kind, url, origin: 'upload', thumb, local: stored, ...meta };
        const first = useEditor.getState().data.clips.length === 0 && kind !== 'audio';
        useEditor.getState().commit((d) => ({ ...d, media: [...d.media, m] }));
        // 影片交給自動剪輯，分析完讓使用者選版本後才放上時間軸
        if (kind === 'video' && autoEdit) useAutoEdit.getState().enqueue(m);
        else if (first) addToTimeline(m);
      } catch (err) {
        toast((err as Error).message, 'error');
      } finally {
        URL.revokeObjectURL(local);
        setUploading((u) => u.filter((x) => x !== item));
      }
    }
  };

  const missing = media.filter(isMissing);
  const relinkInput = useRef<HTMLInputElement>(null);
  const [relinking, setRelinking] = useState(false);
  const relink = async (files: FileList) => {
    setRelinking(true);
    try {
      const found = await relinkFiles(useEditor.getState().data.media, Array.from(files));
      if (found.length) {
        patchMedia(new Map(found.map((f) => [f.id, { url: f.url }])));
      }
      const left = missing.length - found.length;
      toast(found.length ? `已找回 ${found.length} 個素材${left ? `，還有 ${left} 個沒配對到` : ''}` : '選的檔案和找不到的素材對不上，請確認是原本的檔案', found.length && !left ? 'success' : 'info');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setRelinking(false);
    }
  };

  // 舊專案還放在伺服器上的素材：移到這台裝置
  const remote = media.filter(isOnServer);
  const [moving, setMoving] = useState<string | null>(null);
  const move = async () => {
    setMoving('準備中…');
    try {
      const moved = await moveToDevice(useEditor.getState().data.media, (done, total) => setMoving(`下載中 ${done}／${total}`));
      patchMedia(new Map(moved.map((m) => [m.id, { url: m.url, local: m.local }])));
      toast(`已把 ${moved.length} 個素材移到這台裝置，伺服器上的檔案會在存檔後刪除`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setMoving(null);
    }
  };

  // 這台裝置的瀏覽器空間用量
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  useEffect(() => {
    void storageUsage().then(setUsage);
  }, [media.length]);

  const removeMedia = (m: MediaItem) => {
    useEditor.getState().commit((d) => ({
      ...d,
      media: d.media.filter((x) => x.id !== m.id),
      clips: d.clips.filter((c) => c.mediaId !== m.id),
      audio: d.audio.filter((a) => a.mediaId !== m.id),
    }));
  };

  return (
    <div className="p-4">
      <h2 className="text-sm font-extrabold">素材庫</h2>
      <button
        onClick={() => input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload(e.dataTransfer.files);
        }}
        className={`mt-3 flex w-full flex-col items-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${over ? 'border-brand bg-brand-soft/60' : 'border-line hover:border-brand/50 hover:bg-brand-soft/30'}`}
      >
        <UploadCloud className="size-7 text-brand" />
        <span className="mt-2 text-sm font-bold">加入影片、圖片、音樂</span>
        <span className="mt-0.5 text-xs text-ink-mute">點一下或把檔案拖進來</span>
      </button>
      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-mute">
        <HardDrive className="mt-0.5 size-3.5 shrink-0" />
        素材只存在這台裝置的瀏覽器裡，不會上傳。換電腦或清除瀏覽器資料後需要重新提供素材，請保留原始檔案。
      </p>
      {usage && (
        <p className="mt-1 pl-5 text-[11px] text-ink-mute tabular-nums">
          這台裝置已使用 {formatBytes(usage.used)}，瀏覽器可用上限約 {formatBytes(usage.quota)}
        </p>
      )}
      {remote.length > 0 && (
        <div className="mt-3 rounded-xl border border-line bg-sunken/60 p-3">
          <div className="text-xs font-bold">{remote.length} 個素材還存在伺服器上</div>
          <div className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">
            這是改成本機剪輯之前上傳的。移到這台裝置後，伺服器上的檔案會刪除；之後換裝置時，需要重新提供素材。
          </div>
          <button
            className="mt-2 w-full rounded-lg border border-ink/20 bg-surface py-2 text-xs font-bold hover:border-brand hover:text-brand disabled:opacity-50"
            disabled={!!moving}
            onClick={() => void move()}
          >
            {moving ?? '移到這台裝置'}
          </button>
        </div>
      )}
      {missing.length > 0 && (
        <div className="mt-3 rounded-xl border border-brand/30 bg-brand-soft/40 p-3" role="alert">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brand" />
            <div className="min-w-0 flex-1 text-xs">
              <div className="font-bold">這台裝置找不到 {missing.length} 個素材</div>
              <div className="mt-0.5 leading-relaxed text-ink-soft">
                可能是換了電腦或清除過瀏覽器資料。選回原本的檔案就能接著剪（可以一次選多個，會依檔名和大小自動配對）。
              </div>
              <div className="mt-1 truncate text-[11px] text-ink-mute">{missing.map((m) => m.local!.fileName).join('、')}</div>
            </div>
          </div>
          <button
            className="mt-2 w-full rounded-lg bg-brand py-2 text-xs font-bold text-white hover:bg-brand-hover disabled:opacity-50"
            disabled={relinking}
            onClick={() => relinkInput.current?.click()}
          >
            {relinking ? '配對中…' : '重新提供素材'}
          </button>
          <input ref={relinkInput} type="file" multiple accept="video/*,image/*,audio/*" className="hidden" onChange={(e) => (e.target.files && relink(e.target.files), (e.target.value = ''))} />
        </div>
      )}
      <input ref={input} type="file" multiple accept="video/*,image/*,audio/*" className="hidden" onChange={(e) => (e.target.files && upload(e.target.files), (e.target.value = ''))} />
      <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 rounded-xl bg-sunken/60 px-3 py-2.5">
        <input type="checkbox" checked={autoEdit} onChange={(e) => toggleAuto(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand" />
        <span className="min-w-0 text-xs">
          <span className="flex items-center gap-1.5 font-bold">
            <Sparkles className="size-3.5 text-coral" /> 加入影片後自動剪輯
            {!isPro && <ProBadge />}
          </span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-mute">剪掉沒有人聲的空拍、自動上字幕，完成後讓你選剪輯前或剪輯後的版本。</span>
        </span>
      </label>

      <div className="mt-4 space-y-2">
        {uploading.map((u) => (
          <div key={u.name} className="flex items-center gap-3 rounded-xl bg-sunken/70 p-2 text-xs font-semibold text-ink-soft">
            <Loader2 className="size-4 animate-spin" /> 加入中：<span className="truncate">{u.name}</span>
          </div>
        ))}
        {media.length === 0 && uploading.length === 0 && <p className="py-6 text-center text-xs text-ink-mute">還沒有素材</p>}
        {media.map((m) => (
          <div key={m.id} className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-1.5 transition hover:border-brand/40 hover:shadow-card">
            <div className="relative grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-sunken">
              {m.thumb ? <img src={m.thumb} alt="" className="h-full w-full object-cover" /> : m.kind === 'audio' ? <Music className="size-5 text-mint" /> : <Film className="size-5 text-ink-mute" />}
              <span className="absolute right-0.5 bottom-0.5 rounded bg-white/90 px-1 text-[9px] font-bold text-ink">{formatTime(m.duration)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold">{m.name}</div>
              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-ink-mute">
                {m.kind === 'video' ? <Film className="size-3" /> : m.kind === 'image' ? <ImageIcon className="size-3" /> : <Music className="size-3" />}
                {m.origin === 'tts' ? '朗讀配音' : m.origin === 'library' ? '音樂庫' : m.kind === 'video' ? '影片' : m.kind === 'image' ? '圖片' : '音訊'}
                {used.has(m.id) && <span className="ml-1 rounded bg-mint-soft px-1 font-bold text-mint">使用中</span>}
                {isMissing(m) && <span className="ml-1 rounded bg-brand-soft px-1 font-bold text-brand">需重新提供</span>}
              </div>
            </div>
            <button onClick={() => removeMedia(m)} className="rounded-lg p-1.5 text-ink-mute opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600" aria-label="移除素材">
              <Trash2 className="size-3.5" />
            </button>
            {m.kind !== 'audio' && (
              <button
                onClick={() => addToOverlay(m)}
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-ink-soft hover:border-brand/50 hover:text-brand"
                aria-label="疊加到主軌上方"
                title="疊加到主軌上方（畫中畫）"
              >
                <Layers className="size-4" />
              </button>
            )}
            <button
              onClick={() => addToTimeline(m)}
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-white hover:bg-brand-hover"
              aria-label={m.kind === 'audio' ? '加到音訊軌' : '加到主軌'}
              title={m.kind === 'audio' ? '加到音訊軌' : '接在主軌最後面'}
            >
              <Plus className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-ink-mute">按「＋」影片和圖片會接在主軌最後面，音樂會從播放頭放進音訊軌；按「疊加」會把影片或圖片疊在主軌上方（畫中畫），可以一層一層往上疊。</p>
    </div>
  );
}

function formatBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/**
 * 換掉素材的網址（重新提供素材、移到這台裝置）：不算一個編輯動作，
 * 復原紀錄裡的舊版本也一起換，按復原不會又變回找不到或指回伺服器。
 */
function patchMedia(changes: Map<string, { url: string; local?: MediaItem['local'] }>) {
  if (!changes.size) return;
  const patch = (d: ProjectData) =>
    d.media.some((m) => changes.has(m.id)) ? { ...d, media: d.media.map((m) => (changes.has(m.id) ? { ...m, ...changes.get(m.id) } : m)) } : d;
  useEditor.setState((st) => ({ data: patch(st.data), past: st.past.map(patch), future: st.future.map(patch) }));
}

function imageThumb(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const scale = 240 / Math.max(img.naturalWidth, img.naturalHeight);
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}

