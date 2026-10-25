import { MarketingLayout } from '../components/Layout';
import { PlanCards } from '../components/Plans';

export default function Pricing() {
  return (
    <MarketingLayout>
      <section className="px-4 py-20 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">簡單的價格</h1>
          <p className="mt-3 text-lg text-ink-soft">免費開始，需要 AI 功能和高畫質匯出時再升級。</p>
        </div>
        <PlanCards />
        <p className="mt-10 text-center text-sm text-ink-mute">價格含稅．按月計費，隨時可取消</p>
      </section>
    </MarketingLayout>
  );
}
