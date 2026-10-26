import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, CloudUpload, Download, Film, HardDrive, Loader2, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { localExports, type ExportInfo, type LocalExport, type SavedExport } from '../lib/exportStore';
import { useAuth } from '../lib/auth';
import { exportModeFor, exportVideo, type ExportMode, type ExportStep } from '../lib/exportVideo';
import { supportedExportMimes } from '../lib/exportSupport';
import { formatTime } from '../lib/format';
import { DEFAULT_SETTINGS, estimateSize, needsRealtime, type ExportBitrate, type ExportFps } from '../lib/offlineExport';
import { aspectSize } from '../lib/timeline';
import type { ProjectData } from '../lib/types';
import { Button, Modal, ProBadge, useToast, useUpgrade } from '../components/ui';
import { useEditor } from './store';
import { checkCaptions, summarizeIssues } from '../lib/captionCheck';
import { fixCaptionIssues } from './panels/CaptionCheck';

type Quality = 720 | 1080;

/** 支援逐格匯出、但因為專案內容只能即時錄製時，說明原因 */
function needsRealtimeHint(data: ProjectData) {
  return typeof VideoEncoder !== 'undefined' && needsRealtime(data) ? '專案裡有變速且帶聲音的片段，為了保持原本音調改用即時錄製。' : '';
}

const BITRATES: [ExportBitrate, string, string][] = [
  ['high', '高畫質', '細節最多，檔案最大'],
  ['standard', '標準', '適合大多數平台'],
  ['small', '省空間', '檔案約一半，適合傳訊息'],
];
const FPS_OPTIONS: [ExportFps, string][] = [
  [24, '電影感'],
  [30, '一般'],
  [60, '動作流暢'],
];
const SETTINGS_KEY = 'export-settings';

