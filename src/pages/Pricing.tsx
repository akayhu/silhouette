import { Link } from 'react-router-dom';
import { MarketingLayout } from '../components/Layout';
import { PlanCards } from '../components/Plans';

export default function Pricing() {
  return (
    <MarketingLayout>
      <section className="px-4 pt-16 pb-28 sm:px-8">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h1 className="text-[clamp(38px,4.6vw,60px)] leading-[1.15] font-black">簡單的價格</h1>
          <p className="mt-4 text-[18px] leading-relaxed text-site-soft">註冊就送 7 天專業版，試用期間 AI 功能、1080p 匯出全部開放。</p>
        </div>
        <PlanCards />
        <p className="mt-12 text-center text-[14px] text-site-soft">價格含稅．按月計費，隨時可取消</p>
        <div className="mx-auto mt-14 grid max-w-[1000px] gap-6 md:grid-cols-2">
          <div className="rounded-[24px] border border-site-line p-6">
            <h2 className="text-[18px] font-black">使用前先確認</h2>
            <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-site-soft">
              <li>・電腦版最新 Chrome 或 Edge，螢幕寬度建議 1024 像素以上</li>
              <li>・剪輯與匯出都在你的電腦上進行，速度看電腦效能，不用安裝軟體</li>
              <li>・第一次使用 AI 字幕會下載語音模型，需要連網</li>
              <li>・手機、平板目前不適合剪輯</li>
            </ul>
          </div>
          <div className="rounded-[24px] border border-site-line p-6">
            <h2 className="text-[18px] font-black">付款與退款</h2>
            <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-site-soft">
              <li>・按月計費，帳戶設定裡隨時可以取消，用到這期結束後不再扣款</li>
              <li>
                ・付款後 7 天內遇到無法正常使用、重複扣款等問題，可以申請退款，聯絡方式在
                <Link to="/about#contact" className="font-bold text-site-red underline underline-offset-4">關於我們</Link>
              </li>
              <li>・單純不想繼續使用請直接取消訂閱，已付的當期費用不退</li>
              <li>・免費版與 7 天專業版試用都不需要信用卡</li>
            </ul>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
