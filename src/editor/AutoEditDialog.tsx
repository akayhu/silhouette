import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Check, Captions, Film, Loader2, Pause, Play, Scissors, Sparkles } from 'lucide-react';
import { analyzeVideo, applyAutoEdit, toEditedTime, type AutoEditChoice, type AutoEditResult, type AutoEditStage } from '../lib/autoEdit';
import { formatTime, uid } from '../lib/format';
import type { MediaItem } from '../lib/types';
import { Button, Modal, useToast } from '../components/ui';
import { useEditor } from './store';
import { isLocked } from '../lib/timeline';

// ---------- 工作佇列：一次上傳多支影片時依序處理 ----------

interface Job {
  media: MediaItem;
  stage: AutoEditStage;
  progress?: number;
  result?: AutoEditResult;
  error?: string;
}

interface AutoEditState {
  jobs: Job[];
  enqueue: (m: MediaItem) => void;
  done: () => void;
}

let running = false;

export const useAutoEdit = create<AutoEditState>((set, get) => ({
  jobs: [],
  enqueue: (media) => {
    set((s) => ({ jobs: [...s.jobs, { media, stage: 'audio' }] }));
    void runNext();
  },
  done: () => {
    set((s) => ({ jobs: s.jobs.slice(1) }));
    void runNext();
  },
}));

const patchJob = (media: MediaItem, patch: Partial<Job>) =>
  useAutoEdit.setState((s) => ({ jobs: s.jobs.map((j) => (j.media.id === media.id ? { ...j, ...patch } : j)) }));

/** 一次只分析一支（語音辨識共用同一個 worker） */
async function runNext() {
  if (running) return;
  const job = useAutoEdit.getState().jobs.find((j) => !j.result && !j.error);
  if (!job) return;
  running = true;
  try {
    const result = await analyzeVideo(job.media, (stage, progress) => patchJob(job.media, { stage, progress }));
    patchJob(job.media, { result });
  } catch (e) {
    patchJob(job.media, { error: (e as Error).message });
  } finally {
    running = false;
    void runNext();
  }
}

// ---------- 對話框 ----------

const STEPS: { stage: AutoEditStage[]; label: string }[] = [
  { stage: ['audio'], label: '讀取影片音軌' },
  { stage: ['silence'], label: '偵測空拍與停頓' },
  { stage: ['download', 'speech'], label: '辨識人聲、產生字幕' },
];

