import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Download, Film, LayoutGrid, Loader2, Play, RotateCcw, UploadCloud, Wand2, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatTime } from '../lib/format';
import { kindOf } from '../lib/media';
import { runSmartEdit, type SmartEditResult } from '../lib/smartEdit';
import { SMART_TEMPLATES, type SmartTemplate } from '../lib/templates';
import { mainDuration } from '../lib/timeline';
import type { LibraryTrack } from '../lib/types';
import { StylePreview } from '../components/StylePreview';
import { Button, ProBadge, useToast, useUpgrade } from '../components/ui';
import { addToTimeline, importMediaFile } from './panels/MediaPanel';
import { useEditor } from './store';

/**
 * 首次使用流程：新專案預設進入引導，只走「加入影片 → 選風格 → 確認剪輯 → 匯出」四步。
 * 其他工具收起來，需要時按「展開全部工具」才出現；隨時可以離開引導。
 */

type Step = 'add' | 'style' | 'review' | 'export';
const STEPS: { id: Step; label: string }[] = [
  { id: 'add', label: '加入影片' },
  { id: 'style', label: '選風格' },
  { id: 'review', label: '確認剪輯' },
  { id: 'export', label: '匯出' },
];

const AUTO_KEY = 'pianke:guide-auto';
/** 新專案要不要自動進入引導：預設關閉，使用者勾選後才自動打開 */
export function guideEnabled() {
  try {
    return localStorage.getItem(AUTO_KEY) === 'on';
  } catch {
    return false;
  }
}

