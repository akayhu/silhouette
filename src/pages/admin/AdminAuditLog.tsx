import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import type { AdminAuditAction, AdminAuditEntry } from '../../lib/types';
import { useToast } from '../../components/ui';
import { AdminLayout } from './AdminLayout';

const PAGE_SIZES = [10, 20, 30, 50, 100] as const;

const ACTION_LABELS: Record<AdminAuditAction, string> = {
  grant: '開通付費',
  revoke: '取消付費',
  'reset-password': '重設密碼',
  'delete-user': '刪除帳號',
  'create-promo-code': '產生優惠碼',
};

/** 把 detail 這個 JSON 補充資訊翻成一句話；不同動作存的欄位不一樣 */
function describeDetail(action: AdminAuditAction, detail: AdminAuditEntry['detail']) {
  if (action === 'grant') {
    const months = Number(detail?.months ?? 0);
    return months === 0 ? '永久開通' : `開通 ${months} 個月`;
  }
  if (action === 'create-promo-code') {
    const kind = detail?.kind;
    return kind === 'discount' ? `${detail?.code}・折 NT$${detail?.discountAmount}` : `${detail?.code}・免費 ${detail?.months} 個月`;
  }
  return '—';
}

export default function AdminAuditLog() {
  const toast = useToast();
  const [entries, setEntries] = useState<AdminAuditEntry[] | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(20);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api
      .adminAuditLog(page, pageSize)
      .then((r) => {
        setEntries(r.entries);
        setTotal(r.total);
      })
      .catch((e) => toast(e.message, 'error'));
  }, [page, pageSize]);
  useEffect(() => setPage(1), [pageSize]);

  return (
    <AdminLayout title="操作紀錄">
      <p className="text-sm text-ink-soft">管理者在後台做的每個操作都會記在這裡：誰、什麼時候、對誰做了什麼，方便之後回溯。</p>

      <div className="mt-6 overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-sunken/70 text-left text-xs text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-bold">時間</th>
                <th className="px-4 py-3 font-bold">管理者</th>
                <th className="px-4 py-3 font-bold">動作</th>
                <th className="px-4 py-3 font-bold">對象</th>
                <th className="px-4 py-3 font-bold">內容</th>
              </tr>
            </thead>
            <tbody>
              {entries === null && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-mute">
                    載入中…
                  </td>
                </tr>
              )}
              {entries?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-mute">
                    還沒有任何管理者操作紀錄
                  </td>
                </tr>
              )}
              {entries?.map((e) => (
                <tr key={e.id} className="border-t border-line align-middle">
                  <td className="px-4 py-3 text-xs text-ink-soft whitespace-nowrap">{formatDate(e.createdAt)}</td>
                  <td className="px-4 py-3 text-xs text-ink-mute">{e.adminEmail}</td>
                  <td className="px-4 py-3 font-semibold">{ACTION_LABELS[e.action] ?? e.action}</td>
                  <td className="px-4 py-3 text-xs text-ink-mute">{e.targetEmail ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-ink-soft">{describeDetail(e.action, e.detail)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div className="flex flex-col gap-3 border-t border-line px-4 py-3 text-xs text-ink-mute sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span>
                第 {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} 筆，共 {total} 筆
              </span>
              <label className="flex items-center gap-1.5">
                每頁
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])}
                  className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-semibold text-ink"
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                筆
              </label>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="grid size-7 place-items-center rounded-lg text-ink-soft hover:bg-sunken hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="上一頁"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="tabular-nums">
                第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 頁
              </span>
              <button
                onClick={() => setPage((p) => (p * pageSize < total ? p + 1 : p))}
                disabled={page * pageSize >= total}
                className="grid size-7 place-items-center rounded-lg text-ink-soft hover:bg-sunken hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label="下一頁"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