/** 記住這台裝置上次選的畫質與格數（讀不到就用預設） */
function loadSettings(): { bitrate: ExportBitrate; fps: ExportFps } {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') as { bitrate?: unknown; fps?: unknown } | null;
    return {
      bitrate: BITRATES.some(([id]) => id === saved?.bitrate) ? (saved!.bitrate as ExportBitrate) : DEFAULT_SETTINGS.bitrate,
      fps: FPS_OPTIONS.some(([id]) => id === saved?.fps) ? (saved!.fps as ExportFps) : DEFAULT_SETTINGS.fps,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function formatSize(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

/** 一排可選的小按鈕（單選） */
function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string, string?][]; onChange: (v: T) => void }) {
  return (
    <div className="mt-4">
      <div className="text-xs font-bold text-ink-soft">{label}</div>
      <div className="mt-1.5 grid gap-1 rounded-2xl bg-sunken p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
        {options.map(([id, title, hint]) => (
          <button
            key={String(id)}
            role="radio"
            aria-checked={value === id}
            onClick={() => onChange(id)}
            className={`min-w-0 rounded-xl px-2 py-1.5 text-center transition ${value === id ? 'bg-paper text-ink shadow-sm' : 'text-ink-mute hover:text-ink'}`}
          >
            <div className="truncate text-[13px] font-extrabold">{title}</div>
            {hint && <div className="truncate text-[11px] opacity-80">{hint}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

function describe(info: ExportInfo, size: number) {
  return `${info.quality}p ・ ${info.fps} 格 ・ ${info.ext.toUpperCase()} ・ ${formatSize(size)}`;
}

function formatWhen(at: number | string) {
  const d = new Date(at);
  const today = new Date();
  const time = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === today.toDateString()) return `今天 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function fileName(project: string, at: number | string, ext: string) {
  const d = new Date(at);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `${project || '片刻剪趣作品'}-${stamp}.${ext}`;
}

const iconButton = 'grid size-9 shrink-0 place-items-center rounded-xl text-ink-soft transition hover:bg-sunken hover:text-ink disabled:opacity-40';

/** 一列匯出成品：格式、大小、時間、存放位置，以及下載／存到帳戶／刪除 */
function ExportRow({ info, size, at, where, href, download, onSave, saving, onDelete }: {
  info: ExportInfo; size: number; at: number | string; where: 'local' | 'account'; href: string; download: string;
  onSave?: () => void; saving?: number | null; onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-2xl border border-line px-3 py-2">
      {where === 'account' ? <CloudUpload className="size-4 shrink-0 text-brand" /> : <HardDrive className="size-4 shrink-0 text-ink-mute" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold tabular-nums">{describe(info, size)}</div>
        <div className="truncate text-[11px] text-ink-mute">
          {formatWhen(at)} ・ {saving != null ? `存到帳戶中 ${Math.round(saving * 100)}%` : where === 'account' ? '已存到帳戶' : '只存在這台裝置'}
        </div>
      </div>
      {onSave && (
        <button className={iconButton} onClick={onSave} disabled={saving != null} title="存到帳戶" aria-label="存到帳戶">
          {saving != null ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
        </button>
      )}
      <a className={iconButton} href={href} download={download} title="下載" aria-label="下載">
        <Download className="size-4" />
      </a>
      <button className={iconButton} onClick={onDelete} disabled={saving != null} title="刪除" aria-label="刪除">
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

const OFFLINE_STEPS: [ExportStep, string][] = [['prepare', '準備素材'], ['audio', '混合聲音'], ['frames', '算圖編碼'], ['finish', '封裝檢查']];
const REALTIME_STEPS: [ExportStep, string][] = [['prepare', '準備素材'], ['record', '即時錄製'], ['finish', '封裝檢查']];

interface FrameProgress {
  done: number;
  total: number;
  /** 這一輪算圖開始的時間與格數（降級重來時會重置），用來算速度和剩餘時間 */
  since: number;
  from: number;
}

function formatEta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  if (seconds < 60) return `約剩 ${Math.max(1, Math.ceil(seconds))} 秒`;
  return `約剩 ${Math.ceil(seconds / 60)} 分鐘`;
}

/** 匯出進度：目前在哪一步、第幾格／總格數、速度與剩餘時間 */
function ExportProgress({ steps, step, frames, stage, progress }: { steps: [ExportStep, string][]; step: ExportStep; frames: FrameProgress | null; stage: string; progress: number }) {
  const current = Math.max(0, steps.findIndex(([id]) => id === step));
  const counting = frames && (step === 'frames' || step === 'record');
  const elapsed = frames ? (performance.now() - frames.since) / 1000 : 0;
  const rate = frames && elapsed > 0.5 ? (frames.done - frames.from) / elapsed : 0;
  const eta = counting && rate > 0 ? formatEta((frames.total - frames.done) / rate) : '';
  return (
    <div className="mt-4">
      <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="匯出步驟">
        {steps.map(([id, label], i) => {
          const state = i < current ? 'done' : i === current ? 'active' : 'todo';
          return (
            <li key={id} aria-current={state === 'active' ? 'step' : undefined} className="min-w-0">
              <div className={`h-1 rounded-full ${state === 'todo' ? 'bg-sunken' : 'bg-brand'}`} />
              <div className={`mt-1.5 flex items-center gap-1 truncate text-[11px] font-semibold ${state === 'active' ? 'text-ink' : 'text-ink-mute'}`}>
                {state === 'done' ? <Check className="size-3 shrink-0 text-brand" /> : state === 'active' ? <Loader2 className="size-3 shrink-0 animate-spin text-brand" /> : null}
                {label}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-semibold" aria-live="polite">{stage}</span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{Math.round(progress * 100)}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress * 100}%` }} />
      </div>
      {counting && (
        <div className="mt-2 flex justify-between gap-3 text-xs text-ink-mute tabular-nums">
          <span>
            第 {frames.done.toLocaleString()}／{frames.total.toLocaleString()} 格
            {rate > 0 && ` ・ 每秒 ${rate >= 10 ? Math.round(rate) : rate.toFixed(1)} 格`}
          </span>
          <span>{eta}</span>
        </div>
      )}
    </div>
  );
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const upgrade = useUpgrade();
  const isPro = user?.plan === 'pro';
  const toast = useToast();
  const name = useEditor((s) => s.name);
  const projectId = useEditor((s) => s.projectId);
  const duration = useEditor((s) => s.data.duration);
  const aspect = useEditor((s) => s.data.aspect);
  const [quality, setQuality] = useState<Quality>(isPro ? 1080 : 720);
  const [{ bitrate, fps }, setSettings] = useState(loadSettings);
  const updateSettings = (next: Partial<{ bitrate: ExportBitrate; fps: ExportFps }>) =>
    setSettings((prev) => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
      } catch {
        /* 無痕模式等存不了就算了，下次用預設 */
      }
      return merged;
    });
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; blob: Blob; size: number; test: boolean; info: ExportInfo; at: number; record: LocalExport | null; savedId?: string } | null>(null);
  /** 這台裝置上這個專案最近一次的匯出，以及存到帳戶的匯出 */
  const [local, setLocal] = useState<LocalExport | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedExport[]>([]);
  /** 正在存到帳戶的上傳進度（0～1） */
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState('');
  const runRef = useRef<AbortController | null>(null);
  const resultRef = useRef<string | null>(null);
  const [stage, setStage] = useState('');
  const [step, setStep] = useState<ExportStep>('prepare');
  const [frames, setFrames] = useState<FrameProgress | null>(null);
  /** 這次匯出走即時錄製（一開始就是，或逐格失敗後改用） */
  const [recording, setRecording] = useState(false);
  const mimes = supportedExportMimes();
  const data = useEditor((s) => s.data);
  // 匯出前的字幕檢查：匯出後才發現字幕讀不完或疊在一起就要重來
  const captionIssues = useMemo(() => checkCaptions(data.captions), [data.captions]);
  // undefined＝還在檢查；null＝這個瀏覽器兩種方式都不支援
  const [mode, setMode] = useState<ExportMode | null | undefined>(undefined);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    exportModeFor(data, { quality, bitrate, fps }).then((m) => alive && setMode(m), () => alive && setMode(mimes.length ? 'realtime' : null));
    return () => { alive = false; };
  }, [data, quality, bitrate, fps]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user || !projectId) return;
    let alive = true;
    void localExports.get(user.id, projectId).then((r) => alive && setLocal(r));
    api.exports(projectId).then((r) => alive && setSaved(r.exports), () => {});
    return () => { alive = false; };
  }, [user, projectId]);

  useEffect(() => {
    if (!local) return setLocalUrl(null);
    const url = URL.createObjectURL(local.blob);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [local]);

  const saveToAccount = async (blob: Blob, info: ExportInfo, record: LocalExport | null, onSaved?: (ex: SavedExport) => void) => {
    if (!projectId || saving != null) return;
    setSaving(0);
    try {
      const { export: ex } = await api.saveExport(projectId, blob, info, setSaving);
      setSaved((list) => [ex, ...list].slice(0, 3));
      onSaved?.(ex);
      if (record) {
        await localExports.markSaved(record, ex.id);
        setLocal((cur) => (cur?.key === record.key && cur.createdAt === record.createdAt ? { ...cur, savedId: ex.id } : cur));
      }
      toast('已存到帳戶，換台裝置也能下載', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : '存到帳戶失敗，請稍後再試', 'error');
    } finally {
      setSaving(null);
    }
  };

  const deleteSaved = async (ex: SavedExport) => {
    if (!projectId) return;
    try {
      await api.deleteExport(projectId, ex.id);
      setSaved((list) => list.filter((x) => x.id !== ex.id));
      if (local?.savedId === ex.id) setLocal({ ...local, savedId: undefined });
    } catch (error) {
      toast(error instanceof Error ? error.message : '刪除失敗', 'error');
    }
  };

  const deleteLocal = async () => {
    if (!user || !projectId) return;
    await localExports.remove(user.id, projectId);
    setLocal(null);
  };

  useEffect(() => () => {
    runRef.current?.abort();
    if (resultRef.current) URL.revokeObjectURL(resultRef.current);
  }, []);

  const start = async (test = false) => {
    if (runRef.current) return;
    const controller = new AbortController();
    runRef.current = controller;
    setState('running');
    setProgress(0);
    setError('');
    setStage('檢查匯出環境…');
    setStep('prepare');
    setFrames(null);
    setRecording(false);
    try {
      const snapshot = structuredClone(useEditor.getState().data);
      const { width, height } = aspectSize(snapshot.aspect, quality);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.className = 'h-full w-full object-contain';
      previewRef.current?.replaceChildren(canvas);
      const output = await exportVideo(canvas, snapshot, {
        signal: controller.signal, quality, bitrate, fps, watermark: !isPro, test,
        onStage: setStage, onProgress: setProgress, onStep: (next) => {
          setStep(next);
          if (next === 'record') setRecording(true);
        },
        onFrames: (done, total) =>
          setFrames((prev) => (prev && prev.total === total && done >= prev.done ? { ...prev, done } : { done, total, since: performance.now(), from: done })),
      });
      if (controller.signal.aborted) return;
      if (resultRef.current) URL.revokeObjectURL(resultRef.current);
      const url = URL.createObjectURL(output.blob);
      resultRef.current = url;
      const info: ExportInfo = { ext: output.ext, width, height, quality, fps, bitrate, duration: output.duration, mode: output.mode };
      setResult({ url, blob: output.blob, size: output.blob.size, test, info, at: Date.now(), record: null });
      setState('done');
      // 完整匯出自動留在這台裝置，關掉視窗或重新整理都還能下載
      if (!test && user && projectId) {
        const record = await localExports.put(user.id, projectId, info, output.blob);
        if (record) {
          setLocal(record);
          setResult((r) => (r && r.url === url ? { ...r, record } : r));
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setError(error instanceof Error ? error.message : '無法匯出，請重新嘗試。');
      setState('error');
    } finally {
      if (runRef.current === controller) runRef.current = null;
    }
  };

  const close = () => {
    runRef.current?.abort();
    onClose();
  };

  return (
    <Modal open onClose={close} width="max-w-lg">
      <h2 className="text-xl font-extrabold">匯出影片</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {aspect} ・ {formatTime(duration)}
      </p>

      {state === 'idle' && (
        <>
          {(local || saved.length > 0) && (
            <section className="mt-5" aria-label="最近匯出">
              <div className="text-xs font-bold text-ink-soft">最近匯出</div>
              <ul className="mt-1.5 grid gap-1.5">
                {local && localUrl && !saved.some((x) => x.id === local.savedId) && (
                  <ExportRow
                    info={local.info} size={local.blob.size} at={local.createdAt} where="local"
                    href={localUrl} download={fileName(name, local.createdAt, local.info.ext)}
                    onSave={() => void saveToAccount(local.blob, local.info, local)} saving={saving}
                    onDelete={() => void deleteLocal()}
                  />
                )}
                {saved.map((ex) => (
                  <ExportRow
                    key={ex.id} info={ex} size={ex.size} at={ex.createdAt} where="account"
                    href={ex.url} download={fileName(name, ex.createdAt, ex.ext)}
                    onDelete={() => void deleteSaved(ex)}
                  />
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-ink-mute">這台裝置會保留每個專案最近一次的匯出；存到帳戶的會保留最近 3 支，換裝置也能下載。</p>
            </section>
          )}
          <div className="mt-5 grid grid-cols-2 gap-2">
            {([720, 1080] as Quality[]).map((q) => {
              const locked = q === 1080 && !isPro;
              return (
                <button
                  key={q}
                  onClick={() => (locked ? upgrade('1080p 高畫質匯出是專業版功能。') : setQuality(q))}
                  className={`rounded-2xl border-2 p-4 text-left transition ${quality === q ? 'border-brand bg-brand-soft/50' : 'border-line hover:border-ink-mute/40'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-extrabold">{q}p</span>
                    {locked && <ProBadge />}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-mute">{q === 720 ? '檔案較小，適合快速分享' : '畫面更細緻，適合正式發佈'}</div>
                </button>
              );
            })}
          </div>
          <Segmented label="畫質" value={bitrate} options={BITRATES} onChange={(v) => updateSettings({ bitrate: v })} />
          <Segmented label="每秒格數" value={fps} options={FPS_OPTIONS.map(([id, hint]) => [id, `${id} 格`, hint])} onChange={(v) => updateSettings({ fps: v })} />
          <p className="mt-2 text-xs text-ink-mute tabular-nums">檔案最大約 {formatSize(estimateSize({ quality, bitrate, fps }, duration))}，畫面變化少的影片會小很多。</p>
          {!isPro && (
            <p className="mt-3 rounded-xl bg-sunken px-3 py-2 text-xs text-ink-soft">
              免費版匯出的影片右下角會有「片刻剪趣」浮水印。
              <button className="ml-1 font-bold text-brand" onClick={() => upgrade('升級專業版即可去除浮水印。')}>
                去除浮水印
              </button>
            </p>
          )}
          {mode === 'offline' ? (
            <p className="mt-3 text-xs text-ink-mute">逐格算圖匯出成 MP4，不會掉格；速度依電腦效能而定，通常比影片本身快。匯出時可以切到其他分頁，但請不要關閉這個分頁。</p>
          ) : mode === 'realtime' ? (
            <>
              <p className="mt-3 text-xs text-ink-mute">
                {needsRealtimeHint(data)}匯出會依影片長度即時錄製，約需 {formatTime(duration)}。過程中請保持這個分頁在前景，切到背景會中止匯出。
              </p>
              <p className="mt-2 text-xs text-ink-mute">{mimes.some((m) => m.includes('mp4')) ? '優先輸出 MP4；無法啟動時自動嘗試 WebM。' : '此瀏覽器將輸出 WebM。需要 MP4 可更換支援 MP4 錄製的瀏覽器。'}</p>
            </>
          ) : mode === null ? (
            <p role="alert" className="mt-2 text-sm text-red-600">此瀏覽器不支援匯出，請更換最新版 Chrome、Edge 或 Safari。</p>
          ) : (
            <p className="mt-3 text-xs text-ink-mute">檢查匯出方式…</p>
          )}
          {captionIssues.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-line px-3 py-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brand" />
              <div className="min-w-0 flex-1 text-xs">
                <div className="font-bold">字幕有 {new Set(captionIssues.map((i) => i.id)).size} 句需要注意</div>
                <div className="mt-0.5 text-ink-mute">{summarizeIssues(captionIssues)}。可以直接匯出，或先一鍵修正。</div>
              </div>
              <button
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-brand hover:bg-brand-soft"
                onClick={() => {
                  const r = fixCaptionIssues();
                  if (r) toast(r.left ? `已修正 ${r.fixed} 處，還有 ${r.left} 個要到「字幕」分頁調整` : `已修正 ${r.fixed} 處`, r.left ? 'info' : 'success');
                }}
              >
                一鍵修正
              </button>
            </div>
          )}
          <Button variant="secondary" className="mt-4 w-full" disabled={!mode || duration <= 0} onClick={() => start(true)}>先測試前 5 秒</Button>
          <Button size="lg" className="mt-3 w-full" disabled={!mode || duration <= 0} onClick={() => start()}>
            <Film className="size-4" /> 開始匯出
          </Button>
        </>
      )}

      <div ref={previewRef} className={`mt-5 aspect-video overflow-hidden rounded-2xl bg-sunken ${state === 'running' ? '' : 'hidden'}`} />
      {state === 'running' && (
        <div>
          <ExportProgress steps={recording ? REALTIME_STEPS : OFFLINE_STEPS} step={step} frames={frames} stage={stage} progress={progress} />
          <Button variant="secondary" className="mt-4 w-full" onClick={close}>
            取消匯出
          </Button>
        </div>
      )}

      {state === 'done' && result && (
        <div className="mt-5 text-center">
          <CheckCircle2 className="mx-auto size-10 text-mint" />
          <div className="mt-2 font-extrabold">{result.test ? '測試匯出完成' : '匯出完成'}</div>
          <div className="text-xs text-ink-mute">
            {describe(result.info, result.size)} ・ {result.info.mode === 'offline' ? '逐格匯出' : '即時錄製'}
          </div>
          <video src={result.url} controls className="mx-auto mt-4 max-h-64 rounded-2xl bg-sunken" />
          <a href={result.url} download={result.test ? `${name || '片刻剪趣作品'}-測試.${result.info.ext}` : fileName(name, result.at, result.info.ext)} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-white hover:bg-brand-hover">
            <Download className="size-4" /> 下載影片
          </a>
          {!result.test && (() => {
            const isSaved = !!result.savedId && saved.some((x) => x.id === result.savedId);
            return isSaved ? (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-ink-soft">
                <Check className="size-4 text-brand" /> 已存到帳戶，換台裝置也能下載
              </p>
            ) : (
              <>
                <Button variant="secondary" className="mt-3 w-full" disabled={saving != null} onClick={() => void saveToAccount(result.blob, result.info, result.record, (ex) => setResult((r) => (r && r.url === result.url ? { ...r, savedId: ex.id } : r)))}>
                  {saving != null ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
                  {saving != null ? `存到帳戶中 ${Math.round(saving * 100)}%` : '存到帳戶'}
                </Button>
                {result.record && <p className="mt-2 text-[11px] text-ink-mute">已自動保留在這台裝置，關掉視窗後重新打開「匯出」也能再下載。</p>}
              </>
            );
          })()}
          {result.test && <Button className="mt-3 w-full" onClick={() => start()}>確認正常，匯出完整影片</Button>}
        </div>
      )}

      {state === 'error' && (
        <div className="mt-5">
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">匯出失敗：{error}</p>
          <Button className="mt-4 w-full" onClick={() => { setQuality(720); setState('idle'); }}>
            改用 720p 再試一次
          </Button>
        </div>
      )}
    </Modal>
  );
}
