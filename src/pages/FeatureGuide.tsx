import { useState, type ComponentType } from 'react';
import { AudioLines, LayoutTemplate, Palette, Scissors, Sparkles, Type, Upload } from 'lucide-react';
import { AppLayout } from '../components/Layout';
import { ProBadge } from '../components/ui';
import { SMART_TEMPLATES } from '../lib/templates';

type Feature = { name: string; desc: string; pro?: boolean };
type Group = { id: string; title: string; icon: ComponentType<{ className?: string }>; intro: string; items: Feature[] };

const GROUPS: Group[] = [
  {
    id: 'workspace',
    title: '編輯器介面',
    icon: LayoutTemplate,
    intro: '熟悉編輯器的版面配置，操作其他功能時會更順手。',
    items: [
      { name: '頂部工具列', desc: '專案名稱、自動儲存狀態、復原／重做、畫面比例和「匯出」都在這一列，隨時掌握剪輯進度。' },
      { name: '時間軸與軌道', desc: '字幕、貼紙、疊加、主軌、音訊共 5 條軌道，各自獨立可以分別鎖定、靜音，避免互相干擾。' },
      { name: '預覽畫面', desc: '播放、短影音安全框參考線、縮放都在這裡，隨時確認畫面在手機上看起來的樣子。' },
      { name: '版面切換', desc: '可以把預覽畫面換到上方或右側，依個人習慣調整工作區配置。' },
      { name: '深色介面', desc: '長時間剪輯時，深色模式對眼睛比較舒服，一鍵切換。' },
      { name: '四步引導模式', desc: '剛開始不熟悉介面時，可以切成引導模式，只看到剪輯、字幕、音樂、匯出四個精簡步驟。' },
      { name: '快捷鍵', desc: '按 ? 打開完整快捷鍵列表，熟悉後剪輯速度會快很多。' },
    ],
  },
  {
    id: 'basics',
    title: '剪輯',
    icon: Scissors,
    intro: '多軌時間軸是整個編輯器的核心，素材、字幕、貼紙、配樂都排在這裡，互不干擾。',
    items: [
      { name: '多軌時間軸', desc: '字幕、貼紙、疊加、主軌、音訊共 5 軌，各自獨立，可以分別鎖定、靜音。' },
      { name: '分割、修剪、拖曳排序', desc: '把素材剪成你要的樣子，拖一拖就能換順序，主軌片段會自動相接不留空隙。' },
      { name: '變速 0.5～3 倍', desc: '想要慢動作強調重點，或加快枯燥的片段，影片和音訊片段都能調整。' },
      { name: '畫面比例 9:16／16:9／1:1', desc: '依發佈平台選對的尺寸，Reels、TikTok、YouTube、IG 貼文都照顧到。' },
      { name: '疊加軌，不限層數', desc: '子母畫面、多層畫面堆疊都做得到，適合畫面講解搭配示範。' },
      { name: '畫面縮放、位置、旋轉', desc: '九宮格對齊輔助，精準調整每個片段在畫面上的位置。' },
      { name: '滑鼠框選批次編輯', desc: '一次選多個片段同時調整，不用一個一個改。' },
      { name: '鎖定軌道', desc: '剪好的部分鎖起來，之後編輯別的軌道時不會不小心誤改。' },
      { name: '時間軸標記', desc: '按 M 先標出重點位置，之後要對齊、跳轉更快，不需要時點一下刪除。' },
      { name: '預覽參考線', desc: '短影音安全框、垂直水平中線，確保重要內容不會被平台介面（按讚、留言按鈕）擋住。' },
      { name: '自動儲存、復原／重做', desc: '每個動作都能復原，剪壞了也不怕，專案也會自動存檔。' },
    ],
  },
  {
    id: 'captions',
    title: '字幕與文字',
    icon: Type,
    intro: '字幕是短影音最重要的元素之一，片刻剪趣把從聽打到對時間的麻煩都處理掉。',
    items: [
      { name: 'AI 自動字幕', desc: '影片裡講的話自動聽寫成繁體中文字幕，辨識在你的瀏覽器裡執行，影片不會外傳。', pro: true },
      { name: '字幕樣式範本', desc: '9 款現成樣式，不用自己從零調，選一款套用就有質感。' },
      { name: '完整自訂樣式', desc: '字型、大小、顏色、描邊、底色、陰影都能改，搭配選色器用色碼、滴管、透明度精準調色。' },
      { name: '預覽畫面直接拖曳', desc: '字幕位置所見即所得，不用猜座標。' },
      { name: '進場動畫', desc: '淡入、彈出、上滑、打字機、卡拉 OK 逐字亮起，共 5 種，讓字幕更有節奏感。' },
      { name: '一句套用到全部', desc: '喜歡某句字幕的樣式，一鍵套到所有字幕，不用一句一句調整。' },
      { name: '花字庫', desc: '選一句字幕，從花字庫挑一款現成的花字樣式直接套用，不用自己調字型顏色和特效。' },
      { name: '貼上講稿自動對時', desc: '有逐字稿的話直接貼上，字幕文字照講稿、時間自動對準實際說話，不用逐字校對。', pro: true },
      { name: '文字剪輯', desc: '在逐字稿上刪掉字或句子，影片就同步剪掉那一段，比在時間軸上找片段快很多。' },
      { name: '雙語字幕', desc: '一鍵把字幕翻成英文，顯示在原文下方，匯出 SRT／VTT 字幕檔也會一併帶上。', pro: true },
      { name: '字幕對時快捷鍵', desc: '按 [ ／ ] 把字幕開始、結束設在播放頭位置，比滑鼠拖曳精準快速。' },
      { name: '字幕品質檢查', desc: '自動抓出讀不完、重疊、太短、太長、字級太大畫面放不下的字幕，一鍵修正或自己調整。' },
      { name: '字幕關鍵字自動變色', desc: '數字、百分比、「最」「超」「限時」等重點字詞自動上色強調，不用自己一個一個挑。' },
    ],
  },
  {
    id: 'audio',
    title: '聲音與配音',
    icon: AudioLines,
    intro: '配樂、音效、AI 配音到自己錄音，聲音相關的素材和處理都在同一個地方。',
    items: [
      { name: '原創無版權配樂、音效', desc: '配樂 50 首、音效 50 個，不用擔心版權問題，直接拖進時間軸用。' },
      { name: '上傳自己的音樂', desc: '長度會自動配合影片，不用自己剪音樂片段。' },
      { name: '音量、淡入淡出', desc: '片段交界處會自動交叉淡化，聲音銜接自然，不會忽大忽小。' },
      { name: '配樂自動閃避人聲', desc: '偵測到有人說話或朗讀時，配樂自動變小聲，講完再回到原本音量，不用自己手動調整音量曲線。' },
      { name: '朗讀音量自動拉齊', desc: '多段配音或錄音音量大小不一致時，一鍵分析並拉到同一個音量，聽起來更一致。' },
      { name: '文字朗讀配音', desc: '打字就能生成台灣腔 AI 人聲或系統語音配音，會依句子自動加上對齊的字幕，不用自己錄音。', pro: true },
      { name: '建立專屬 AI 聲音', desc: '錄一段約 10 秒的聲音，就能用自己的聲音生成 AI 配音，影片聽起來更像本人在講。', pro: true },
      { name: '錄音上字幕', desc: '用麥克風直接錄一段口白加到音訊軌，可選自動降噪，還能用瀏覽器內建語音辨識產生對齊時間的字幕。', pro: true },
    ],
  },
  {
    id: 'visuals',
    title: '畫面效果',
    icon: Palette,
    intro: '濾鏡、轉場、貼紙和動態效果，讓畫面更有風格、片段銜接更順。',
    items: [
      { name: '濾鏡，可調強度', desc: '30 種濾鏡，快速統一整支影片的色調氛圍。' },
      { name: '畫質微調', desc: '亮度、對比、飽和度、色溫、暗角、顆粒，給想精修畫面的人用的進階選項。' },
      { name: '轉場效果', desc: '25 種轉場，讓片段銜接更流暢，不會太生硬。' },
      { name: '片段動態', desc: '慢慢放大、縮小、特寫推近、震動，共 4 種，幫靜態畫面加點動感。' },
      { name: '美肌', desc: '磨皮、美白、紅潤 4 種預設，可個別微調強度；主軌和疊加片段都能用。' },
      { name: '降噪', desc: '濾掉低頻悶響、講話停頓時壓低背景雜訊、人聲增豔，強度可調，讓收音更接近錄音室效果。' },
      { name: '原創手繪貼紙', desc: '60 款貼紙、6 種出場動畫，幫畫面加點個性和重點強調。' },
      { name: '智能取景', desc: '裁成「填滿畫面」時，自動分析畫面動態找出重點位置來裁切，不再永遠置中。' },
    ],
  },
  {
    id: 'ai',
    title: 'AI 自動處理',
    icon: Sparkles,
    intro: '最花時間的挑片段、剪空拍、上字幕，交給 AI 先幫你做好，你再微調就好。',
    items: [
      { name: '一鍵自動剪輯', desc: '不用選模板：自動剪掉空拍和「嗯、啊」、講錯重講只留後面那次，辨識字幕，依內容挑最像的模板，花字、配樂和音效一次配好，之後每一項都能調整、也能一鍵復原。', pro: true },
      { name: '智能混剪', desc: '一次選多支素材，AI 自動幫每支挑一段接起來：有講話的留講話段，沒講話的留畫面動態最多的一段，省去自己一支支挑的時間。', pro: true },
      { name: '智能剪輯模板', desc: `${SMART_TEMPLATES.length} 個模板，一鍵套用剪空拍、上字幕、加花字、配樂和音效的完整剪輯公式。`, pro: true },
      { name: '上傳後自動剪輯', desc: '影片上傳完自動幫你剪掉沒人說話的空拍、講錯重來的重複口白，上好字幕，讓你選剪輯前或剪輯後的版本。', pro: true },
      { name: 'AI 自動剪輯', desc: '依聲音起伏和字幕內容，自動加上特寫、運鏡、轉場、字幕動畫和貼紙，讓剪輯更有層次。', pro: true },
      { name: '智能口播', desc: '自動剪掉說話的停頓和「嗯、啊」之類的口誤，口播類影片最省時間的功能。', pro: true },
      { name: '智能全消', desc: '自動偵測並清除畫面上的 Logo、浮水印或燒錄字幕，模糊、馬賽克兩種方式（請只用在你有權使用的影片）。', pro: true },
      { name: '開場強度檢查', desc: '分析開場前幾秒的畫面動態，太弱的話提醒你換成動態較強的片段開場，避免觀眾一開始就滑走。' },
      { name: '鏡頭相似度檢查', desc: '相鄰片段的畫面色調、構圖太接近時提醒你，可能看不太出來有剪接，可以加轉場或換個鏡位。' },
    ],
  },
  {
    id: 'export',
    title: '匯出與帳戶',
    icon: Upload,
    intro: '剪完怎麼匯出、換裝置能不能接著剪，這裡一次說清楚。',
    items: [
      { name: '免費版畫質', desc: '720p，含浮水印，一般分享已經很夠用。' },
      { name: '高畫質、無浮水印', desc: '1080p，適合正式發佈到各平台。', pro: true },
      { name: '指定檔案大小上限', desc: '傳訊息或平台有大小限制時，匯出前選 10／25／50／100 MB，自動調整畫質壓進去；影片太長壓不進去會直接告訴你，不會偷偷降到很糊。' },
      { name: '匯出跟預覽一致', desc: '所見即所得，不會匯出結果跟編輯時看到的不一樣。' },
      { name: '影片封面', desc: '從時間軸挑一格畫面，或上傳一張圖片，加上封面標題，讓平台抓到吸睛的封面。' },
      { name: '本機剪輯', desc: '原始影片留在你的電腦，不必上傳；剪輯、算圖、匯出都在你的瀏覽器裡完成。' },
      { name: '匯出前整體混音量檢查', desc: '口白、配樂、音效個別調好音量後，疊在一起可能還是太小聲或太吵，匯出前會提醒並可一鍵調整整體音量。' },
      { name: '專案存在帳戶裡', desc: '剪輯內容、字幕和設定會自動同步；換裝置時重新選回原本的素材檔即可接著剪。' },
      { name: '專案搜尋與排序', desc: '專案變多了可以在「我的專案」用名稱搜尋，也能切換依最近更新或名稱排序，快速找到要剪的專案。' },
    ],
  },
];

