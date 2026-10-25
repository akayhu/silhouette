import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { MarketingLayout } from '../components/Layout';
import { buttonClass } from '../components/ui';

export default function NotFound() {
  return (
    <MarketingLayout>
      <section className="px-4 py-28 text-center sm:px-6">
        <div className="text-sm font-bold text-coral">404</div>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">找不到這個頁面</h1>
        <p className="mx-auto mt-3 max-w-md text-ink-soft">網址可能打錯了，或這個頁面已經移除。回到首頁看看片刻剪趣能幫你做什麼吧。</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/" className={buttonClass('primary', 'lg')}>
            回到首頁 <ArrowRight className="size-4" />
          </Link>
          <Link to="/pricing" className={buttonClass('secondary', 'lg')}>
            看價格方案
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
