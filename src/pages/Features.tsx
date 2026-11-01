import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { MarketingLayout } from '../components/Layout';
import { mkButton } from '../components/marketing';
import { FeatureList } from './Landing';

export default function Features() {
  return (
    <MarketingLayout>
      <section className="px-4 pt-16 pb-4 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-[clamp(38px,4.6vw,60px)] leading-[1.15] font-black">全部功能</h1>
          <p className="mt-4 text-[18px] leading-relaxed text-site-soft">剪輯、字幕、聲音、畫面效果、AI 自動處理到匯出，片刻剪趣有的功能都在這裡。</p>
        </div>
      </section>
      <FeatureList />
      <div className="px-4 pb-28 text-center sm:px-8">
        <Link to="/register" className={mkButton('red', 'lg')}>
          免費開始剪輯 <ArrowRight className="size-5" />
        </Link>
        <p className="mt-4 text-[14px] text-site-mute">免費註冊即享 7 天專業版・不需信用卡</p>
      </div>
    </MarketingLayout>
  );
}
