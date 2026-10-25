import type { ReactNode } from 'react';
import { Link, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, LogOut, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { Logo } from '../../components/ui';

/** 只有管理者能進入；一般會員導回自己的專案頁 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center text-ink-mute">載入中…</div>;
  if (!user) return <Navigate to="/login?next=/admin" replace />;
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export function AdminLayout({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${isActive ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-sunken hover:text-ink'}`;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo to="/admin" />
          <span className="flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-xs font-bold text-ink-soft">
            <ShieldCheck className="size-3.5" /> 管理後台
          </span>
          <nav className="ml-2 hidden gap-1 sm:flex">
            <NavLink to="/admin" end className={tab}>
              <BarChart3 className="size-4" /> 總覽
            </NavLink>
            <NavLink to="/admin/members" className={tab}>
              <Users className="size-4" /> 會員管理
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Link to="/dashboard" className="hidden items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-sunken hover:text-ink md:flex">
              <ArrowLeft className="size-4" /> 回到網站
            </Link>
            <span className="hidden text-xs text-ink-mute lg:inline">{user?.email}</span>
            <button
              onClick={async () => {
                await logout();
                navigate('/');
              }}
              className="grid size-9 place-items-center rounded-xl text-ink-soft hover:bg-red-50 hover:text-red-600"
              aria-label="登出"
              title="登出"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 border-t border-line px-4 py-2 sm:hidden">
          <NavLink to="/admin" end className={tab}>
            <BarChart3 className="size-4" /> 總覽
          </NavLink>
          <NavLink to="/admin/members" className={tab}>
            <Users className="size-4" /> 會員管理
          </NavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
