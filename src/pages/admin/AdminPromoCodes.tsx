import { useEffect, useState } from 'react';
import { Check, Copy, Ticket } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { PromoCode } from '../../lib/types';
import { Button, useToast } from '../../components/ui';
import { AdminLayout } from './AdminLayout';

const MAX_DISCOUNT = 300;

export default function AdminPromoCodes() {
  const toast = useToast();
  const [codes, setCodes] = useState<PromoCode[] | null>(null);
  const [kind, setKind] = useState<'months' | 'discount'>('months');
  const [months, setMonths] = useState(1);
  const [discountAmount, setDiscountAmount] = useState(100);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = () => api.adminPromoCodes().then((r) => setCodes(r.codes)).catch((e) => toast(e.message, 'error'));
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const { code } = await api.adminCreatePromoCode(kind === 'months' ? { kind, months } : { kind, discountAmount });
      toast(`已產生優惠碼 ${code.code}`, 'success');
      await load();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const copy = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <AdminLayout title="優惠碼">
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-card">
        <h2 className="text-lg font-extrabold">產生新的優惠碼</h2>
        <p className="mt-1 text-sm text-ink-soft">
          兌換不會產生付款紀錄，也不會計入營收（折扣碼實際扣款的金額會）。同一組優惠碼每個人都能用，但每個人只能兌換一次。
        </p>

        <div className="mt-4 flex rounded-xl bg-sunken p-0.5" role="group" aria-label="優惠碼類型">
          {(
            [
              ['months', '免費月數'],
              ['discount', '折扣金額'],
            ] as [typeof kind, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setKind(id)}
              className={`rounded-[10px] px-4 py-2 text-xs font-bold transition ${kind === id ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {kind === 'months' ? (
          <div className="mt-4 flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="w-full max-w-xs accent-brand"
              aria-label="免費月數"
            />
            <span className="w-16 shrink-0 text-sm font-bold tabular-nums">{months} 個月</span>
            <Button onClick={create} disabled={busy}>
              <Ticket className="size-4" /> 產生優惠碼
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={MAX_DISCOUNT}
              step={1}
              value={discountAmount}
              onChange={(e) => setDiscountAmount(Number(e.target.value))}
              className="w-full max-w-xs accent-brand"
              aria-label="折扣金額"
            />
            <span className="w-20 shrink-0 text-sm font-bold tabular-nums">NT${discountAmount}</span>
            <Button onClick={create} disabled={busy}>
              <Ticket className="size-4" /> 產生優惠碼
            </Button>
          </div>
        )}
        {kind === 'discount' && <p className="mt-2 text-xs text-ink-mute">最多可折 NT${MAX_DISCOUNT}，兌換後引導到綠界付實際折扣後的金額。</p>}
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-sunken/70 text-left text-xs text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-bold">優惠碼</th>
                <th className="px-4 py-3 text-right font-bold">內容</th>
                <th className="px-4 py-3 text-right font-bold">已使用次數</th>
                <th className="px-4 py-3 font-bold">建立時間</th>
                <th className="px-4 py-3 text-right font-bold">操作</th>
              </tr>
            </thead>
            <tbody>
              {codes === null && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-mute">
                    載入中…
                  </td>
                </tr>
              )}
              {codes?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-mute">
                    還沒有優惠碼
                  </td>
                </tr>
              )}
              {codes?.map((c) => (
                <tr key={c.code} className="border-t border-line align-middle">
                  <td className="px-4 py-3 font-mono font-bold tabular-nums">{c.code}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.kind === 'discount' ? `折 NT$${c.discountAmount}` : `免費 ${c.months} 個月`}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.redemptions}</td>
                  <td className="px-4 py-3 text-xs text-ink-soft">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="secondary" size="sm" onClick={() => copy(c.code)}>
                      {copied === c.code ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copied === c.code ? '已複製' : '複製'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {codes && codes.length > 0 && <div className="border-t border-line px-4 py-2.5 text-xs text-ink-mute">共 {codes.length} 組</div>}
      </div>
    </AdminLayout>
  );
}
