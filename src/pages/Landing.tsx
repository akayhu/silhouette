import { Link } from 'react-router-dom';
import { ArrowRight, AudioLines, Captions, Crop, Scissors, Sparkles, Upload, Wand2, Download } from 'lucide-react';
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
        <SectionTitle eyebrow="價格方案" title="先免費剪，需要再升級" sub="不綁約，隨時可以取消。專業版每月 NT$399。" />
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
          <p className="mt-4 text-[13px] text-ink-mute">不需信用卡．免費版每月 3 個專案</p>
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

const features = [
  { icon: Crop, color: 'bg-brand-soft text-brand', title: '裁剪與分割', body: '拖曳邊緣修剪片段，一鍵在播放點分割。調整速度、切換 9:16、16:9、1:1 比例。' },
  { icon: Captions, color: 'bg-coral-soft text-coral', title: '字幕', body: 'AI 聽寫影片自動上字幕，也能手動輸入。字型、顏色、描邊、位置、進場動畫都能調。' },
  { icon: Scissors, color: 'bg-mint-soft text-mint', title: '智能口播', body: '自動找出沒說話的空檔和「嗯、啊」口誤，一鍵剪掉，節奏立刻變緊湊。' },
  { icon: AudioLines, color: 'bg-[#fff6dc] text-[#c98a00]', title: '文字朗讀', body: '輸入文字或直接用字幕，選一個聲音就能產生中文配音，自動放進音訊軌。' },
];

function Features() {
  return (
    <section id="features" className="scroll-mt-16 px-4 py-24 sm:px-6">
      <SectionTitle eyebrow="功能" title="剪短影音需要的，這裡都有" sub="從素材到成品，不用在好幾個 App 之間切來切去。" />
      <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <div key={f.title} className="group rounded-3xl border border-line bg-surface p-6 shadow-card transition hover:-translate-y-1 hover:shadow-pop">
            <div className={`grid size-12 place-items-center rounded-2xl ${f.color}`}>
              <f.icon className="size-6" />
            </div>
            <h3 className="mt-5 text-lg font-extrabold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
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
  ['需要安裝軟體嗎？', '不用。剪影 Studio 直接在瀏覽器執行，建議使用最新版 Chrome 或 Edge。'],
  ['AI 自動字幕準確嗎？支援台灣用語嗎？', '使用 Whisper 語音辨識，並自動轉成繁體中文。辨識完可以逐句修改，第一次使用會下載語音模型。'],
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
        <p className="mt-3 text-ink-soft">免費註冊，馬上開始。</p>
        <Link to="/register" className={buttonClass('primary', 'lg', 'mt-8')}>
          免費開始剪輯 <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
