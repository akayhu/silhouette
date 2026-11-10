import { Check } from 'lucide-react';
import { FILTER_PRESETS } from '../lib/filters';
import { formatTime } from '../lib/format';
import { layoutMain } from '../lib/timeline';
import { Modal } from '../components/ui';
import { useEditor } from './store';

/**
 * 鏡頭總覽表：主軌每一段的重點狀態一覽（字幕、運鏡、轉場、濾鏡有沒有套），
 * 不用一段段刷時間軸找，點一列可以直接跳過去。純讀取既有資料，不分析也不建議。
 */
export function ShotTable({ onClose, seek }: { onClose: () => void; seek: (t: number) => void }) {
  const data = useEditor((s) => s.data);
  const placed = layoutMain(data.clips);
  const mediaById = new Map(data.media.map((m) => [m.id, m]));
  const hasCaption = (start: number, end: number) => data.captions.some((c) => c.role !== 'flower' && c.start < end && c.end > start);

  const goto = (t: number) => {
    seek(t);
    onClose();
  };

  return (
    <Modal open onClose={onClose} width="max-w-3xl">
      <h2 className="text-xl font-extrabold">鏡頭總覽表</h2>
      <p className="mt-1 text-sm text-ink-soft">主軌每一段的重點狀態一覽，點一列可以直接跳過去看。</p>
      {placed.length === 0 ? (
        <p className="mt-6 py-8 text-center text-sm text-ink-mute">主軌還沒有片段</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line text-ink-mute">
                <th className="py-2 pr-2 font-bold">#</th>
                <th className="py-2 pr-2 font-bold">片段</th>
                <th className="py-2 pr-2 font-bold">時長</th>
                <th className="py-2 pr-2 font-bold">字幕</th>
                <th className="py-2 pr-2 font-bold">運鏡</th>
                <th className="py-2 pr-2 font-bold">轉場</th>
                <th className="py-2 pr-2 font-bold">濾鏡</th>
              </tr>
            </thead>
            <tbody>
              {placed.map((c, i) => {
                const media = mediaById.get(c.mediaId);
                const filterName = c.filter && c.filter.preset !== 'none' ? FILTER_PRESETS.find((p) => p.id === c.filter!.preset)?.name : null;
                return (
                  <tr key={c.id} className="cursor-pointer border-b border-line/60 hover:bg-sunken/60" onClick={() => goto(c.start)}>
                    <td className="py-2 pr-2 align-middle font-bold text-ink-mute">{i + 1}</td>
                    <td className="py-2 pr-2 align-middle">
                      <div className="flex items-center gap-2">
                        {media?.thumb ? (
                          <img src={media.thumb} alt="" className="h-9 w-14 shrink-0 rounded-md object-cover" />
                        ) : (
                          <div className="h-9 w-14 shrink-0 rounded-md bg-sunken" />
                        )}
                        <span className="min-w-0 truncate font-semibold">{media?.name ?? '—'}</span>
                      </div>
                    </td>
                    {/* 加一點點容錯：主軌片段算出來的長度常常是 3.9999999999 這種浮點誤差，不加會被無條件捨去顯示少 1 秒 */}
                    <td className="py-2 pr-2 align-middle tabular-nums">{formatTime(c.end - c.start + 1e-6)}</td>
                    <td className="py-2 pr-2 align-middle">{hasCaption(c.start, c.end) ? <Check className="size-4 text-mint" /> : <span className="text-ink-mute">—</span>}</td>
                    <td className="py-2 pr-2 align-middle">{c.motion && c.motion !== 'none' ? <Check className="size-4 text-mint" /> : <span className="text-ink-mute">—</span>}</td>
                    <td className="py-2 pr-2 align-middle">{c.transition ? <Check className="size-4 text-mint" /> : <span className="text-ink-mute">—</span>}</td>
                    <td className="py-2 pr-2 align-middle">{filterName ?? <span className="text-ink-mute">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
