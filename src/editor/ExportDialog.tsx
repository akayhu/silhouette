import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Film, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Engine } from '../lib/engine';
import { formatTime } from '../lib/format';
import { aspectSize } from '../lib/timeline';
import { Button, Modal, ProBadge, useUpgrade } from '../components/ui';
import { useEditor } from './store';

type Quality = 720 | 1080;

function pickMime() {
  const candidates = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
}

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
  const [result, setResult] = useState<{ url: string; ext: string; size: number } | null>(null);
  const [error, setError] = useState('');
  const cancelRef = useRef<() => void>(() => {});
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    cancelRef.current();
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  const start = async () => {
    setState('running');
    setProgress(0);
    setError('');
    const { width, height } = aspectSize(aspect, quality);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.className = 'h-full w-full object-contain';
    previewRef.current?.replaceChildren(canvas);
    const engine = new Engine(canvas, { speakers: false, watermark: !isPro });
    let cancelled = false;
    try {
      await document.fonts.ready;
      engine.setData(useEditor.getState().data);
      engine.seek(0);
      await engine.ready();
      const mime = pickMime();
      const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...engine.recordDest.stream.getAudioTracks()]);
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: quality === 1080 ? 10_000_000 : 5_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const finished = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
      cancelRef.current = () => {
        cancelled = true;
        engine.pause();
        if (recorder.state !== 'inactive') recorder.stop();
      };
      engine.onTime = (t) => setProgress(t / engine.duration);
      engine.onEnded = () => setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), 150);
      recorder.start(500);
      await engine.play();
      await finished;
      if (cancelled) return;
      const blob = new Blob(chunks, { type: mime.split(';')[0] });
      setResult({ url: URL.createObjectURL(blob), ext: mime.includes('mp4') ? 'mp4' : 'webm', size: blob.size });
      setState('done');
    } catch (e) {
      setError((e as Error).message);
      setState('error');
    } finally {
      engine.destroy();
      cancelRef.current = () => {};
    }
  };

  const close = () => {
    cancelRef.current();
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
          <p className="mt-3 text-xs text-ink-mute">匯出會依影片長度即時錄製，約需 {formatTime(duration)}。過程中請保持這個分頁開著。</p>
          <Button size="lg" className="mt-5 w-full" onClick={start}>
            <Film className="size-4" /> 開始匯出
          </Button>
        </>
      )}

      <div ref={previewRef} className={`mt-5 aspect-video overflow-hidden rounded-2xl bg-sunken ${state === 'running' ? '' : 'hidden'}`} />
      {state === 'running' && (
        <div className="mt-4">
          <div className="flex justify-between text-sm font-semibold">
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-brand" /> 匯出中…
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
          <div className="mt-2 font-extrabold">匯出完成</div>
          <div className="text-xs text-ink-mute">
            {quality}p ・ {result.ext.toUpperCase()} ・ {(result.size / 1024 / 1024).toFixed(1)} MB
          </div>
          <video src={result.url} controls className="mx-auto mt-4 max-h-64 rounded-2xl bg-sunken" />
          <a href={result.url} download={`${name || '片刻剪趣作品'}.${result.ext}`} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand font-semibold text-white hover:bg-brand-hover">
            <Download className="size-4" /> 下載影片
          </a>
        </div>
      )}

      {state === 'error' && (
        <div className="mt-5">
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">匯出失敗：{error}</p>
          <Button className="mt-4 w-full" onClick={() => setState('idle')}>
            再試一次
          </Button>
        </div>
      )}
    </Modal>
  );
}
