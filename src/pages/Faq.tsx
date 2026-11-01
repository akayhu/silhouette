import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { MarketingLayout } from '../components/Layout';
import { mkButton } from '../components/marketing';
import { faqs } from '../lib/faq';
import { SITE_NAME, SITE_URL } from '../lib/seo';

export default function Faq() {
  return (
    <MarketingLayout>
      <StructuredData />
      <section className="px-4 pt-16 pb-28 sm:px-8">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h1 className="text-[clamp(38px,4.6vw,60px)] leading-[1.15] font-black">常見問題</h1>
          <p className="mt-4 text-[18px] leading-relaxed text-site-soft">關於剪輯、AI 功能、素材版權和帳戶的常見問題，都在這裡。</p>
        </div>
        <div className="mx-auto max-w-[860px] space-y-3">
          {faqs.map(([q, a]) => (
            <details key={q} className="group rounded-2xl border border-site-line bg-white px-5 open:shadow-site">
              <summary className="flex cursor-pointer list-none items-center gap-4 py-5 text-[17px] font-bold [&::-webkit-details-marker]:hidden">
                <span className="flex-1">{q}</span>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-site-band transition-transform group-open:rotate-45">
                  <Plus className="size-4" aria-hidden />
                </span>
              </summary>
              <p className="pr-12 pb-6 text-[15px] leading-[1.85] text-site-soft">{a}</p>
            </details>
          ))}
        </div>
        <div className="mx-auto mt-16 max-w-[860px] rounded-[28px] bg-site-band p-8 text-center sm:p-10">
          <h2 className="text-[22px] font-black">沒找到答案？</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-site-soft">免費註冊就能實際試用，7 天內全部功能都開放。</p>
          <Link to="/register" className={mkButton('red', 'md', 'mt-6')}>
            免費開始剪輯 <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}

/** 結構化資料：只描述頁面上看得到的常見問題 */
function StructuredData() {
  const abs = (p: string) => (SITE_URL ? SITE_URL + p : undefined);
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: abs('/') },
      { '@type': 'ListItem', position: 2, name: '常見問題', item: abs('/faq') },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, '\\u003c') }} />
    </>
  );
}
