import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * 後台圖表（純 SVG）：細長柱、頂端 4px 圓角、單一 y 軸、淡灰格線，
 * 每根柱子／每個時間點都有 hover 提示。文字一律用文字色，不用資料色。
 */

export const CHART = {
  paid: '#5b4cf5',
  trial: '#19b38a',
  free: '#ff7a59',
  grid: '#ece9e2',
  axis: '#918d9e',
  ink: '#1f1d2b',
  surface: '#ffffff',
};

export const money = (v: number) => `NT$${Math.round(v).toLocaleString('zh-TW')}`;
const compact = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(v % 1000 ? 1 : 0)}K` : String(Math.round(v)));
const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
export const longDate = (d: string) => `${Number(d.slice(5, 7))} 月 ${Number(d.slice(8, 10))} 日`;

/** 刻度取整：1、2、2.5、5 × 10ⁿ，約 4 格 */
function niceTicks(max: number) {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  // 靠右側時改往左顯示，避免超出圖表
  const left = x > width - 170 ? x - 170 : x + 12;
  return (
    <div className="pointer-events-none absolute z-10 w-[158px] rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop" style={{ left, top: Math.max(0, y - 10) }}>
      {children}
    </div>
  );
}

const M = { top: 22, right: 16, bottom: 26, left: 52 };

export function BarChart({
  data,
  color,
  height = 220,
  format,
  tooltip,
  label,
}: {
  data: { key: string; value: number }[];
  color: string;
  height?: number;
  format: (v: number) => string;
  tooltip: (i: number) => ReactNode;
  label: string;
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const iw = Math.max(10, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const slot = iw / Math.max(1, data.length);
  const bw = Math.max(2, Math.min(24, slot - 2));
  const y = (v: number) => M.top + ih - (v / top) * ih;
  const every = Math.ceil(data.length / Math.max(2, Math.floor(iw / 56)));
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={CHART.grid} strokeWidth={1} />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={CHART.axis}>
              {compact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = M.left + slot * i + slot / 2;
          const h = Math.max(0, y(0) - y(d.value));
          const r = Math.min(4, h, bw / 2);
          const x0 = cx - bw / 2;
          const yTop = y(0) - h;
          return (
            <g key={d.key}>
              {h > 0 && (
                <path
                  d={`M${x0},${y(0)} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + bw - r} Q${x0 + bw},${yTop} ${x0 + bw},${yTop + r} V${y(0)} Z`}
                  fill={color}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {i % every === 0 && (
                <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill={CHART.axis}>
                  {shortDate(d.key)}
                </text>
              )}
              {/* 比柱子大的感應區 */}
              <rect x={M.left + slot * i} y={M.top} width={slot} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          );
        })}
        {max > 0 && (
          <text x={M.left + slot * peak + slot / 2} y={y(data[peak].value) - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={CHART.ink}>
            {format(data[peak].value)}
          </text>
        )}
        <line x1={M.left} x2={width - M.right} y1={y(0)} y2={y(0)} stroke={CHART.axis} strokeWidth={1} opacity={0.5} />
      </svg>
      {hover !== null && (
        <Tooltip x={M.left + slot * hover + slot / 2} y={y(data[hover].value)} width={width}>
          {tooltip(hover)}
        </Tooltip>
      )}
    </div>
  );
}

export function LineChart({
  data,
  color,
  height = 220,
  format,
  tooltip,
  label,
}: {
  data: { key: string; value: number }[];
  color: string;
  height?: number;
  format: (v: number) => string;
  tooltip: (i: number) => ReactNode;
  label: string;
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const right = M.right + 64; // 留位置給最後一點的數值標籤
  const iw = Math.max(10, width - M.left - right);
  const ih = height - M.top - M.bottom;
  const x = (i: number) => M.left + (data.length > 1 ? (iw * i) / (data.length - 1) : iw / 2);
  const y = (v: number) => M.top + ih - (v / top) * ih;
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`);
  const every = Math.ceil(data.length / Math.max(2, Math.floor(iw / 56)));
  const last = data.length - 1;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * last);
    setHover(Math.max(0, Math.min(last, i)));
  };

  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - right} y1={y(t)} y2={y(t)} stroke={CHART.grid} strokeWidth={1} />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={CHART.axis}>
              {compact(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % every === 0 ? (
            <text key={d.key} x={x(i)} y={height - 8} textAnchor="middle" fontSize={11} fill={CHART.axis}>
              {shortDate(d.key)}
            </text>
          ) : null,
        )}
        {data.length > 0 && (
          <>
            <polygon points={`${x(0)},${y(0)} ${pts.join(' ')} ${x(last)},${y(0)}`} fill={color} opacity={0.1} />
            <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(last)} cy={y(data[last].value)} r={4} fill={color} stroke={CHART.surface} strokeWidth={2} />
            <text x={x(last) + 10} y={y(data[last].value)} dy="0.32em" fontSize={12} fontWeight={700} fill={CHART.ink}>
              {format(data[last].value)}
            </text>
          </>
        )}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={y(0)} stroke={CHART.axis} strokeWidth={1} opacity={0.6} />
            <circle cx={x(hover)} cy={y(data[hover].value)} r={5} fill={color} stroke={CHART.surface} strokeWidth={2} />
          </g>
        )}
        <rect x={M.left} y={M.top} width={iw} height={ih} fill="transparent" onMouseMove={onMove} />
      </svg>
      {hover !== null && (
        <Tooltip x={x(hover)} y={y(data[hover].value)} width={width}>
          {tooltip(hover)}
        </Tooltip>
      )}
    </div>
  );
}

/** 付費／免費比例：一條 100% 堆疊橫條，兩段之間留 2px 間隙，旁邊的圖例寫出人數與百分比 */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-4 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${p.value} 人`).join('、')}>
        {parts.map((p) =>
          p.value > 0 ? <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label} ${p.value} 人`} /> : null,
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: p.color }} />
            <span className="text-ink-soft">{p.label}</span>
            <b className="text-ink tabular-nums">{p.value.toLocaleString('zh-TW')} 人</b>
            <span className="text-ink-mute tabular-nums">{Math.round((p.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
