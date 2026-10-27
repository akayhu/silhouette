import { useEffect, useRef, useState } from 'react';
import { Download, Film, ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { COVER_PRESETS, coverSize, coverThumb, defaultCover, renderCover } from '../lib/cover';
import { captionBox, drawCaption } from '../lib/engine';
import { formatTime } from '../lib/format';
import type { Caption, VideoCover } from '../lib/types';
import { StylePreview } from '../components/StylePreview';
import { Button, Modal, useToast } from '../components/ui';
import { importMediaFile } from './panels/MediaPanel';
import { Slider } from './Inspector';
import { useEditor } from './store';

/**
 * 設定封面（仿剪映）：從影片挑一格畫面或用本機圖片，加上封面標題。
 * 儲存後當作專案縮圖，可以下載圖片，也可以在匯出時放在影片開頭。
 */
export function CoverDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const data = useEditor((s) => s.data);
  const name = useEditor((s) => s.name);
  const [cover, setCover] = useState<VideoCover>(() => data.cover ?? { ...defaultCover(), time: Math.min(useEditor.getState().time, Math.max(0, data.duration - 0.05)) });
  // 預覽分兩層：底圖（影片那一格或圖片，畫一次就留著）＋標題（每次調整立刻重畫，拖曳才順）
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const image = cover.mediaId ? data.media.find((m) => m.id === cover.mediaId) : undefined;
  const images = data.media.filter((m) => m.kind === 'image' && m.url);
  const { width, height } = coverSize(data);

  const scale = 420 / Math.max(width, height);
  const pw = Math.round(width * scale);
  const ph = Math.round(height * scale);

  // 底圖：只有換畫面或換圖片時才重畫（不含標題）
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setRendering(true);
      try {
        const c = await renderCover(data, { ...cover, title: '' }, pw, ph);
        if (alive) setBase(c);
      } catch {
        if (alive) setBase(null);
      } finally {
        if (alive) setRendering(false);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cover.source, cover.time, cover.mediaId, data, pw, ph]);

  // 標題：每次改文字、樣式、位置都立刻畫在底圖上
  const title: Caption = { id: 'cover-title', start: 0, end: 1, text: cover.title, style: { ...cover.style, animation: 'none' } };
  useEffect(() => {
    const c = previewRef.current;
    if (!c || !base) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, pw, ph);
    ctx.drawImage(base, 0, 0, pw, ph);
    if (cover.title.trim()) drawCaption(ctx, title, 0.5, pw, ph, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, cover.title, cover.style, pw, ph]);
  // 字型載入後再畫一次，避免先用替代字型
  useEffect(() => {
    void document.fonts.load(`900 40px "${cover.style.font}"`).then(() => setCover((c) => ({ ...c })));
  }, [cover.style.font]);

  /** 拖曳標題：依滑鼠位置移動標題中心，限制在畫面內 */
  const moveTitle = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const box = captionBox(title, pw, ph);
    const x = Math.min(box.maxX, Math.max(box.minX, (e.clientX - r.left) / r.width));
    const y = Math.min(box.maxY, Math.max(box.minY, (e.clientY - r.top) / r.height));
    setCover((c) => ({ ...c, style: { ...c.style, x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 } }));
  };
  const box = cover.title.trim() ? captionBox(title, pw, ph) : null;

  const set = (patch: Partial<VideoCover>) => setCover((c) => ({ ...c, ...patch }));
  const setStyle = (patch: Partial<VideoCover['style']>) => setCover((c) => ({ ...c, style: { ...c.style, ...patch } }));

  const pickImage = async (file: File) => {
    setBusy('加入圖片…');
    try {
      const m = await importMediaFile(file);
      if (m.kind !== 'image') throw new Error('請選擇圖片檔');
      set({ source: 'image', mediaId: m.id });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const full = () => renderCover(useEditor.getState().data, cover, width, height);

  const save = async () => {
    setBusy('儲存中…');
    try {
      const thumb = coverThumb(await full());
      useEditor.getState().commit((d) => ({ ...d, cover: { ...cover, thumb } }));
      toast('已設定封面', 'success');
      onClose();
    } catch (e) {
      toast('封面儲存失敗：' + (e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy('產生圖片…');
    try {
      const canvas = await full();
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (!blob) throw new Error('無法產生圖片');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name || '片刻剪趣作品'}-封面.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast('下載失敗：' + (e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const remove = () => {
    useEditor.getState().commit((d) => ({ ...d, cover: undefined }));
    toast('已移除封面', 'success');
    onClose();
  };

  return (
    <Modal open onClose={onClose} width="max-w-4xl">
      <h2 className="text-xl font-extrabold">設定封面</h2>
      <p className="mt-1 text-sm text-ink-soft">從影片挑一格畫面，或用一張圖片，再加上封面標題。封面會當作專案縮圖，也可以下載或放在匯出影片的開頭。</p>

      <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,300px)_1fr]">
        {/* 預覽 */}
        <div>
          <div className="relative mx-auto overflow-hidden rounded-2xl bg-sunken" style={{ aspectRatio: `${width} / ${height}`, maxHeight: 480 }}>
            <canvas
              ref={previewRef}
              width={pw}
              height={ph}
              role="img"
              aria-label="封面預覽，可以拖曳標題調整位置"
              className={`h-full w-full touch-none ${box ? 'cursor-move' : ''}`}
              onPointerDown={(e) => {
                if (!box) return;
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                moveTitle(e);
              }}
              onPointerMove={(e) => dragging.current && moveTitle(e)}
              onPointerUp={() => (dragging.current = false)}
              onPointerCancel={() => (dragging.current = false)}
            />
            {/* 標題範圍：虛線框提示可以拖曳 */}
            {box && (
              <div
                className="pointer-events-none absolute rounded-md border border-dashed border-white/90 shadow-[0_0_0_1px_rgb(0_0_0/0.35)]"
                style={{ left: `${((box.cx - box.w / 2) / pw) * 100}%`, top: `${((box.cy - box.h / 2) / ph) * 100}%`, width: `${(box.w / pw) * 100}%`, height: `${(box.h / ph) * 100}%` }}
              />
            )}
            {!base && <div className="absolute inset-0 grid place-items-center text-xs text-ink-mute">預覽產生中…</div>}
            {rendering && <Loader2 className="absolute top-3 right-3 size-4 animate-spin text-white drop-shadow" />}
          </div>
          <p className="mt-2 text-center text-xs text-ink-mute tabular-nums">
            {box ? '拖曳標題可以移動位置・' : ''}
            {width} × {height}
          </p>
        </div>

        {/* 設定 */}
        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-sunken p-1" role="radiogroup" aria-label="封面來源">
            {(
              [
                ['frame', '影片畫面', <Film key="f" className="size-4" />],
                ['image', '本機圖片', <ImageIcon key="i" className="size-4" />],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                role="radio"
                aria-checked={cover.source === id}
                onClick={() => set({ source: id })}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold transition ${cover.source === id ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {cover.source === 'frame' ? (
            <div>
              <Slider
                label="選擇畫面"
                value={cover.time}
                min={0}
                max={Math.max(0.1, data.duration - 0.05)}
                step={0.04}
                format={(v) => formatTime(v, true)}
                onChange={(time) => set({ time })}
              />
              <button className="mt-2 text-xs font-bold text-brand hover:underline" onClick={() => set({ time: Math.min(useEditor.getState().time, Math.max(0, data.duration - 0.05)) })}>
                用目前播放頭的畫面
              </button>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap gap-2">
                {images.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => set({ mediaId: m.id })}
                    className={`size-16 overflow-hidden rounded-xl border-2 ${cover.mediaId === m.id ? 'border-brand' : 'border-line'}`}
                    aria-label={`用「${m.name}」當封面`}
                  >
                    <img src={m.thumb || m.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
                <button
                  onClick={() => imageInput.current?.click()}
                  className="grid size-16 place-items-center rounded-xl border-2 border-dashed border-line text-xs font-bold text-ink-soft hover:border-brand hover:text-brand"
                >
                  加入圖片
                </button>
              </div>
              <input ref={imageInput} type="file" accept="image/*" className="hidden" onChange={(e) => (e.target.files?.[0] && void pickImage(e.target.files[0]), (e.target.value = ''))} />
              {!image && <p className="mt-2 text-xs text-ink-mute">選一張圖片當封面；圖片只存在這台電腦。</p>}
            </div>
          )}

          <div>
            <div className="mb-1.5 text-xs font-semibold text-ink-soft">封面標題</div>
            <textarea
              value={cover.title}
              onChange={(e) => set({ title: e.target.value })}
              rows={2}
              placeholder="例如：台南必吃小吃 5 家"
              className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="標題樣式">
              {COVER_PRESETS.map((p) => {
                const on = p.style.color === cover.style.color && p.style.background === cover.style.background && p.style.font === cover.style.font && p.style.stroke === cover.style.stroke;
                return (
                  <button
                    key={p.name}
                    role="radio"
                    aria-checked={on}
                    onClick={() => setStyle({ ...p.style, size: cover.style.size, x: cover.style.x, y: cover.style.y })}
                    className={`grid h-14 place-items-center rounded-xl border-2 bg-[linear-gradient(140deg,#c9d4ff,#ffd9cb)] ${on ? 'border-brand' : 'border-transparent'}`}
                    title={p.name}
                  >
                    <StylePreview style={p.style} text="封面標題" size={15} />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Slider label="字級" value={cover.style.size} min={60} max={200} onChange={(size) => setStyle({ size })} />
              <Slider label="垂直位置" value={Math.round(cover.style.y * 100)} min={5} max={95} format={(v) => (v < 35 ? '上方' : v > 65 ? '下方' : '中間')} onChange={(v) => setStyle({ y: v / 100 })} />
            </div>
            <button className="mt-2 text-xs font-bold text-brand hover:underline disabled:text-ink-mute disabled:no-underline" disabled={(cover.style.x ?? 0.5) === 0.5} onClick={() => setStyle({ x: 0.5 })}>
              水平置中
            </button>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 accent-brand" checked={cover.inVideo} onChange={(e) => set({ inVideo: e.target.checked })} />
            <span>
              匯出影片時放在開頭
              <span className="block text-xs text-ink-mute">影片最前面 0.1 秒顯示封面，上傳到社群平台時比較容易被當成封面。</span>
            </span>
          </label>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => void download()} disabled={!!busy}>
            <Download className="size-4" /> 下載封面圖片
          </Button>
          {data.cover && (
            <Button variant="secondary" size="sm" onClick={remove} disabled={!!busy}>
              <Trash2 className="size-4" /> 移除封面
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={!!busy}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={!!busy || (cover.source === 'image' && !image)}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {busy ?? '儲存封面'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
