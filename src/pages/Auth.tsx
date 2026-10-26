import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Field, Logo, inputClass, useToast } from '../components/ui';

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const { user, setUser } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { user } = mode === 'login' ? await api.login(form) : await api.register(form);
      setUser(user);
      navigate(next, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isLogin = mode === 'login';
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-3xl font-black tracking-tight">{isLogin ? '歡迎回來' : '建立免費帳號'}</h1>
          <p className="mt-2 text-ink-soft">{isLogin ? '登入後繼續剪輯你的專案。' : '註冊就送 7 天專業版，不需信用卡。'}</p>

          <button
            type="button"
            onClick={() => toast('Google 登入需要先設定 Google OAuth 用戶端 ID，目前請先用 Email 登入')}
            className="mt-8 flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-surface text-sm font-semibold transition hover:bg-sunken/60"
          >
            <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            使用 Google 帳號{isLogin ? '登入' : '註冊'}
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-ink-mute">
            <span className="h-px flex-1 bg-line" /> 或使用 Email <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            {!isLogin && (
              <Field label="名稱">
                <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="你的名字或頻道名稱" required autoComplete="name" />
              </Field>
            )}
            <Field label="Email">
              <input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required autoComplete="email" />
            </Field>
            <Field label="密碼" hint={isLogin ? undefined : '至少 8 個字元'}>
              <input
                className={inputClass}
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={isLogin ? undefined : 8}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
              />
            </Field>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? '處理中…' : isLogin ? '登入' : '建立帳號'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-soft">
            {isLogin ? '還沒有帳號？' : '已經有帳號了？'}
            <Link to={`${isLogin ? '/register' : '/login'}${next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : ''}`} className="ml-1 font-bold text-brand hover:underline">
              {isLogin ? '免費註冊' : '登入'}
            </Link>
          </p>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-sunken lg:block">
        <div className="absolute inset-0 grid place-items-center p-12">
          <div className="w-full max-w-md">
            <div className="relative mx-auto aspect-[9/16] w-56 -rotate-3 overflow-hidden rounded-[28px] border-[6px] border-ink bg-sunken shadow-pop">
              <img
                src="https://images.unsplash.com/photo-1593960548354-62d1b5c9d542?w=448&h=796&fit=crop&q=70&auto=format"
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="relative flex h-full flex-col justify-end p-5">
                <div className="text-center text-lg leading-snug font-black text-white [-webkit-text-stroke:6px_#1f1d2b] [paint-order:stroke]">
                  一次剪好
                  <br />
                  一支短影音
                </div>
              </div>
            </div>
            <ul className="mx-auto mt-10 w-fit space-y-2.5 text-[15px] font-semibold text-ink">
              {['AI 自動上字幕，轉成繁體中文', '一鍵剪掉停頓和口誤', '文字直接變成中文配音'].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <span className="grid size-5 place-items-center rounded-full bg-brand text-[11px] text-white">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
