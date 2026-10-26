import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Pipette, Plus } from 'lucide-react';

/**
 * 顏色選擇器：飽和度／明度方塊、色相條、滴管、Hex 或 RGB 色碼、透明度、我的顏色與常用色。
 * 輸出 #rrggbb；透明度不是 100% 時輸出 #rrggbbaa（畫布直接支援）。
 */

type HSVA = { h: number; s: number; v: number; a: number };

const PALETTE = [
  '#ffffff', '#f2f2f2', '#c8ccd0', '#8a9097', '#474a52', '#18191d',
  '#ffe14a', '#fff59a', '#ffd9c6', '#f4a9a0', '#ee6b5f', '#d42c22',
  '#ff9f43', '#f97316', '#a0522d', '#fdf3c7', '#f5c542', '#e8a33d',
  '#7cf0c4', '#19b38a', '#0f766e', '#bfe3ff', '#5aa9ff', '#1d4ed8',
  '#e0d7ff', '#a9a2ff', '#7c5cff', '#ffd1e3', '#ff6fa8', '#ff2bd6',
];
const MINE_KEY = 'pianke.myColors';

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function parse(input: string): HSVA | null {
  let r: number, g: number, b: number, a = 1;
  const s = input.trim().toLowerCase();
  const hex = /^#?([0-9a-f]{3,8})$/.exec(s);
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
  } else if (rgb) {
    [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (rgb[4]) a = rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : Number(rgb[4]);
  } else return null;
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: ((h * 60) + 360) % 360, s: max ? d / max : 0, v: max, a: clamp(a) };
}

function toRgb({ h, s, v }: HSVA) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return [f(5), f(3), f(1)] as const;
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0');
function toHex(c: HSVA, withAlpha = true) {
  const [r, g, b] = toRgb(c);
  const base = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  return withAlpha && c.a < 0.999 ? base + hex2(Math.round(c.a * 255)) : base;
}

function useMine() {
  const [mine, setMine] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(MINE_KEY) ?? '[]');
    } catch {
      return [];
    }
  });
  const save = (list: string[]) => {
    setMine(list);
    try {
      localStorage.setItem(MINE_KEY, JSON.stringify(list));
    } catch {
      /* 無法儲存就只在這次有效 */
    }
  };
  return [mine, save] as const;
}

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

