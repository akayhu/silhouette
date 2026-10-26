import { useState } from 'react';
import { Captions, Clapperboard, FileText, Languages, Loader2, Scissors, Sparkles } from 'lucide-react';
import { TRANSLATE_TARGETS, translateTexts, type TranslateTarget } from '../../lib/translate';
import { useAuth } from '../../lib/auth';
import { ASR_MODELS, getConverter, isFiller, transcribe } from '../../lib/asr';
import { captionWords, formatCaptionTime, parseEditTime, replaceCaptionsInRanges } from '../../lib/captions';
import { alignScript } from '../../lib/scriptAlign';
import { decodeAudio, detectSilence, sliceMono } from '../../lib/media';
import { captionFromWords, layoutMain, newCaption, rippleRemove } from '../../lib/timeline';
import type { Caption, ProjectData } from '../../lib/types';
import { transcribeTimeline, type TimeRange } from '../../lib/subtitles';
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
          <button onClick={() => upgrade('AI 工具是專業版功能。')} className="w-full rounded-2xl border border-brand/25 bg-brand-soft/60 p-4 text-left">
            <ProBadge />
            <div className="mt-2 text-sm font-extrabold">升級解鎖 AI 工具</div>
            <div className="mt-0.5 text-xs text-ink-soft">自動字幕、智能口播不限次數</div>
          </button>
        </div>
      )}
      <AutoEffects isPro={isPro} />
      <AutoCaptions isPro={isPro} />
      <ScriptSync isPro={isPro} />
      <Bilingual isPro={isPro} />
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

type Scope = 'all' | 'selected' | 'range';
const SCOPES: { id: Scope; label: string }[] = [
  { id: 'all', label: '整條主軌' },
  { id: 'selected', label: '選取的項目' },
  { id: 'range', label: '指定時間' },
];
const timeField = 'w-full min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs tabular-nums outline-none focus:border-brand';
const shortTime = (t: number) => formatCaptionTime(t).slice(3);

/** 時間軸上選取的片段與字幕所涵蓋的時間範圍（合併重疊） */
function selectedRanges(): TimeRange[] {
  const { data, selected } = useEditor.getState();
  const placed = layoutMain(data.clips);
  const ranges: TimeRange[] = [];
  for (const item of selected) {
    if (item.type === 'clip') {
      const c = placed.find((p) => p.id === item.id);
      if (c) ranges.push([c.start, c.end]);
    } else if (item.type === 'caption') {
      const c = data.captions.find((x) => x.id === item.id);
      if (c) ranges.push([c.start, c.end]);
    }
  }
  return merged(ranges);
}