export function AutoEditDialog() {
  const job = useAutoEdit((s) => s.jobs[0]);
  const queued = useAutoEdit((s) => s.jobs.length - 1);
  const done = useAutoEdit((s) => s.done);
  const toast = useToast();
  const [choice, setChoice] = useState<AutoEditChoice>('edited');
  const [withCaptions, setWithCaptions] = useState(true);

  // 離開編輯器時清掉佇列，避免分析結果加到別的專案
  useEffect(() => () => useAutoEdit.setState({ jobs: [] }), []);

  // 換下一支影片時回到預設選項
  useEffect(() => {
    setChoice('edited');
    setWithCaptions(true);
  }, [job?.media.id]);

  if (!job) return null;
  const { media, result, error } = job;
  const canEdit = !!result?.hasSpeech;
  const pick: AutoEditChoice = canEdit ? choice : 'original';

  const addOriginalOnly = () => {
    if (isLocked(useEditor.getState().data, 'main')) toast('主軌已鎖定，影片先放在素材庫', 'info');
    else useEditor.getState().commit((d) => ({ ...d, clips: [...d.clips, { id: uid(), mediaId: media.id, in: 0, out: media.duration, speed: 1, volume: 1 }] }));
    done();
  };

  const confirm = () => {
    if (!result) return;
    const { data, commit } = useEditor.getState();
    if (isLocked(data, 'main')) {
      toast('主軌已鎖定，請先解鎖再加入影片', 'error');
      return;
    }
    const captionsOk = withCaptions && result.segments.length > 0 && !isLocked(data, 'caption');
    if (withCaptions && result.segments.length && !captionsOk) toast('字幕軌已鎖定，這次不加字幕', 'info');
    commit((d) => applyAutoEdit(d, media, result, pick, { captions: captionsOk, style: d.captions[0]?.style }));
    toast(
      pick === 'edited' ? `已加入剪輯後的影片，剪掉 ${result.removed.toFixed(1)} 秒${captionsOk ? `，加上 ${result.segments.length} 句字幕` : ''}` : `已加入原始影片${captionsOk ? `，加上 ${result.segments.length} 句字幕` : ''}`,
      'success',
    );
    done();
  };

  return (
    <Modal open onClose={done} width="max-w-2xl">
      <div className="flex items-center gap-2 text-xs font-bold text-coral">
        <Sparkles className="size-3.5" /> 自動剪輯
        {queued > 0 && <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-soft">還有 {queued} 支排隊中</span>}
      </div>
      <h2 className="mt-1 pr-8 text-xl font-extrabold">
        {result ? (canEdit ? '剪好了，要用哪個版本？' : '沒有偵測到人聲') : error ? '這支影片無法自動剪輯' : '正在自動剪輯…'}
      </h2>
      <p className="mt-1 truncate text-sm text-ink-soft">{media.name}</p>

      {!result && !error && <Progress job={job} />}

      {error && (
        <>
          <p className="mt-4 rounded-2xl bg-sunken p-4 text-sm text-ink-soft">{error}</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={done}>
              先放在素材庫
            </Button>
            <Button onClick={addOriginalOnly}>加入原始影片</Button>
          </div>
        </>
      )}

      {result && (
        <>
          {!canEdit && <p className="mt-3 text-sm text-ink-soft">這支影片聽不到有人說話，所以沒有剪輯，也沒有字幕。可以直接加入原始影片。</p>}
          {canEdit && <CutBar result={result} />}

          <div className="mt-4 grid gap-4 sm:grid-cols-[200px_1fr]">
            <PreviewPlayer media={media} result={result} choice={pick} showCaptions={withCaptions} />
            <div className="space-y-2.5">
              <ChoiceCard
                active={pick === 'edited'}
                disabled={!canEdit}
                onClick={() => setChoice('edited')}
                icon={Scissors}
                title="剪輯後"
                badge="推薦"
                detail={canEdit ? `${formatTime(result.duration - result.removed)}・剪掉 ${result.cuts} 段空拍共 ${result.removed.toFixed(1)} 秒` : '沒有可剪的段落'}
              />
              <ChoiceCard
                active={pick === 'original'}
                onClick={() => setChoice('original')}
                icon={Film}
                title="剪輯前（原始影片）"
                detail={`${formatTime(result.duration)}・保留完整內容`}
              />
              {result.segments.length > 0 && (
                <label className="flex items-center gap-2.5 rounded-2xl border border-line px-3.5 py-3 text-sm">
                  <input type="checkbox" checked={withCaptions} onChange={(e) => setWithCaptions(e.target.checked)} className="size-4 accent-brand" />
                  <Captions className="size-4 text-coral" />
                  <span className="flex-1 font-semibold">加上自動字幕</span>
                  <span className="text-xs text-ink-mute">{result.segments.length} 句</span>
                </label>
              )}
              <p className="text-[11px] leading-relaxed text-ink-mute">影片會接在主軌最後面。之後都能在時間軸上調整，也可以按 ⌘Z 復原。</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
            <Button variant="secondary" onClick={done}>
              先放在素材庫
            </Button>
            <Button onClick={confirm}>
              <Check className="size-4" /> 使用{pick === 'edited' ? '剪輯後' : '剪輯前'}的版本
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function Progress({ job }: { job: Job }) {
  const current = STEPS.findIndex((s) => s.stage.includes(job.stage));
  return (
    <>
      <ol className="mt-5 space-y-2.5">
        {STEPS.map((s, i) => {
          const state = i < current ? 'done' : i === current ? 'active' : 'todo';
          return (
            <li key={s.label} className="flex items-center gap-3 text-sm">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full ${state === 'done' ? 'bg-mint text-white' : state === 'active' ? 'bg-brand-soft text-brand' : 'bg-sunken text-ink-mute'}`}
              >
                {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : state === 'active' ? <Loader2 className="size-3.5 animate-spin" /> : <span className="text-[11px] font-bold">{i + 1}</span>}
              </span>
              <span className={state === 'todo' ? 'text-ink-mute' : 'font-semibold'}>{s.label}</span>
              {state === 'active' && job.stage === 'download' && <span className="text-xs text-ink-mute">下載語音模型 {Math.round(job.progress ?? 0)}%（只有第一次）</span>}
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-[11px] text-ink-mute">分析在你的瀏覽器裡進行，影片不會傳到外部服務。影片越長需要越久。</p>
      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={() => useAutoEdit.getState().done()}>
          略過，先放在素材庫
        </Button>
      </div>
    </>
  );
}

/** 保留（紫）與剪掉（斜線）的段落示意 */
function CutBar({ result }: { result: AutoEditResult }) {
  return (
    <div className="mt-4">
      <div className="relative h-7 overflow-hidden rounded-lg bg-[repeating-linear-gradient(135deg,var(--color-sunken)_0_6px,var(--color-line)_6px_8px)]" aria-label={`保留 ${result.keeps.length} 段，剪掉 ${result.cuts} 段`}>
        {result.keeps.map(([a, b]) => (
          <span key={a} className="absolute inset-y-0 rounded-[3px] border-x border-white/60 bg-brand/80" style={{ left: `${(a / result.duration) * 100}%`, width: `${((b - a) / result.duration) * 100}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex gap-4 text-[11px] text-ink-mute">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand/80" /> 保留的人聲
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[repeating-linear-gradient(135deg,var(--color-sunken)_0_2px,var(--color-ink-mute)_2px_3px)]" /> 剪掉的空拍
        </span>
      </div>
    </div>
  );
}

function ChoiceCard({
  active,
  disabled,
  onClick,
  icon: Icon,
  title,
  badge,
  detail,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: typeof Film;
  title: string;
  badge?: string;
  detail: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex w-full items-center gap-3 rounded-2xl border-2 px-3.5 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? 'border-brand bg-brand-soft/50' : 'border-line hover:border-brand/40'}`}
    >
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${active ? 'bg-brand text-white' : 'bg-sunken text-ink-soft'}`}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-extrabold">
          {title}
          {badge && !disabled && <span className="rounded-full bg-coral-soft px-1.5 py-0.5 text-[10px] font-bold text-coral">{badge}</span>}
        </span>
        <span className="mt-0.5 block text-xs text-ink-soft">{detail}</span>
      </span>
      <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${active ? 'border-brand bg-brand text-white' : 'border-line'}`}>{active && <Check className="size-3" strokeWidth={3} />}</span>
    </button>
  );
}

/** 小預覽：剪輯後版本播放時自動跳過被剪掉的段落，下方顯示當下的字幕 */
function PreviewPlayer({ media, result, choice, showCaptions }: { media: MediaItem; result: AutoEditResult; choice: AutoEditChoice; showCaptions: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const edited = choice === 'edited' && result.hasSpeech;
  const total = edited ? result.duration - result.removed : result.duration;

  // 切換版本時回到開頭（剪輯後版本從第一段人聲開始）；影片還沒載入時等載入後再跳
  const startAt = edited ? (result.keeps[0]?.[0] ?? 0) : 0;
  const rewind = () => {
    const v = video.current;
    if (!v) return;
    v.currentTime = startAt;
    setT(startAt);
  };
  useEffect(() => {
    video.current?.pause();
    setPlaying(false);
    rewind();
  }, [edited, result]);

  const onTime = () => {
    const v = video.current!;
    if (edited) {
      const now = v.currentTime;
      const inKeep = result.keeps.find(([a, b]) => now >= a - 0.02 && now < b);
      if (!inKeep) {
        const next = result.keeps.find(([a]) => a > now);
        if (next) v.currentTime = next[0];
        else {
          v.pause();
          setPlaying(false);
        }
      }
    }
    setT(v.currentTime);
  };

  const toggle = () => {
    const v = video.current!;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      if (v.ended || (edited && v.currentTime >= (result.keeps.at(-1)?.[1] ?? 0) - 0.05)) v.currentTime = startAt;
      v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const shown = edited ? toEditedTime(result.keeps, t) : t;
  const caption = showCaptions ? result.segments.find((s) => t >= s.start && t < s.end)?.text : undefined;

  return (
    <div className="mx-auto w-full max-w-[200px]">
      <div className="relative overflow-hidden rounded-2xl bg-ink">
        <video ref={video} src={media.url} className="aspect-[9/16] w-full object-contain" playsInline preload="auto" onLoadedMetadata={rewind} onTimeUpdate={onTime} onEnded={() => setPlaying(false)} />
        {caption && (
          <div className="pointer-events-none absolute inset-x-2 bottom-[16%] text-center text-[13px] leading-tight font-black text-white [-webkit-text-stroke:4px_#1f1d2b] [paint-order:stroke]">{caption}</div>
        )}
        <button onClick={toggle} className="absolute inset-0 grid place-items-center text-white opacity-0 transition hover:opacity-100 focus-visible:opacity-100" aria-label={playing ? '暫停預覽' : '播放預覽'}>
          <span className="grid size-12 place-items-center rounded-full bg-ink/50 backdrop-blur-sm">{playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="ml-0.5 size-5" fill="currentColor" />}</span>
        </button>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-mute tabular-nums">
        <span>{edited ? '剪輯後預覽' : '原始影片預覽'}</span>
        <span>
          {formatTime(shown)} / {formatTime(total)}
        </span>
      </div>
    </div>
  );
}
