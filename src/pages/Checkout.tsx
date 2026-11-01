import { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Lock, Ticket } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { isPaidPro, isTrial } from '../lib/plan';
import { useAuth } from '../lib/auth';
import { Button, Logo, inputClass, useToast } from '../components/ui';

export default function Checkout() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [promo, setPromo] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const alreadyPro = useRef(isPaidPro(user)).current;

  if (alreadyPro) return <Navigate to="/account" replace />;

  const goToEcpay = async () => {
    setBusy(true);
    try {
      const { actionUrl, fields } = await api.ecpayCheckout();
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = actionUrl;
      for (const [key, value] of Object.entries(fields)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      toast((err as Error).message, 'error');
      setBusy(false);
    }
  };

  const redeemPromo = async () => {
    if (!promo.trim()) return;
    setPromoBusy(true);
    try {
      const { user, months } = await api.redeemPromo(promo.trim());
      setUser(user);
      toast(`優惠碼兌換成功，已升級專業版 ${months} 個月`, 'success');
      if (location.key !== 'default') navigate(-1);
      else navigate('/dashboard');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setPromoBusy(false);
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
              <span className="font-bold">片刻剪趣 專業版</span>
              <span className="text-2xl font-extrabold">NT$399</span>
            </div>
            <div className="text-sm text-ink-mute">每月自動續訂，可隨時取消</div>
            {isTrial(user) && (
              <p className="mt-3 rounded-xl bg-coral-soft px-3 py-2 text-xs font-semibold text-coral">
                你的試用到 {formatDate(user!.planRenewsAt!)}，現在付款的話，第一個月會從試用結束後開始計算，剩下的試用天數不會浪費。
              </p>
            )}
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
        <div className="h-fit rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <h2 className="text-lg font-extrabold">用信用卡付款</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            按下方按鈕後，會前往綠界金流的收銀台頁面輸入卡號，刷卡資料不會經過片刻剪趣的伺服器。付款完成後會自動回到這裡。
          </p>
          <Button size="lg" className="mt-6 w-full" disabled={busy} onClick={goToEcpay}>
            {busy ? '前往付款頁面中…' : '前往綠界付款 NT$399／月'}
          </Button>
          <p className="mt-3 text-center text-xs text-ink-mute">訂閱後每月自動扣款，可在帳戶設定隨時取消。</p>

          <div className="mt-6 border-t border-line pt-6">
            <div className="flex items-center gap-2 text-sm font-extrabold">
              <Ticket className="size-4 text-brand" /> 有優惠碼？
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className={inputClass}
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
                placeholder="輸入優惠碼"
                onKeyDown={(e) => e.key === 'Enter' && redeemPromo()}
              />
              <Button variant="secondary" disabled={promoBusy || !promo.trim()} onClick={redeemPromo}>
                {promoBusy ? '兌換中…' : '兌換'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-ink-mute">兌換後直接升級，不需要信用卡。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