function AutoCaptions({ isPro }: { isPro: boolean }) {
  const upgrade = useUpgrade();
  const toast = useToast();
  const [model, setModel] = useState<string>(ASR_MODELS[0].id);
  const [status, setStatus] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const pickedCount = useEditor((s) => s.selected.filter((i) => i.type === 'clip' || i.type === 'caption').length);
  const duration = useEditor((s) => s.data.duration);

  const rangeOf = (): TimeRange[] | null => {
    if (scope === 'selected') {
      const r = selectedRanges();
      if (!r.length) {
        toast('先在時間軸點選要重新辨識的影片片段或字幕', 'error');
        return null;
      }
      return r;
    }
    let a = NaN;
    let b = NaN;
    try {
      a = parseEditTime(from || '0');
      b = parseEditTime(to || String(duration));
    } catch {
      /* 格式錯誤，下面統一提示 */
    }
    if (!Number.isFinite(a) || !Number.isFinite(b) || b - a < 0.3) {
      toast('請輸入有效的時間，例如 00:12.500 或 12.5（秒），結束要比開始晚', 'error');
      return null;
    }
    return [[Math.max(0, a), Math.min(duration, b)]];
  };

  const run = async () => {
    if (!isPro) return upgrade('AI 自動字幕是專業版功能，升級後可以自動聽寫影片並產生字幕。');
    if (!ensureUnlocked('caption')) return;
    const { data, commit } = useEditor.getState();
    if (!data.clips.length) return toast('主軌上還沒有影片', 'error');
    let ranges: TimeRange[] | undefined;
    if (scope !== 'all') {
      const r = rangeOf();
      if (!r) return;
      ranges = r;
    }
    try {
      const out = await transcribeTimeline(data, model, setStatus, ranges);
      commit((d) => ({ ...d, captions: replaceCaptionsInRanges(d.captions, out, ranges) }));
      const where = ranges ? `（${ranges.map(([a, b]) => `${shortTime(a)}–${shortTime(b)}`).join('、')}）` : '';
      toast(out.length ? `已產生 ${out.length} 句字幕${where}` : '沒有辨識到語音', out.length ? 'success' : 'info');
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
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">聽寫主軌影片的語音，自動產生繁體中文字幕，完成後可以逐句修改。只想重做某一段時，選「選取的項目」或「指定時間」，其他已經修好的字幕不會被動到。</p>
      <div className="mt-3">
        <div className="mb-1.5 text-xs font-semibold text-ink-soft">辨識範圍</div>
        <Chips options={SCOPES} value={scope} onChange={setScope} />
        {scope === 'selected' && (
          <p className="mt-2 text-[11px] text-ink-mute">
            {pickedCount ? `已選取 ${pickedCount} 個片段或字幕，只重新辨識這些時間。` : '在時間軸點選影片片段或字幕（按住 Shift 可多選）。'}
          </p>
        )}
        {scope === 'range' && (
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
            <TimeInput label="開始時間" value={from} placeholder="00:00.0" onChange={setFrom} />
            <span className="text-xs text-ink-mute">到</span>
            <TimeInput label="結束時間" value={to} placeholder={shortTime(duration)} onChange={setTo} />
          </div>
        )}
      </div>
      <div className="mt-3">
        <div className="mb-1.5 text-xs font-semibold text-ink-soft">辨識模型</div>
        <Chips options={ASR_MODELS.map((m) => ({ id: m.id, label: m.label }))} value={model} onChange={setModel} />
      </div>
      <Button className="mt-4 w-full" onClick={run} disabled={!!status}>
        {status ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {status ?? (scope === 'all' ? '開始產生字幕' : '重新辨識這個範圍')}
      </Button>
      <p className="mt-2 text-[11px] text-ink-mute">{scope === 'all' ? '會取代目前的一般字幕，花字保留。' : '只取代這個範圍內的字幕。'}語音辨識在你的瀏覽器裡執行，影片不會傳到外部服務。</p>
    </section>
  );
}


/** 時間輸入框：可打「1:23.5」或秒數，旁邊的按鈕帶入播放頭位置 */
function TimeInput({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (v: string) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <input aria-label={label} className={timeField} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <button
        className="shrink-0 rounded-lg px-1.5 py-1 text-[11px] font-bold text-brand hover:bg-brand-soft"
        title="帶入播放頭位置"
        onClick={() => onChange(shortTime(useEditor.getState().time))}
      >
        播放頭
      </button>
    </div>
  );
}

/** 雙語字幕：把一般字幕翻成英文，顯示在原文下一行 */
function Bilingual({ isPro }: { isPro: boolean }) {
  const upgrade = useUpgrade();
  const toast = useToast();
  const [target, setTarget] = useState<TranslateTarget>('en');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const lines = useEditor((s) => s.data.captions.filter((c) => c.role !== 'flower' && c.text.trim()).length);
  const translated = useEditor((s) => s.data.captions.filter((c) => c.role !== 'flower' && c.translation?.trim()).length);

  const run = async () => {
    if (!isPro) return upgrade('雙語字幕是專業版功能。');
    if (!ensureUnlocked('caption')) return;
    const { data, commit } = useEditor.getState();
    const todo = data.captions.filter((c) => c.role !== 'flower' && c.text.trim() && (!onlyMissing || !c.translation?.trim()));
    if (!todo.length) return toast(lines ? '每一句都已經有翻譯了' : '還沒有字幕，先產生或輸入字幕', 'info');
    try {
      setStatus('準備翻譯');
      const out = await translateTexts(
        todo.map((c) => c.text.replace(/\n/g, ' ')),
        target,
        (p) => setStatus(p.phase === 'download' ? `下載翻譯模型 ${Math.round(p.progress)}%（只有第一次）` : `翻譯中 ${Math.round(p.progress)}%`),
      );
      const map = new Map(todo.map((c, i) => [c.id, out[i] ?? '']));
      // 翻譯期間字幕被改過的話，只更新文字沒變的句子
      const texts = new Map(todo.map((c) => [c.id, c.text]));
      commit((d) => ({ ...d, captions: d.captions.map((c) => (map.has(c.id) && texts.get(c.id) === c.text ? { ...c, translation: map.get(c.id) } : c)) }));
      toast(`已翻譯 ${todo.length} 句，可以在「字幕」分頁逐句修改`, 'success');
    } catch (e) {
      toast('翻譯失敗：' + (e as Error).message, 'error');
    } finally {
      setStatus(null);
    }
  };

  const remove = () => {
    if (!ensureUnlocked('caption')) return;
    useEditor.getState().commit((d) => ({ ...d, captions: d.captions.map(({ translation: _t, ...c }) => c) }));
    toast('已移除所有翻譯', 'success');
  };

  return (
    <section className="p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl bg-coral-soft text-coral">
          <Languages className="size-4" />
        </span>
        <h2 className="text-sm font-extrabold">雙語字幕</h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">
        把字幕翻成外語，顯示在原文下方、字小一點，經營海外觀眾更方便。翻譯在你的瀏覽器裡執行，匯出 SRT／VTT 時也會帶上翻譯。
      </p>
      <div className="mt-3">
        <div className="mb-1.5 text-xs font-semibold text-ink-soft">翻譯成</div>
        <Chips options={TRANSLATE_TARGETS.map((t) => ({ id: t.id, label: t.label }))} value={target} onChange={setTarget} />
      </div>
      {translated > 0 && (
        <label className="mt-3 flex items-center gap-1.5 text-xs">
          <input type="checkbox" className="accent-brand" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          只翻還沒有翻譯的句子（保留你改過的翻譯）
        </label>
      )}
      <Button className="mt-3 w-full" onClick={run} disabled={!!status || !lines}>
        {status ? <Loader2 className="size-4 animate-spin" /> : <Languages className="size-4" />}
        {status ?? (lines ? `翻譯 ${onlyMissing ? lines - translated : lines} 句字幕` : '先產生或輸入字幕')}
      </Button>
      {translated > 0 && (
        <button className="mt-2 w-full text-center text-[11px] font-bold text-ink-soft hover:text-brand" onClick={remove}>
          移除全部翻譯（目前 {translated} 句）
        </button>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-ink-mute">機器翻譯是逐句翻的，太短的句子可能翻得不完整，建議發佈前看過一遍。</p>
    </section>
  );
}

/** 貼上講稿自動對時：字幕文字用講稿，時間用語音辨識的逐字時間 */
function ScriptSync({ isPro }: { isPro: boolean }) {
  const upgrade = useUpgrade();
  const toast = useToast();
  const [script, setScript] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [redo, setRedo] = useState(false);
  // 目前的字幕有逐字時間，就直接拿來對時，不用再辨識一次
  const timed = useEditor((s) => {
    const lines = s.data.captions.filter((c) => c.role !== 'flower');
    return lines.length > 0 && lines.filter((c) => captionWords(c)).length >= lines.length * 0.6;
  });
  const chars = [...script.replace(/[\s\p{P}\p{S}]/gu, '')].length;

  const run = async () => {
    if (!isPro) return upgrade('貼上講稿自動對時是專業版功能。');
    if (!ensureUnlocked('caption')) return;
    const { data, commit } = useEditor.getState();
    if (!data.clips.length) return toast('主軌上還沒有影片', 'error');
    if (!chars) return toast('請先貼上講稿', 'error');
    try {
      const recognized = timed && !redo ? data.captions : await transcribeTimeline(data, ASR_MODELS[0].id, setStatus);
      setStatus('對齊講稿');
      const convert = await getConverter();
      const style = data.captions.find((c) => c.role !== 'flower')?.style;
      const result = alignScript(script, recognized, style, convert);
      if (!result.captions.length) return toast('沒有可用的講稿文字', 'error');
      const rate = result.total ? result.matched / result.total : 0;
      commit((d) => ({ ...d, captions: [...d.captions.filter((c) => c.role === 'flower'), ...result.captions].sort((a, b) => a.start - b.start) }));
      if (rate < 0.5) toast(`講稿和影片說的內容差很多（只對上 ${Math.round(rate * 100)}%），時間可能不準，請確認是同一份講稿；可按 ⌘Z 復原`, 'info');
      else toast(`已依講稿產生 ${result.captions.length} 句字幕，對上 ${Math.round(rate * 100)}% 的字`, 'success');
    } catch (e) {
      toast('對時失敗：' + (e as Error).message, 'error');
    } finally {
      setStatus(null);
    }
  };

  return (
    <section className="p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl bg-coral-soft text-coral">
          <FileText className="size-4" />
        </span>
        <h2 className="text-sm font-extrabold">貼上講稿自動對時</h2>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">
        有講稿就不用逐字校對：貼上正確的講稿，系統用語音辨識找出每個字說出的時間，字幕文字完全照講稿，不會有錯字。換行和句號會自動分句。
      </p>
      <textarea
        aria-label="講稿"
        value={script}
        onChange={(e) => setScript(e.target.value)}
        rows={6}
        placeholder="把講稿貼在這裡…"
        className="mt-3 w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-brand"
      />
      <div className="mt-1 flex items-center justify-between text-[11px] text-ink-mute">
        <span className="tabular-nums">{chars} 字</span>
        {timed && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" className="accent-brand" checked={redo} onChange={(e) => setRedo(e.target.checked)} />
            重新辨識語音
          </label>
        )}
      </div>
      <Button className="mt-3 w-full" onClick={run} disabled={!!status || !chars}>
        {status ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
        {status ?? '依講稿對時'}
      </Button>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-mute">
        {timed && !redo ? '目前的字幕已有逐字時間，會直接拿來對時，幾秒就好。' : '會先辨識影片語音（和 AI 自動字幕相同），再對齊講稿。'}會取代目前的字幕，花字不受影響；可以復原。
      </p>
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
