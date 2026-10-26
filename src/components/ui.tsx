import { createContext, useCallback, useContext, useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Crown, X } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'coral' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover shadow-[0_6px_16px_-8px_rgb(91_76_245/0.8)]',
  secondary: 'bg-surface text-ink border border-line hover:border-ink-mute/50 hover:bg-sunken/60',
  ghost: 'text-ink-soft hover:text-ink hover:bg-sunken',
  coral: 'bg-coral text-white hover:brightness-95 shadow-[0_6px_16px_-8px_rgb(255_122_89/0.9)]',
  danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-2xl',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `inline-flex items-center justify-center font-semibold whitespace-nowrap transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({ variant, size, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button {...rest} className={buttonClass(variant, size, className)} />;
}

export function Logo({ to = '/', compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-extrabold tracking-tight text-ink">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--color-brand)" />
        <path d="M12 9.5v13l11-6.5z" fill="#fff" />
        <circle cx="24" cy="8" r="3" fill="var(--color-coral)" />
      </svg>
      {!compact && (
        <span className="text-[17px]">
          片刻<span className="text-brand">剪趣</span>
        </span>
      )}
    </Link>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-mute">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full h-11 rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-mute/70 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/10';

export function Modal({ open, onClose, children, width = 'max-w-md' }: { open: boolean; onClose: () => void; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/25 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        className={`relative max-h-[calc(100dvh-2rem)] w-full ${width} animate-fade-up overflow-y-auto rounded-3xl bg-surface p-6 shadow-pop`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 rounded-lg p-1.5 text-ink-mute hover:bg-sunken hover:text-ink" aria-label="關閉">
          <X className="size-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function ProBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-coral-soft px-2 py-0.5 text-[11px] font-bold text-coral ${className}`}>
      <Crown className="size-3" /> 專業版
    </span>
  );
}

// ---------- 升級提示 ----------
const UpgradeContext = createContext<(reason?: string) => void>(() => {});
export const useUpgrade = () => useContext(UpgradeContext);

export function UpgradeProvider({ children }: { children: ReactNode }) {
  const [reason, setReason] = useState<string | null>(null);
  const navigate = useNavigate();
  const open = useCallback((r?: string) => setReason(r ?? '這個功能需要專業版'), []);
  return (
    <UpgradeContext.Provider value={open}>
      {children}
      <Modal open={reason !== null} onClose={() => setReason(null)}>
        <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-coral-soft text-coral">
          <Crown className="size-6" />
        </div>
        <h2 className="text-xl font-extrabold">升級專業版，解鎖全部功能</h2>
        <p className="mt-1.5 text-sm text-ink-soft">{reason}</p>
        <ul className="mt-5 space-y-2 text-sm text-ink">
          {['AI 自動字幕、智能口播、文字朗讀不限次數', '匯出 1080p 高畫質，無浮水印', '不限專案數量'].map((t) => (
            <li key={t} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-coral" />
              {t}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setReason(null)}>
            稍後再說
          </Button>
          <Button
            variant="coral"
            className="flex-1"
            onClick={() => {
              setReason(null);
              navigate('/checkout');
            }}
          >
            NT$399／月 立即升級
          </Button>
        </div>
      </Modal>
    </UpgradeContext.Provider>
  );
}

// ---------- 提示訊息 ----------
type Toast = { id: number; text: string; tone: 'info' | 'error' | 'success' };
const ToastContext = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});
export const useToast = () => useContext(ToastContext);

/** 不在元件裡（例如工具函式）也能顯示提示訊息 */
let globalToast: ((text: string, tone?: Toast['tone']) => void) | null = null;
export const notify = (text: string, tone?: Toast['tone']) => globalToast?.(text, tone);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);
  useEffect(() => {
    globalToast = push;
    return () => {
      globalToast = null;
    };
  }, [push]);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-fade-up rounded-2xl px-4 py-2.5 text-sm font-semibold shadow-pop ${
              t.tone === 'error' ? 'bg-red-600 text-white' : t.tone === 'success' ? 'bg-mint text-white' : 'bg-ink text-white'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