export function ColorPicker({
  value,
  onChange,
  onStart,
  alpha = true,
  label,
}: {
  value: string;
  /** final 為 true 是一次性的選擇（寫入復原紀錄）；拖曳中為 false，復原點由 onStart 先存好 */
  onChange: (color: string, final: boolean) => void;
  /** 開始拖曳前呼叫，讓整段拖曳只算一次復原 */
  onStart?: () => void;
  alpha?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const parsed = parse(value);
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={`自訂${label}`}
        aria-expanded={open}
        className="relative grid size-7 place-items-center overflow-hidden rounded-lg border border-line bg-[conic-gradient(#ccc_25%,#fff_0_50%,#ccc_0_75%,#fff_0)] bg-[length:8px_8px]"
        title="更多顏色"
      >
        <span className="absolute inset-0" style={{ background: parsed ? value : 'transparent' }} />
        <Plus className="relative size-3.5 text-white [filter:drop-shadow(0_0_1px_rgb(0_0_0/0.8))]" strokeWidth={3} />
      </button>
      {open && <Popover anchor={btn} value={value} onChange={onChange} onStart={onStart} alpha={alpha} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

function Popover({
  anchor,
  value,
  onChange,
  onStart,
  alpha,
  label,
  onClose,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  value: string;
  onChange: (color: string, final: boolean) => void;
  onStart?: () => void;
  alpha: boolean;
  label: string;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [c, setC] = useState<HSVA>(() => parse(value) ?? { h: 0, s: 0, v: 1, a: 1 });
  const [mode, setMode] = useState<'hex' | 'rgb'>('hex');
  const [hexText, setHexText] = useState(toHex(c, false).slice(1).toUpperCase());
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [mine, setMine] = useMine();
  const Dropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;

  // 外部改了顏色（例如點色塊）時同步
  useEffect(() => {
    const p = parse(value);
    if (p && toHex(p) !== toHex(c)) {
      setC((old) => ({ ...p, h: p.s === 0 ? old.h : p.h }));
      setHexText(toHex(p, false).slice(1).toUpperCase());
    }
  }, [value]);

  // 放在按鈕下方，超出畫面就往上／往左移
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    const el = box.current;
    if (!a || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = a.left;
    let top = a.bottom + 8;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, a.top - h - 8);
    setPos({ left: Math.max(8, left), top });
  }, [anchor]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [anchor, onClose]);

  const emit = (next: HSVA, final: boolean) => {
    setC(next);
    setHexText(toHex(next, false).slice(1).toUpperCase());
    onChange(toHex(next, alpha), final);
  };

  const drag = (e: RPointerEvent<HTMLDivElement>, apply: (x: number, y: number) => HSVA) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const at = (ev: { clientX: number; clientY: number }) => apply(clamp((ev.clientX - rect.left) / rect.width), clamp((ev.clientY - rect.top) / rect.height));
    onStart?.();
    let last = at(e);
    emit(last, false);
    const move = (ev: PointerEvent) => {
      last = at(ev);
      emit(last, false);
    };
    // 拖曳開始時已經存了復原點，結束不用再寫一次
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const pickSwatch = (hex: string) => {
    const p = parse(hex);
    if (p) emit({ ...p, a: c.a, h: p.s === 0 ? c.h : p.h }, true);
  };
  const commitHex = () => {
    const p = parse('#' + hexText);
    if (p) emit({ ...p, a: c.a, h: p.s === 0 ? c.h : p.h }, true);
    else setHexText(toHex(c, false).slice(1).toUpperCase());
  };
  const [r, g, b] = toRgb(c);
  const setRgb = (i: number, v: number) => {
    const rgb = [r, g, b];
    rgb[i] = Math.round(clamp(v || 0, 0, 255));
    const p = parse(`rgb(${rgb.join(',')})`);
    if (p) emit({ ...p, a: c.a, h: p.s === 0 ? c.h : p.h }, true);
  };
  const dropper = async () => {
    if (!Dropper) return;
    try {
      const res = await new Dropper().open();
      pickSwatch(res.sRGBHex);
    } catch {
      /* 使用者取消 */
    }
  };
  const current = toHex(c, false);
  const hueColor = toHex({ h: c.h, s: 1, v: 1, a: 1 }, false);
  const input = 'h-8 min-w-0 rounded-lg border border-line bg-surface px-2 text-[13px] font-mono uppercase outline-none focus:border-brand';

  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label={`選擇${label}`}
      className="fixed z-[60] w-[264px] rounded-2xl border border-line bg-surface p-3 shadow-pop"
      style={pos}
    >
      {/* 飽和度／明度 */}
      <div
        className="relative h-40 cursor-crosshair touch-none rounded-lg"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})` }}
        onPointerDown={(e) => drag(e, (x, y) => ({ ...c, s: x, v: 1 - y }))}
      >
        <span
          className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.3)]"
          style={{ left: `${c.s * 100}%`, top: `${(1 - c.v) * 100}%`, background: current }}
        />
      </div>

      {/* 滴管＋色相 */}
      <div className="mt-3 flex items-center gap-2">
        {Dropper && (
          <button type="button" onClick={dropper} className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-ink-soft hover:text-ink" aria-label="用滴管從畫面取色" title="滴管">
            <Pipette className="size-4" />
          </button>
        )}
        <div
          className="relative h-4 flex-1 cursor-pointer touch-none rounded-full"
          style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
          onPointerDown={(e) => drag(e, (x) => ({ ...c, h: x * 359.9 }))}
          role="slider"
          aria-label="色相"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(c.h)}
        >
          <span
            className="pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.3)]"
            style={{ left: `${(c.h / 360) * 100}%`, background: hueColor }}
          />
        </div>
      </div>

      {/* 色碼與透明度 */}
      <div className="mt-3 flex items-center gap-1.5">
        <label className="relative">
          <span className="sr-only">色碼格式</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as 'hex' | 'rgb')} className="h-8 appearance-none rounded-lg border border-line bg-surface pr-6 pl-2 text-[12px] font-bold outline-none">
            <option value="hex">Hex</option>
            <option value="rgb">RGB</option>
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-1.5 size-3.5 -translate-y-1/2 text-ink-mute" />
        </label>
        {mode === 'hex' ? (
          <input
            className={`${input} flex-1`}
            value={hexText}
            maxLength={6}
            onChange={(e) => setHexText(e.target.value.replace(/[^0-9a-f]/gi, ''))}
            onBlur={commitHex}
            onKeyDown={(e) => e.key === 'Enter' && commitHex()}
            aria-label="Hex 色碼"
          />
        ) : (
          [r, g, b].map((v, i) => (
            <input
              key={i}
              className={`${input} w-0 flex-1 text-center`}
              type="number"
              min={0}
              max={255}
              value={v}
              onChange={(e) => setRgb(i, Number(e.target.value))}
              aria-label={['紅', '綠', '藍'][i]}
            />
          ))
        )}
        {alpha && (
          <label className="flex h-8 w-[64px] shrink-0 items-center rounded-lg border border-line bg-surface pr-1.5 focus-within:border-brand">
            <input
              className="w-0 min-w-0 flex-1 bg-transparent text-right font-mono text-[13px] outline-none"
              type="number"
              min={0}
              max={100}
              value={Math.round(c.a * 100)}
              onChange={(e) => emit({ ...c, a: clamp((Number(e.target.value) || 0) / 100) }, true)}
              aria-label="不透明度"
            />
            <span className="text-[12px] text-ink-mute">%</span>
          </label>
        )}
      </div>

      {/* 我的顏色 */}
      <div className="mt-3 border-t border-line pt-3">
        <div className="mb-2 flex items-center justify-between text-[12px] font-bold text-ink-soft">
          我的顏色
          {mine.length > 0 && (
            <button type="button" onClick={() => setMine([])} className="font-semibold text-ink-mute hover:text-ink">
              清除
            </button>
          )}
        </div>
        <div className="grid grid-cols-8 gap-1.5">
          <button
            type="button"
            onClick={() => setMine([current, ...mine.filter((m) => m !== current)].slice(0, 23))}
            className="grid aspect-square place-items-center rounded-md border border-dashed border-ink-mute/60 text-ink-soft hover:border-ink hover:text-ink"
            aria-label="把目前顏色加到我的顏色"
            title="加入我的顏色"
          >
            <Plus className="size-3.5" />
          </button>
          {mine.map((m) => (
            <Chip key={m} color={m} active={m === current} onClick={() => pickSwatch(m)} />
          ))}
        </div>
        <div className="mt-3 mb-2 text-[12px] font-bold text-ink-soft">常用色</div>
        <div className="grid grid-cols-8 gap-1.5">
          {PALETTE.map((m) => (
            <Chip key={m} color={m} active={m === current} onClick={() => pickSwatch(m)} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Chip({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={color}
      title={color.toUpperCase()}
      className={`aspect-square rounded-md border transition ${active ? 'border-brand ring-2 ring-brand/40' : 'border-ink/10 hover:scale-110'}`}
      style={{ background: color }}
    />
  );
}
