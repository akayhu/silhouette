import { useState } from 'react';
import { Captions, Loader2, Scissors, Sparkles } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { ASR_MODELS, isFiller, transcribe } from '../../lib/asr';
import { decodeAudio, detectSilence, sliceMono } from '../../lib/media';
import { layoutMain, newCaption, rippleRemove } from '../../lib/timeline';
import type { Caption } from '../../lib/types';
import { Button, ProBadge, useToast, useUpgrade } from '../../components/ui';
import { Chips, Slider } from '../Inspector';
import { useEditor } from '../store';
import { ensureUnlocked } from '../locks';

type Range = [number, number];

export function AIPanel() {
  const { user } = useAuth();
  const upgrade = useUpgrade();
  const isPro = user?.plan === 'pro';
  return (
    <div className="divide-y divide-line">
      {!isPro && (
        <div className="p-4">
          <button onClick={() => upgrade('AI 工具是專業版功能。')} className="w-full rounded-2xl bg-[linear-gradient(120deg,#ecebff,#fff0eb)] p-4 text-left">
            <ProBadge />
            <div className="mt-2 text-sm font-extrabold">升級解鎖 AI 工具</div>
            <div className="mt-0.5 text-xs text-ink-soft">自動字幕、智能口播不限次數</div>
          </button>
        </div>
      )}
      <AutoCaptions isPro={isPro} />
      <SmartCut isPro={isPro} />
    </div>
  );
}

