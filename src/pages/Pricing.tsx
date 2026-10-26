import { MarketingLayout } from '../components/Layout';
import { PlanCards } from '../components/Plans';

export default function Pricing() {
  return (
    <MarketingLayout>
      <section className="px-4 pt-16 pb-28 sm:px-8">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h1 className="text-[clamp(38px,4.6vw,60px)] leading-[1.1] font-black tracking-[-0.02em]">簡單的價格</h1>
          <p className="mt-4 text-[18px] leading-relaxed text-receipt-soft">註冊就送 7 天專業版，試用期間 AI 功能、1080p 匯出全部開放。</p>
        </div>
        <PlanCards />
        <p className="mt-12 text-center text-[14px] text-receipt-soft">價格含稅．按月計費，隨時可取消</p>
      </section>
    </MarketingLayout>
  );
}