export default function FeatureGuide() {
  const [active, setActive] = useState(GROUPS[0].id);
  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">功能介紹</h1>
        <p className="mt-2 text-ink-soft">片刻剪趣有哪些功能、能幫你做到什麼。想知道怎麼操作，可以到「教學」頁看步驟。</p>
      </div>

      <div className="flex flex-wrap gap-1.5 rounded-2xl bg-sunken p-1.5">
        {GROUPS.map((g) => (
          <a
            key={g.id}
            href={`#${g.id}`}
            onClick={() => setActive(g.id)}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition ${
              active === g.id ? 'bg-surface text-brand shadow-card' : 'text-ink-soft hover:text-ink'
            }`}
          >
            <g.icon className="size-4" /> {g.title}
          </a>
        ))}
      </div>

      <div className="mt-8 space-y-10">
        {GROUPS.map((g) => (
          <section key={g.id} id={g.id} className="scroll-mt-20 rounded-3xl border border-line bg-surface p-6 sm:p-8">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand">
                <g.icon className="size-5" />
              </span>
              <h2 className="text-xl font-black">{g.title}</h2>
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">{g.intro}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {g.items.map((it) => (
                <div key={it.name} className="rounded-2xl bg-sunken p-4">
                  <div className="flex items-center gap-1.5 text-sm font-bold">
                    {it.name}
                    {it.pro && <ProBadge />}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{it.desc}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppLayout>
  );
}