function AutoCaptions({ isPro }: { isPro: boolean }) {
  const upgrade = useUpgrade();
  const toast = useToast();
  const [model, setModel] = useState<string>(ASR_MODELS[0].id);
  const [status, setStatus] = useState<string | null>(null);

  const run = async () => {
    if (!isPro) return upgrade('AI 自動字幕是專業版功能，升級後可以自動聽寫影片並產生字幕。');
    if (!ensureUnlocked('caption')) return;
    const { data, commit } = useEditor.getState();
    const media = new Map(data.media.map((m) => [m.id, m]));
    const clips = layoutMain(data.clips).filter((c) => media.get(c.mediaId)?.kind === 'video');
    if (!clips.length) return toast('主軌上還沒有影片', 'error');
    const style = data.captions[0]?.style;
    const out: Caption[] = [];
    try {
      for (const [i, clip] of clips.entries()) {
        const label = clips.length > 1 ? `（${i + 1}/${clips.length}）` : '';
        setStatus(`讀取音軌${label}`);
        const buffer = await decodeAudio(media.get(clip.mediaId)!.url);
        const samples = await sliceMono(buffer, clip.in, clip.out, 16000);
        const segs = await transcribe(samples, model, (p) =>
          setStatus(p.phase === 'download' ? `下載語音模型 ${Math.round(p.progress ?? 0)}%（只有第一次）` : `辨識中${label}…`),
        );
        for (const s of segs) {
          const start = clip.start + s.start / clip.speed;
          const end = Math.min(clip.end, clip.start + s.end / clip.speed);
          if (end - start > 0.05) out.push(newCaption(start, end, s.text, style));
        }
      }
      commit((d) => ({ ...d, captions: out }));
      toast(out.length ? `已產生 ${out.length} 句字幕` : '沒有辨識到語音', out.length ? 'success' : 'info');
    } catch (e) {
      toast('自動字幕失敗：' + (e as Error).message, 'error');
    } finally {
      setStatus(null);
    }
  };

  return (
    <section className="p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl bg-coral-soft text-coral">
          <Captions className="size-4" />
        </span>
        <h2 className="text-sm font-extrabold">AI 自動字幕</h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">聽寫主軌影片的語音，自動產生繁體中文字幕。會取代目前的字幕，完成後可以逐句修改。</p>
      <div className="mt-3">
        <div className="mb-1.5 text-xs font-semibold text-ink-soft">辨識模型</div>
        <Chips options={ASR_MODELS.map((m) => ({ id: m.id, label: m.label }))} value={model} onChange={setModel} />
      </div>
      <Button className="mt-4 w-full" onClick={run} disabled={!!status}>
        {status ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {status ?? '開始產生字幕'}
      </Button>
      <p className="mt-2 text-[11px] text-ink-mute">語音辨識在你的瀏覽器裡執行，影片不會傳到外部服務。</p>
    </section>
  );
}

function SmartCut({ isPro }: { isPro: boolean }) {
  const upgrade = useUpgrade();
  const toast = useToast();
  const hasCaptions = useEditor((s) => s.data.captions.length > 0);
  const [threshold, setThreshold] = useState(-38);
  const [minSilence, setMinSilence] = useState(0.5);
  const [padding, setPadding] = useState(0.12);
  const [fillers, setFillers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ ranges: Range[]; silences: number; fillers: number; seconds: number } | null>(null);

  const analyze = async () => {
    if (!isPro) return upgrade('智能口播是專業版功能，可以自動剪掉影片中的停頓和口誤。');
    if (!ensureUnlocked('main')) return;
    setBusy(true);
    setFound(null);
    try {
      const { data } = useEditor.getState();
      const media = new Map(data.media.map((m) => [m.id, m]));
      const ranges: Range[] = [];
      let silences = 0;
      for (const clip of layoutMain(data.clips)) {
        const m = media.get(clip.mediaId);
        if (m?.kind !== 'video') continue;
        const buffer = await decodeAudio(m.url).catch(() => null);
        if (!buffer) continue;
        const gaps = await detectSilence(buffer, clip.in, clip.out, { thresholdDb: threshold, minSilence, padding });
        silences += gaps.length;
        gaps.forEach(([a, b]) => ranges.push([clip.start + (a - clip.in) / clip.speed, clip.start + (b - clip.in) / clip.speed]));
      }
      const fillerCaps = fillers ? data.captions.filter((c) => isFiller(c.text)) : [];
      fillerCaps.forEach((c) => ranges.push([c.start, c.end]));
      const seconds = merged(ranges).reduce((s, [a, b]) => s + b - a, 0);
      setFound({ ranges, silences, fillers: fillerCaps.length, seconds });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!found) return;
    useEditor.getState().commit((d) => rippleRemove(d, found.ranges));
    toast(`已剪掉 ${found.seconds.toFixed(1)} 秒`, 'success');
    setFound(null);
  };

  return (
    <section className="p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl bg-mint-soft text-mint">
          <Scissors className="size-4" />
        </span>
        <h2 className="text-sm font-extrabold">智能口播</h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">自動找出沒在說話的空檔，一鍵剪掉。字幕和配音會跟著往前移。</p>
      <div className="mt-4 space-y-3">
        <Slider label="靜音判定" value={threshold} min={-60} max={-20} format={(v) => `${v} dB${v > -32 ? '（積極）' : v < -46 ? '（保守）' : ''}`} onChange={(v) => (setThreshold(v), setFound(null))} />
        <Slider label="停頓超過" value={minSilence} min={0.2} max={2} step={0.05} format={(v) => `${v.toFixed(2)} 秒才剪`} onChange={(v) => (setMinSilence(v), setFound(null))} />
        <Slider label="前後保留" value={padding} min={0} max={0.4} step={0.02} format={(v) => `${v.toFixed(2)} 秒`} onChange={(v) => (setPadding(v), setFound(null))} />
        <label className={`flex items-start gap-2 text-xs ${hasCaptions ? 'text-ink' : 'text-ink-mute'}`}>
          <input type="checkbox" className="mt-0.5 accent-brand" checked={fillers && hasCaptions} disabled={!hasCaptions} onChange={(e) => (setFillers(e.target.checked), setFound(null))} />
          <span>
            一併剪掉只有「嗯、啊、呃」的口誤字幕
            {!hasCaptions && <span className="block text-[11px]">需要先產生字幕</span>}
          </span>
        </label>
      </div>
      {found ? (
        <div className="mt-4 rounded-2xl bg-mint-soft/70 p-3">
          <div className="text-sm font-extrabold text-[#0d6b52]">找到 {found.silences} 段停頓{found.fillers ? `、${found.fillers} 段口誤` : ''}</div>
          <div className="text-xs text-ink-soft">共可剪掉 {found.seconds.toFixed(1)} 秒</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" onClick={() => setFound(null)}>
              取消
            </Button>
            <Button size="sm" onClick={apply} disabled={!found.ranges.length}>
              套用剪輯
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-4 w-full" onClick={analyze} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Scissors className="size-4" />}
          {busy ? '分析音訊中…' : '分析停頓'}
        </Button>
      )}
    </section>
  );
}

function merged(ranges: Range[]) {
  const out: Range[] = [];
  for (const r of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([...r]);
  }
  return out;
}
