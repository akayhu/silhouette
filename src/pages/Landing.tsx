import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, AudioLines, Check, Crop, Crown, Download, Film, Mic, Palette, Scissors, Sparkles, Type, Upload, Wand2 } from 'lucide-react';
import { MarketingLayout } from '../components/Layout';
import { PlanCards } from '../components/Plans';
import { buttonClass } from '../components/ui';

export default function Landing() {
  return (
    <MarketingLayout>
      <Hero />
      <Features />
      <Steps />
      <section id="pricing" className="px-4 py-24 sm:px-6">
        <SectionTitle eyebrow="價格方案" title="先免費剪，需要再升級" sub="新會員註冊就送 7 天專業版，全部功能都能用。之後專業版每月 NT$399，不綁約，隨時可以取消。" />
        <PlanCards />
      </section>
      <Faq />
      <Cta />
    </MarketingLayout>
  );
}

function SectionTitle({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <div className="text-sm font-bold text-coral">{eyebrow}</div>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-ink-soft">{sub}</p>}
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(91_76_245/0.14),transparent)]" />
      <div className="pointer-events-none absolute top-40 -right-32 size-[380px] rounded-full bg-[radial-gradient(closest-side,rgb(255_122_89/0.16),transparent)]" />
      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[13px] font-semibold text-ink-soft shadow-card">
            <Sparkles className="size-3.5 text-coral" /> AI 自動字幕、智能口播、朗讀配音
          </span>
          <h1 className="mt-6 animate-fade-up text-4xl leading-[1.15] font-black tracking-tight text-balance [animation-delay:60ms] sm:text-6xl">
            打開瀏覽器，
            <br className="sm:hidden" />
            <span className="relative whitespace-nowrap text-brand">
              三分鐘
              <svg viewBox="0 0 200 12" className="absolute -bottom-1 left-0 w-full" preserveAspectRatio="none" aria-hidden>
                <path d="M2 9c50-6 140-8 196-3" stroke="var(--color-coral)" strokeWidth="4" fill="none" strokeLinecap="round" />
              </svg>
            </span>
            剪好一支短影音
          </h1>
          <p className="mx-auto mt-6 max-w-xl animate-fade-up text-lg leading-relaxed text-ink-soft [animation-delay:120ms]">
            一看就會的線上剪輯工具。裁剪、上字幕、自動剪掉停頓、文字轉語音，全部在網頁完成。
          </p>
          <div className="mt-8 flex animate-fade-up flex-col justify-center gap-3 [animation-delay:180ms] sm:flex-row">
            <Link to="/register" className={buttonClass('primary', 'lg')}>
              免費開始剪輯 <ArrowRight className="size-4" />
            </Link>
            <a href="#features" className={buttonClass('secondary', 'lg')}>
              看看有哪些功能
            </a>
          </div>
          <p className="mt-4 text-[13px] text-ink-mute">免費註冊即享 7 天專業版・不需信用卡</p>
        </div>
        <EditorMock />
      </div>
    </section>
  );
}

