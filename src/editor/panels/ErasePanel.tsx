import { useState } from 'react';
import { Eye, Loader2, ScanSearch, SquareDashedMousePointer, Trash2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { detectWatermarks } from '../../lib/erase';
import { uid } from '../../lib/format';
import { clipAt, layoutMain } from '../../lib/timeline';
import type { EraseMode } from '../../lib/types';
import { Button, ProBadge, useToast, useUpgrade } from '../../components/ui';
import { Chips } from '../Inspector';
import { updateErase } from '../EraseOverlay';
import { useEditor } from '../store';
import { ensureUnlocked } from '../locks';

const MODES: { id: EraseMode; label: string }[] = [
  { id: 'blur', label: '模糊' },
  { id: 'mosaic', label: '馬賽克' },
];

export function ErasePanel({ onCompare }: { onCompare: (on: boolean) => void }) {
  const { user } = useAuth();
  const upgrade = useUpgrade();
  const toast = useToast();
  const data = useEditor((s) => s.data);
  const time = useEditor((s) => s.time);
  const selection = useEditor((s) => s.selection);
  const editing = useEditor((s) => s.eraseEdit);
  const [detecting, setDetecting] = useState<number | null>(null);
  const isPro = user?.plan === 'pro';

  // 處理對象：選取中的主軌片段，否則是播放頭所在的片段
  const placed = layoutMain(data.clips);
  const clip = (selection?.type === 'clip' && placed.find((c) => c.id === selection.id)) || clipAt(placed, time);
  const media = clip ? data.media.find((m) => m.id === clip.mediaId) : undefined;
  const regions = media?.erase ?? [];
  const uses = media ? data.clips.filter((c) => c.mediaId === media.id).length : 0;

  const guard = () => {
    if (!isPro) upgrade('去除浮水印是專業版功能。');
    return isPro && ensureUnlocked('main');
  };

  const detect = async () => {
    if (!guard() || !media || !clip) return;
    setDetecting(0);
    try {
      const { regions: found, mostlyStatic } = await detectWatermarks(media.url, clip.in, clip.out, setDetecting);
      if (!found.length) {
        toast(mostlyStatic ? '畫面幾乎沒有變動，無法自動判斷，請改用手動框選' : '沒有偵測到固定的浮水印，可以改用手動框選');
        return;
      }
      updateErase(media.id, (rs) => [...rs, ...found.map((r) => ({ id: uid(), ...r, mode: 'blur' as const }))]);
      useEditor.getState().setEraseEdit(media.id);
      const logos = found.filter((r) => r.kind === 'logo').length;
      const subs = found.length - logos;
      toast(`找到 ${[logos && `${logos} 個 Logo／浮水印`, subs && `${subs} 條字幕帶`].filter(Boolean).join('、')}，請確認框選位置`, 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setDetecting(null);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold">去除浮水印</h2>
        {!isPro && <ProBadge />}
      </div>
      <p className="mt-1 text-xs text-ink-mute">框出影片中的浮水印、Logo 或文字，自動把它補掉。</p>

      {!media || media.kind === 'audio' ? (
        <div className="mt-4 rounded-2xl border-2 border-dashed border-line p-6 text-center text-xs leading-relaxed text-ink-soft">
          把播放頭移到要處理的影片上，
          <br />
          或在時間軸點選主軌片段。
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-sunken/70 p-2.5">
            {media.thumb && <img src={media.thumb} alt="" className="h-10 w-14 rounded-lg object-cover" />}
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{media.name}</div>
              <div className="text-[11px] text-ink-mute">套用到這支素材的 {uses} 個片段</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={detect} disabled={detecting !== null || media.kind !== 'video'}>
              {detecting !== null ? <Loader2 className="size-4 animate-spin" /> : <ScanSearch className="size-4" />}
              {detecting !== null ? `分析中 ${Math.round(detecting * 100)}%` : '自動偵測'}
            </Button>
            <Button
              variant={editing === media.id ? 'primary' : 'secondary'}
              onClick={() => guard() && useEditor.getState().setEraseEdit(editing === media.id ? null : media.id)}
            >
              <SquareDashedMousePointer className="size-4" />
              {editing === media.id ? '完成框選' : '手動框選'}
            </Button>
          </div>

          {regions.length > 0 && (
            <>
              <ul className="mt-4 space-y-2">
                {regions.map((r, i) => (
                  <li key={r.id} className="rounded-xl border border-line p-2.5">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-bold">
                        <span className="grid size-4 place-items-center rounded bg-coral text-[10px] text-white">{i + 1}</span>
                        {r.kind === 'subtitle' ? '字幕帶' : r.kind === 'logo' ? 'Logo／浮水印' : '區域'} {i + 1}
                      </span>
                      <button
                        onClick={() => updateErase(media.id, (rs) => rs.filter((x) => x.id !== r.id))}
                        className="rounded p-1 text-ink-mute hover:bg-red-50 hover:text-red-600"
                        aria-label={`刪除區域 ${i + 1}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <Chips options={MODES} value={r.mode === 'fill' ? 'blur' : r.mode} onChange={(mode) => updateErase(media.id, (rs) => rs.map((x) => (x.id === r.id ? { ...x, mode } : x)))} />
                  </li>
                ))}
              </ul>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-xs font-bold text-ink-soft select-none hover:bg-sunken active:bg-brand-soft active:text-brand"
                  onPointerDown={() => onCompare(true)}
                  onPointerUp={() => onCompare(false)}
                  onPointerLeave={() => onCompare(false)}
                >
                  <Eye className="size-3.5" /> 按住比較原圖
                </button>
                <button className="rounded-xl border border-line py-2 text-xs font-bold text-red-600 hover:bg-red-50" onClick={() => updateErase(media.id, () => [])}>
                  全部清除
                </button>
              </div>
            </>
          )}

          <ul className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-ink-soft">
            <li>・畫面單純、背景平坦的位置，選<b>模糊</b>效果最自然</li>
            <li>・畫面複雜、細節多的位置，改用<b>馬賽克</b>比較不會看出痕跡</li>
            <li>・框稍微比浮水印大一點，效果會更好</li>
            <li>・自動偵測也會找出影片原本燒在畫面上的<b>字幕帶</b>；字幕區面積大，補完會看得出痕跡，要換成自己的字幕時，可以讓新字幕加上底色直接蓋過去</li>
          </ul>
        </>
      )}

      <p className="mt-4 rounded-xl bg-sun/20 px-3 py-2 text-[11px] leading-relaxed text-[#8a6100]">
        請只處理你自己拍攝、或已取得授權的影片。移除他人作品的浮水印再發佈，可能侵害著作權。
      </p>
    </div>
  );
}
