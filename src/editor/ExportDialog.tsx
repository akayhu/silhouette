import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Film, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { exportVideo } from '../lib/exportVideo';
import { supportedExportMimes } from '../lib/exportSupport';
import { formatTime } from '../lib/format';
import { aspectSize } from '../lib/timeline';
import { Button, Modal, ProBadge, useUpgrade } from '../components/ui';
import { useEditor } from './store';

type Quality = 720 | 1080;

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const upgrade = useUpgrade();
  const isPro = user?.plan === 'pro';
  const name = useEditor((s) => s.name);
  const duration = useEditor((s) => s.data.duration);
  const aspect = useEditor((s) => s.data.aspect);
  const [quality, setQuality] = useState<Quality>(isPro ? 1080 : 720);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; ext: string; size: number; test: boolean } | null>(null);
  const [error, setError] = useState('');
  const runRef = useRef<AbortController | null>(null);
  const resultRef = useRef<string | null>(null);
  const [stage, setStage] = useState('');
  const mimes = supportedExportMimes();
  const previewRef = useRef<HTMLDivElement>(null);

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
    try {
      const snapshot = structuredClone(useEditor.getState().data);
      const { width, height } = aspectSize(snapshot.aspect, quality);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.className = 'h-full w-full object-contain';
      previewRef.current?.replaceChildren(canvas);
      const output = await exportVideo(canvas, snapshot, {
        signal: controller.signal, quality, watermark: !isPro, test,
        onStage: setStage, onProgress: setProgress,
      });
      if (controller.signal.aborted) return;
      if (resultRef.current) URL.revokeObjectURL(resultRef.current);
      const url = URL.createObjectURL(output.blob);
      resultRef.current = url;
      setResult({ url, ext: output.ext, size: output.blob.size, test });
      setState('done');
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
                  <div className="mt-0.5 text-xs text-ink-mute">{q === 720 ? '檔案較小，適合快速分享' : '高畫質，適合正式發佈'}</div>
                </button>
              );
            })}
          </div>
          {!isPro && (
            <p className="mt-3 rounded-xl bg-sunken px-3 py-2 text-xs text-ink-soft">
              免費版匯出的影片右下角會有「片刻剪趣」浮水印。
              <button className="ml-1 font-bold text-brand" onClick={() => upgrade('升級專業版即可去除浮水印。')}>
                去除浮水印
              </button>
            </p>
          )}
          <p className="mt-3 text-xs text-ink-mute">匯出會依影片長度即時錄製，約需 {formatTime(duration)}。過程中請保持這個分頁在前景，切到背景會中止匯出。</p>
          <p className="mt-2 text-xs text-ink-mute">{mimes.some((m) => m.includes('mp4')) ? '優先輸出 MP4；無法啟動時自動嘗試 WebM。' : '此瀏覽器將輸出 WebM。需要 MP4 可更換支援 MP4 錄製的瀏覽器。'}</p>
          {!mimes.length && <p role="alert" className="mt-2 text-sm text-red-600">此瀏覽器不支援匯出，請更換最新版 Chrome、Edge 或 Safari。</p>}
          <Button variant="secondary" className="mt-4 w-full" disabled={!mimes.length || duration <= 0} onClick={() => start(true)}>先測試前 5 秒</Button>
          <Button size="lg" className="mt-3 w-full" disabled={!mimes.length || duration <= 0} onClick={() => start()}>
            <Film className="size-4" /> 開始匯出
          </Button>
        </>
      )}

      <div ref={previewRef} className={`mt-5 aspect-video overflow-hidden rounded-2xl bg-sunken ${state === 'running' ? '' : 'hidden'}`} />
      {state === 'running' && (
        <div className="mt-4">
          <div className="flex justify-between text-sm font-semibold">
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-brand" /> {stage}
            </span>
            <span className="tabular-nums">{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress * 100}%` }} />
          </div>
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
            {quality}p ・ {result.ext.toUpperCase()} ・ {(result.size / 1024 / 1024).toFixed(1)} MB
          </div>
          <video src={result.url} controls className="mx-auto mt-4 max-h-64 rounded-2xl bg-sunken" />
          <a href={result.url} download={`${name || '片刻剪趣作品'}${result.test ? '-測試' : ''}.${result.ext}`} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-white hover:bg-brand-hover">
            <Download className="size-4" /> 下載影片
          </a>
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