/** 首頁示意圖：用 HTML 畫出編輯器樣貌 */
function EditorMock() {
  return (
    <div className="relative mx-auto mt-16 max-w-5xl animate-fade-up [animation-delay:260ms]">
      <div className="overflow-hidden rounded-[28px] border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="size-3 rounded-full bg-coral/70" />
          <span className="size-3 rounded-full bg-sun" />
          <span className="size-3 rounded-full bg-mint/70" />
          <span className="ml-3 text-xs font-semibold text-ink-mute">我的旅行 vlog・9:16</span>
          <span className="ml-auto rounded-lg bg-brand px-3 py-1 text-xs font-bold text-white">匯出</span>
        </div>
        <div className="grid grid-cols-[1fr_1.1fr] gap-0 sm:grid-cols-[180px_1fr_200px]">
          <div className="hidden space-y-2 border-r border-line bg-canvas p-3 sm:block">
            {['#c7c1ff', '#ffd2c4', '#bfeedd', '#ffe7a8'].map((c, i) => (
              <div key={c} className="flex items-center gap-2 rounded-xl bg-surface p-1.5 shadow-card">
                <div className="h-9 w-12 rounded-lg" style={{ background: `linear-gradient(135deg, ${c}, #fff)` }} />
                <div className="space-y-1">
                  <div className="h-1.5 w-14 rounded bg-line" />
                  <div className="h-1.5 w-8 rounded bg-line/70" />
                </div>
                {i === 0 && <span className="ml-auto size-1.5 rounded-full bg-brand" />}
              </div>
            ))}
          </div>
          <div className="grid place-items-center bg-sunken/70 p-6">
            <div className="relative aspect-[9/16] w-36 overflow-hidden rounded-2xl bg-[linear-gradient(160deg,#a7c6ff,#ffd1bf_60%,#ffe9a8)] shadow-card sm:w-44">
              <div className="absolute inset-x-0 top-[38%] mx-auto size-16 rounded-full bg-white/50 blur-md" />
              <div className="absolute inset-x-3 bottom-[18%] text-center text-[15px] leading-tight font-black text-white [-webkit-text-stroke:5px_#1f1d2b] [paint-order:stroke]">
                今天來到海邊 🌊
              </div>
            </div>
          </div>
          <div className="space-y-3 border-l border-line p-4">
            <div className="text-xs font-bold text-ink-soft">字幕樣式</div>
            <div className="grid grid-cols-3 gap-1.5">
              {['#fff', '#ffc94a', '#ff7a59', '#5b4cf5', '#19b38a', '#1f1d2b'].map((c) => (
                <div key={c} className="h-7 rounded-lg border border-line" style={{ background: c }} />
              ))}
            </div>
            <div className="h-2 rounded-full bg-sunken">
              <div className="h-2 w-2/3 rounded-full bg-brand" />
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-brand-soft p-2 text-[11px] font-bold text-brand">
              <Wand2 className="size-3.5" /> 智能口播：已剪掉 12 段停頓
            </div>
          </div>
        </div>
        <div className="space-y-1.5 border-t border-line bg-canvas p-3">
          <div className="relative flex h-9 gap-1">
            {[28, 18, 34, 20].map((w, i) => (
              <div key={i} className="rounded-lg border-2 border-track-video-edge/40 bg-track-video" style={{ width: `${w}%` }} />
            ))}
            <div className="absolute -top-1 bottom-[-52px] left-[38%] w-0.5 bg-coral" />
          </div>
          <div className="flex h-6 gap-1 pl-[6%]">
            {[14, 22, 16, 18].map((w, i) => (
              <div key={i} className="rounded-md bg-track-caption" style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className="h-6 w-[70%] rounded-md bg-track-audio" />
        </div>
      </div>
    </div>
  );
}

type Spotlight = { eyebrow: string; title: string; body: string; points: string[]; pro?: boolean; visual: ReactNode };

const spotlights: Spotlight[] = [
  {
    eyebrow: 'AI 自動字幕',
    title: '說完話，字幕就上好了',
    body: '不用再一句一句打字幕。AI 會聽寫影片裡的語音，自動產生字幕並放到對應的時間點。',
    points: [
      '語音辨識在你的瀏覽器裡執行，影片不會傳到外部服務',
      '自動轉成繁體中文，並依標點切成好讀的短句',
      '產生後可以逐句修改文字、拖曳時間、統一換樣式',
      '影片原本就有的字幕帶，也能用去水印工具偵測後去除',
    ],
    pro: true,
    visual: <CaptionVisual />,
  },
  {
    eyebrow: '智能口播',
    title: '自動剪掉停頓和「嗯、啊」',
    body: '講話時的空檔和口誤最花剪輯時間。智能口播會分析聲音，找出沒說話的片段一次剪掉，節奏立刻變緊湊。',
    points: [
      '可以調整靜音判定、停頓多久才剪、前後保留多少',
      '先告訴你找到幾段停頓、能剪掉幾秒，確認後再套用',
      '一併剪掉只有「嗯、啊、呃」的口誤字幕',
      '剪完後字幕、貼紙、配音會自動往前對齊；鎖定的軌道保持不動',
    ],
    pro: true,
    visual: <SmartCutVisual />,
  },
  {
    eyebrow: '文字朗讀',
    title: '台灣腔 AI 人聲，還能用你自己的聲音',
    body: '輸入文字，選一個聲音，就能產生自然的中文配音。不想露聲也能做口播影片。',
    points: [
      '內建台灣腔 AI 女聲，也有多款系統中文語音可選',
      '錄一段約 10 秒的朗讀，就能建立自己的 AI 聲音',
      '配音會依句子自動加上字幕，時間完全對齊',
      '已經有字幕的影片，也能一鍵把字幕轉成配音',
    ],
    pro: true,
    visual: <VoiceVisual />,
  },
];

type FeatureItem = { name: string; pro?: boolean };
const featureGroups: { icon: typeof Crop; color: string; title: string; items: FeatureItem[] }[] = [
  {
    icon: Film,
    color: 'bg-brand-soft text-brand',
    title: '剪輯',
    items: [
      { name: '多軌時間軸：字幕、貼紙、主軌、音訊' },
      { name: '分割、修剪、拖曳排序、0.5～3 倍變速' },
      { name: '9:16、16:9、1:1 畫面比例' },
      { name: '畫面縮放、位置、旋轉，九宮格快速對齊' },
      { name: '滑鼠框選多個項目，一次批次編輯' },
      { name: '鎖定軌道，避免誤改已剪好的部分' },
      { name: '復原／重做，自動儲存專案' },
    ],
  },
  {
    icon: Type,
    color: 'bg-coral-soft text-coral',
    title: '字幕與文字',
    items: [
      { name: '6 種字幕樣式範本，一鍵套用' },
      { name: '字型、大小、顏色、描邊、底色、位置都能調' },
      { name: '彈出、淡入、上滑、打字機等進場動畫' },
      { name: '把一句的樣式套用到全部字幕' },
      { name: 'AI 自動字幕（繁體中文）', pro: true },
    ],
  },
  {
    icon: AudioLines,
    color: 'bg-mint-soft text-mint',
    title: '聲音與配音',
    items: [
      { name: '原創無版權配樂 8 首、音效 8 個' },
      { name: '音量調整、淡入淡出' },
      { name: '轉場時聲音自動交叉淡化' },
      { name: '文字朗讀：台灣腔 AI 人聲與系統語音', pro: true },
      { name: '錄音建立自己的 AI 聲音', pro: true },
    ],
  },
  {
    icon: Palette,
    color: 'bg-[#fff6dc] text-[#c98a00]',
    title: '畫面效果',
    items: [
      { name: '35 款原創貼紙，7 種動畫' },
      { name: '14 種濾鏡，可調強度' },
      { name: '亮度、對比、飽和度、色溫、暗角、顆粒微調' },
      { name: '溶解、推移、閃白、圓形展開等 10 種轉場' },
    ],
  },
  {
    icon: Sparkles,
    color: 'bg-brand-soft text-brand',
    title: 'AI 工具',
    items: [
      { name: '智能口播：自動剪掉停頓與口誤', pro: true },
      { name: '去浮水印：自動偵測 Logo 與字幕帶', pro: true },
      { name: '智能填補、模糊、馬賽克三種處理方式', pro: true },
    ],
  },
  {
    icon: Download,
    color: 'bg-coral-soft text-coral',
    title: '匯出與帳戶',
    items: [
      { name: '匯出 MP4，畫面比例和預覽完全一致' },
      { name: '免費版 720p（含浮水印）' },
      { name: '1080p 高畫質、無浮水印', pro: true },
      { name: '專案存在帳戶裡，隨時接著剪' },
    ],
  },
];

function Features() {
  return (
    <section id="features" className="scroll-mt-16 px-4 py-24 sm:px-6">
      <SectionTitle eyebrow="功能" title="剪短影音需要的，這裡都有" sub="從素材到成品，不用在好幾個 App 之間切來切去。" />

      <div className="mx-auto max-w-6xl space-y-20 sm:space-y-28">
        {spotlights.map((f, i) => (
          <div key={f.eyebrow} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className={i % 2 ? 'lg:order-2' : ''}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-coral">{f.eyebrow}</span>
                {f.pro && <ProTag />}
              </div>
              <h3 className="mt-2 text-2xl font-extrabold tracking-tight text-balance sm:text-3xl">{f.title}</h3>
              <p className="mt-3 leading-relaxed text-ink-soft">{f.body}</p>
              <ul className="mt-6 space-y-3">
                {f.points.map((p) => (
                  <li key={p} className="flex gap-3 text-[15px] leading-relaxed">
                    <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className={i % 2 ? 'lg:order-1' : ''}>{f.visual}</div>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-24 max-w-6xl sm:mt-32">
        <div className="mb-10 text-center">
          <h3 className="text-2xl font-extrabold tracking-tight sm:text-3xl">全部功能一覽</h3>
          <p className="mt-2 text-ink-soft">
            標示 <ProTag /> 的是專業版功能，其餘免費版就能使用。
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featureGroups.map((g) => (
            <div key={g.title} className="rounded-3xl border border-line bg-surface p-6 shadow-card">
              <div className="flex items-center gap-3">
                <span className={`grid size-10 place-items-center rounded-xl ${g.color}`}>
                  <g.icon className="size-5" />
                </span>
                <h4 className="text-lg font-extrabold">{g.title}</h4>
              </div>
              <ul className="mt-5 space-y-2.5">
                {g.items.map((it) => (
                  <li key={it.name} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink">
                    <Check className="mt-0.5 size-4 shrink-0 text-mint" strokeWidth={3} />
                    <span>
                      {it.name}
                      {it.pro && <ProTag className="ml-1.5 align-[1px]" />}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProTag({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full bg-coral-soft px-1.5 py-0.5 text-[10px] font-bold text-coral ${className}`}>
      <Crown className="size-2.5" /> 專業版
    </span>
  );
}

// ---------- 功能示意圖（純 HTML 繪製） ----------

function VisualFrame({ children }: { children: ReactNode }) {
  return <div className="rounded-[28px] border border-line bg-[linear-gradient(150deg,#f3f1ff,#fff4ef)] p-5 shadow-card sm:p-8">{children}</div>;
}

function CaptionVisual() {
  const lines = [
    ['00:01', '大家好，歡迎來到我的頻道'],
    ['00:03', '今天要帶你們去吃拉麵'],
    ['00:05', '這家店排隊要一個小時'],
  ];
  return (
    <VisualFrame>
      <div className="grid items-center gap-5 sm:grid-cols-[150px_1fr]">
        <div className="relative mx-auto aspect-[9/16] w-36 overflow-hidden rounded-2xl bg-[linear-gradient(170deg,#b9c9ff,#ffd6c6_60%,#ffeab0)] shadow-card">
          <div className="absolute inset-x-2 bottom-[22%] text-center text-[13px] leading-tight font-black text-white [-webkit-text-stroke:4px_#1f1d2b] [paint-order:stroke]">
            今天要帶你們
            <br />
            去吃拉麵
          </div>
        </div>
        <div className="space-y-2">
          <div className="mb-3 flex h-8 items-center gap-[3px] rounded-xl bg-surface px-3" aria-hidden>
            {[4, 10, 16, 8, 20, 12, 6, 18, 22, 10, 5, 14, 19, 9, 4, 12, 17, 7, 3, 11].map((h, i) => (
              <span key={i} className="w-1 rounded-full bg-brand/60" style={{ height: h }} />
            ))}
          </div>
          {lines.map(([t, text], i) => (
            <div key={t} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${i === 1 ? 'bg-surface shadow-card ring-2 ring-brand' : 'bg-surface/70'}`}>
              <span className="font-mono text-[11px] text-ink-mute">{t}</span>
              <span className="font-semibold">{text}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1 text-xs font-bold text-brand">
            <Sparkles className="size-3.5" /> 已自動產生 3 句字幕
          </div>
        </div>
      </div>
    </VisualFrame>
  );
}

function SmartCutVisual() {
  // 0 = 有說話，1 = 停頓（會被剪掉）
  const segments = [0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0];
  return (
    <VisualFrame>
      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <div className="mb-2 text-xs font-bold text-ink-soft">剪輯前</div>
        <div className="flex h-12 items-center gap-[3px]" aria-hidden>
          {segments.flatMap((silent, i) =>
            Array.from({ length: 5 }, (_, j) => (
              <span
                key={`${i}-${j}`}
                className={`flex-1 rounded-full ${silent ? 'bg-coral/35' : 'bg-brand/70'}`}
                style={{ height: silent ? 4 : 8 + ((i * 7 + j * 13) % 30) }}
              />
            )),
          )}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-mute">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-brand/70" /> 說話
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-coral/50" /> 停頓
          </span>
        </div>
      </div>
      <div className="my-4 flex items-center justify-center gap-2 text-sm font-bold text-ink-soft">
        <Scissors className="size-4 text-coral" /> 找到 4 段停頓，剪掉 6.2 秒
      </div>
      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <div className="mb-2 text-xs font-bold text-ink-soft">剪輯後</div>
        <div className="flex h-12 w-[72%] items-center gap-[3px]" aria-hidden>
          {segments
            .filter((s) => !s)
            .flatMap((_, i) =>
              Array.from({ length: 5 }, (_, j) => (
                <span key={`${i}-${j}`} className="flex-1 rounded-full bg-brand/70" style={{ height: 8 + ((i * 11 + j * 13) % 30) }} />
              )),
            )}
        </div>
      </div>
    </VisualFrame>
  );
}

function VoiceVisual() {
  const voices = [
    { name: '曉涵', desc: '台灣腔 AI 女聲', active: true },
    { name: '我的聲音', desc: '用 10 秒錄音建立' },
    { name: '美佳', desc: '系統語音・女聲' },
  ];
  return (
    <VisualFrame>
      <div className="rounded-2xl bg-surface p-4 shadow-card">
        <div className="text-xs font-bold text-ink-soft">朗讀文字</div>
        <p className="mt-1.5 text-sm leading-relaxed">大家好，今天帶你們去吃拉麵。這家店排隊要一個小時！</p>
      </div>
      <div className="mt-3 grid gap-2">
        {voices.map((v) => (
          <div key={v.name} className={`flex items-center gap-3 rounded-2xl bg-surface p-3 ${v.active ? 'shadow-card ring-2 ring-brand' : 'opacity-80'}`}>
            <span className={`grid size-9 place-items-center rounded-full ${v.active ? 'bg-brand text-white' : 'bg-sunken text-ink-soft'}`}>
              {v.name === '我的聲音' ? <Mic className="size-4" /> : <AudioLines className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">{v.name}</div>
              <div className="text-xs text-ink-mute">{v.desc}</div>
            </div>
            {v.active && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">使用中</span>}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden>
        {['大家好', '今天帶你們去吃拉麵', '這家店排隊要一個小時！'].map((t) => (
          <span key={t} className="rounded-lg bg-track-caption px-2 py-1 text-[11px] font-bold text-[#b2432a]">
            {t}
          </span>
        ))}
        <span className="self-center text-[11px] font-semibold text-ink-mute">← 自動對齊的字幕</span>
      </div>
    </VisualFrame>
  );
}

function Steps() {
  const steps = [
    { icon: Upload, title: '上傳素材', body: '把手機拍的影片、照片、音樂拖進來。' },
    { icon: Wand2, title: '一鍵 AI 處理', body: '自動上字幕、剪掉停頓、產生配音。' },
    { icon: Download, title: '匯出分享', body: '輸出高畫質影片，直接上傳 IG、TikTok。' },
  ];
  return (
    <section className="bg-surface px-4 py-24 sm:px-6">
      <SectionTitle eyebrow="怎麼用" title="三個步驟，從素材到成品" />
      <ol className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="relative rounded-3xl bg-canvas p-7">
            <span className="absolute top-6 right-6 text-5xl font-black text-line">{i + 1}</span>
            <s.icon className="size-7 text-brand" />
            <h3 className="mt-4 text-lg font-extrabold">{s.title}</h3>
            <p className="mt-1.5 text-sm text-ink-soft">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const faqs = [
  ['需要安裝軟體嗎？', '不用。片刻剪趣直接在瀏覽器執行，建議使用最新版 Chrome 或 Edge。'],
  ['AI 自動字幕準確嗎？支援台灣用語嗎？', '使用 Whisper 語音辨識，並自動轉成繁體中文。準確度會受收音品質影響，辨識完可以逐句修改；第一次使用會下載語音模型。'],
  ['配樂、音效、貼紙、濾鏡可以用在商業影片嗎？', '可以。這些都是片刻剪趣原創製作，沒有版權問題，個人與商業影片都能免費使用，也不需要標註來源。'],
  ['可以用自己的聲音配音嗎？', '可以（專業版）。在「朗讀」錄一段約 10 秒的朗讀，就能建立你的 AI 聲音。請只使用自己的聲音，或已取得聲音主人同意的錄音。'],
  ['去浮水印可以處理任何影片嗎？', '請只處理你自己拍攝、或已取得授權的影片。移除他人作品的浮水印或字幕再發佈，可能侵害著作權。'],
  ['免費試用 7 天怎麼算？', '註冊當下就自動開通專業版 7 天，不需要信用卡，期間可以使用全部專業版功能。7 天後沒有付費會自動回到免費版，不會扣款，專案也都會保留。試用期間付款的話，第一個月會從試用結束後開始計算。'],
  ['免費版和專業版差在哪？', '免費版每月 3 個專案、匯出 720p 並帶浮水印；專業版 NT$399／月，不限專案、1080p 無浮水印，AI 功能不限次數。'],
  ['可以隨時取消訂閱嗎？', '可以。在帳戶設定取消後，專業版會使用到這期結束，之後自動回到免費版，不會再扣款。'],
  ['匯出的影片是什麼格式？', '依瀏覽器支援輸出 MP4 或 WebM，畫面比例和你在編輯器選的一樣。'],
];

function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 px-4 py-24 sm:px-6">
      <SectionTitle eyebrow="常見問題" title="還有疑問嗎？" />
      <div className="mx-auto max-w-3xl space-y-3">
        {faqs.map(([q, a]) => (
          <details key={q} className="group rounded-2xl border border-line bg-surface px-5 py-4 shadow-card open:shadow-pop">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold">
              {q}
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sunken text-ink-soft transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-[linear-gradient(120deg,#ecebff,#fff0eb)] px-6 py-16 text-center">
        <h2 className="text-3xl font-black tracking-tight text-balance sm:text-4xl">今天就剪出第一支短影音</h2>
        <p className="mt-3 text-ink-soft">免費註冊，立即享有 7 天專業版，不需信用卡。</p>
        <Link to="/register" className={buttonClass('primary', 'lg', 'mt-8')}>
          免費開始剪輯 <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
