import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ChevronDown, Crown, LayoutGrid, LogOut, Menu, Settings, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Logo, buttonClass } from './ui';

export function SiteHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const links = [
    { href: '/#features', label: '功能' },
    { href: '/pricing', label: '價格' },
    { href: '/#faq', label: '常見問題' },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft transition hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <Link to="/dashboard" className={buttonClass('primary')}>
              進入我的專案
            </Link>
          ) : (
            <>
              <Link to="/login" className={buttonClass('ghost')}>
                登入
              </Link>
              <Link to="/register" className={buttonClass('primary')}>
                免費開始剪輯
              </Link>
            </>
          )}
        </div>
        <button className="rounded-lg p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="選單">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-line bg-canvas px-4 py-3 md:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2.5 font-semibold text-ink-soft">
              {l.label}
            </a>
          ))}
          <Link to={user ? '/dashboard' : '/register'} className={buttonClass('primary', 'md', 'mt-2 w-full')}>
            {user ? '進入我的專案' : '免費開始剪輯'}
          </Link>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-sunken/50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">在瀏覽器裡完成剪輯、上字幕、配音。不用安裝軟體，打開就能剪。</p>
        </div>
        {[
          { title: '產品', items: [['功能介紹', '/#features'], ['價格方案', '/pricing'], ['開始剪輯', '/register']] },
          { title: '支援', items: [['常見問題', '/#faq'], ['帳戶設定', '/account']] },
          { title: '公司', items: [['關於我們', '/'], ['服務條款', '/'], ['隱私權政策', '/']] },
        ].map((col) => (
          <div key={col.title}>
            <div className="text-sm font-bold">{col.title}</div>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              {col.items.map(([label, href]) => (
                <li key={label}>
                  <a href={href} className="hover:text-ink">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-ink-mute">© {new Date().getFullYear()} 剪影 Studio. All rights reserved.</div>
    </footer>
  );
}

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  if (!user) return null;
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${isActive ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-sunken hover:text-ink'}`;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo to="/dashboard" />
          <nav className="ml-4 hidden gap-1 sm:flex">
            <NavLink to="/dashboard" className={tab}>
              <LayoutGrid className="size-4" /> 我的專案
            </NavLink>
            <NavLink to="/account" className={tab}>
              <Settings className="size-4" /> 帳戶
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user.plan === 'free' && (
              <Link to="/checkout" className={buttonClass('coral', 'sm')}>
                <Crown className="size-3.5" /> 升級專業版
              </Link>
            )}
            <div className="relative">
              <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-xl py-1 pr-2 pl-1 hover:bg-sunken">
                <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">{user.name.slice(0, 1)}</span>
                <ChevronDown className="size-4 text-ink-mute" />
              </button>
              {menu && (
                <div className="absolute right-0 mt-2 w-56 animate-fade-up rounded-2xl border border-line bg-surface p-1.5 shadow-pop" onMouseLeave={() => setMenu(false)}>
                  <div className="px-3 py-2">
                    <div className="truncate text-sm font-bold">{user.name}</div>
                    <div className="truncate text-xs text-ink-mute">{user.email}</div>
                  </div>
                  <Link to="/account" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-sunken">
                    <Settings className="size-4" /> 帳戶設定
                  </Link>
                  <button
                    onClick={async () => {
                      await logout();
                      navigate('/');
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="size-4" /> 登出
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