export function Guide({ onExpandTools, onExport, seek, play }: { onExpandTools: () => void; onExport: () => void; seek: (t: number) => void; play: () => void }) {
  const hasClips = useEditor((s) => s.data.clips.length > 0);
  const [step, setStep] = useState<Step>(hasClips ? 'style' : 'add');
  const [applied, setApplied] = useState<{ tpl: SmartTemplate; counts: SmartEditResult['counts'] } | null | 'none'>(null);
  const [autoOn, setAutoOn] = useState(guideEnabled);
  const index = STEPS.findIndex((s) => s.id === step);

  const toggleAuto = (on: boolean) => {
    setAutoOn(on);
    try {
      localStorage.setItem(AUTO_KEY, on ? 'on' : 'off');
    } catch {
      /* 存不了就只在這次有效 */
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-surface" aria-label="首次使用引導">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold">四步剪好一支短影音</div>
          <div className="text-xs text-ink-mute">其他工具先收起來，需要時再展開</div>
        </div>
        <button onClick={onExpandTools} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink-soft hover:border-ink hover:text-ink">
          <LayoutGrid className="size-3.5" /> 展開全部工具
        </button>
      </div>

      {/* 步驟條：完成的步驟可以點回去 */}
      <ol className="grid grid-cols-4 gap-1 px-5 pt-4" aria-label="步驟">
        {STEPS.map((s, i) => {
          const done = i < index;
          const on = i === index;
          return (
            <li key={s.id}>
              <button
                disabled={!done}
                onClick={() => setStep(s.id)}
                aria-current={on ? 'step' : undefined}
                className="flex w-full flex-col items-start gap-1.5 text-left disabled:cursor-default"
              >
                <span className={`h-1 w-full rounded-full ${i <= index ? 'bg-brand' : 'bg-sunken'}`} />
                <span className={`flex items-center gap-1 text-xs font-bold ${on ? 'text-ink' : done ? 'text-brand' : 'text-ink-mute'}`}>
                  {done ? <Check className="size-3.5" /> : <span className="tabular-nums">{i + 1}</span>}
                  {s.label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-6 pb-6">
        {step === 'add' && <AddStep onNext={() => setStep('style')} />}
        {step === 'style' && (
          <StyleStep
            onDone={(r) => {
              setApplied(r);
              setStep('review');
              seek(0);
            }}
          />
        )}
        {step === 'review' && (
          <ReviewStep
            applied={applied}
            onPlay={() => {
              seek(0);
              play();
            }}
            onRestyle={() => {
              // 換風格：先復原剛才套用的模板，再回到選風格
              if (applied && applied !== 'none') useEditor.getState().undo();
              setApplied(null);
              setStep('style');
            }}
            onTweak={onExpandTools}
            onNext={() => setStep('export')}
          />
        )}
        {step === 'export' && <ExportStep onExport={onExport} onDone={onExpandTools} />}
      </div>

      <label className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs text-ink-mute">
        <input type="checkbox" className="accent-brand" checked={autoOn} onChange={(e) => toggleAuto(e.target.checked)} />
        建立新專案時自動打開引導（也可以隨時按上方「引導」按鈕打開）
      </label>
    </section>
  );
}

function StepTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-black">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{sub}</p>
    </div>
  );
}

// ---------- 1. 加入影片 ----------

function AddStep({ onNext }: { onNext: () => void }) {
  const toast = useToast();
  const clips = useEditor((s) => s.data.clips);
  const media = useEditor((s) => s.data.media);
  const [busy, setBusy] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const total = mainDuration(clips);

  const add = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const kind = kindOf(file);
      if (kind !== 'video' && kind !== 'image') {
        toast(`這一步只放影片或圖片：${file.name}`, 'error');
        continue;
      }
      setBusy((b) => [...b, file.name]);
      try {
        const m = await importMediaFile(file);
        // 依加入的順序接在主軌後面
        addToTimeline(m);
      } catch (err) {
        toast((err as Error).message, 'error');
      } finally {
        setBusy((b) => b.filter((x) => x !== file.name));
      }
    }
  };

  return (
    <div>
      <StepTitle title="加入影片" sub="把手機拍的影片拖進來，可以一次放好幾支，會依順序接起來。影片只存在這台電腦，不會上傳。" />
      <button
        onClick={() => input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void add(e.dataTransfer.files);
        }}
        className={`flex w-full flex-col items-center rounded-2xl border-2 border-dashed px-4 py-10 text-center transition ${over ? 'border-brand bg-brand-soft/60' : 'border-line hover:border-brand/50 hover:bg-brand-soft/30'}`}
      >
        <UploadCloud className="size-9 text-brand" />
        <span className="mt-3 text-base font-extrabold">選擇影片，或拖進這裡</span>
        <span className="mt-1 text-xs text-ink-mute">支援手機拍的影片與照片</span>
      </button>
      <input ref={input} type="file" multiple accept="video/*,image/*" className="hidden" onChange={(e) => (e.target.files && void add(e.target.files), (e.target.value = ''))} />

      {(clips.length > 0 || busy.length > 0) && (
        <ul className="mt-5 space-y-2" aria-label="已加入的影片">
          {clips.map((c, i) => {
            const m = media.find((x) => x.id === c.mediaId);
            return (
              <li key={c.id} className="flex items-center gap-3 rounded-xl border border-line p-1.5">
                <span className="grid h-10 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-sunken">
                  {m?.thumb ? <img src={m.thumb} alt="" className="h-full w-full object-cover" /> : <Film className="size-4 text-ink-mute" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  <span className="mr-1.5 text-ink-mute tabular-nums">{i + 1}</span>
                  {m?.name ?? '影片'}
                </span>
                <span className="pr-2 text-xs text-ink-mute tabular-nums">{formatTime(c.out - c.in)}</span>
              </li>
            );
          })}
          {busy.map((name) => (
            <li key={name} className="flex items-center gap-3 rounded-xl bg-sunken/70 p-3 text-xs font-semibold text-ink-soft">
              <Loader2 className="size-4 animate-spin" /> 加入中：<span className="truncate">{name}</span>
            </li>
          ))}
        </ul>
      )}

      <Button className="mt-6 w-full" size="lg" disabled={!clips.length || busy.length > 0} onClick={onNext}>
        {clips.length ? (
          <>
            下一步：選風格（共 <span className="tabular-nums">{formatTime(total)}</span>） <ArrowRight className="size-4" />
          </>
        ) : (
          '先加入至少一支影片'
        )}
      </Button>
    </div>
  );
}

// ---------- 2. 選風格 ----------

function StyleStep({ onDone }: { onDone: (r: { tpl: SmartTemplate; counts: SmartEditResult['counts'] } | 'none') => void }) {
  const { user } = useAuth();
  const isPro = user?.plan === 'pro';
  const upgrade = useUpgrade();
  const toast = useToast();
  const [library, setLibrary] = useState<LibraryTrack[]>([]);
  const [pick, setPick] = useState<SmartTemplate>(SMART_TEMPLATES[0]);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api.music().then((r) => setLibrary(r.items)).catch(() => setLibrary([]));
  }, []);

  const apply = async () => {
    if (!isPro) return upgrade('套用風格會自動剪掉空拍、上字幕、加花字和配樂，是專業版功能。也可以先不套用，直接下一步。');
    const base = useEditor.getState().data;
    setStatus('分析影片內容');
    try {
      const result = await runSmartEdit(base, pick, library, { regenerateCaptions: false }, setStatus);
      if (useEditor.getState().data !== base) return toast('剪輯期間專案有變動，請再按一次', 'info');
      useEditor.getState().commit(() => result.data);
      onDone({ tpl: pick, counts: result.counts });
    } catch (e) {
      toast('剪輯失敗：' + (e as Error).message, 'error');
    } finally {
      setStatus(null);
    }
  };

  return (
    <div>
      <StepTitle title="選一個風格" sub="會自動剪掉沒人說話的空拍、上好字幕，再依風格加上字幕樣式、花字、配樂和音效。之後每一項都能再改。" />
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="風格">
        {SMART_TEMPLATES.map((t) => {
          const on = pick.id === t.id;
          return (
            <button
              key={t.id}
              role="radio"
              aria-checked={on}
              onClick={() => setPick(t)}
              className={`overflow-hidden rounded-2xl border-2 text-left transition ${on ? 'border-brand' : 'border-line hover:border-ink-mute/40'}`}
            >
              <div className="grid h-20 place-items-center content-center gap-0.5 px-1" style={{ background: t.swatch }} aria-hidden>
                <StylePreview style={t.flower} text="超好吃！" size={17} />
                <StylePreview style={t.caption} text="字幕長這樣" size={10} />
              </div>
              <div className="p-2">
                <div className={`text-[13px] font-extrabold ${on ? 'text-brand' : ''}`}>{t.name}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-mute">{t.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
      <Button className="mt-5 w-full" size="lg" onClick={() => void apply()} disabled={!!status}>
        {status ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
        {status ?? `套用「${pick.name}」並自動剪輯`}
        {!isPro && !status && <ProBadge />}
      </Button>
      <button className="mt-3 w-full text-center text-sm font-bold text-ink-soft hover:text-ink disabled:opacity-50" disabled={!!status} onClick={() => onDone('none')}>
        先不套用，保持原樣
      </button>
    </div>
  );
}

// ---------- 3. 確認剪輯 ----------

function ReviewStep({
  applied,
  onPlay,
  onRestyle,
  onTweak,
  onNext,
}: {
  applied: { tpl: SmartTemplate; counts: SmartEditResult['counts'] } | null | 'none';
  onPlay: () => void;
  onRestyle: () => void;
  onTweak: () => void;
  onNext: () => void;
}) {
  const clips = useEditor((s) => s.data.clips);
  const captions = useEditor((s) => s.data.captions.filter((c) => c.role !== 'flower').length);
  const c = applied && applied !== 'none' ? applied.counts : null;
  const lines = c
    ? [
        c.cuts > 0 && `剪掉 ${c.cuts} 段空拍，共 ${c.removed.toFixed(1)} 秒`,
        c.subtitles > 0 && `自動字幕 ${c.subtitles} 句`,
        c.flowers > 0 && `花字 ${c.flowers} 個`,
        c.music && `配樂「${c.music}」`,
        c.sfx > 0 && `音效 ${c.sfx} 個`,
        c.filter && `濾鏡「${c.filter}」`,
        c.transitions > 0 && `轉場 ${c.transitions} 個`,
      ].filter(Boolean)
    : [`${clips.length} 段影片`, captions ? `${captions} 句字幕` : '還沒有字幕'];
  return (
    <div>
      <StepTitle
        title="確認剪輯結果"
        sub={c ? `已套用「${(applied as { tpl: SmartTemplate }).tpl.name}」。從頭播放看看，右邊就是成品的樣子。` : '保持原樣，沒有自動剪輯。從頭播放看看，確認沒問題就可以匯出。'}
      />
      <ul className="space-y-1.5 rounded-2xl bg-sunken/60 p-4 text-sm">
        {lines.map((l) => (
          <li key={l as string} className="flex items-center gap-2">
            <Check className="size-4 shrink-0 text-brand" /> {l}
          </li>
        ))}
        <li className="flex items-center gap-2 font-bold">
          <Film className="size-4 shrink-0 text-ink-mute" /> 成品長度 <span className="tabular-nums">{formatTime(mainDuration(clips))}</span>
        </li>
      </ul>
      <Button variant="secondary" className="mt-4 w-full" onClick={onPlay}>
        <Play className="size-4" /> 從頭播放
      </Button>
      <Button className="mt-3 w-full" size="lg" onClick={onNext}>
        滿意，下一步：匯出 <ArrowRight className="size-4" />
      </Button>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" onClick={onRestyle}>
          <RotateCcw className="size-3.5" /> 換個風格
        </Button>
        <Button variant="secondary" size="sm" onClick={onTweak}>
          自己調整細節
        </Button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-mute">「自己調整細節」會展開全部工具：字幕、文字剪輯、貼紙、濾鏡、轉場都在裡面。</p>
    </div>
  );
}

// ---------- 4. 匯出 ----------

function ExportStep({ onExport, onDone }: { onExport: () => void; onDone: () => void }) {
  return (
    <div>
      <StepTitle title="匯出影片" sub="選畫質後匯出 MP4，畫面和預覽一致。匯出完成可以直接下載，上傳到 Reels、TikTok 或 Shorts。" />
      <Button className="w-full" size="lg" onClick={onExport}>
        <Download className="size-4" /> 匯出影片
      </Button>
      <div className="mt-6 rounded-2xl border border-line p-4">
        <div className="text-sm font-bold">接下來可以</div>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
          <li>・在「字幕」逐句修改錯字，或用「文字剪輯」刪掉說錯的話</li>
          <li>・加貼紙、換濾鏡、調整轉場</li>
          <li>・在「AI 工具」加上英文雙語字幕</li>
        </ul>
        <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={onDone}>
          <X className="size-3.5" /> 結束引導，打開完整編輯器
        </Button>
      </div>
    </div>
  );
}
