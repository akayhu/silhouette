import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { mkButton } from '../components/marketing';
import { SITE_INFO } from '../lib/siteInfo';
import { ContactLine, InfoValue, LegalList, LegalPage, LegalSection } from './legal';

export default function About() {
  return (
    <LegalPage title="關於片刻剪趣" intro="片刻剪趣是一個在瀏覽器裡完成的短影音剪輯工具：剪空拍、上繁體中文字幕、配音、配樂，影片留在你的電腦，不用安裝軟體。">
      <LegalSection title="我們想解決什麼">
        <p>剪一支短影音，最花時間的往往不是創意，而是剪空拍、打字幕、對時間這些重複的工作。片刻剪趣把這些先交給自動處理，你只要挑版本、微調就能發佈。</p>
      </LegalSection>
      <LegalSection title="我們堅持的做法">
        <LegalList
          items={[
            '本機優先：你的影片、圖片和音樂只存在你的電腦瀏覽器裡，剪輯、AI 字幕、算圖和匯出都在瀏覽器完成，不會上傳到我們的伺服器。',
            '你的作品你帶走：可以在帳戶頁下載自己的所有資料，匯出的成品存在你自己的電腦；原始影片不會被改動。',
            '素材可放心商用：配樂、音效、貼紙、濾鏡都是原創製作，個人與商業影片都能免費使用。',
            '價格講清楚：免費版可以一直用，專業版每月 NT$399，隨時可以取消，退款條件寫在價格頁。',
          ]}
        />
      </LegalSection>
      <LegalSection id="contact" title="營運與聯絡方式">
        <p>
          營運主體：<InfoValue value={SITE_INFO.operator} />
        </p>
        <p>
          聯絡 Email：<ContactLine />
        </p>
        <p>帳務、退款、帳號問題與個資請求，都可以寄信到上面的信箱；信中請附上註冊用的 Email，方便我們查詢。</p>
      </LegalSection>
      <LegalSection title="相關文件">
        <p>
          <Link to="/privacy" className="font-bold text-site-red underline underline-offset-4">隱私權政策</Link>
          、
          <Link to="/terms" className="font-bold text-site-red underline underline-offset-4">服務條款</Link>
          、
          <Link to="/local" className="font-bold text-site-red underline underline-offset-4">本機剪輯怎麼運作</Link>
        </p>
      </LegalSection>
      <div>
        <Link to="/register" className={mkButton('red', 'lg')}>
          免費開始剪輯 <ArrowRight className="size-5" />
        </Link>
      </div>
    </LegalPage>
  );
}
