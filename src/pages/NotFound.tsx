import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { MarketingLayout } from '../components/Layout';
import { mkButton } from '../components/marketing';

export default function NotFound() {
  return (
    <MarketingLayout>
      <section className="px-4 py-24 sm:px-8">
        <div className="mx-auto max-w-[460px] border-y border-mag-ink py-12 text-center">
          <div className="num font-ming text-[96px] leading-none font-black text-mag-blue">404</div>
          <h1 className="mt-5 font-ming text-[30px] font-black">這一頁不在本期</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-mag-soft">網址可能打錯了，或這個頁面已經移除。回到首頁看看片刻剪趣能幫你做什麼吧。</p>
          <div className="mt-8 flex flex-col gap-3">
            <Link to="/" className={mkButton('ink', 'lg')}>
              回到首頁 <ArrowRight className="size-5" />
            </Link>
            <Link to="/pricing" className={mkButton('line', 'lg')}>
              看價格方案
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
