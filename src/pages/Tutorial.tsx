import { useState, type ComponentType } from 'react';
import {
  ArrowRightLeft,
  AudioLines,
  Film,
  ListChecks,
  Palette,
  Scissors,
  Sparkles,
  Type,
  Upload,
} from 'lucide-react';
import { AppLayout } from '../components/Layout';
import { ProBadge } from '../components/ui';

type Group = {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  intro: string;
  steps: string[];
  tool: string;
  toolIcon: ComponentType<{ className?: string }>;
  rows: { label: string; tag?: string; pro?: boolean }[];
};

const GROUPS: Group[] = [
  {
    id: 'basics',
    title: '剪輯基礎',
    icon: Scissors,
    intro: '先把素材放進時間軸，再用分割、裁剪、拖曳排好順序，這是每支影片都會用到的第一步。',
    steps: [
      '點左側工具列的「素材」，上傳影片、圖片或音訊，也可以直接從音樂庫選一首配樂或音效',
      '把素材拖到下方時間軸對應的軌道：主軌放影片畫面，疊加軌放子母畫面，音訊軌放配樂、人聲或音效',
      '點選片段後，用上方工具或快捷鍵 ⌘/Ctrl+B 在播放頭分割、Q／W 裁掉左右多餘的部分、Delete 刪除',
      '在右上角切換畫面比例：9:16 直式、16:9 橫式、1:1 方形',
      '拖曳片段調整順序，主軌片段會自動磁吸相接，不留空隙',
    ],
    tool: '素材',
    toolIcon: Film,
    rows: [
      { label: '上傳影片、圖片、音訊' },
      { label: '原創無版權配樂', tag: '50 首' },
      { label: '原創音效', tag: '50 個' },
      { label: '畫面比例 9:16／16:9／1:1' },
    ],
  },
  {
    id: 'captions',
    title: '字幕與文字',
    icon: Type,
    intro: 'AI 自動聽寫字幕，省下逐句打字和對時間的功夫；想精修的話，手動調整也很直覺。',
    steps: [
      '點工具列「字幕」，按「AI 自動字幕」讓 AI 聽寫產生繁體中文字幕（辨識在瀏覽器裡執行，影片不會外傳）',
      '選一款字幕樣式範本，或自己調字型、大小、顏色、描邊、底色、陰影',
      '直接在預覽畫面拖曳字幕位置；選進場動畫，像是卡拉 OK 逐字亮起、打字機效果',
      '要精修對時：選取字幕，按 [ 把開始設到播放頭，按 ] 設結束',
      '切到「文字剪輯」分頁，在逐字稿上刪掉字或句子，影片就同步剪掉那一段',
    ],
    tool: '字幕',
    toolIcon: Type,
    rows: [
      { label: 'AI 自動字幕', pro: true },
      { label: '字幕樣式範本', tag: '9 款' },
      { label: '進場動畫', tag: '5 種' },
      { label: '雙語字幕', pro: true },
    ],
  },
  {
    id: 'audio',
    title: '聲音與配音',
    icon: AudioLines,
    intro: '配樂、音效、AI 朗讀配音，或是錄一段自己的聲音，都在同一個地方處理。',
    steps: [
      '工具列「音樂」選一首無版權配樂或音效，拖進音訊軌，也可以上傳自己的音樂，長度會自動配合影片',
      '工具列「朗讀」輸入文字，選台灣腔 AI 人聲或系統語音，產生配音並自動加上對齊的字幕',
      '錄一段約 10 秒的聲音，就能建立自己的 AI 聲音；也能用麥克風直接錄一段口白並選自動降噪',
      '調整每段音訊的音量、淡入淡出；片段轉場的地方聲音會自動交叉淡化',
    ],
    tool: '朗讀',
    toolIcon: AudioLines,
    rows: [
      { label: '台灣腔 AI 人聲與系統語音', pro: true },
      { label: '錄 10 秒建立專屬 AI 聲音', pro: true },
      { label: '錄音上字幕', pro: true },
      { label: '音量、淡入淡出、交叉淡化' },
    ],
  },
  {
    id: 'visuals',
    title: '畫面效果',
    icon: Palette,
    intro: '濾鏡、美肌、轉場、貼紙和片段動態，讓畫面更有風格、銜接更順。',
    steps: [
      '工具列「濾鏡」選一種套用，拖曳調整強度，或微調亮度、對比、飽和度、色溫、暗角、顆粒',
      '工具列「美肌」套用磨皮、美白、紅潤等預設，也可以個別微調強度',
      '工具列「轉場」在兩個片段交界處選一種轉場效果，像是淡入淡出、滑動、縮放',
      '在右側屬性面板設定片段動態：慢慢放大、縮小、特寫推近、震動',
      '工具列「貼紙」把原創手繪貼紙拖到畫面上，設定出場動畫，像是彈出、搖晃、飄浮',
    ],
    tool: '濾鏡',
    toolIcon: Palette,
    rows: [
      { label: '濾鏡，可調強度', tag: '30 種' },
      { label: '轉場效果', tag: '25 種' },
      { label: '原創手繪貼紙', tag: '60 款' },
      { label: '片段動態', tag: '4 種' },
    ],
  },
  {
    id: 'ai',
    title: 'AI 自動處理',
    icon: Sparkles,
    intro: '最花時間的剪空拍、挑片段、上字幕，交給 AI 先做一版，你再微調就好。',
    steps: [
      '工具列「智能剪輯」選一個模板，一鍵剪掉空拍、上字幕、加花字、配樂和音效',
      '工具列「智能混剪」一次選多支素材，AI 自動幫每支挑一段接起來：有講話的留講話段，沒講話的留動態最多的畫面',
      '工具列「AI 工具」裡的智能口播，一鍵剪掉說話的停頓和「嗯、啊」之類的口誤',
      '工具列「智能全消」自動偵測畫面上的 Logo、浮水印或燒錄字幕，用模糊或馬賽克處理（請只用在你有權使用的影片）',
    ],
    tool: '智能剪輯',
    toolIcon: Sparkles,
    rows: [
      { label: '智能剪輯模板', tag: '20 個', pro: true },
      { label: '智能混剪', pro: true },
      { label: '智能口播：剪掉停頓', pro: true },
      { label: '智能全消：去水印、去字幕', pro: true },
    ],
  },
  {
    id: 'export',
    title: '匯出與帳戶',
    icon: Upload,
    intro: '剪完設定封面、選畫質就能匯出；專案會自動存進帳戶，換裝置也能接著剪。',
    steps: [
      '點右上角「匯出」，確認畫質：免費版 720p（含浮水印）、專業版 1080p（無浮水印）',
      '設定影片封面：從時間軸挑一格畫面，或上傳一張圖片，再加上封面標題',
      '匯出完成會存進帳戶的「匯出紀錄」，之後可以隨時回來下載',
      '剪輯內容、字幕和設定會自動同步到帳戶；換裝置時重新選回原本的素材檔，就能接著剪（影片本身不會上傳到伺服器）',
    ],
    tool: '匯出',
    toolIcon: Upload,
    rows: [
      { label: '720p，含浮水印' },
      { label: '1080p，無浮水印', pro: true },
      { label: '封面：挑一格畫面或上傳圖片' },
      { label: '專案自動存檔同步帳戶' },
    ],
  },
];

