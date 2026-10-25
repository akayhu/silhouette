import { Plus } from 'lucide-react';
import { formatTime } from '../../lib/format';
import { defaultCaptionStyle, newCaption } from '../../lib/timeline';
import type { CaptionStyle } from '../../lib/types';
import { useEditor } from '../store';
import { ensureUnlocked } from '../locks';

const presets: { name: string; style: Partial<CaptionStyle>; preview: React.CSSProperties }[] = [
  { name: '經典白字', style: {}, preview: { color: '#fff', WebkitTextStroke: '5px #1f1d2b', paintOrder: 'stroke' } },
  { name: '綜藝黃', style: { color: '#ffe14a', stroke: '#1f1d2b', animation: 'pop' }, preview: { color: '#ffe14a', WebkitTextStroke: '5px #1f1d2b', paintOrder: 'stroke' } },
  { name: '白底黑字', style: { color: '#1f1d2b', background: 'rgba(255,255,255,0.92)', animation: 'fade' }, preview: { color: '#1f1d2b', background: '#fff', padding: '2px 8px', borderRadius: 6 } },
  { name: '品牌紫', style: { color: '#ffffff', background: 'rgba(91,76,245,0.92)', animation: 'slide' }, preview: { color: '#fff', background: '#5b4cf5', padding: '2px 8px', borderRadius: 6 } },
  { name: '珊瑚標題', style: { color: '#ff7a59', stroke: '#ffffff', size: 110, y: 0.2, animation: 'pop' }, preview: { color: '#ff7a59', WebkitTextStroke: '5px #fff', paintOrder: 'stroke' } },
  { name: '打字機', style: { color: '#ffffff', stroke: '#1f1d2b', bold: false, animation: 'typewriter' }, preview: { color: '#fff', WebkitTextStroke: '4px #1f1d2b', paintOrder: 'stroke', fontWeight: 500 } },
];

export function TextPanel({ seek }: { seek: (t: number) => void }) {
  const captions = useEditor((s) => s.data.captions);
  const selection = useEditor((s) => s.selection);

  const add = (style: Partial<CaptionStyle>) => {
    if (!ensureUnlocked('caption')) return;
    const { time, commit, select } = useEditor.getState();
    const c = newCaption(time, time + 2, '輸入字幕文字', { ...defaultCaptionStyle(), ...style });
    commit((d) => ({ ...d, captions: [...d.captions, c] }));
    select({ type: 'caption', id: c.id });
  };

  const sorted = [...captions].sort((a, b) => a.start - b.start);
  return (
    <div className="p-4">
      <h2 className="text-sm font-extrabold">新增字幕</h2>
      <p className="mt-1 text-xs text-ink-mute">點選樣式，會在播放頭位置加入 2 秒字幕</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {presets.map((p) => (
          <button key={p.name} onClick={() => add(p.style)} className="group grid h-20 place-items-center rounded-2xl bg-[linear-gradient(140deg,#c9d4ff,#ffd9cb)] transition hover:-translate-y-0.5 hover:shadow-card">
            <span className="text-[15px] font-black" style={p.preview}>
              {p.name}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-extrabold">字幕列表</h2>
        <span className="text-xs text-ink-mute">{captions.length} 句</span>
      </div>
      {sorted.length === 0 ? (
        <p className="mt-3 rounded-xl bg-sunken/70 p-3 text-xs leading-relaxed text-ink-soft">
          還沒有字幕。可以從上方新增，或到「AI 工具」自動產生。
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {sorted.map((c) => (
            <li key={c.id}>
              <div
                className={`flex gap-2 rounded-xl border p-2 transition ${selection?.id === c.id ? 'border-brand bg-brand-soft/40' : 'border-line hover:border-brand/40'}`}
                onClick={() => {
                  useEditor.getState().select({ type: 'caption', id: c.id });
                  seek(c.start + 0.01);
                }}
              >
                <span className="shrink-0 pt-1.5 font-mono text-[10px] text-ink-mute">{formatTime(c.start)}</span>
                <input
                  value={c.text}
                  onFocus={() => useEditor.getState().checkpoint()}
                  onChange={(e) => useEditor.getState().live((d) => ({ ...d, captions: d.captions.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)) }))}
                  className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-sm outline-none focus:bg-surface"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => add({})} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-2 text-xs font-bold text-ink-soft hover:border-brand/50 hover:text-brand">
        <Plus className="size-3.5" /> 在播放頭新增一句
      </button>
    </div>
  );
}
