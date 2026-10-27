import { Link } from 'react-router-dom';

/** 行銷頁的按鈕：墨黑實心、墨線描框，或封底鈷藍上的白底 */
export function mkButton(variant: 'ink' | 'line' | 'paper' = 'ink', size: 'md' | 'lg' = 'md', extra = '') {
  const v = {
    ink: 'bg-mag-ink text-mag-white hover:bg-mag-blue',
    line: 'border border-mag-ink text-mag-ink hover:bg-mag-ink hover:text-mag-white',
    paper: 'bg-mag-white text-mag-blue-deep hover:bg-white',
  }[variant];
  const s = size === 'lg' ? 'h-14 px-7 text-[17px]' : 'h-11 px-5 text-[15px]';
  return `inline-flex items-center justify-center gap-2 rounded-none font-bold whitespace-nowrap transition-colors active:translate-y-px ${v} ${s} ${extra}`;
}

/** 刊頭 logo：墨黑方塊、白色播放鍵、品牌紅點 */
export function PrintedLogo({ to = '/', className = '' }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={`flex items-center gap-2 text-mag-ink ${className}`} aria-label="片刻剪趣 首頁">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="7" fill="currentColor" />
        <path d="M12 9.5v13l11-6.5z" fill="var(--color-mag-white)" />
        <circle cx="24" cy="8" r="3.2" fill="#d42c22" />
      </svg>
      <span className="font-ming text-[20px] font-black tracking-[0.04em]">片刻剪趣</span>
    </Link>
  );
}

/** 版頭：刊名與頁碼（雜誌每頁上緣那一行），用來分隔每個單元 */
export function RunningHead({ page, title, tone = 'paper' }: { page: string; title: string; tone?: 'paper' | 'blue' }) {
  const color = tone === 'blue' ? 'border-white/35 text-white/85' : 'border-mag-ink/15 text-mag-soft';
  return (
    <div className={`flex items-baseline justify-between border-t pt-3 text-[13px] ${color}`} aria-hidden>
      <span className="font-ming tracking-[0.12em]">片刻剪趣　ISSUE 01</span>
      <span className="font-ming">
        <span className="num">{page}</span>　{title}
      </span>
    </div>
  );
}

/** 封底的條碼（依文字產生固定的線條，同一段文字永遠長一樣） */
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
