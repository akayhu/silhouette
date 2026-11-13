import { SITE_INFO } from '../lib/siteInfo';
import { ContactLine, InfoValue, LegalList, LegalPage, LegalSection } from './legal';

export default function Privacy() {
  return (
    <LegalPage
      title="隱私權政策"
      intro={
        <>
          <strong className="font-black text-site-ink">白話摘要：</strong>
          你的影片、圖片和音樂不會上傳，只存在你自己的電腦瀏覽器。我們只保存帳戶資料、專案內容（剪輯、字幕、設定）、你主動存到帳戶的匯出影片、你建立的 AI 聲音樣本，以及付款紀錄。不放廣告追蹤，也不賣你的資料。刪除帳號時，除了付款紀錄之外會一併刪除。
        </>
      }
    >
      <LegalSection title="一、我們蒐集什麼資料">
        <LegalList
          items={[
            '帳戶資料：Email、顯示名稱、密碼（加密後儲存，我們看不到原始密碼）。用 Google 帳號登入時，我們會收到 Google 提供的 Email 與名稱。',
            '登入狀態：讓你保持登入的工作階段資料。',
            '專案內容：剪輯內容、字幕文字、設定與縮圖。你的影片、圖片、音樂檔案本身不在其中。',
            '你主動存到帳戶的匯出影片：只有按下「存到帳戶」才會上傳。',
            'AI 聲音樣本：你建立專屬 AI 聲音時提供的約 10 秒錄音與朗讀文字。',
            '付款紀錄：付款金額、時間與信用卡末四碼。完整卡號由金流服務商處理，我們不會取得、也不會儲存。',
          ]}
        />
      </LegalSection>
      <LegalSection title="二、哪些資料不會離開你的電腦">
        <p>你加入的影片、圖片和音樂，以及 AI 字幕辨識、雙語翻譯、算圖和匯出的處理過程，都在你的瀏覽器裡進行，不會傳到我們的伺服器。素材檔案存在這台電腦的瀏覽器儲存空間；清除瀏覽器資料或換電腦後，需要重新提供素材。</p>
      </LegalSection>
      <LegalSection title="三、我們怎麼使用資料">
        <LegalList
          items={[
            '提供服務：登入、保存與同步你的專案、處理訂閱與付款。',
            '寄送必要通知：信箱驗證、重設密碼等交易型信件。',
            '客服與帳務：處理你的詢問、退款與帳號問題。',
          ]}
        />
        <p>我們不會把你的資料出售給第三方，也不會用來投放廣告。</p>
      </LegalSection>
      <LegalSection title="四、委託的服務商">
        <LegalList
          items={[
            '綠界科技（ECPay）：處理信用卡付款。',
            'Resend：寄送驗證信與重設密碼信。',
            'Google：提供「使用 Google 帳號登入」，以及網頁字型（載入字型時 Google 會看到你的連線資訊）。',
          ]}
        />
        <p>以上服務商只取得完成該項服務所需的最少資料。</p>
      </LegalSection>
      <LegalSection title="五、Cookie 與本機儲存">
        <p>我們使用 Cookie 保持你的登入，並在瀏覽器本機儲存介面偏好（例如深淺色、匯出設定、預設字幕樣式）與你的素材檔案。網站不使用廣告或行為追蹤的 Cookie，也沒有放置第三方流量分析工具。</p>
      </LegalSection>
      <LegalSection title="六、保存與刪除">
        <LegalList
          items={[
            '你可以在帳戶頁隨時「下載我的所有資料」。',
            '你可以在帳戶頁自行刪除帳號：會一併刪除專案、上傳的檔案、AI 聲音樣本與登入狀態。',
            '付款紀錄不會隨帳號刪除，因為會計與稅務對帳需要保存，保存期間依相關法令規定。',
          ]}
        />
      </LegalSection>
      <LegalSection title="七、你的權利">
        <p>依個人資料保護法，你可以請求查詢、閱覽、製給複製本、補充或更正、停止蒐集處理利用，或刪除你的個人資料。多數操作可以直接在帳戶頁完成，其他請求請寄信給我們。</p>
      </LegalSection>
      <LegalSection title="八、政策變更與聯絡">
        <p>政策有重大變更時，我們會在網站上公告並更新「最後更新」日期。</p>
        <p>
          營運主體：<InfoValue value={SITE_INFO.operator} />
        </p>
        <p>
          聯絡 Email：<ContactLine />
        </p>
      </LegalSection>
    </LegalPage>
  );
}
