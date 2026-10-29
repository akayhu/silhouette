import { useRef, useState } from 'react';
import { Check, Film, Loader2, Sparkles, UploadCloud } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { applyMixEdit, planMixEdit, type MixPlanItem } from '../../lib/mixEdit';
import type { MediaItem } from '../../lib/types';
import { Button, ProBadge, useToast, useUpgrade } from '../../components/ui';
import { Slider } from '../Inspector';
import { importMediaFile } from './MediaPanel';
import { useEditor } from '../store';
import { ensureUnlocked } from '../locks';

/**
 * 智能混剪：一次選多支素材，AI 自動幫每支挑一段接起來（有講話的留講話段，
 * 沒講話的留畫面動態最多的一段），可以順便帶字幕。不是看得懂內容的 AI，
 * 挑不出「最精彩那一刻」，接完建議再到「智能剪輯」套個模板、調整細節。
 */
export function MixPanel() {
  const { user } = useAuth();
  const upgrade = useUpgrade();
  const toast = useToast();
  const data = useEditor((s) => s.data);
  const isPro = user?.plan === 'pro';

  const videos = data.media.filter((m) => m.kind === 'video');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [perClip, setPerClip] = useState(6);
  const [withCaptions, setWithCaptions] = useState(true);
  const [uploading, setUploading] = useState(0);
  const [running, setRunning] = useState<{ i: number; total: number; name: string; stage: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const toggle = (id: string) => setPicked((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id])));

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    setUploading(list.length);
    const added: string[] = [];
    for (const file of list) {
      try {
        const m = await importMediaFile(file);
        if (m.kind === 'video') added.push(m.id);
      } catch (e) {
        toast((e as Error).message, 'error');
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
    if (added.length) setPicked((s) => new Set([...s, ...added]));
  };

  const start = async () => {
    if (!isPro) return upgrade('智能混剪是專業版功能，一次把多支素材自動接成一支。');
    if (!ensureUnlocked('main')) return;
    const medias = videos.filter((m) => picked.has(m.id));
    if (medias.length < 2) return toast('至少選 2 支影片素材', 'info');
    setRunning({ i: 0, total: medias.length, name: medias[0].name, stage: '準備中' });
    try {
      const plan = await planMixEdit(medias, { perClipSeconds: perClip }, (i, total, stage) =>
        setRunning({ i, total, name: medias[i]?.name ?? '', stage: stageLabel(stage) }),
      );
      const style = data.captions[0]?.style;
      useEditor.getState().commit((d) => applyMixEdit(d, plan, { withCaptions, style }));
      const failed = plan.filter((p) => p.error).length;
      const totalSec = plan.reduce((n, p) => n + p.ranges.reduce((s, [a, b]) => s + (b - a), 0), 0);
      toast(`已接好 ${plan.length} 支素材，共約 ${Math.round(totalSec)} 秒${failed ? `，${failed} 支分析失敗改用開頭片段` : ''}`, 'success');
      setPicked(new Set());
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold">智能混剪</h2>
        {!isPro && <ProBadge />}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-mute">
        一次選多支素材，AI 自動幫每支挑一段接起來：有講話的留講話段，沒講話的留畫面動態最多的一段。
      </p>

      <input
        ref={input}
        type="file"
        multiple
        accept="video/*"
        className="hidden"
        onChange={(e) => (e.target.files && void addFiles(e.target.files), (e.target.value = ''))}
      />
      <Button variant="secondary" className="mt-3 w-full" onClick={() => input.current?.click()} disabled={uploading > 0}>
        {uploading > 0 ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
        {uploading > 0 ? `上傳中 ${uploading} 支…` : '加入新的影片素材'}
      </Button>

      {videos.length === 0 ? (
        <div className="mt-4 rounded-2xl border-2 border-dashed border-line p-6 text-center text-xs leading-relaxed text-ink-soft">
          還沒有影片素材，
          <br />
          先加入幾支要混剪的影片。
        </div>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {videos.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => toggle(m.id)}
                aria-pressed={picked.has(m.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl border p-2 text-left transition ${
                  picked.has(m.id) ? 'border-brand bg-brand-soft/50' : 'border-line hover:bg-sunken'
                }`}
              >
                <span className={`grid size-5 shrink-0 place-items-center rounded-md border-2 ${picked.has(m.id) ? 'border-brand bg-brand text-white' : 'border-line'}`}>
                  {picked.has(m.id) && <Check className="size-3.5" />}
                </span>
                {m.thumb ? <img src={m.thumb} alt="" className="h-10 w-14 shrink-0 rounded-lg object-cover" /> : <Film className="size-5 shrink-0 text-ink-mute" />}
                <span className="min-w-0 flex-1 truncate text-xs font-bold">{m.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 space-y-3">
        <Slider label="每支最多保留" value={perClip} min={2} max={15} format={(v) => `${v} 秒`} onChange={setPerClip} />
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
          <input type="checkbox" checked={withCaptions} onChange={(e) => setWithCaptions(e.target.checked)} className="accent-brand" /> 講話的段落自動帶字幕
        </label>
      </div>

      {running ? (
        <div className="mt-5 rounded-2xl bg-sunken/70 p-3 text-xs">
          <div className="flex items-center gap-2 font-bold">
            <Loader2 className="size-4 shrink-0 animate-spin text-brand" />
            第 {running.i + 1}／{running.total} 支：{running.name}
          </div>
          <div className="mt-1 text-ink-mute">{running.stage}</div>
        </div>
      ) : (
        <Button className="mt-5 w-full" onClick={start} disabled={picked.size < 2}>
          <Sparkles className="size-4" /> 開始混剪（已選 {picked.size} 支）
        </Button>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-ink-mute">
        這是語音辨識＋畫面動態分析，不是看得懂內容的 AI，挑不出「最精彩那一刻」。接完建議到「智能剪輯」套個模板，或自己微調順序、濾鏡和配樂。
      </p>
    </div>
  );
}

function stageLabel(stage: string) {
  if (stage === 'audio') return '讀取影片音軌';
  if (stage === 'silence') return '偵測空拍與停頓';
  if (stage === 'download' || stage === 'speech') return '辨識語音';
  return stage;
}
