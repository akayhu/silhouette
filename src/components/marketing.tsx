import { Link } from 'react-router-dom';

/** 行銷頁的按鈕：品牌紅膠囊（主要行動）、白底描框、紅色帶上的白底 */
export function mkButton(variant: 'red' | 'outline' | 'white' = 'red', size: 'md' | 'lg' = 'md', extra = '') {
  const v = {
    red: 'bg-site-red text-white shadow-[0_8px_20px_-8px_rgb(212_44_34/0.6)] hover:bg-site-red-deep',
    outline: 'border border-site-line bg-white text-site-ink hover:border-site-ink',
    white: 'bg-white text-site-red-deep hover:bg-site-red-soft',
  }[variant];
  const s = size === 'lg' ? 'h-14 px-8 text-[17px]' : 'h-11 px-5 text-[15px]';
  return `inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-colors active:translate-y-px ${v} ${s} ${extra}`;
}

/** 網站 logo：墨黑方塊、白色播放鍵、品牌紅點 */
export function PrintedLogo({ to = '/', className = '' }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={`flex items-center gap-2 text-site-ink ${className}`} aria-label="片刻剪趣 首頁">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill="currentColor" />
        <path d="M12 9.5v13l11-6.5z" fill="#fff" />
        <circle cx="24" cy="8" r="3.2" fill="var(--color-site-red)" />
      </svg>
      <span className="text-[19px] font-black tracking-[0.02em]">片刻剪趣</span>
    </Link>
  );
}

/** 區塊標題：置中大標＋說明 */
export function SectionTitle({ title, sub, className = '' }: { title: React.ReactNode; sub?: string; className?: string }) {
  return (
    <div className={`mx-auto mb-12 max-w-3xl text-center ${className}`}>
      <h2 className="text-[clamp(30px,3.6vw,48px)] leading-[1.2] font-black tracking-[-0.01em] text-balance">{title}</h2>
      {sub && <p className="mx-auto mt-4 max-w-[38em] text-[17px] leading-relaxed text-site-soft">{sub}</p>}
    </div>
  );
}
