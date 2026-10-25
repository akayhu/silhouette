import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Field, Logo, inputClass, useToast } from '../components/ui';

const formatCard = (v: string) => v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
const formatExpiry = (v: string) => v.replace(/\D/g, '').slice(0, 4).replace(/(\d{2})(?=\d)/, '$1/');

export default function Checkout() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [card, setCard] = useState({ name: '', number: '', expiry: '', cvc: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const location = useLocation();
  const alreadyPro = useRef(user?.plan === 'pro').current;

  if (alreadyPro) return <Navigate to="/account" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { user } = await api.checkout({ cardNumber: card.number, name: card.name });
      setUser(user);
      toast('升級成功！已解鎖專業版全部功能', 'success');
      // 從編輯器點升級的話，付款完回到原本的頁面
      if (location.key !== 'default') navigate(-1);
      else navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Logo to="/dashboard" />
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-mute">
          <Lock className="size-3.5" /> 安全加密結帳
        </span>
      </header>
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-6 md:grid-cols-[1fr_1.1fr]">
        <div>
          <Link to="/pricing" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
            <ArrowLeft className="size-4" /> 返回方案
          </Link>
          <h1 className="mt-4 text-3xl font-black tracking-tight">升級專業版</h1>
          <div className="mt-6 rounded-3xl border border-line bg-surface p-6 shadow-card">
            <div className="flex items-baseline justify-between">
              <span className="font-bold">剪影 Studio 專業版</span>
              <span className="text-2xl font-extrabold">NT$399</span>
            </div>
            <div className="text-sm text-ink-mute">每月自動續訂，可隨時取消</div>
            <ul className="mt-5 space-y-2.5 border-t border-line pt-5 text-sm">
              {['不限專案數量', '匯出 1080p，無浮水印', 'AI 自動字幕', '智能口播（剪掉靜音與口誤）', '文字朗讀配音'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="size-4 text-mint" strokeWidth={3} /> {t}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-between border-t border-line pt-4 font-bold">
              <span>今日應付</span>
              <span>NT$399</span>
            </div>
          </div>
        </div>
        <form onSubmit={submit} className="h-fit rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <h2 className="text-lg font-extrabold">付款資訊</h2>
          <p className="mt-1 rounded-xl bg-sun/20 px-3 py-2 text-xs font-semibold text-[#8a6100]">
            目前是本機測試模式，不會真的扣款。可以用測試卡號 4242 4242 4242 4242。
          </p>
          <div className="mt-5 space-y-4">
            <Field label="持卡人姓名">
              <input className={inputClass} value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} required placeholder={user?.name} />
            </Field>
            <Field label="卡號">
              <input className={inputClass} inputMode="numeric" value={card.number} onChange={(e) => setCard({ ...card, number: formatCard(e.target.value) })} required placeholder="1234 5678 9012 3456" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="到期日">
                <input className={inputClass} inputMode="numeric" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })} required placeholder="MM/YY" pattern="\d{2}/\d{2}" />
              </Field>
              <Field label="安全碼">
                <input className={inputClass} inputMode="numeric" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })} required placeholder="CVC" minLength={3} />
              </Field>
            </div>
          </div>
          {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
          <Button type="submit" size="lg" className="mt-6 w-full" disabled={busy}>
            {busy ? '處理中…' : '確認訂閱 NT$399／月'}
          </Button>
          <p className="mt-3 text-center text-xs text-ink-mute">訂閱後每月自動扣款，可在帳戶設定隨時取消。</p>
        </form>
      </div>
    </div>
  );
}
