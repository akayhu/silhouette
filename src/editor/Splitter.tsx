import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';

/** 編輯器各區塊的大小（px），使用者拖曳分隔線調整，記在這台瀏覽器 */
export interface EditorLayout {
  tools: number;
  preview: number;
  timeline: number;
  /** side：預覽在右側從上到下；top：預覽在上方，時間軸橫跨整個寬度 */
  mode: 'side' | 'top';
  /** 工具列改用下拉選單挑工具（取代一排圖示），可以收合整個工具面板 */
  compactTools: boolean;
  /** compactTools 開啟時，工具面板內容是否展開；關閉時只留下拉選單那一條 */
  toolsExpanded: boolean;
  /** 編輯器介面主題：淺色（原本）或深色 */
  theme: 'light' | 'dark';
}

const KEY = 'pianke:editor-layout';
export const LAYOUT_DEFAULT = (): EditorLayout => ({
  tools: 360,
  preview: Math.round(Math.min(520, Math.max(320, window.innerWidth * 0.32))),
  timeline: 300,
  mode: 'side',
  compactTools: false,
  toolsExpanded: true,
  theme: 'light',
});

/** 每個區塊的最小／最大；最大值依視窗大小計算，中間的屬性區至少保留 240px，上方至少保留 200px */
export function clampLayout(l: EditorLayout): EditorLayout {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const tools = Math.min(Math.max(l.tools, 280), Math.min(640, w - 300 - 240));
  const preview = Math.min(Math.max(l.preview, 280), Math.max(280, w - tools - 240));
  const timeline = Math.min(Math.max(l.timeline, 180), Math.max(180, h - 56 - 200));
  return {
    tools,
    preview,
    timeline,
    mode: l.mode === 'top' ? 'top' : 'side',
    compactTools: !!l.compactTools,
    toolsExpanded: l.toolsExpanded ?? true,
    theme: l.theme === 'dark' ? 'dark' : 'light',
  };
}

export function useEditorLayout() {
  const [layout, setLayout] = useState<EditorLayout>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<EditorLayout> | null;
      return clampLayout({ ...LAYOUT_DEFAULT(), ...(saved ?? {}) });
    } catch {
      return clampLayout(LAYOUT_DEFAULT());
    }
  });
  // 視窗縮小時，區塊不要超出畫面
  useEffect(() => {
    const onResize = () => setLayout((l) => clampLayout(l));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const update = useCallback((patch: Partial<EditorLayout>) => {
    setLayout((l) => {
      const next = clampLayout({ ...l, ...patch });
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* 存不了就只在這次有效 */
      }
      return next;
    });
  }, []);
  return [layout, update] as const;
}

/**
 * 區塊之間的分隔線：拖曳調整大小，雙擊回到預設，也可以用方向鍵微調。
 * onDrag 收到的是從按下開始累計的位移（px）。
 */
export function Splitter({
  direction,
  label,
  onStart,
  onDrag,
  onReset,
  onKey,
}: {
  direction: 'col' | 'row';
  label: string;
  onStart: () => void;
  onDrag: (delta: number) => void;
  onReset: () => void;
  onKey: (step: number) => void;
}) {
  const start = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const col = direction === 'col';
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = col ? e.clientX : e.clientY;
    setActive(true);
    onStart();
    document.body.style.cursor = col ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    onDrag((col ? e.clientX : e.clientY) - start.current);
  };
  const up = () => {
    start.current = null;
    setActive(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
  return (
    <div
      role="separator"
      aria-orientation={col ? 'vertical' : 'horizontal'}
      aria-label={label}
      tabIndex={0}
      title={`${label}：拖曳調整大小，雙擊恢復預設`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10;
        const keys = col ? { ArrowLeft: -step, ArrowRight: step } : { ArrowUp: -step, ArrowDown: step };
        const d = keys[e.key as keyof typeof keys];
        if (d === undefined) return;
        e.preventDefault();
        e.stopPropagation();
        onKey(d);
      }}
      className={`group relative z-30 shrink-0 outline-none ${col ? 'w-1.5 cursor-col-resize' : 'h-1.5 cursor-row-resize'} ${col ? '-mx-[3px]' : '-my-[3px]'}`}
    >
      <span
        className={`absolute transition-colors ${col ? 'inset-y-0 left-1/2 w-[2px] -translate-x-1/2' : 'inset-x-0 top-1/2 h-[2px] -translate-y-1/2'} ${
          active ? 'bg-brand' : 'bg-transparent group-hover:bg-brand/60 group-focus-visible:bg-brand'
        }`}
      />
    </div>
  );
}
