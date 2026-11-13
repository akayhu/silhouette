import { Link } from 'react-router-dom';
import { SITE_INFO } from '../lib/siteInfo';
import { ContactLine, InfoValue, LegalList, LegalPage, LegalSection } from './legal';

export default function Terms() {
  return (
    <LegalPage title="服務條款" intro="使用片刻剪趣即表示你同意以下條款。條款用白話寫成，重點是：你的作品屬於你、請合法使用素材與聲音、訂閱可以隨時取消。">
      <LegalSection title="一、服務內容">
        <p>片刻剪趣是在瀏覽器執行的線上短影音剪輯工具，包含剪輯、字幕、配音、配樂、AI 自動處理與匯出。免費版與專業版的功能差異以價格頁為準。</p>
      </LegalSection>
      <LegalSection title="二、帳號">
        <p>你需要提供正確的 Email 並妥善保管密碼。帳號下發生的操作視為你本人的操作；發現帳號被盜用請盡快通知我們。</p>
      </LegalSection>
      <LegalSection title="三、訂閱、付款與退款">
        <LegalList
          items={[
            '專業版按月計費、自動續訂，費用以結帳頁顯示為準，價格含稅。',
            '你可以在帳戶設定隨時取消，專業版使用到該期結束，之後不再扣款。',
            '付款後 7 天內，如遇無法正常使用、重複扣款等問題，可以申請退款；單純不想繼續使用請直接取消訂閱，已付的當期費用不退。',
            '新會員的 7 天專業版試用不需要信用卡，試用結束後沒有付費會自動回到免費版。',
          ]}
        />
        <p>
          退款與帳務請聯絡：<ContactLine />
        </p>
      </LegalSection>
      <LegalSection title="四、你的內容與責任">
        <LegalList
          items={[
            '你加入的影片、圖片、音樂與剪輯出的作品，著作權屬於你（或原權利人），我們不主張任何權利。',
            '請只使用你自己拍攝、或已取得授權的素材。移除他人作品的浮水印或字幕再發佈，可能侵害著作權，責任由使用者自行承擔。',
            'AI 聲音請只使用你自己的聲音，或已取得聲音主人同意的錄音。',
            '不得利用本服務製作違法、侵害他人權益或欺騙性的內容。',
            '素材存在你電腦的瀏覽器裡，請自行保留原始檔案；清除瀏覽器資料可能導致需要重新提供素材。',
          ]}
        />
      </LegalSection>
      <LegalSection title="五、內建素材的授權">
        <p>片刻剪趣內建的配樂、音效、貼紙、濾鏡為原創製作，個人與商業影片都能免費使用，不需要標註來源。不得單獨轉售或散佈這些素材檔案本身。</p>
      </LegalSection>
      <LegalSection title="六、服務的提供與限制">
        <p>我們會盡力維持服務穩定，但不保證不中斷或完全沒有錯誤。AI 字幕的準確度會受收音品質影響，發佈前請自行確認內容。剪輯與匯出的速度取決於你的電腦與瀏覽器。在法律允許的範圍內，我們對因使用本服務產生的間接損失不負賠償責任。</p>
      </LegalSection>
      <LegalSection title="七、終止">
        <p>你可以隨時刪除帳號。若帳號被用於違反本條款的行為，我們可以暫停或終止服務。</p>
      </LegalSection>
      <LegalSection title="八、條款變更與適用法律">
        <p>條款有重大變更時，我們會在網站上公告並更新「最後更新」日期。本條款以中華民國法律為準據法。</p>
        <p>
          相關文件：<Link to="/privacy" className="font-bold text-site-red underline underline-offset-4">隱私權政策</Link>。
        </p>
        <p>
          營運主體：<InfoValue value={SITE_INFO.operator} />；聯絡 Email：<ContactLine />
        </p>
      </LegalSection>
    </LegalPage>
  );
}
