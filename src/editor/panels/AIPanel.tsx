import { useState } from 'react';
import { Captions, Clapperboard, Loader2, Scissors, Sparkles } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { ASR_MODELS, isFiller, transcribe } from '../../lib/asr';
import { decodeAudio, detectSilence, sliceMono } from '../../lib/media';
import { layoutMain, newCaption, rippleRemove } from '../../lib/timeline';
import type { Caption, ProjectData } from '../../lib/types';
import { planAutoEffects, type AutoEffectOptions, type AutoEffectPlan, type Intensity } from '../../lib/autoEffects';
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
      <AutoEffects isPro={isPro} />
      <AutoCaptions isPro={isPro} />
      <SmartCut isPro={isPro} />
    </div>
  );
}

const INTENSITIES: { id: Intensity; label: string }[] = [
  { id: 'light', label: '輕微' },
  { id: 'normal', label: '標準' },
  { id: 'strong', label: '強烈' },
];
const PARTS: { key: keyof Omit<AutoEffectOptions, 'intensity'>; label: string; hint: string }[] = [
  { key: 'cut', label: '剪掉空拍', hint: '剪掉沒有人說話的段落和「嗯、啊」' },
  { key: 'subtitles', label: '自動上字幕', hint: '辨識語音，產生繁體中文字幕' },
  { key: 'motion', label: '放大縮小運鏡', hint: '重點時刻特寫推近，其他段落慢慢放大或縮小' },
  { key: 'transitions', label: '轉場', hint: '換場景的地方依氣氛挑轉場' },
  { key: 'captions', label: '字幕動畫', hint: '驚嘆句彈出、問句上滑、其他淡入' },
  { key: 'stickers', label: '貼紙特效', hint: '依字幕關鍵字加上表情或標籤貼紙' },
];

/** AI 自動剪輯：依聲音起伏、字幕內容、場景切換，一次加上運鏡、轉場、字幕動畫和貼紙 */
function AutoEffects({ isPro }: { isPro: boolean }) {
  const upgrade = useUpgrade();
  const toast = useToast();
  const hasClips = useEditor((s) => s.data.clips.length > 0);
  const captionCount = useEditor((s) => s.data.captions.length);
  // 已經有字幕時預設不重新產生，避免蓋掉手動修改過的字幕
  const [opts, setOpts] = useState<AutoEffectOptions>(() => ({
    intensity: 'normal',
    cut: true,
    subtitles: useEditor.getState().data.captions.length === 0,
    motion: true,
    transitions: true,
    captions: true,
    stickers: true,
  }));
  const [status, setStatus] = useState<string | null>(null);
  const [plan, setPlan] = useState<{ base: ProjectData; result: AutoEffectPlan } | null>(null);

  const analyze = async () => {
    if (!isPro) return upgrade('AI 自動剪輯是專業版功能，會依影片內容自動加上運鏡、轉場和動畫。');
    const base = useEditor.getState().data;
    if (!base.clips.length) return toast('主軌上還沒有影片', 'error');
    setPlan(null);
    setStatus('分析影片內容');
    try {
      const result = await planAutoEffects(base, opts, setStatus);
      const c = result.counts;
      if (!c.cuts && !c.subtitles && !c.punch && !c.shake && !c.zoom && !c.transitions && !c.captions && !c.stickers) toast('沒有找到適合加特效的地方，可以試試「強烈」', 'info');
      else setPlan({ base, result });
    } catch (e) {
      toast('分析失敗：' + (e as Error).message, 'error');
    } finally {
      setStatus(null);
    }
  };

  const apply = () => {
    if (!plan) return;
    // 分析後又改過專案，就重新分析，避免蓋掉剛剛的修改
    if (useEditor.getState().data !== plan.base) {
      setPlan(null);
      return toast('專案剛剛有變動，請重新分析一次', 'info');
    }
    useEditor.getState().commit(() => plan.result.data);
    toast('已套用 AI 自動剪輯，不滿意可以按 ⌘Z 復原', 'success');
    setPlan(null);
  };

  const c = plan?.result.counts;
  const lines = c
    ? [
        c.cuts > 0 && `剪掉 ${c.cuts} 段空拍，共 ${c.removed.toFixed(1)} 秒`,
        c.subtitles > 0 && `${c.subtitles} 句自動字幕`,
        c.punch + c.shake > 0 && `${c.punch + c.shake} 個重點特寫${c.shake ? `（含 ${c.shake} 個震動）` : ''}`,
        c.zoom > 0 && `${c.zoom} 段放大縮小運鏡`,
        c.transitions > 0 && `${c.transitions} 個轉場`,
        c.captions > 0 && `${c.captions} 句字幕動畫`,
        c.stickers > 0 && `${c.stickers} 個貼紙`,
      ].filter(Boolean)
    : [];

  return (
    <section className="p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl bg-brand-soft text-brand">
          <Clapperboard className="size-4" />
        </span>
        <h2 className="text-sm font-extrabold">AI 自動剪輯</h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">一鍵完成剪輯：剪掉空拍、自動上字幕，再依內容加上特效。聲音激動或字幕有驚嘆的地方特寫推近，換場景加轉場，字幕和貼紙配上動畫。</p>

      <div className="mt-3">
        <div className="mb-1.5 text-xs font-semibold text-ink-soft">特效強度</div>
        <Chips options={INTENSITIES} value={opts.intensity} onChange={(intensity) => (setOpts({ ...opts, intensity }), setPlan(null))} />
      </div>
      <div className="mt-3 space-y-2">
        {PARTS.map((p) => (
          <label key={p.key} className="flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5 accent-brand" checked={opts[p.key]} onChange={(e) => (setOpts({ ...opts, [p.key]: e.target.checked }), setPlan(null))} />
            <span>
              <span className="font-semibold">{p.label}</span>
              <span className="block text-[11px] text-ink-mute">
                {p.key === 'subtitles' && captionCount > 0 ? `會取代目前的 ${captionCount} 句字幕` : p.hint}
              </span>
            </span>
          </label>
        ))}
      </div>

      {plan ? (
        <div className="mt-4 rounded-2xl bg-brand-soft/60 p-3">
          <div className="text-sm font-extrabold text-brand">分析完成，準備加上：</div>
          <ul className="mt-1.5 space-y-0.5 text-xs text-ink-soft">
            {lines.map((l) => (
              <li key={l as string}>・{l}</li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPlan(null)}>
              取消
            </Button>
            <Button size="sm" onClick={apply}>
              套用
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-4 w-full" onClick={analyze} disabled={!!status || !hasClips}>
          {status ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {status ?? (hasClips ? '分析影片並加上特效' : '先把影片加到主軌')}
        </Button>
      )}
      <p className="mt-2 text-[11px] text-ink-mute">已經手動設定過的動態效果和轉場不會被改掉。</p>
    </section>
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
