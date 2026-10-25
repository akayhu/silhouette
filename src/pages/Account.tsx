import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';
import { AppLayout } from '../components/Layout';
import { Button, Field, Modal, buttonClass, inputClass, useToast } from '../components/ui';

type Payment = { id: string; amount: number; cardLast4: string; createdAt: string };

export default function Account() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [pw, setPw] = useState({ current: '', next: '' });
  const [payments, setPayments] = useState<Payment[]>([]);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    api.payments().then((r) => setPayments(r.payments));
  }, [user?.plan]);

  if (!user) return null;

  const saveProfile = async () => {
    try {
      setUser((await api.updateMe({ name })).user);
      toast('已更新個人資料', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const savePassword = async () => {
    try {
      setUser((await api.updateMe({ currentPassword: pw.current, newPassword: pw.next })).user);
      setPw({ current: '', next: '' });
      toast('已更新密碼', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const card = 'rounded-3xl border border-line bg-surface p-6 shadow-card';
  return (
    <AppLayout>
      <h1 className="text-3xl font-black tracking-tight">帳戶設定</h1>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className={card}>
          <h2 className="text-lg font-extrabold">個人資料</h2>
          <div className="mt-5 space-y-4">
            <Field label="名稱">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Email" hint="Email 無法修改">
              <input className={`${inputClass} bg-sunken text-ink-mute`} value={user.email} disabled />
            </Field>
            <Button onClick={saveProfile} disabled={!name.trim() || name === user.name}>
              儲存
            </Button>
          </div>
          <h2 className="mt-10 text-lg font-extrabold">修改密碼</h2>
          <div className="mt-5 space-y-4">
            <Field label="目前密碼">
              <input className={inputClass} type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
            </Field>
            <Field label="新密碼" hint="至少 8 個字元">
              <input className={inputClass} type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
            </Field>
            <Button variant="secondary" onClick={savePassword} disabled={!pw.current || pw.next.length < 8}>
              更新密碼
            </Button>
          </div>
        </section>

        <section className="space-y-6">
          <div className={card}>
            <h2 className="text-lg font-extrabold">訂閱方案</h2>
            {user.plan === 'pro' ? (
              <>
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-coral-soft p-4">
                  <Crown className="size-6 text-coral" />
                  <div>
                    <div className="font-bold">專業版．NT$399／月</div>
                    <div className="text-sm text-ink-soft">
                      {user.cancelAtPeriodEnd ? `已取消，將於 ${formatDate(user.planRenewsAt!)} 回到免費版` : `下次續訂：${formatDate(user.planRenewsAt!)}`}
                    </div>
                  </div>
                </div>
                {user.cancelAtPeriodEnd ? (
                  <Button className="mt-4" onClick={async () => setUser((await api.resume()).user)}>
                    恢復訂閱
                  </Button>
                ) : (
                  <Button variant="danger" className="mt-4" onClick={() => setConfirmCancel(true)}>
                    取消訂閱
                  </Button>
                )}
              </>
            ) : (
              <>
                <div className="mt-4 rounded-2xl bg-sunken p-4">
                  <div className="font-bold">免費版</div>
                  <div className="text-sm text-ink-soft">
                    本月已建立 {user.usage.projectsThisMonth} / {user.usage.projectLimit} 個專案．匯出 720p 含浮水印
                  </div>
                </div>
                <Link to="/checkout" className={buttonClass('coral', 'md', 'mt-4')}>
                  <Crown className="size-4" /> 升級專業版 NT$399／月
                </Link>
              </>
            )}
          </div>
          <div className={card}>
            <h2 className="text-lg font-extrabold">付款紀錄</h2>
            {payments.length === 0 ? (
              <p className="mt-3 text-sm text-ink-mute">還沒有付款紀錄</p>
            ) : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex justify-between py-3">
                    <span>
                      {formatDate(p.createdAt)}
                      <span className="ml-2 text-ink-mute">卡號末四碼 {p.cardLast4}</span>
                    </span>
                    <span className="font-bold">NT${p.amount}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)}>
        <h2 className="text-xl font-extrabold">確定要取消訂閱嗎？</h2>
        <p className="mt-2 text-sm text-ink-soft">
          取消後不會再扣款。專業版功能可以用到 {user.planRenewsAt && formatDate(user.planRenewsAt)}，之後回到免費版。
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
            保留訂閱
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              setUser((await api.cancel()).user);
              setConfirmCancel(false);
              toast('已取消訂閱');
            }}
          >
            確定取消
          </Button>
        </div>
      </Modal>
    </AppLayout>
  );
}