export default function Tutorial() {
  const [active, setActive] = useState(GROUPS[0].id);
  return (
    <AppLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">使用教學</h1>
        <p className="mt-2 text-ink-soft">片刻剪趣的所有功能怎麼操作，照著下面的步驟做就能上手。</p>
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
          <section key={g.id} id={g.id} className="scroll-mt-20 grid gap-8 rounded-3xl border border-line bg-surface p-6 sm:p-8 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand">
                  <g.icon className="size-5" />
                </span>
                <h2 className="text-xl font-black">{g.title}</h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{g.intro}</p>
              <ol className="mt-5 space-y-3">
                {g.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink/5 text-xs font-bold text-ink-soft">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
            <DemoPanel group={g} />
          </section>
        ))}
      </div>
    </AppLayout>
  );
}

/** 示範圖：簡化版的編輯器畫面（工具列 + 面板內容），用來示意這個功能在哪裡、長什麼樣子 */
function DemoPanel({ group }: { group: Group }) {
  const tools: { label: string; icon: ComponentType<{ className?: string }> }[] = [
    { label: '素材', icon: Film },
    { label: '字幕', icon: Type },
    { label: '朗讀', icon: AudioLines },
    { label: '濾鏡', icon: Palette },
    { label: '智能剪輯', icon: Sparkles },
    { label: '匯出', icon: Upload },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-ink/[0.03]">
      <div className="flex items-center gap-1 border-b border-line bg-surface px-3 py-2">
        <span className="size-2.5 rounded-full bg-coral/70" />
        <span className="size-2.5 rounded-full bg-amber-400/70" />
        <span className="size-2.5 rounded-full bg-mint/70" />
        <span className="ml-3 text-xs font-semibold text-ink-mute">片刻剪趣｜編輯器</span>
      </div>
      <div className="flex">
        <div className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-3">
          {tools.map((t) => {
            const isActive = t.label === group.tool;
            return (
              <div
                key={t.label}
                className={`flex w-full flex-col items-center gap-1 px-1 py-2 text-center text-[10px] font-semibold ${
                  isActive ? 'bg-brand-soft text-brand' : 'text-ink-mute'
                }`}
              >
                <t.icon className="size-4" />
                {t.label}
              </div>
            );
          })}
        </div>
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
            <group.toolIcon className="size-3.5 text-brand" /> {group.tool}
          </div>
          <ul className="mt-3 space-y-2">
            {group.rows.map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2.5 text-xs shadow-card">
                <span className="flex items-center gap-1.5 font-semibold text-ink">
                  {r.label}
                  {r.pro && <ProBadge />}
                </span>
                {r.tag && <span className="shrink-0 text-ink-mute">{r.tag}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-4 h-10 rounded-xl bg-surface shadow-card" aria-hidden>
            <div className="flex h-full items-center gap-1 px-2">
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} className="h-full w-1.5 shrink-0 rounded-full bg-brand/15" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-mute">
            <ListChecks className="size-3" /> 時間軸示意
            <ArrowRightLeft className="ml-auto size-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
