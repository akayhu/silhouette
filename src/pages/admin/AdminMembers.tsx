import { useEffect, useState } from 'react';
import { Crown, Search, ShieldCheck, Trash2, UserMinus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import type { AdminMember } from '../../lib/types';
import { Button, Modal, inputClass, useToast } from '../../components/ui';
import { AdminLayout } from './AdminLayout';
import { money } from './charts';

type Filter = 'all' | 'pro' | 'free';
const DURATIONS = [
  { months: 1, label: '1 個月' },
  { months: 3, label: '3 個月' },
  { months: 6, label: '6 個月' },
  { months: 12, label: '1 年' },
  { months: 0, label: '永久' },
];

export default function AdminMembers() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [members, setMembers] = useState<AdminMember[] | null>(null);
  const [granting, setGranting] = useState<AdminMember | null>(null);
  const [months, setMonths] = useState(1);
  const [deleting, setDeleting] = useState<AdminMember | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.adminUsers(q, filter).then((r) => setMembers(r.users)).catch((e) => toast(e.message, 'error'));
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q, filter]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done, 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout title="會員管理">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex h-10 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-brand">
          <Search className="size-4 text-ink-mute" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋名稱或 Email" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <div className="flex rounded-xl bg-sunken p-0.5" role="group" aria-label="方案篩選">
          {(
            [
              ['all', '全部'],
              ['pro', '付費'],
              ['free', '免費'],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`rounded-[10px] px-4 py-2 text-xs font-bold transition ${filter === id ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-sunken/70 text-left text-xs text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-bold">會員</th>
                <th className="px-4 py-3 font-bold">方案</th>
                <th className="px-4 py-3 font-bold">到期</th>
                <th className="px-4 py-3 text-right font-bold">專案</th>
                <th className="px-4 py-3 text-right font-bold">累計付款</th>
                <th className="px-4 py-3 font-bold">註冊日期</th>
                <th className="px-4 py-3 text-right font-bold">操作</th>
              </tr>
            </thead>
            <tbody>
              {members === null && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-mute">
                    載入中…
                  </td>
                </tr>
              )}
              {members?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-mute">
                    找不到符合的會員
                  </td>
                </tr>
              )}
              {members?.map((u) => {
                const isAdmin = u.role === 'admin';
                return (
                  <tr key={u.id} className="border-t border-line align-middle">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">{u.name.slice(0, 1)}</span>
                        <div className="min-w-0">
                          <div className="truncate font-bold">{u.name}</div>
                          <div className="truncate text-xs text-ink-mute">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <PlanBadge u={u} />
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-soft">
                      {u.plan === 'pro' ? (u.planRenewsAt ? `${formatDate(u.planRenewsAt)}${u.cancelAtPeriodEnd ? '（不續訂）' : ''}` : '永久') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{u.projects}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{u.totalPaid ? money(u.totalPaid) : '—'}</td>
                    <td className="px-4 py-3 text-xs text-ink-soft">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      {isAdmin ? (
                        <div className="text-right text-xs text-ink-mute">{u.id === me?.id ? '目前登入的帳號' : '管理者帳號'}</div>
                      ) : (
                        <div className="flex justify-end gap-1.5">
                          {u.plan === 'pro' ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={busy}
                              onClick={() => act(() => api.adminRevoke(u.id), `已將 ${u.name} 改回免費版`)}
                            >
                              <UserMinus className="size-3.5" /> 取消付費
                            </Button>
                          ) : (
                            <Button variant="coral" size="sm" disabled={busy} onClick={() => (setGranting(u), setMonths(1))}>
                              <Crown className="size-3.5" /> 開通付費
                            </Button>
                          )}
                          <button
                            onClick={() => (setDeleting(u), setConfirmText(''))}
                            className="grid size-8 place-items-center rounded-lg text-ink-mute hover:bg-red-50 hover:text-red-600"
                            aria-label={`刪除 ${u.name}`}
                            title="刪除帳號"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {members && members.length > 0 && <div className="border-t border-line px-4 py-2.5 text-xs text-ink-mute">共 {members.length} 位</div>}
      </div>

      <Modal open={!!granting} onClose={() => setGranting(null)}>
        <h2 className="text-xl font-extrabold">開通付費功能</h2>
        <p className="mt-1 text-sm text-ink-soft">
          直接把「{granting?.name}」升級為專業版，不會產生付款紀錄，也不會計入營收。到期後自動回到免費版。
        </p>
        <div className="mt-5 grid grid-cols-5 gap-1.5">
          {DURATIONS.map((d) => (
            <button
              key={d.months}
              onClick={() => setMonths(d.months)}
              className={`rounded-xl border-2 py-2.5 text-sm font-bold transition ${months === d.months ? 'border-brand bg-brand-soft/60 text-brand' : 'border-line text-ink-soft hover:border-ink-mute/40'}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setGranting(null)}>
            取消
          </Button>
          <Button
            variant="coral"
            disabled={busy}
            onClick={async () => {
              const u = granting!;
              setGranting(null);
              await act(() => api.adminGrant(u.id, months), `已為 ${u.name} 開通專業版（${DURATIONS.find((d) => d.months === months)?.label}）`);
            }}
          >
            確認開通
          </Button>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)}>
        <h2 className="text-xl font-extrabold text-red-600">刪除帳號</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          將永久刪除「{deleting?.name}」的帳號、所有專案、上傳的影片和自訂聲音，<b className="text-ink">無法復原</b>。付款紀錄會保留，營收報表不受影響。
        </p>
        <label className="mt-4 block text-xs font-semibold text-ink-soft">
          請輸入這位會員的 Email 確認刪除
          <input className={`${inputClass} mt-1.5`} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={deleting?.email} />
        </label>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            取消
          </Button>
          <Button
            variant="danger"
            disabled={busy || confirmText.trim().toLowerCase() !== deleting?.email}
            onClick={async () => {
              const u = deleting!;
              setDeleting(null);
              await act(() => api.adminDelete(u.id), `已刪除 ${u.name} 的帳號`);
            }}
          >
            <Trash2 className="size-4" /> 永久刪除
          </Button>
        </div>
      </Modal>
    </AdminLayout>
  );
}

function PlanBadge({ u }: { u: AdminMember }) {
  if (u.role === 'admin')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-xs font-bold text-ink-soft">
        <ShieldCheck className="size-3" /> 管理者
      </span>
    );
  if (u.plan === 'pro')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand">
        <Crown className="size-3" /> 專業版{u.planSource === 'admin' ? '・管理者開通' : '・付費'}
      </span>
    );
  return <span className="rounded-full bg-sunken px-2 py-0.5 text-xs font-bold text-ink-soft">免費版</span>;
}
