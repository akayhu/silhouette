import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ChevronDown, Crown, LayoutGrid, LogOut, Menu, Settings, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { isPaidPro, isTrial, trialDaysLeft } from '../lib/plan';
import { Logo, buttonClass } from './ui';
import { mkButton, PrintedLogo } from './marketing';

/** 雜誌刊頭：刊名、期別、目錄式導覽（附頁碼） */
export function SiteHeader() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const links = [
    { href: '/#editor-note', label: '本機剪輯', page: 'p.02' },
    { href: '/#templates', label: '智能剪輯', page: 'p.04' },
    { href: '/#features', label: '功能索引', page: 'p.06' },
    { href: '/pricing', label: '方案', page: 'p.12' },
    { href: '/#faq', label: '問與答', page: 'p.14' },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-mag-ink/15 bg-mag-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between gap-6 px-4 sm:px-8">
        <div className="flex items-baseline gap-4">
          <PrintedLogo />
          <span className="hidden font-ming text-[13px] tracking-[0.14em] text-mag-soft xl:inline">ISSUE 01・剪一支短影音的一天</span>
        </div>
        <nav className="hidden items-baseline gap-6 lg:flex" aria-label="主要">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="group flex items-baseline gap-1.5 text-[15px] font-bold text-mag-soft transition-colors hover:text-mag-ink">
              <span className="num text-[12px] font-medium text-mag-mute group-hover:text-mag-blue">{l.page}</span>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-5 lg:flex">
          {user ? (
            <Link to="/dashboard" className={mkButton('ink')}>
              進入我的專案
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-[15px] font-bold text-mag-soft hover:text-mag-ink">
                登入
              </Link>
              <Link to="/register" className={mkButton('ink')}>
                免費開始剪輯
              </Link>
            </>
          )}
        </div>
        <button className="grid size-10 place-items-center text-mag-ink lg:hidden" onClick={() => setOpen(!open)} aria-label={open ? '關閉選單' : '開啟選單'} aria-expanded={open}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-mag-ink/15 bg-mag-white px-4 pt-2 pb-4 lg:hidden">
          <div className="pt-2 pb-1 font-ming text-[13px] tracking-[0.14em] text-mag-mute">本期目錄</div>
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex items-baseline justify-between border-b border-mag-ink/10 py-3 font-bold text-mag-ink">
              {l.label}
              <span className="num text-[13px] font-medium text-mag-mute">{l.page}</span>
            </a>
          ))}
          {!user && (
            <Link to="/login" className="flex py-3 font-bold text-mag-soft">
              登入
            </Link>
          )}
          <Link to={user ? '/dashboard' : '/register'} className={mkButton('ink', 'md', 'mt-2 w-full')}>
            {user ? '進入我的專案' : '免費開始剪輯'}
          </Link>
        </div>
      )}
    </header>
  );
}

const FOOTER_COLS = [
  { title: '產品', items: [['功能索引', '/#features'], ['價格方案', '/pricing'], ['開始剪輯', '/register']] },
  { title: '支援', items: [['問與答', '/#faq'], ['帳戶設定', '/account']] },
  { title: '公司', items: [['關於我們', '/'], ['服務條款', '/'], ['隱私權政策', '/']] },
];

/** 版權頁：雜誌最後的出版資訊 */
export function SiteFooter() {
  return (
    <footer className="border-t border-mag-ink/15 bg-mag-white text-mag-ink">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 pt-14 pb-10 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <PrintedLogo />
          <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-mag-soft">在瀏覽器裡完成剪輯、上字幕、配音。影片留在你的電腦，不用安裝軟體，打開就能剪。</p>
        </div>
        {FOOTER_COLS.map((col) => (
          <div key={col.title}>
            <div className="font-ming text-[15px] font-black">{col.title}</div>
            <ul className="mt-3 space-y-2.5 text-[15px] text-mag-soft">
              {col.items.map(([label, href]) => (
                <li key={label}>
                  <a href={href} className="underline-offset-4 hover:text-mag-ink hover:underline">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-[1240px] flex-col gap-2 border-t border-mag-ink/15 px-4 py-6 text-[13px] text-mag-soft sm:flex-row sm:justify-between sm:px-8">
        <span>
          <span className="num">© {new Date().getFullYear()}</span> 片刻剪趣　創刊號
        </span>
        <span>
          本期示範照片：Roméo A.、Robson Hatsukami Morgan、Brandon Lee／
          <a href="https://unsplash.com" className="underline underline-offset-2 hover:text-mag-ink" rel="noopener">
            Unsplash
          </a>
        </span>
      </div>
    </footer>
  );
}

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mk flex min-h-screen flex-col">
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
            {user.role === 'admin' && (
              <NavLink to="/admin" className={tab}>
                <ShieldCheck className="size-4" /> 管理後台
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {!isPaidPro(user) && (
              <Link to="/checkout" className={buttonClass('coral', 'sm')}>
                <Crown className="size-3.5" /> {isTrial(user) ? `試用剩 ${trialDaysLeft(user)} 天・升級` : '升級專業版'}
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
