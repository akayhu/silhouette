import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import { MarketingLayout } from '../components/Layout';
import { PlanCards } from '../components/Plans';
import { Barcode, mkButton } from '../components/marketing';
import { stickerDef, stickerUrl } from '../lib/stickers';
import { OG_IMAGE, PUBLIC_ROUTES, SITE_NAME, SITE_URL } from '../lib/seo';

export default function Landing() {
  return (
    <MarketingLayout>
      <StructuredData />
      <Hero />
      <Itemized />
      <RealEditor />
      <Orders />
      <section id="pricing" className="scroll-mt-16 px-4 pt-24 pb-28 sm:px-8">
        <Heading title="先免費剪，需要再升級" sub="新會員註冊就送 7 天專業版，全部功能都能用。之後專業版每月 NT$399，不綁約，隨時可以取消。" />
        <PlanCards />
      </section>
      <Faq />
      <Close />
    </MarketingLayout>
  );
}

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-2xl text-center">
      <h2 className="text-[clamp(30px,3.6vw,46px)] leading-[1.15] font-black tracking-[-0.01em] text-balance">{title}</h2>
      {sub && <p className="mt-4 text-[17px] leading-relaxed text-receipt-soft">{sub}</p>}
    </div>
  );
}

function ProStamp() {
  return (
    <span className="ml-2 inline-block -rotate-6 rounded-[3px] border-2 border-invoice px-1.5 py-px align-[2px] text-[11px] leading-tight font-black tracking-[0.08em] text-invoice">
      專業版
    </span>
  );
}

// ---------- 首屏：示範影片＋剪輯明細單 ----------

function Hero() {
  return (
    <section className="overflow-hidden px-4 pt-10 pb-20 sm:px-8 lg:pt-16 lg:pb-28">
      <div className="mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-5">
          <h1 className="text-[clamp(42px,5.4vw,78px)] leading-[1.06] font-black tracking-[-0.02em]">
            打開瀏覽器，
            <br />
            <span className="text-invoice">一次</span>剪好
            <br />
            一支短影音
          </h1>
          <p className="mt-7 max-w-[30em] text-[18px] leading-[1.75] text-receipt-soft">
            上傳手機拍的影片，片刻剪趣會剪掉沒人說話的空拍、上好繁體中文字幕，再依內容加上特寫、轉場和動畫。你只要挑版本、微調，就能發佈。
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link to="/register" className={mkButton('red', 'lg')}>
              免費開始剪輯 <ArrowRight className="size-5" />
            </Link>
            <a href="#features" className="text-[16px] font-bold underline decoration-2 underline-offset-[6px] hover:text-invoice">
              看完整功能明細
            </a>
          </div>
          <p className="mt-5 text-[14px] text-receipt-soft">免費註冊即享 7 天專業版・不需信用卡</p>
        </div>
        <div className="lg:col-span-7">
          <EditDemo />
        </div>
      </div>
    </section>
  );
}

const photo = (id: string) => `https://images.unsplash.com/photo-${id}?w=540&h=960&fit=crop&q=70&auto=format`;
const CLIPS = [
  { src: photo('1665898362159-616b0ade1044'), alt: '掛著手寫招牌的甜不辣小攤', caption: '今天來吃這攤甜不辣' },
  { src: photo('1583560266880-bdd37ea65fe0'), alt: '老闆在蒸籠旁準備食材', caption: '老闆一早就在備料' },
  { src: photo('1593960548354-62d1b5c9d542'), alt: '攤販在烤架上翻烤香腸', caption: '香腸烤到滋滋作響！' },
];

type Effect = 'cut' | 'filler' | 'subs' | 'punch' | 'zoom' | 'trans' | 'anim' | 'sticker';
const LINES: { id: Effect; label: string; qty: string; amount?: string; clip: number }[] = [
  { id: 'cut', label: '剪掉空拍', qty: '4 段', amount: '−11.6 秒', clip: 0 },
  { id: 'filler', label: '剪掉「嗯、啊」', qty: '2 處', amount: '−1.4 秒', clip: 1 },
  { id: 'subs', label: '自動字幕', qty: '6 句', clip: 1 },
  { id: 'zoom', label: '慢慢放大運鏡', qty: '2 段', clip: 0 },
  { id: 'trans', label: '轉場', qty: '2 個', clip: 1 },
  { id: 'punch', label: '重點特寫推近', qty: '2 個', clip: 2 },
  { id: 'anim', label: '字幕動畫', qty: '6 句', clip: 2 },
  { id: 'sticker', label: '貼紙', qty: '1 個', clip: 2 },
];

