import { useEffect, useRef, useState, type ComponentType } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type ToolTab<T extends string> = { id: T; label: string; icon: ComponentType<{ className?: string }> };

/**
 * 素材區上方的工具列：預設是一排可以左右捲動的圖示；也可以切換成 rail 模式，
 * 改成最左邊一條固定的直式圖示欄（跟剪映那類軟體一樣），旁邊的工具內容可以整個收合，
 * 適合預覽畫面要留大一點的時候。rail 用另一個元件 ToolRail，在左邊單獨佔一欄。
 */
export function ToolTabs<T extends string>({ tabs, value, onChange }: { tabs: readonly ToolTab<T>[]; value: T; onChange: (id: T) => void }) {
  return <FullToolTabs tabs={tabs} value={value} onChange={onChange} />;
}

/** 直式圖示欄：固定在最左邊，點圖示切換工具；上方有收合整個工具內容區的按鈕 */
export function ToolRail<T extends string>({
  tabs,
  value,
  onChange,
  expanded,
  onToggleExpanded,
}: {
  tabs: readonly ToolTab<T>[];
  value: T;
  onChange: (id: T) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  return (
    <nav className="flex w-16 shrink-0 flex-col border-r border-line bg-surface" aria-label="編輯工具">
      <button
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        title={expanded ? '收合工具面板' : '展開工具面板'}
        className="flex h-9 shrink-0 items-center justify-center border-b border-line text-ink-soft hover:bg-sunken hover:text-ink"
      >
        {expanded ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto py-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={value === t.id}
            onClick={() => {
              onChange(t.id);
              if (!expanded) onToggleExpanded();
            }}
            className={`flex w-full flex-col items-center gap-1 px-1 py-2.5 text-center text-[10px] leading-tight font-bold whitespace-nowrap transition ${
              value === t.id && expanded ? 'bg-brand-soft/60 text-brand' : 'text-ink-soft hover:bg-sunken hover:text-ink'
            }`}
          >
            <t.icon className="size-5" />
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

/** 原本的樣式：工具多的時候可以左右捲動。底部有細捲軸，滑鼠滾輪也能橫向捲動，兩側有箭頭按鈕；切到的工具會自動捲進畫面。 */
function FullToolTabs<T extends string>({ tabs, value, onChange }: { tabs: readonly ToolTab<T>[]; value: T; onChange: (id: T) => void }) {
  const nav = useRef<HTMLElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  useEffect(() => {
    const el = nav.current;
    if (!el) return;
    const update = () => setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    // 直向滾輪轉成橫向捲動（觸控板本來就能橫向滑）
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      el.removeEventListener('wheel', onWheel);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    nav.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [value]);

  const page = (dir: -1 | 1) => {
    const el = nav.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' });
  };

  return (
    <div className="relative shrink-0 border-b border-line">
      <nav ref={nav} className="scroll-x-thin flex overflow-x-auto px-1" role="tablist" aria-label="編輯工具">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
            className={`relative flex w-[60px] shrink-0 flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-bold whitespace-nowrap transition ${value === t.id ? 'text-brand' : 'text-ink-soft hover:text-ink'}`}
          >
            <t.icon className="size-5" />
            {t.label}
            {value === t.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </nav>
      {edge.left && (
        <button
          onClick={() => page(-1)}
          className="absolute inset-y-0 left-0 flex w-9 items-center justify-start bg-gradient-to-r from-surface via-surface/90 to-transparent pl-1 text-ink-soft hover:text-brand"
          aria-label="工具列往左捲"
        >
          <ChevronLeft className="size-4" />
        </button>
      )}
      {edge.right && (
        <button
          onClick={() => page(1)}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-end bg-gradient-to-l from-surface via-surface/90 to-transparent pr-1 text-ink-soft hover:text-brand"
          aria-label="工具列往右捲"
        >
          <ChevronRight className="size-4" />
        </button>
      )}
    </div>
  );
}
