import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { MarketingLayout } from '../components/Layout';
import { mkButton } from '../components/marketing';
import { LocalFirst } from './Landing';

export default function Local() {
  return (
    <MarketingLayout>
      <section className="px-4 pt-16 pb-4 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-[clamp(38px,4.6vw,60px)] leading-[1.15] font-black">本機剪輯</h1>
          <p className="mt-4 text-[18px] leading-relaxed text-site-soft">片刻剪趣怎麼在不上傳影片的情況下完成剪輯。</p>
        </div>
      </section>
      <LocalFirst />
      <div className="px-4 pb-28 text-center sm:px-8">
        <Link to="/register" className={mkButton('red', 'lg')}>
          免費開始剪輯 <ArrowRight className="size-5" />
        </Link>
        <p className="mt-4 text-[14px] text-site-mute">免費註冊即享 7 天專業版・不需信用卡</p>
      </div>
    </MarketingLayout>
  );
}
