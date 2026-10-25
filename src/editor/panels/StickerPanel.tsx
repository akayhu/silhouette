import { useState } from 'react';
import { uid } from '../../lib/format';
import { STICKER_CATEGORIES, STICKERS, stickerUrl, type StickerCategory, type StickerDef } from '../../lib/stickers';
import type { StickerItem } from '../../lib/types';
import { useToast } from '../../components/ui';
import { useEditor } from '../store';

const DEFAULT_SECONDS = 3;

/** 從播放頭加入貼紙：放在畫面中間偏上，帶彈出動畫 */
function addSticker(def: StickerDef) {
  const { time, commit, select, data } = useEditor.getState();
  // 同一時間已有貼紙時稍微錯開位置，避免完全疊在一起
  const overlapping = data.stickers.filter((s) => time >= s.start && time < s.end).length;
  const item: StickerItem = {
    id: uid(),
    stickerId: def.id,
    start: time,
    end: time + DEFAULT_SECONDS,
    x: 0.5 + ((overlapping % 3) - 1) * 0.18 * Math.min(1, overlapping),
    y: 0.38 + Math.floor(overlapping / 3) * 0.12,
    scale: 1,
    rotation: 0,
    opacity: 1,
    animation: 'pop',
  };
  commit((d) => ({ ...d, stickers: [...d.stickers, item] }));
  select({ type: 'sticker', id: item.id });
}

export function StickerPanel() {
  const toast = useToast();
  const [cat, setCat] = useState<StickerCategory>('face');
  const list = STICKERS.filter((s) => s.category === cat);

  return (
    <div className="p-4">
      <h2 className="text-sm font-extrabold">貼紙</h2>
      <p className="mt-1 text-xs text-ink-mute">原創設計，無版權問題，可用於個人與商業影片。點一下加入，會從播放頭開始顯示 3 秒。</p>

      <div className="mt-3 grid grid-cols-4 rounded-xl bg-sunken p-0.5">
        {STICKER_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={`rounded-[10px] py-1.5 text-xs font-bold transition ${cat === c.id ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {list.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              addSticker(s);
              toast(`已加入「${s.name}」`, 'success');
            }}
            className="group flex flex-col items-center rounded-2xl border border-line bg-surface p-2 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card"
            title={s.name}
          >
            <img src={stickerUrl(s)} alt={s.name} className="size-16 transition group-hover:scale-110" draggable={false} />
            <span className="mt-1 truncate text-[11px] font-semibold text-ink-soft">{s.name}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-ink-mute">加入後可以在右側預覽畫面直接拖曳位置，或在中間的屬性區調整大小、角度和動畫。</p>
    </div>
  );
}