// 時間軸示意：原始 42 秒，斜線段落是會被剪掉的空拍與「嗯、啊」
const SEGMENTS: { len: number; cut?: 'silence' | 'filler' }[] = [
  { len: 3.2, cut: 'silence' },
  { len: 7.4 },
  { len: 2.6, cut: 'silence' },
  { len: 5.1 },
  { len: 0.7, cut: 'filler' },
  { len: 6.3 },
  { len: 3.4, cut: 'silence' },
  { len: 4.4 },
  { len: 0.7, cut: 'filler' },
  { len: 5.8 },
  { len: 2.4, cut: 'silence' },
];

const STEP_MS = 2600;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** 首屏示範：明細單一行一行印出來，手機同步播放那一行的效果；點任一行只看那個效果 */
function EditDemo() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [printed, setPrinted] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [run, setRun] = useState(0);

  // 減少動態時直接印好整張單，不自動播放
  useEffect(() => {
    if (reduced) {
      setPlaying(false);
      setPrinted(LINES.length);
    }
  }, [reduced]);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      const next = (active + 1) % LINES.length;
      setActive(next);
      setPrinted((p) => Math.max(p, next + 1));
      setRun((r) => r + 1);
    }, STEP_MS);
    return () => clearTimeout(t);
  }, [playing, active]);

  const pick = (i: number) => {
    setActive(i);
    setPrinted((p) => Math.max(p, i + 1));
    setPlaying(false);
    setRun((r) => r + 1);
  };
  const replay = () => {
    setActive(0);
    setPrinted(1);
    setPlaying(true);
    setRun((r) => r + 1);
  };

  const done = printed >= LINES.length;
  const line = LINES[active];

  return (
    <div className="relative mx-auto flex max-w-[680px] flex-col items-center gap-8 sm:flex-row sm:items-start sm:justify-center sm:gap-5">
      <div className="w-[min(290px,78vw)] shrink-0 sm:mt-8">
        <Phone effect={line.id} clip={line.clip} run={run} />
        <Timeline effect={line.id} run={run} />
      </div>

      <div className="w-full max-w-[360px] sm:max-w-[350px] sm:rotate-[1.6deg]">
        <div className="slip-edge-y bg-paper pt-2 pb-7 shadow-slip">
          <div className="border-b-2 border-dashed border-receipt/25 px-6 pt-6 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[18px] font-black">片刻剪趣 剪輯明細</div>
                <div className="num mt-2 text-[11px] text-receipt-mute">115年09-10月</div>
                <div className="num text-[22px] leading-tight font-extrabold tracking-[0.02em]" style={{ fontStretch: '85%' }}>
                  PK-00000029
                </div>
                <div className="num mt-1.5 space-y-0.5 text-[12px] text-receipt-mute">
                  <div>素材　台南小吃一日.mp4</div>
                  <div>原始長度　00:42</div>
                </div>
              </div>
              <span className="mt-0.5 -rotate-6 rounded-[3px] border-2 border-invoice px-1.5 text-[12px] leading-snug font-black text-invoice">示範</span>
            </div>
          </div>

          <ol className="px-3 pt-3" aria-label="自動剪輯做了哪些事，點一行看效果">
            {LINES.map((l, i) => {
              const on = i === active;
              if (i >= printed) return <li key={l.id} className="h-10" aria-hidden />;
              return (
                <li key={l.id} className={i === printed - 1 && playing ? 'print-line' : ''}>
                  <button
                    type="button"
                    onClick={() => pick(i)}
                    aria-pressed={on}
                    className={`flex h-10 w-full items-baseline gap-2 rounded-[4px] px-3 pt-2.5 text-left text-[15px] transition-colors ${on ? 'bg-invoice text-white' : 'hover:bg-steel'}`}
                  >
                    <span className={on ? 'font-black' : 'font-medium'}>{l.label}</span>
                    <span className={`leader ${on ? 'opacity-0' : ''}`} aria-hidden />
                    <span className="num shrink-0 text-[13px]">{l.qty}</span>
                    {l.amount && <span className={`num shrink-0 text-right text-[13px] whitespace-nowrap ${on ? '' : 'text-invoice'}`} style={{ fontStretch: '82%' }}>{l.amount}</span>}
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="mx-6 mt-3 border-t-2 border-dashed border-receipt/25 pt-4">
            <div className="flex items-end justify-between">
              <span className="pb-2 text-[15px] font-black whitespace-nowrap">總計</span>
              <span className={`num text-[clamp(84px,8vw,104px)] leading-[0.9] font-extrabold tracking-[-0.05em] transition-opacity duration-500 ${done ? '' : 'opacity-20'}`} style={{ fontStretch: '76%' }}>
                00:29
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-4">
              <Barcode value="PIANKE-0029" className="h-9 w-[150px] text-receipt" />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setPlaying(!playing)}
                  className="grid size-9 place-items-center rounded-[6px] border-2 border-receipt/80 text-receipt hover:bg-receipt hover:text-paper"
                  aria-label={playing ? '暫停示範' : '繼續播放示範'}
                >
                  {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                </button>
                <button type="button" onClick={replay} className="grid size-9 place-items-center rounded-[6px] border-2 border-receipt/80 text-receipt hover:bg-receipt hover:text-paper" aria-label="從頭重播示範">
                  <RotateCcw className="size-4" />
                </button>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-receipt-mute">點任一行，手機畫面只播那個效果。數字為示範。</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Phone({ effect, clip, run }: { effect: Effect; clip: number; run: number }) {
  const c = CLIPS[clip];
  const motion = effect === 'punch' ? 'demo-punch 0.22s cubic-bezier(0.2,0.9,0.3,1) both' : effect === 'zoom' ? `demo-zoom ${STEP_MS}ms linear both` : undefined;
  const caption =
    effect === 'subs' ? { animation: 'demo-type 1.1s steps(12) both' } : effect === 'anim' ? { animation: 'demo-pop 0.45s cubic-bezier(0.2,0.9,0.3,1) both' } : undefined;
  return (
    <div className="rounded-[36px] bg-receipt p-[9px] shadow-slip">
      <div className="relative aspect-[9/16] overflow-hidden rounded-[28px] bg-steel-deep" role="img" aria-label={`示範畫面：${c.alt}，字幕「${c.caption}」`}>
        {CLIPS.map((x, i) => (
          <img
            key={i === clip ? `${i}-${run}` : i}
            src={x.src}
            alt=""
            loading={i === 0 ? 'eager' : 'lazy'}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${i === clip ? 'opacity-100' : 'opacity-0'}`}
            style={i === clip && motion ? { animation: motion } : undefined}
          />
        ))}
        {effect === 'trans' && <div key={`f${run}`} className="absolute inset-0 bg-white" style={{ animation: 'demo-flash 0.6s ease-out both' }} />}
        {effect === 'sticker' && (
          <img key={`s${run}`} src={stickerUrl(stickerDef('badge-yummy')!)} alt="" className="absolute top-[13%] right-[7%] w-[34%] rotate-6" style={{ animation: 'demo-pop 0.5s cubic-bezier(0.2,0.9,0.3,1) both' }} />
        )}
        <div className="absolute inset-x-3 bottom-[15%] text-center">
          <span key={`c${run}`} className="inline-block text-[21px] leading-tight font-black text-white [-webkit-text-stroke:6px_var(--color-receipt)] [paint-order:stroke]" style={caption}>
            {c.caption}
          </span>
        </div>
        <span className="num absolute top-4 left-4 rounded-[4px] bg-receipt/70 px-1.5 py-0.5 text-[11px] text-white">示範</span>
      </div>
    </div>
  );
}

function Timeline({ effect, run }: { effect: Effect; run: number }) {
  const cutting = effect === 'cut' || effect === 'filler';
  // 剪空拍那一行：先顯示完整素材，再看著空檔收起來
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    if (!cutting) return setCollapsed(true);
    setCollapsed(false);
    const t = setTimeout(() => setCollapsed(true), 700);
    return () => clearTimeout(t);
  }, [cutting, run]);
  return (
    <div className="mt-4 px-1" aria-hidden>
      <div className="flex h-7 gap-[2px] overflow-hidden rounded-[4px]">
        {SEGMENTS.map((s, i) => {
          const gone = !!s.cut && collapsed;
          return (
            <span
              key={i}
              className={`h-full transition-[flex-grow,opacity] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                s.cut ? 'bg-[repeating-linear-gradient(135deg,var(--color-steel-deep)_0_4px,var(--color-receipt-mute)_4px_5px)]' : 'bg-receipt'
              } ${gone ? 'opacity-0' : ''}`}
              style={{ flexGrow: gone ? 0.0001 : s.len, flexBasis: 0 }}
            />
          );
        })}
      </div>
      <div className="num mt-2 flex justify-between text-[12px] text-receipt-mute">
        <span>{collapsed ? '剪好 00:29' : '原始 00:42'}</span>
        <span>{cutting && !collapsed ? '剪掉空拍中…' : '可以發佈了'}</span>
      </div>
    </div>
  );
}

// ---------- 完整功能明細 ----------

type Item = { name: string; qty?: string; pro?: boolean; note?: string };
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: '剪輯',
    items: [
      { name: '多軌時間軸：字幕、貼紙、疊加、主軌、音訊', qty: '5 軌' },
      { name: '分割、修剪、拖曳排序' },
      { name: '變速', qty: '0.5～3 倍' },
      { name: '畫面比例 9:16、16:9、1:1', qty: '3 種' },
      { name: '疊加軌：影片多層堆疊、子母畫面', qty: '不限層' },
      { name: '畫面縮放、位置、旋轉，九宮格對齊' },
      { name: '滑鼠框選，一次批次編輯' },
      { name: '鎖定軌道，避免誤改剪好的部分' },
      { name: '復原／重做，自動儲存專案' },
    ],
  },
  {
    title: '字幕與文字',
    items: [
      { name: '字幕樣式範本', qty: '8 款' },
      { name: '字型、大小、顏色、描邊、底色、陰影' },
      { name: '直接在預覽畫面拖曳字幕位置' },
      { name: '進場動畫：淡入、彈出、上滑、打字機', qty: '4 種' },
      { name: '一句的樣式套用到全部字幕' },
      { name: 'AI 自動字幕', pro: true, note: '聽寫語音產生繁體中文字幕，辨識在你的瀏覽器裡執行，影片不會傳到外部服務。' },
    ],
  },
  {
    title: '聲音與配音',
    items: [
      { name: '原創無版權配樂', qty: '8 首' },
      { name: '原創音效', qty: '8 個' },
      { name: '上傳自己的音樂，自動配合影片長度' },
      { name: '音量、淡入淡出；轉場時聲音交叉淡化' },
      { name: '文字朗讀：台灣腔 AI 人聲與系統語音', pro: true, note: '配音會依句子自動加上對齊的字幕。' },
      { name: '錄一段約 10 秒，建立自己的 AI 聲音', pro: true },
    ],
  },
  {
    title: '畫面效果',
    items: [
      { name: '原創手繪貼紙', qty: '35 款' },
      { name: '貼紙動畫', qty: '6 種' },
      { name: '濾鏡，可調強度', qty: '14 種' },
      { name: '亮度、對比、飽和度、色溫、暗角、顆粒微調' },
      { name: '轉場', qty: '10 種' },
      { name: '片段動態：慢慢放大、縮小、特寫推近、震動', qty: '4 種' },
    ],
  },
  {
    title: 'AI 自動處理',
    items: [
      { name: '上傳後自動剪輯', pro: true, note: '剪掉沒人說話的空拍、自動上字幕，讓你選剪輯前或剪輯後的版本。' },
      { name: 'AI 自動剪輯', pro: true, note: '依聲音起伏和字幕內容，加上特寫、運鏡、轉場、字幕動畫和貼紙。' },
      { name: '智能口播：剪掉停頓與「嗯、啊」', pro: true },
      { name: '去浮水印：偵測 Logo 與字幕帶', pro: true, note: '智能填補、模糊、馬賽克三種方式，只處理你有權使用的影片。' },
    ],
  },
  {
    title: '匯出與帳戶',
    items: [
      { name: '匯出影片，畫面和預覽一致' },
      { name: '免費版畫質（含浮水印）', qty: '720p' },
      { name: '高畫質、無浮水印', qty: '1080p', pro: true },
      { name: '專案存在帳戶裡，換電腦接著剪' },
    ],
  },
];

function Itemized() {
  return (
    <section id="features" className="scroll-mt-16 bg-steel-deep/60 px-4 pt-24 pb-28 sm:px-8">
      <Heading title="完整剪輯明細" sub="剪一支短影音會用到的，都在這張單上。標了「專業版」的品項需要專業版，其餘免費就能用。" />
      <div className="slip-edge-y mx-auto max-w-[1040px] bg-paper px-6 py-14 shadow-slip sm:px-12">
        <div className="grid gap-x-16 gap-y-12 md:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <h3 className="flex items-baseline justify-between border-b-2 border-receipt pb-2 text-[20px] font-black">
                {g.title}
                <span className="num text-[12px] font-semibold text-receipt-mute">{g.items.length} 項</span>
              </h3>
              <ul className="mt-2">
                {g.items.map((it) => (
                  <li key={it.name} className="border-b border-dashed border-receipt/20 py-3">
                    <div className="flex items-baseline gap-2 text-[15px] leading-snug">
                      <span>
                        {it.name}
                        {it.pro && <ProStamp />}
                      </span>
                      {it.qty && (
                        <>
                          <span className="leader" aria-hidden />
                          <span className="num shrink-0 text-[13px] font-semibold">{it.qty}</span>
                        </>
                      )}
                    </div>
                    {it.note && <p className="mt-1.5 text-[13px] leading-relaxed text-receipt-mute">{it.note}</p>}
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

// ---------- 實際的編輯器畫面 ----------

function RealEditor() {
  return (
    <section className="px-4 pt-24 pb-24 sm:px-8">
      <Heading title="這就是剪輯畫面" sub="上面明細單上的每一項，都在這個編輯器裡完成。左邊放素材，中間調整，右邊即時預覽，下方是時間軸。" />
      <figure className="mx-auto max-w-[1140px]">
        <div className="mx-auto max-w-[340px] bg-paper p-2 shadow-slip sm:max-w-none sm:p-3">
          {/* 手機上整個編輯器縮到看不清，改給預覽區的特寫 */}
          <picture>
            <source media="(max-width: 639px)" srcSet="/editor-demo-mobile.jpg" width={920} height={1690} />
            <img
              src="/editor-demo.jpg"
              width={1440}
              height={900}
              loading="lazy"
              alt="片刻剪趣編輯器：時間軸上有三段小吃影片、轉場、三句字幕與一張「超好吃」貼紙，預覽畫面是烤香腸與黃色字幕"
              className="block h-auto w-full"
            />
          </picture>
        </div>
        <figcaption className="mt-4 flex flex-wrap items-baseline justify-between gap-2 text-[13px] text-receipt-soft">
          <span>片刻剪趣編輯器實際畫面，示範專案「台南小吃一日」。手機上顯示預覽區。</span>
          <span>照片：Unsplash</span>
        </figcaption>
      </figure>
    </section>
  );
}

// ---------- 四種常見的剪法 ----------

const ORDERS: { title: string; who: string; lines: [string, string][]; total: string }[] = [
  { title: '知識型口播', who: '對著鏡頭講解的創作者', lines: [['智能口播剪掉停頓與口誤', '12 處'], ['AI 自動字幕，大字樣式', '18 句'], ['重點句貼紙強調', '3 個']], total: '00:52' },
  { title: '美食與旅遊 Vlog', who: '記錄生活、分享景點的人', lines: [['多段素材串接轉場', '5 個'], ['美食濾鏡統一色調', '1 套'], ['無版權配樂，淡入淡出', '1 首']], total: '00:38' },
  { title: '小店家商品介紹', who: '經營網拍或實體店的老闆', lines: [['疊加商品特寫，子母畫面', '2 層'], ['AI 聲音朗讀介紹', '6 句'], ['價格與優惠標籤貼紙', '2 個']], total: '00:30' },
  { title: '教學與課程片段', who: '老師、講師、職人分享', lines: [['疊加螢幕畫面與講者鏡頭', '1 層'], ['鎖定剪好的軌道', '2 條'], ['去除舊影片的 Logo', '1 處']], total: '01:20' },
];

function Orders() {
  return (
    <section className="bg-steel-deep/60 px-4 pt-24 pb-28 sm:px-8">
      <Heading title="四種常見的剪法" sub="不同類型的影片，在片刻剪趣裡各有順手的做法。以下是示範訂單。" />
      <div className="mx-auto grid max-w-[1180px] items-start gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {ORDERS.map((o, i) => (
          <article key={o.title} className={`slip-edge-y bg-paper pt-2 pb-7 shadow-slip ${i % 2 ? 'lg:mt-10 lg:-rotate-1' : 'lg:rotate-1'}`}>
            <header className="border-b-2 border-dashed border-receipt/25 px-5 pt-5 pb-3">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-[19px] font-black">{o.title}</h3>
                <span className="num text-[11px] text-receipt-mute">示範</span>
              </div>
              <p className="mt-1 text-[13px] text-receipt-mute">{o.who}</p>
            </header>
            <ul className="space-y-2.5 px-5 pt-4 text-[14px] leading-snug">
              {o.lines.map(([name, qty]) => (
                <li key={name} className="flex items-baseline gap-2">
                  <span>{name}</span>
                  <span className="leader" aria-hidden />
                  <span className="num shrink-0 text-[12px] font-semibold">{qty}</span>
                </li>
              ))}
            </ul>
            <div className="mx-5 mt-4 flex items-baseline justify-between border-t-2 border-dashed border-receipt/25 pt-3">
              <span className="text-[14px] font-black">成品長度</span>
              <span className="num text-[30px] leading-none font-extrabold text-invoice" style={{ fontStretch: '80%' }}>
                {o.total}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------- 常見問題 ----------

const faqs: [string, string][] = [
  ['需要安裝軟體嗎？', '不用。片刻剪趣直接在瀏覽器執行，建議使用最新版 Chrome 或 Edge。'],
  ['AI 自動字幕準確嗎？支援台灣用語嗎？', '使用 Whisper 語音辨識，並自動轉成繁體中文。準確度會受收音品質影響，辨識完可以逐句修改；第一次使用會下載語音模型。'],
  ['可以做子母畫面、把好幾支影片疊在一起嗎？', '可以。在素材按「疊加」，影片或圖片就會疊在主軌上方，層數不限。上層會蓋住下層，每一層都能各自調整位置、大小、透明度和濾鏡，匯出時一起輸出。'],
  ['上傳的素材存在哪裡？', '素材和專案存在你的帳戶裡，只有你自己看得到，換一台電腦登入也能接著剪。刪除帳號時，專案和上傳的檔案會一併刪除。'],
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
    <section id="faq" className="scroll-mt-16 bg-steel-deep/60 px-4 pt-24 pb-28 sm:px-8">
      <Heading title="常見問題" />
      <div className="slip-edge-y mx-auto max-w-[820px] bg-paper px-5 py-8 shadow-slip sm:px-10">
        {faqs.map(([q, a]) => (
          <details key={q} className="group border-b border-dashed border-receipt/25 last:border-b-0">
            <summary className="flex cursor-pointer list-none items-baseline gap-4 py-5 text-[17px] font-bold [&::-webkit-details-marker]:hidden">
              <span className="flex-1">{q}</span>
              <Plus className="size-5 shrink-0 self-center text-invoice transition-transform group-open:rotate-45" aria-hidden />
            </summary>
            <p className="pb-6 pr-9 text-[15px] leading-[1.8] text-receipt-soft">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ---------- 收尾：發票紅總計 ----------

function Close() {
  return (
    <section className="bg-invoice px-4 py-24 text-white sm:px-8">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-[clamp(36px,5vw,68px)] leading-[1.08] font-black tracking-[-0.02em] text-balance">今天就剪出第一支短影音</h2>
          <p className="mt-5 text-[18px] text-white/90">免費註冊，立即享有 7 天專業版，不需信用卡。</p>
        </div>
        <div className="flex flex-col items-start gap-4 lg:items-end">
          <Link to="/register" className={mkButton('paper', 'lg')}>
            免費開始剪輯 <ArrowRight className="size-5" />
          </Link>
          <Barcode value="START-FREE-7DAYS" className="h-10 w-[200px] text-white/85" />
        </div>
      </div>
    </section>
  );
}

/** 結構化資料：只描述頁面上看得到的內容（方案價格、常見問題） */
function StructuredData() {
  const abs = (p: string) => (SITE_URL ? SITE_URL + p : undefined);
  const app = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    url: abs('/'),
    image: abs(OG_IMAGE),
    description: PUBLIC_ROUTES['/'].description,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    inLanguage: 'zh-Hant-TW',
    browserRequirements: '需要最新版 Chrome 或 Edge 瀏覽器',
    offers: [
      { '@type': 'Offer', name: '免費版', price: '0', priceCurrency: 'TWD' },
      { '@type': 'Offer', name: '專業版（月費）', price: '399', priceCurrency: 'TWD' },
    ],
  };
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(app).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq).replace(/</g, '\\u003c') }} />
    </>
  );
}
