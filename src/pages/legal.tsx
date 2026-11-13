import type { ReactNode } from 'react';
import { MarketingLayout } from '../components/Layout';
import { SITE_INFO } from '../lib/siteInfo';

/** 營運資訊還沒填時，顯示醒目的「待補」，避免上線後空白或亂填 */
export function InfoValue({ value }: { value: string }) {
  return value ? <>{value}</> : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[13px] font-bold text-amber-800">待補</span>;
}

export function ContactLine() {
  const email = SITE_INFO.contactEmail;
  return email ? (
    <a href={`mailto:${email}`} className="font-bold text-site-red underline underline-offset-4">
      {email}
    </a>
  ) : (
    <InfoValue value="" />
  );
}

/** 條款、政策這類文字頁共用的版面：標題、更新日期、分段 */
export function LegalPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <MarketingLayout>
      <article className="px-4 pt-16 pb-28 sm:px-8">
        <div className="mx-auto max-w-[760px]">
          <h1 className="text-[clamp(34px,4.2vw,52px)] leading-[1.15] font-black">{title}</h1>
          <p className="mt-3 text-[14px] text-site-mute">最後更新：{SITE_INFO.updated}</p>
          {intro && <div className="mt-6 rounded-2xl bg-site-band p-5 text-[16px] leading-[1.85]">{intro}</div>}
          <div className="mt-8 space-y-9">{children}</div>
        </div>
      </article>
    </MarketingLayout>
  );
}

export function LegalSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-[22px] font-black">{title}</h2>
      <div className="mt-3 space-y-3 text-[16px] leading-[1.9] text-site-soft">{children}</div>
    </section>
  );
}

export const LegalList = ({ items }: { items: ReactNode[] }) => (
  <ul className="space-y-2">
    {items.map((it, i) => (
      <li key={i} className="flex gap-2">
        <span aria-hidden>・</span>
        <span>{it}</span>
      </li>
    ))}
  </ul>
);
