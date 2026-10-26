import { Link } from 'react-router-dom';

/** 行銷頁的按鈕：發票紅的印章感方塊，或碳黑描框 */
export function mkButton(variant: 'red' | 'ink' | 'paper' = 'red', size: 'md' | 'lg' = 'md', extra = '') {
  const v = {
    red: 'bg-invoice text-white hover:bg-invoice-deep',
    ink: 'border-2 border-receipt text-receipt hover:bg-receipt hover:text-paper',
    paper: 'bg-paper text-invoice-deep hover:bg-white',
  }[variant];
  const s = size === 'lg' ? 'h-14 px-7 text-[17px]' : 'h-11 px-5 text-[15px]';
  return `inline-flex items-center justify-center gap-2 rounded-[6px] font-bold whitespace-nowrap transition-colors active:translate-y-px ${v} ${s} ${extra}`;
}

/** 單據抬頭用的印刷版 logo：熱感應紙只印得出黑色，紅點是發票紅 */
export function PrintedLogo({ to = '/', className = '' }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={`flex items-center gap-2 text-receipt ${className}`} aria-label="片刻剪趣 首頁">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="7" fill="currentColor" />
        <path d="M12 9.5v13l11-6.5z" fill="var(--color-paper)" />
        <circle cx="24" cy="8" r="3.2" fill="var(--color-invoice)" />
      </svg>
      <span className="text-[19px] font-black tracking-[0.02em]">片刻剪趣</span>
    </Link>
  );
}

/** 單據底部的條碼（依文字產生固定的線條，同一段文字永遠長一樣） */
export function Barcode({ value, className = '' }: { value: string; className?: string }) {
  let seed = 0;
  for (const ch of value) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const bars: { x: number; w: number }[] = [];
  let x = 0;
  for (let i = 0; i < 38; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const w = 1 + ((seed >> 8) % 3);
    bars.push({ x, w });
    x += w + 1 + ((seed >> 12) % 2);
  }
  return (
    <svg viewBox={`0 0 ${x} 40`} preserveAspectRatio="none" className={className} aria-hidden>
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={40} fill="currentColor" />
      ))}
    </svg>
  );
}
