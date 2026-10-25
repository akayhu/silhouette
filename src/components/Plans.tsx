import { Link } from 'react-router-dom';
import { Check, Minus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { buttonClass } from './ui';

const rows: { label: string; free: string | boolean; pro: string | boolean }[] = [
  { label: '每月專案數', free: '3 個', pro: '不限' },
  { label: '匯出畫質', free: '720p', pro: '1080p' },
  { label: '浮水印', free: '有', pro: '無' },
  { label: '裁剪、分割、變速、比例', free: true, pro: true },
  { label: '手動字幕與字幕樣式', free: true, pro: true },
  { label: 'AI 自動字幕', free: false, pro: true },
  { label: '智能口播（自動剪靜音）', free: false, pro: true },
  { label: '文字朗讀配音', free: false, pro: true },
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Check className="size-4 text-mint" strokeWidth={3} />;
  if (v === false) return <Minus className="size-4 text-ink-mute/60" />;
  return <span className="font-semibold">{v}</span>;
}

export function PlanCards() {
  const { user } = useAuth();
  const isPro = user?.plan === 'pro';
  return (
    <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
      <div className="rounded-3xl border border-line bg-surface p-7 shadow-card">
        <div className="text-sm font-bold text-ink-soft">免費版</div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-4xl font-extrabold tracking-tight">NT$0</span>
          <span className="text-ink-mute">／月</span>
        </div>
        <p className="mt-2 text-sm text-ink-soft">先試試看，剪幾支日常短片。</p>
        <Link
          to={user ? '/dashboard' : '/register'}
          className={buttonClass('secondary', 'lg', 'mt-6 w-full')}
        >
          {user ? (isPro ? '回到我的專案' : '目前方案') : '免費註冊'}
        </Link>
        <PlanList plan="free" />
      </div>
      <div className="relative rounded-3xl border-2 border-brand bg-surface p-7 shadow-pop">
        <span className="absolute -top-3 left-7 rounded-full bg-coral px-3 py-1 text-xs font-bold text-white">最受歡迎</span>
        <div className="text-sm font-bold text-brand">專業版</div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-4xl font-extrabold tracking-tight">NT$399</span>
          <span className="text-ink-mute">／月</span>
        </div>
        <p className="mt-2 text-sm text-ink-soft">經營自媒體、接案剪片，AI 功能全開。</p>
        <Link
          to={isPro ? '/account' : user ? '/checkout' : '/register?next=/checkout'}
          className={buttonClass('primary', 'lg', 'mt-6 w-full')}
        >
          {isPro ? '管理訂閱' : '升級專業版'}
        </Link>
        <PlanList plan="pro" />
      </div>
    </div>
  );
}

function PlanList({ plan }: { plan: 'free' | 'pro' }) {
  return (
    <ul className="mt-7 space-y-3 border-t border-line pt-6 text-sm">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center justify-between gap-3">
          <span className={r[plan] === false ? 'text-ink-mute' : 'text-ink'}>{r.label}</span>
          <Cell v={r[plan]} />
        </li>
      ))}
    </ul>
  );
}
