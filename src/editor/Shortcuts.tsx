import { Modal } from '../components/ui';
import { isLocked } from '../lib/timeline';
import { notify } from '../components/ui';
import { ensureUnlocked } from './locks';
import { useEditor } from './store';

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

export const SHORTCUTS: { group: string; items: [string[], string][] }[] = [
  {
    group: '播放',
    items: [
      [['Space'], '播放／暫停'],
      [['K'], '播放／暫停'],
      [['J'], '倒退 1 秒（Shift + J 倒退 5 秒）'],
      [['L'], '前進 1 秒（Shift + L 前進 5 秒）'],
      [['←', '→'], '前後移動一格（按住 Shift 移動 1 秒）'],
      [['Home'], '跳到開頭'],
      [['End'], '跳到結尾'],
    ],
  },
  {
    group: '字幕對時',
    items: [
      [['['], '把目前字幕的開始時間設成播放頭位置'],
      [[']'], '把目前字幕的結束時間設成播放頭位置'],
    ],
  },
  {
    group: '編輯',
    items: [
      [[mod, 'B'], '在播放頭位置分割選取的項目'],
      [['Q'], '向左裁剪：剪掉播放頭左邊的部分'],
      [['W'], '向右裁剪：剪掉播放頭右邊的部分'],
      [['Delete'], '刪除選取的項目'],
      [[mod, 'A'], '全選'],
      [['Esc'], '取消選取'],
      [[mod, 'Z'], '復原'],
      [['Shift', mod, 'Z'], '重做'],
    ],
  },
  {
    group: '字幕校對與文字剪輯',
    items: [
      [['Enter'], '字幕清單：跳到下一句'],
      [['Shift', 'Enter'], '字幕清單：換行'],
      [[mod, 'Enter'], '字幕清單：依文字游標拆句'],
      [['Delete'], '文字剪輯：剪掉選取的字'],
    ],
  },
  { group: '其他', items: [[['?'], '打開這份快捷鍵說明']] },
];

/**
 * 「目前字幕」：選取中的字幕；沒有選取就用播放頭所在的那句；
 * 播放頭剛好在兩句之間時，設開始找下一句、設結束找上一句。
 */
function currentCaption(edge: 'start' | 'end') {
  const { selection, data, time } = useEditor.getState();
  if (selection?.type === 'caption') return data.captions.find((c) => c.id === selection.id);
  const plain = data.captions.filter((c) => c.role !== 'flower');
  const under = plain.find((c) => time >= c.start && time < c.end);
  if (under) return under;
  return edge === 'start'
    ? plain.filter((c) => c.start >= time).sort((a, b) => a.start - b.start)[0]
    : plain.filter((c) => c.end <= time).sort((a, b) => b.end - a.end)[0];
}

/** [ 與 ]：把目前字幕的開始或結束時間設成播放頭位置 */
export function setCaptionEdge(edge: 'start' | 'end') {
  const { data, time, commit, select } = useEditor.getState();
  if (isLocked(data, 'caption')) return void ensureUnlocked('caption');
  const c = currentCaption(edge);
  if (!c) return notify('播放頭附近沒有字幕', 'info');
  const t = Math.round(time * 1000) / 1000;
  if (edge === 'start' && t > c.end - 0.1) return notify('開始時間要比結束早至少 0.1 秒', 'error');
  if (edge === 'end' && t < c.start + 0.1) return notify('結束時間要比開始晚至少 0.1 秒', 'error');
  commit((d) => ({ ...d, captions: d.captions.map((x) => (x.id === c.id ? { ...x, [edge]: t } : x)) }));
  select({ type: 'caption', id: c.id });
}

function Key({ k }: { k: string }) {
  return <kbd className="inline-grid min-w-6 place-items-center rounded-md border border-line bg-sunken px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink">{k}</kbd>;
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} width="max-w-lg">
      <h2 className="text-xl font-extrabold">快捷鍵</h2>
      <p className="mt-1 text-sm text-ink-soft">在文字輸入框以外的地方使用；隨時按 ? 打開這份說明。</p>
      <div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {SHORTCUTS.map((g) => (
          <section key={g.group}>
            <h3 className="text-xs font-bold text-ink-mute">{g.group}</h3>
            <ul className="mt-1.5 divide-y divide-line">
              {g.items.map(([keys, label], i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span>{label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {keys.map((k, j) => (
                      <Key key={j} k={k} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
