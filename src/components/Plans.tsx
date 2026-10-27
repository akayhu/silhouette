import { Link } from 'react-router-dom';
import { Check, Minus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { isPaidPro, TRIAL_DAYS } from '../lib/plan';
import type { ReactNode } from 'react';
import { mkButton } from './marketing';

const rows: { label: string; free: string | boolean; pro: string | boolean }[] = [
  { label: '每月專案數', free: '3 個', pro: '不限' },
  { label: '匯出畫質', free: '720p', pro: '1080p' },
  { label: '浮水印', free: '有', pro: '無' },
  { label: '裁剪、分割、變速、比例', free: true, pro: true },
  { label: '手動字幕與字幕樣式', free: true, pro: true },
  { label: '疊加軌、貼紙、濾鏡、轉場', free: true, pro: true },
  { label: '無版權配樂與音效', free: true, pro: true },
  { label: 'AI 自動字幕', free: false, pro: true },
  { label: '智能口播（自動剪靜音）', free: false, pro: true },
  { label: '文字朗讀配音', free: false, pro: true },
  { label: '用自己的聲音建立 AI 配音', free: false, pro: true },
  { label: '去浮水印（Logo、字幕帶）', free: false, pro: true },
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Check className="size-4 text-mag-ink" strokeWidth={2.5} aria-label="有" />;
  if (v === false) return <Minus className="size-4 text-mag-mute" aria-label="沒有" />;
  return <span className="num text-[14px] font-bold">{v}</span>;
}

/** 方案頁：雜誌的兩欄比較，中間一條直線分欄；專業版的欄頭是期色鈷藍 */
export function PlanCards() {
  const { user } = useAuth();
  const isPro = isPaidPro(user);
  return (
    <div className="mx-auto grid max-w-[1000px] border-y border-mag-ink md:grid-cols-2 md:divide-x md:divide-mag-ink/20">
      <Column
        name="免費版"
        price="0"
        note={`註冊就送 ${TRIAL_DAYS} 天專業版，之後可以一直免費使用。`}
        cta={
          <Link to={user ? '/dashboard' : '/register'} className={mkButton('line', 'lg', 'w-full')}>
            {user ? (user.plan === 'pro' ? '回到我的專案' : '目前方案') : `免費註冊・送 ${TRIAL_DAYS} 天專業版`}
          </Link>
        }
        plan="free"
      />
      <Column
        name="專業版"
        price="399"
        featured
        note={`經營自媒體、接案剪片，AI 功能全開。新會員可先免費試用 ${TRIAL_DAYS} 天。`}
        cta={
          <Link to={isPro ? '/account' : user ? '/checkout' : '/register'} className={mkButton('ink', 'lg', 'w-full')}>
            {isPro ? '管理訂閱' : user ? '升級專業版' : `免費試用 ${TRIAL_DAYS} 天`}
          </Link>
        }
        plan="pro"
      />
    </div>
  );
}

function Column({ name, price, note, cta, plan, featured }: { name: string; price: string; note: string; cta: ReactNode; plan: 'free' | 'pro'; featured?: boolean }) {
  return (
    <article className="border-b border-mag-ink/20 pb-10 last:border-b-0 md:border-b-0">
      <header className={`flex items-baseline justify-between px-6 pt-5 pb-4 sm:px-8 ${featured ? 'bg-mag-blue text-white' : 'border-b border-mag-ink/15'}`}>
        <h3 className="font-ming text-[24px] font-black">{name}</h3>
        {featured && <span className="font-kai text-[16px]">AI 全開</span>}
      </header>
      <div className="px-6 pt-7 sm:px-8">
        <div className="flex items-baseline gap-2">
          <span className="num text-[16px] font-bold">NT$</span>
          <span className="num font-ming text-[76px] leading-none font-black tracking-[-0.03em]">{price}</span>
          <span className="text-[15px] text-mag-soft">／月</span>
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-mag-soft">{note}</p>
        <div className="mt-6">{cta}</div>
        <ul className="mt-8 divide-y divide-mag-ink/10 border-t border-mag-ink/15 text-[15px]">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-4 py-2.5">
              <span className={r[plan] === false ? 'text-mag-mute' : ''}>{r.label}</span>
              <Cell v={r[plan]} />
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
