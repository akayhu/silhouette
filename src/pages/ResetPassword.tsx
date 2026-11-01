import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Field, Logo, inputClass } from '../components/ui';

export default function ResetPassword() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!token) return <Navigate to="/forgot-password" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('兩次輸入的密碼不一樣');
    setBusy(true);
    try {
      const { user } = await api.resetPassword(token, password);
      setUser(user);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="mt-6 text-center text-2xl font-black tracking-tight">設定新密碼</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="新密碼" hint="至少 8 個字元">
            <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </Field>
          <Field label="再輸入一次新密碼">
            <input className={inputClass} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" />
          </Field>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? '更新中…' : '更新密碼'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-soft">
          <Link to="/login" className="font-bold text-ink-soft hover:text-ink">
            返回登入
          </Link>
        </p>
      </div>
    </div>
  );
}
