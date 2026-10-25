import { useEffect, useState, type ReactNode } from 'react';
import { RefreshCw, Table2 } from 'lucide-react';
import { api } from '../../lib/api';
import type { AdminStats } from '../../lib/types';
import { AdminLayout } from './AdminLayout';
import { BarChart, CHART, LineChart, longDate, money, SplitBar } from './charts';

const RANGES = [7, 30, 90] as const;

export default function AdminOverview() {
  const [days, setDays] = useState<number>(30);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');
  const [showTable, setShowTable] = useState(false);

  const load = () => {
    setError('');
    api.adminStats(days).then(setStats).catch((e) => setError(e.message));
  };
  useEffect(load, [days]);

  const m = stats?.members;
  const r = stats?.revenue;
  const daily = stats?.daily ?? [];
  const paidRate = m && m.total ? Math.round((m.paid / m.total) * 100) : 0;

  return (
    <AdminLayout
      title="營運總覽"
      actions={
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-sunken p-0.5" role="group" aria-label="時間範圍">
            {RANGES.map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-[10px] px-3 py-1.5 text-xs font-bold transition ${days === d ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`}
              >
                近 {d} 天
              </button>
            ))}
          </div>
          <button onClick={load} className="grid size-9 place-items-center rounded-xl border border-line bg-surface text-ink-soft hover:text-ink" aria-label="重新整理" title="重新整理">
            <RefreshCw className="size-4" />
          </button>
        </div>
      }
    >
      {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}

      {/* 主要數字：總營收為主角，其他為小卡 */}
      <div className="grid gap-4 lg:grid-cols-[1.3fr_2fr]">
        <Card>
          <div className="text-sm font-bold text-ink-soft">累計總營收</div>
          <div className="mt-2 text-5xl font-extrabold tracking-tight tabular-nums">{r ? money(r.total) : '—'}</div>
          <div className="mt-2 text-sm text-ink-soft">
            共 {r?.payments ?? 0} 筆付款・近 {days} 天 {r ? money(r.inRange) : '—'}
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Tile label="今日營收" value={r ? money(r.today) : '—'} />
          <Tile label="會員總數" value={m ? m.total.toLocaleString('zh-TW') : '—'} sub={m ? `今天新增 ${m.newToday} 位` : undefined} />
          <Tile label="付費會員" value={m ? m.paid.toLocaleString('zh-TW') : '—'} sub={m ? `付費率 ${paidRate}%` : undefined} />
          <Tile label="免費會員" value={m ? m.free.toLocaleString('zh-TW') : '—'} sub={m?.adminGranted ? `另有 ${m.adminGranted} 位由管理者開通` : undefined} />
        </div>
      </div>

      <Card className="mt-4">
        <SectionHead title="付費與免費會員" />
        {m && (
          <SplitBar
            parts={[
              { label: '付費會員', value: m.paid, color: CHART.paid },
              { label: '免費會員', value: m.free, color: CHART.free },
            ]}
          />
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHead title="每日付費金額" sub={`近 ${days} 天，每根柱子是當天的付款總額`} />
          {stats && (
            <BarChart
              label="每日付費金額長條圖"
              data={daily.map((d) => ({ key: d.date, value: d.amount }))}
              color={CHART.paid}
              format={money}
              tooltip={(i) => (
                <>
                  <div className="font-bold">{longDate(daily[i].date)}</div>
                  <Row k="付費金額" v={money(daily[i].amount)} />
                  <Row k="付款筆數" v={`${daily[i].payments} 筆`} />
                </>
              )}
            />
          )}
        </Card>
        <Card>
          <SectionHead title="累計總金額" sub="到每一天為止的總營收" />
          {stats && (
            <LineChart
              label="累計總金額折線圖"
              data={daily.map((d) => ({ key: d.date, value: d.cumulative }))}
              color={CHART.paid}
              format={money}
              tooltip={(i) => (
                <>
                  <div className="font-bold">{longDate(daily[i].date)}</div>
                  <Row k="累計總金額" v={money(daily[i].cumulative)} />
                  <Row k="當天付費" v={money(daily[i].amount)} />
                </>
              )}
            />
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <SectionHead
          title="每日新增會員"
          sub={`近 ${days} 天的註冊人數`}
          aside={
            <button onClick={() => setShowTable(!showTable)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-ink-soft hover:bg-sunken hover:text-ink">
              <Table2 className="size-3.5" /> {showTable ? '隱藏表格' : '以表格檢視每日數據'}
            </button>
          }
        />
        {stats && (
          <BarChart
            label="每日新增會員長條圖"
            height={180}
            data={daily.map((d) => ({ key: d.date, value: d.signups }))}
            color={CHART.paid}
            format={(v) => `${v} 位`}
            tooltip={(i) => (
              <>
                <div className="font-bold">{longDate(daily[i].date)}</div>
                <Row k="新增會員" v={`${daily[i].signups} 位`} />
              </>
            )}
          />
        )}
        {showTable && (
          <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-sunken text-left text-xs text-ink-soft">
                <tr>
                  <th className="px-3 py-2">日期</th>
                  <th className="px-3 py-2 text-right">新增會員</th>
                  <th className="px-3 py-2 text-right">付款筆數</th>
                  <th className="px-3 py-2 text-right">付費金額</th>
                  <th className="px-3 py-2 text-right">累計總金額</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[...daily].reverse().map((d) => (
                  <tr key={d.date} className="border-t border-line">
                    <td className="px-3 py-2">{d.date}</td>
                    <td className="px-3 py-2 text-right">{d.signups}</td>
                    <td className="px-3 py-2 text-right">{d.payments}</td>
                    <td className="px-3 py-2 text-right">{money(d.amount)}</td>
                    <td className="px-3 py-2 text-right">{money(d.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AdminLayout>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-line bg-surface p-5 shadow-card sm:p-6 ${className}`}>{children}</section>;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <div className="text-xs font-bold text-ink-soft">{label}</div>
      <div className="mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-mute">{sub}</div>}
    </Card>
  );
}

function SectionHead({ title, sub, aside }: { title: string; sub?: string; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-extrabold">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-ink-mute">{sub}</p>}
      </div>
      {aside}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="mt-1 flex justify-between gap-2 text-ink-soft">
      <span>{k}</span>
      <b className="text-ink tabular-nums">{v}</b>
    </div>
  );
}
