import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Check, FolderOpen, HardDrive, Laptop, Mic, Music2, Pause, Play, Plus, RotateCcw, Scissors, WandSparkles } from 'lucide-react';
import { MarketingLayout } from '../components/Layout';
import { PlanCards } from '../components/Plans';
import { mkButton, SectionTitle } from '../components/marketing';
import { stickerDef, stickerUrl } from '../lib/stickers';
import { OG_IMAGE, PUBLIC_ROUTES, SITE_NAME, SITE_URL } from '../lib/seo';
import { SMART_TEMPLATES } from '../lib/templates';
import { FILTER_PRESETS } from '../lib/filters';
import { StylePreview } from '../components/StylePreview';
import musicLibrary from '../../server/music/library.json';

/**
 * 首頁：明亮、以產品為主角的軟體官網。
 * 首屏（編輯器視窗）→ AI 功能分頁 → 數字帶 → 本機剪輯 → 三步驟 → 全部功能 → 適合誰 → 方案 → 常見問題 → 紅色收尾帶。
 */
export default function Landing() {
  return (
    <MarketingLayout>
      <StructuredData />
      <Hero />
      <AiTabs />
      <Numbers />
      <LocalFirst />
      <Steps />
      <FeatureList />
      <ForWho />
      <section id="pricing" className="scroll-mt-16 bg-site-band px-4 py-24 sm:px-8">
        <SectionTitle title="先免費剪，需要再升級" sub="新會員註冊就送 7 天專業版，全部功能都能用。之後專業版每月 NT$399，不綁約，隨時可以取消。" />
        <PlanCards />
      </section>
      <Faq />
      <Closing />
    </MarketingLayout>
  );
}

function ProBadge() {
  return <span className="ml-2 inline-block rounded-full bg-site-red-soft px-2 align-[2px] text-[12px] leading-[1.7] font-bold text-site-red-deep">專業版</span>;
}

// ---------- 首屏 ----------

function Hero() {
  return (
    <section className="overflow-hidden px-4 pt-14 pb-20 sm:px-8 lg:pt-20">
      <div className="mx-auto max-w-[1240px] text-center">
        <h1 className="mx-auto max-w-[15em] text-[clamp(40px,6vw,84px)] leading-[1.12] font-black tracking-[-0.02em] text-balance">
          打開瀏覽器，<span className="text-site-red">一次剪好</span>一支短影音
        </h1>
        <p className="mx-auto mt-6 max-w-[36em] text-[18px] leading-[1.8] text-site-soft">
          把手機拍的影片拖進來，片刻剪趣會剪掉沒人說話的空拍、上好繁體中文字幕，再依內容加上特寫、轉場和動畫。你只要挑版本、微調，就能發佈。影片留在你的電腦，不必上傳。
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/register" className={mkButton('red', 'lg')}>
            免費開始剪輯 <ArrowRight className="size-5" />
          </Link>
          <a href="#ai" className={mkButton('outline', 'lg')}>
            看 AI 怎麼剪
          </a>
        </div>
        <p className="mt-4 text-[14px] text-site-mute">免費註冊即享 7 天專業版・不需信用卡</p>

        <div className="relative mx-auto mt-16 max-w-[1100px]">
          <div className="overflow-hidden rounded-[22px] border border-site-line bg-white shadow-site">
            <div className="flex h-9 items-center gap-1.5 border-b border-site-line bg-site-band px-4" aria-hidden>
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-3 rounded-full bg-white px-3 py-0.5 text-[11px] text-site-mute">片刻剪趣編輯器</span>
            </div>
            <picture>
              <source media="(max-width: 639px)" srcSet="/editor-demo-mobile.jpg" width={920} height={1690} />
              <img
                src="/editor-demo.jpg"
                width={1440}
                height={900}
                alt="片刻剪趣編輯器實際畫面：時間軸上有三段小吃影片、轉場、三句字幕與一張「超好吃」貼紙，預覽畫面是烤香腸與黃色字幕"
                className="block h-auto w-full"
              />
            </picture>
          </div>
          {/* 浮動標籤：自動剪輯做了什麼（示範數字） */}
          <Chip className="top-[18%] -left-3 hidden lg:flex" icon={<Scissors className="size-4" />} text="剪掉空拍 4 段" num="−11.6 秒" />
          <Chip className="top-[44%] -right-4 hidden lg:flex" icon={<WandSparkles className="size-4" />} text="自動字幕" num="6 句" />
          <Chip className="-bottom-5 left-1/2 -translate-x-1/2" icon={<HardDrive className="size-4" />} text="影片留在你的電腦" />
        </div>
      </div>
    </section>
  );
}

function Chip({ className, icon, text, num }: { className: string; icon: React.ReactNode; text: string; num?: string }) {
  return (
    <div className={`absolute flex items-center gap-2 rounded-full border border-site-line bg-white px-4 py-2.5 text-[14px] font-bold whitespace-nowrap shadow-site ${className}`}>
      <span className="grid size-7 place-items-center rounded-full bg-site-red-soft text-site-red">{icon}</span>
      {text}
      {num && <span className="num text-site-red">{num}</span>}
    </div>
  );
}

// ---------- AI 功能分頁 ----------

const AI_TABS = [
  {
    id: 'mix',
    label: '智能混剪',
    title: '一次丟多支素材，AI 幫你接好',
    body: '把拍好的好幾支素材一次丟進來，AI 自動幫每一支挑一段：有講話的留講話段，沒講話的留畫面動態最多的一段，接成一支影片，順便帶字幕。接完還能再到「智能剪輯」套模板、調整順序。',
    points: ['一次選多支素材', '自動判斷講話／動態', '接好自動帶字幕'],
  },
  {
    id: 'auto',
    label: '上傳後自動剪輯',
    title: '加入影片，空拍和字幕自動處理好',
    body: '剪掉沒人說話的空拍與「嗯、啊」，自動上繁體中文字幕，再依聲音起伏加上特寫、運鏡、轉場和貼紙。剪輯前、剪輯後兩個版本讓你挑。',
    points: ['剪空拍、剪口誤', '自動字幕', '特寫、轉場、貼紙'],
  },
  {
    id: 'subs',
    label: 'AI 字幕',
    title: '繁體中文字幕，逐字對準說話時間',
    body: '語音辨識在你的瀏覽器裡執行，產生繁體中文字幕並記下每個字的時間。可以做成卡拉 OK 逐字亮起，也能貼上講稿自動對時，字幕不會有錯字。',
    points: ['逐字時間', '卡拉 OK 字幕', '貼上講稿自動對時'],
  },
  {
    id: 'text',
    label: '文字剪輯',
    title: '刪掉一句話，影片就剪掉那一段',
    body: '字幕變成一份逐字稿。點選要刪的字或句子按剪掉，那段畫面和聲音同步刪除，後面的內容自動往前補，剪片就像改稿。',
    points: ['點字就剪', '一鍵選語助詞', '可以復原'],
  },
  {
    id: 'tpl',
    label: '智能剪輯模板',
    title: '選一個模板，一鍵剪好',
    body: '剪空拍、上字幕之後，依模板換上字幕樣式，把重點句做成花字，配上音樂、音效和濾鏡。剪完每一項都能再調整。',
    points: [`${SMART_TEMPLATES.length} 個模板`, '花字、配樂、音效', '再套用不會越疊越多'],
  },
  {
    id: 'dual',
    label: '雙語字幕',
    title: '一鍵加上英文字幕',
    body: '把字幕翻成英文，顯示在原文下方、字小一點。翻譯在瀏覽器裡執行，每一句都能再修改，匯出 SRT／VTT 也一併帶上。',
    points: ['中文＋英文', '逐句修改', '匯出字幕檔'],
  },
] as const;

function AiTabs() {
  const [tab, setTab] = useState<(typeof AI_TABS)[number]['id']>('auto');
  const t = AI_TABS.find((x) => x.id === tab)!;
  return (
    <section id="ai" className="scroll-mt-16 bg-site-band px-4 py-24 sm:px-8">
      <SectionTitle title={<>交給 AI，<span className="marker">剪片快很多</span></>} sub="最花時間的剪空拍、上字幕、對時間，片刻剪趣都能先幫你做好。以下功能標示專業版，新會員試用期間都能用。" />
      <div className="mx-auto max-w-[1180px]">
        <div className="mx-auto flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-site-line bg-white p-1.5" role="tablist" aria-label="AI 功能">
          {AI_TABS.map((x) => (
            <button
              key={x.id}
              role="tab"
              aria-selected={x.id === tab}
              onClick={() => setTab(x.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-[15px] font-bold transition-colors ${x.id === tab ? 'bg-site-ink text-white' : 'text-site-soft hover:text-site-ink'}`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <div className="mt-10 grid items-center gap-10 rounded-[28px] bg-white p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr] lg:gap-14" role="tabpanel">
          <div>
            <h3 className="text-[clamp(26px,2.6vw,36px)] leading-[1.25] font-black">
              {t.title}
              <ProBadge />
            </h3>
            <p className="mt-4 text-[16px] leading-[1.85] text-site-soft">{t.body}</p>
            <ul className="mt-6 space-y-2.5">
              {t.points.map((p) => (
                <li key={p} className="flex items-center gap-2.5 text-[15px] font-bold">
                  <span className="grid size-5 place-items-center rounded-full bg-site-red text-white">
                    <Check className="size-3" strokeWidth={3.5} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <Link to="/register" className={mkButton('red', 'md', 'mt-8')}>
              免費試用 <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="min-w-0">
            {tab === 'mix' && <MixMock />}
            {tab === 'auto' && <EditDemo />}
            {tab === 'subs' && <SubsMock />}
            {tab === 'text' && <TranscriptMock />}
            {tab === 'tpl' && <TemplatesMock />}
            {tab === 'dual' && <DualMock />}
          </div>
        </div>
      </div>
    </section>
  );
}

/** 自動剪輯示範：手機播放效果，旁邊列出剪輯項目，點一項只播那個效果 */
function EditDemo() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      setActive((a) => (a + 1) % LINES.length);
      setRun((r) => r + 1);
    }, STEP_MS);
    return () => clearTimeout(t);
  }, [playing, active]);
  const pick = (i: number) => {
    setActive(i);
    setPlaying(false);
    setRun((r) => r + 1);
  };
  const line = LINES[active];
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-center">
      <div className="w-[min(240px,70vw)] shrink-0">
        <Phone effect={line.id} clip={line.clip} run={run} />
        <Timeline effect={line.id} run={run} />
      </div>
      <div className="w-full max-w-[280px]">
        <ol className="space-y-1" aria-label="自動剪輯做了哪些事，點一項看效果">
          {LINES.map((l, i) => {
            const on = i === active;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => pick(i)}
                  aria-pressed={on}
                  className={`flex w-full items-baseline justify-between gap-2 rounded-xl px-3 py-2 text-left text-[14px] transition-colors ${on ? 'bg-site-red text-white' : 'hover:bg-site-band'}`}
                >
                  <span className="font-bold">{l.label}</span>
                  <span className={`num shrink-0 text-[13px] ${on ? '' : 'text-site-mute'}`}>{l.amount ?? l.qty}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-3 flex items-center justify-between gap-2 px-3">
          <span className="text-[12px] text-site-mute">點一項只播那個效果・數字為示範</span>
          <span className="flex gap-1">
            <button type="button" onClick={() => setPlaying(!playing)} className="grid size-8 place-items-center rounded-full hover:bg-site-band" aria-label={playing ? '暫停示範' : '繼續播放示範'}>
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => (setActive(0), setPlaying(true), setRun((r) => r + 1))}
              className="grid size-8 place-items-center rounded-full hover:bg-site-band"
              aria-label="從頭重播示範"
            >
              <RotateCcw className="size-4" />
            </button>
          </span>
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
    <div className="rounded-[32px] bg-site-ink p-[7px] shadow-site">
      <div className="relative aspect-[9/16] overflow-hidden rounded-[26px] bg-site-band" role="img" aria-label={`示範畫面：${c.alt}，字幕「${c.caption}」`}>
        {CLIPS.map((x, i) => (
          <img
            key={i === clip ? `${i}-${run}` : i}
            src={x.src}
            alt=""
            loading="lazy"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${i === clip ? 'opacity-100' : 'opacity-0'}`}
            style={i === clip && motion ? { animation: motion } : undefined}
          />
        ))}
        {effect === 'trans' && <div key={`f${run}`} className="absolute inset-0 bg-white" style={{ animation: 'demo-flash 0.6s ease-out both' }} />}
        {effect === 'sticker' && (
          <img key={`s${run}`} src={stickerUrl(stickerDef('badge-yummy')!)} alt="" className="absolute top-[13%] right-[7%] w-[34%] rotate-6" style={{ animation: 'demo-pop 0.5s cubic-bezier(0.2,0.9,0.3,1) both' }} />
        )}
        <div className="absolute inset-x-3 bottom-[15%] text-center">
          <span key={`c${run}`} className="inline-block text-[18px] leading-tight font-black text-white [-webkit-text-stroke:6px_var(--color-site-ink)] [paint-order:stroke]" style={caption}>
            {c.caption}
          </span>
        </div>
        <span className="absolute top-4 left-4 rounded-full bg-site-ink/70 px-2 py-0.5 text-[11px] text-white">示範</span>
      </div>
    </div>
  );
}

function Timeline({ effect, run }: { effect: Effect; run: number }) {
  const cutting = effect === 'cut' || effect === 'filler';
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    if (!cutting) return setCollapsed(true);
    setCollapsed(false);
    const t = setTimeout(() => setCollapsed(true), 700);
    return () => clearTimeout(t);
  }, [cutting, run]);
  return (
    <div className="mt-4" aria-hidden>
      <div className="flex h-5 gap-[2px] overflow-hidden rounded-md">
        {SEGMENTS.map((s, i) => {
          const gone = !!s.cut && collapsed;
          return (
            <span
              key={i}
              className={`h-full transition-[flex-grow,opacity] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                s.cut ? 'bg-[repeating-linear-gradient(135deg,var(--color-site-red-soft)_0_4px,var(--color-site-red)_4px_5px)]' : 'bg-site-ink'
              } ${gone ? 'opacity-0' : ''}`}
              style={{ flexGrow: gone ? 0.0001 : s.len, flexBasis: 0 }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-site-mute">
        <span className="num">{collapsed ? '剪好 00:29' : '原始 00:42'}</span>
        <span>{cutting && !collapsed ? '剪掉空拍中…' : '可以發佈了'}</span>
      </div>
    </div>
  );
}

/** AI 字幕示範：卡拉 OK 逐字亮起 */
function SubsMock() {
  const words = ['如果', '我', '給', '你', '一個', '不用', '離職', '就能', '開始', '的', '副業'];
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => (x + 1) % (words.length + 3)), 380);
    return () => clearInterval(t);
  }, [words.length]);
  return (
    <div className="relative mx-auto aspect-[4/3] max-w-[520px] overflow-hidden rounded-[22px]" role="img" aria-label="示範：字幕依說話時間逐字亮起">
      <img src={CLIPS[1].src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-x-4 bottom-[12%] text-center text-[clamp(18px,2.2vw,26px)] leading-snug font-black [-webkit-text-stroke:6px_var(--color-site-ink)] [paint-order:stroke]">
        {words.map((w, i) => (
          <span key={i} className={i < n ? 'text-site-sun' : 'text-white'}>
            {w}
          </span>
        ))}
      </div>
      <span className="absolute top-4 left-4 rounded-full bg-site-ink/70 px-2 py-0.5 text-[11px] text-white">示範</span>
    </div>
  );
}

/** 文字剪輯示範：逐字稿上刪掉的字有刪除線 */
function TranscriptMock() {
  const rows: [string, boolean][][] = [
    [['如果我給你', false], ['嗯', true], ['一個不用離職', false]],
    [['就能開始的副業', false], ['然後那個', true]],
    [['你最想了解什麼？', false]],
  ];
  return (
    <div className="mx-auto max-w-[520px] rounded-[22px] border border-site-line bg-white p-6" role="img" aria-label="示範：逐字稿上刪掉的字會從影片剪掉">
      <div className="flex items-center justify-between border-b border-site-line pb-3 text-[13px] font-bold text-site-soft">
        <span>逐字稿</span>
        <span className="rounded-full bg-site-red px-3 py-1 text-white">剪掉 2 段・1.1 秒</span>
      </div>
      <div className="mt-4 space-y-4 text-[19px] leading-relaxed font-bold">
        {rows.map((r, i) => (
          <p key={i}>
            <span className="mr-3 align-middle text-[12px] font-medium text-site-mute num">00:0{i * 2}</span>
            {r.map(([t, cut], j) =>
              cut ? (
                <span key={j} className="rounded bg-site-red-soft px-0.5 text-site-red line-through decoration-2">
                  {t}
                </span>
              ) : (
                <span key={j}>{t}</span>
              ),
            )}
          </p>
        ))}
      </div>
      <p className="mt-5 text-[12px] text-site-mute">示範</p>
    </div>
  );
}

/** 智能剪輯模板示範：模板的花字與字幕樣式 */
function TemplatesMock() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {SMART_TEMPLATES.map((t) => (
        <div key={t.id} className="overflow-hidden rounded-2xl border border-site-line bg-white">
          <div className="grid aspect-[4/3] place-items-center content-center gap-1 px-2" style={{ background: t.swatch }} aria-hidden>
            <StylePreview style={t.flower} text="超好吃！" size={22} />
            <StylePreview style={t.caption} text="字幕長這樣" size={12} />
          </div>
          <div className="px-3 py-2.5">
            <div className="text-[15px] font-black">{t.name}</div>
            <div className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-site-mute"><Music2 className="size-3 shrink-0" aria-hidden />{TRACK_TITLE.get(t.music) ?? '—'}・{t.filter ? (FILTER_PRESETS.find((p) => p.id === t.filter)?.name ?? '—') : '原色'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 雙語字幕示範 */
function DualMock() {
  return (
    <div className="relative mx-auto aspect-[4/3] max-w-[520px] overflow-hidden rounded-[22px]" role="img" aria-label="示範：中文字幕下方加上英文翻譯">
      <img src={CLIPS[2].src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-x-4 bottom-[10%] text-center font-black text-white [-webkit-text-stroke:5px_var(--color-site-ink)] [paint-order:stroke]">
        <div className="text-[clamp(20px,2.4vw,28px)] leading-snug">你最想了解什麼？</div>
        <div className="mt-1 text-[clamp(13px,1.4vw,17px)] leading-snug">What do you want to know most?</div>
      </div>
      <span className="absolute top-4 left-4 rounded-full bg-site-ink/70 px-2 py-0.5 text-[11px] text-white">示範</span>
    </div>
  );
}

/** 智能混剪示範：多支素材個別分析（講話／動態）→ 接成一支影片的時間軸 */
type MixMode = 'speech' | 'motion';
const MIX_SOURCES: { clip: number; mode: MixMode; seconds: number; desc: string }[] = [
  { clip: 0, mode: 'motion', seconds: 3, desc: '沒有人說話，AI 抓了畫面動態最多的一段' },
  { clip: 1, mode: 'speech', seconds: 3, desc: '偵測到老闆在說話，留下講話的段落，字幕也一起帶出來' },
  { clip: 2, mode: 'motion', seconds: 4, desc: '沒有人說話，抓了翻烤最有畫面感的幾秒' },
];
const MIX_TOTAL = MIX_SOURCES.reduce((n, s) => n + s.seconds, 0);

function MixMock() {
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % MIX_SOURCES.length), 2600);
    return () => clearTimeout(t);
  }, [playing, active]);
  const pick = (i: number) => {
    setActive(i);
    setPlaying(false);
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-3" role="group" aria-label="三支原始素材，點一支看 AI 怎麼挑這一段">
        {MIX_SOURCES.map((s, i) => {
          const c = CLIPS[s.clip];
          const on = i === active;
          return (
            <button
              key={i}
              type="button"
              onClick={() => pick(i)}
              aria-pressed={on}
              className={`relative overflow-hidden rounded-2xl text-left ring-2 transition ${on ? 'ring-site-red' : 'ring-transparent hover:ring-site-line'}`}
            >
              <div className="relative aspect-[3/4]">
                <img src={c.src} alt={c.alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-site-ink/75 via-transparent to-transparent" />
                <span className={`absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${s.mode === 'speech' ? 'bg-site-red' : 'bg-site-ink/75'}`}>
                  {s.mode === 'speech' ? <Mic className="size-3" /> : <Activity className="size-3" />}
                  {s.mode === 'speech' ? '有講話' : '動態最多'}
                </span>
                <span className="absolute inset-x-2 bottom-2 truncate text-[11px] font-bold text-white">素材 {i + 1}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-site-line bg-white p-4">
        <p className="min-h-[2.7em] text-[14px] leading-snug font-bold text-site-ink">{MIX_SOURCES[active].desc}</p>
        <div className="mt-3 flex h-6 gap-[3px] overflow-hidden rounded-md" aria-hidden>
          {MIX_SOURCES.map((s, i) => (
            <span
              key={i}
              className={`h-full transition-opacity duration-300 ${i === active ? 'opacity-100' : 'opacity-35'} ${s.mode === 'speech' ? 'bg-site-red' : 'bg-site-ink'}`}
              style={{ flexGrow: s.seconds, flexBasis: 0 }}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-[12px] text-site-mute">
          <span className="num">3 支素材・共 {MIX_TOTAL} 秒</span>
          <span>點上面的縮圖看每一支怎麼挑</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-center gap-1">
        <button type="button" onClick={() => setPlaying(!playing)} className="grid size-8 place-items-center rounded-full hover:bg-site-band" aria-label={playing ? '暫停示範' : '繼續播放示範'}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <button type="button" onClick={() => (setActive(0), setPlaying(true))} className="grid size-8 place-items-center rounded-full hover:bg-site-band" aria-label="從頭重播示範">
          <RotateCcw className="size-4" />
        </button>
      </div>
    </div>
  );
}

// ---------- 數字帶 ----------

function Numbers() {
  const items: [string, string][] = [
    [`${SMART_TEMPLATES.length}`, '智能剪輯模板'],
    ['35', '原創手繪貼紙'],
    ['14', '濾鏡'],
    ['10', '轉場'],
    ['8＋8', '原創配樂與音效'],
  ];
  return (
    <section className="px-4 py-20 sm:px-8">
      <div className="mx-auto max-w-[1180px]">
        <SectionTitle title="素材都是原創，商用也不用擔心版權" className="mb-10" />
        <dl className="grid grid-cols-2 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
          {items.map(([n, label]) => (
            <div key={label} className="text-center">
              <dt className="num text-[clamp(44px,5vw,68px)] leading-none font-extrabold tracking-[-0.03em] text-site-red">{n}</dt>
              <dd className="mt-3 text-[15px] font-bold text-site-soft">{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// ---------- 本機剪輯 ----------

function LocalFirst() {
  return (
    <section id="local" className="scroll-mt-16 px-4 pb-24 sm:px-8">
      <div className="mx-auto grid max-w-[1180px] items-center gap-10 rounded-[32px] bg-site-band p-8 sm:p-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <h2 className="text-[clamp(28px,3.2vw,42px)] leading-[1.25] font-black text-balance">影片留在你的電腦，不必上傳</h2>
          <p className="mt-5 text-[16px] leading-[1.85] text-site-soft">
            片刻剪趣採本機剪輯。你加入的影片、圖片和音樂只存在這台電腦的瀏覽器裡；剪輯、AI 字幕、翻譯、算圖和匯出，也都在瀏覽器裡完成。剪輯內容、字幕和設定會存到帳戶，只有你自己看得到。
          </p>
          <div className="mt-6 rounded-2xl border border-site-line bg-white p-5">
            <div className="text-[15px] font-black">需要注意</div>
            <p className="mt-1.5 text-[15px] leading-[1.8] text-site-soft">
              換裝置時需重新提供素材：影片檔在原本那台電腦上，打開專案後把同樣的檔案再選一次（依檔名和大小自動配對），就能接著剪。清除瀏覽器資料後也一樣，所以剪完前請保留原始影片。
            </p>
          </div>
        </div>
        <ul className="grid gap-4" aria-label="本機剪輯的運作方式">
          {[
            { icon: <Laptop className="size-5" />, t: '素材存在這台電腦', d: '影片、圖片、音樂存在瀏覽器裡，不會傳到伺服器。' },
            { icon: <FolderOpen className="size-5" />, t: '專案存在帳戶', d: '剪輯內容、字幕、設定會同步，換電腦登入結構都還在。' },
            { icon: <HardDrive className="size-5" />, t: '換裝置時重新提供素材', d: '選回原本的影片檔，自動配對就能接著剪。' },
          ].map((x) => (
            <li key={x.t} className="flex gap-4 rounded-2xl bg-white p-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-site-red-soft text-site-red">{x.icon}</span>
              <span>
                <span className="block text-[16px] font-black">{x.t}</span>
                <span className="mt-1 block text-[14px] leading-relaxed text-site-soft">{x.d}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------- 三步驟 ----------

function Steps() {
  const steps = [
    { n: '1', t: '把影片拖進來', d: '直接拖進瀏覽器，不用安裝軟體、不用上傳。勾選自動剪輯，空拍和字幕會先處理好。' },
    { n: '2', t: '挑版本、微調', d: '在剪輯前、剪輯後之間選一個，再用時間軸、文字剪輯或模板調整到滿意。' },
    { n: '3', t: '匯出就能發佈', d: '逐格匯出 MP4，畫面和預覽一致，直接上傳 Reels、TikTok、Shorts。' },
  ];
  return (
    <section className="bg-site-band px-4 py-24 sm:px-8">
      <SectionTitle title="三個步驟，剪好一支" />
      <ol className="mx-auto grid max-w-[1180px] gap-6 md:grid-cols-3">
        {steps.map((s) => (
          <li key={s.n} className="rounded-[24px] bg-white p-7">
            <span className="num grid size-11 place-items-center rounded-full bg-site-ink text-[18px] font-extrabold text-white">{s.n}</span>
            <h3 className="mt-5 text-[21px] font-black">{s.t}</h3>
            <p className="mt-2 text-[15px] leading-[1.8] text-site-soft">{s.d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------- 全部功能 ----------

function FeatureList() {
  return (
    <section id="features" className="scroll-mt-16 px-4 py-24 sm:px-8">
      <SectionTitle title="剪一支短影音會用到的，都在這裡" sub="標了「專業版」的需要專業版，其餘免費就能用。" />
      <div className="mx-auto grid max-w-[1180px] gap-6 md:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.title} className="rounded-[24px] border border-site-line p-6">
            <h3 className="flex items-baseline justify-between text-[20px] font-black">
              {g.title}
              <span className="num text-[13px] font-semibold text-site-mute">{g.items.length} 項</span>
            </h3>
            <ul className="mt-3 divide-y divide-site-line">
              {g.items.map((it) => (
                <li key={it.name} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-3 text-[15px] leading-snug">
                    <span>
                      {it.name}
                      {it.pro && <ProBadge />}
                    </span>
                    {it.qty && <span className="num shrink-0 text-[14px] font-bold">{it.qty}</span>}
                  </div>
                  {it.note && <p className="mt-1 text-[13px] leading-relaxed text-site-mute">{it.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- 適合誰（示範） ----------

function ForWho() {
  return (
    <section className="px-4 pb-24 sm:px-8">
      <SectionTitle title="四種常見的剪法" sub="不同類型的影片，在片刻剪趣裡各有順手的做法。以下是示範。" />
      <div className="mx-auto grid max-w-[1180px] gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {ORDERS.map((o) => (
          <article key={o.title} className="flex flex-col rounded-[24px] bg-site-band p-6">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[19px] font-black">{o.title}</h3>
              <span className="text-[12px] text-site-mute">示範</span>
            </div>
            <p className="mt-1 text-[14px] text-site-soft">{o.who}</p>
            <ul className="mt-5 flex-1 space-y-2 text-[14px] leading-snug">
              {o.lines.map(([name, qty]) => (
                <li key={name} className="flex items-baseline justify-between gap-3">
                  <span>{name}</span>
                  <span className="num shrink-0 font-bold">{qty}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-baseline justify-between rounded-2xl bg-white px-4 py-3">
              <span className="text-[14px] font-bold">成品長度</span>
              <span className="num text-[26px] leading-none font-extrabold text-site-red">{o.total}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------- 常見問題 ----------

function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 px-4 py-24 sm:px-8">
      <SectionTitle title="常見問題" />
      <div className="mx-auto max-w-[860px] space-y-3">
        {faqs.map(([q, a]) => (
          <details key={q} className="group rounded-2xl border border-site-line bg-white px-5 open:shadow-site">
            <summary className="flex cursor-pointer list-none items-center gap-4 py-5 text-[17px] font-bold [&::-webkit-details-marker]:hidden">
              <span className="flex-1">{q}</span>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-site-band transition-transform group-open:rotate-45">
                <Plus className="size-4" aria-hidden />
              </span>
            </summary>
            <p className="pr-12 pb-6 text-[15px] leading-[1.85] text-site-soft">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ---------- 收尾 ----------

function Closing() {
  return (
    <section className="px-4 pb-24 sm:px-8">
      <div className="mx-auto max-w-[1180px] rounded-[32px] bg-site-red px-8 py-16 text-center text-white sm:px-16">
        <h2 className="text-[clamp(32px,4.4vw,60px)] leading-[1.15] font-black text-balance">今天就剪出第一支短影音</h2>
        <p className="mx-auto mt-4 max-w-[32em] text-[18px] text-white/90">免費註冊，立即享有 7 天專業版，不需信用卡。</p>
        <Link to="/register" className={mkButton('white', 'lg', 'mt-9')}>
          免費開始剪輯 <ArrowRight className="size-5" />
        </Link>
      </div>
    </section>
  );
}

// ---------- 示範資料 ----------

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

const TRACK_TITLE = new Map(musicLibrary.items.map((t) => [t.id, t.title]));
const INTENSITY_LABEL = { light: '輕微', normal: '標準', strong: '強烈' } as const;



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
      { name: '預覽參考線：短影音安全框、垂直與水平中線' },
      { name: '復原／重做，自動儲存專案' },
    ],
  },
  {
    title: '字幕與文字',
    items: [
      { name: '字幕樣式範本', qty: '9 款' },
      { name: '字型、大小、顏色、描邊、底色、陰影' },
      { name: '選色器：色碼、滴管取色、透明度、我的顏色' },
      { name: '直接在預覽畫面拖曳字幕位置' },
      { name: '進場動畫：淡入、彈出、上滑、打字機、卡拉 OK 逐字亮起', qty: '5 種' },
      { name: '一句的樣式套用到全部字幕' },
      { name: 'AI 自動字幕', pro: true, note: '聽寫語音產生繁體中文字幕，辨識在你的瀏覽器裡執行，影片不會傳到外部服務。' },
      { name: '貼上講稿自動對時', pro: true, note: '字幕文字照你的講稿，時間對準實際說話，不用逐字校對錯字。' },
      { name: '文字剪輯', note: '在逐字稿上刪掉字或句子，影片就同步剪掉那一段。' },
      { name: '雙語字幕', pro: true, note: '一鍵把字幕翻成英文，顯示在原文下方，匯出 SRT／VTT 也一併帶上。' },
      { name: '字幕對時快捷鍵', note: '按 [ ] 把字幕開始、結束設在播放頭；J／K／L 控制播放，按 ? 看全部快捷鍵。' },
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
      { name: '原創手繪貼紙', qty: '50 款' },
      { name: '貼紙動畫', qty: '6 種' },
      { name: '濾鏡，可調強度', qty: '21 種' },
      { name: '亮度、對比、飽和度、色溫、暗角、顆粒微調' },
      { name: '轉場', qty: '14 種' },
      { name: '片段動態：慢慢放大、縮小、特寫推近、震動', qty: '4 種' },
      { name: '美肌：磨皮、美白、紅潤', note: '4 種預設，可個別微調；主軌和疊加片段都能用。' },
      { name: '降噪：人聲更接近錄音室效果', note: '濾低頻悶響、講話停頓時壓低背景雜訊、人聲增豔，強度可調。' },
    ],
  },
  {
    title: 'AI 自動處理',
    items: [
      { name: '智能混剪', pro: true, note: '一次選多支素材，AI 自動幫每支挑一段接起來：有講話的留講話段，沒講話的留畫面動態最多的一段。' },
      { name: '智能剪輯', qty: '8 個模板', pro: true, note: '一鍵剪空拍、上字幕、花字、配樂、音效和濾鏡。' },
      { name: '上傳後自動剪輯', pro: true, note: '剪掉沒人說話的空拍、自動上字幕，讓你選剪輯前或剪輯後的版本。' },
      { name: 'AI 自動剪輯', pro: true, note: '依聲音起伏和字幕內容，加上特寫、運鏡、轉場、字幕動畫和貼紙。' },
      { name: '智能口播：剪掉停頓與「嗯、啊」', pro: true },
      { name: '智能全消：去水印、去字幕', pro: true, note: '分別偵測 Logo／浮水印與燒錄字幕，模糊、馬賽克兩種方式，只處理你有權使用的影片。' },
    ],
  },
  {
    title: '匯出與帳戶',
    items: [
      { name: '匯出影片，畫面和預覽一致' },
      { name: '免費版畫質（含浮水印）', qty: '720p' },
      { name: '高畫質、無浮水印', qty: '1080p', pro: true },
      { name: '本機剪輯：原始影片留在你的電腦，不必上傳', note: '剪輯、算圖、匯出都在你的瀏覽器裡完成，影片不會傳到伺服器。' },
      { name: '專案存在帳戶裡', note: '剪輯內容、字幕和設定會同步到帳戶；換裝置時需重新提供素材（選回原本的影片檔即可）。' },
    ],
  },
];

const ORDERS: { title: string; who: string; lines: [string, string][]; total: string }[] = [
  { title: '知識型口播', who: '對著鏡頭講解的創作者', lines: [['智能口播剪掉停頓與口誤', '12 處'], ['AI 自動字幕，大字樣式', '18 句'], ['重點句貼紙強調', '3 個']], total: '00:52' },
  { title: '美食與旅遊 Vlog', who: '記錄生活、分享景點的人', lines: [['多段素材串接轉場', '5 個'], ['美食濾鏡統一色調', '1 套'], ['無版權配樂，淡入淡出', '1 首']], total: '00:38' },
  { title: '小店家商品介紹', who: '經營網拍或實體店的老闆', lines: [['疊加商品特寫，子母畫面', '2 層'], ['AI 聲音朗讀介紹', '6 句'], ['價格與優惠標籤貼紙', '2 個']], total: '00:30' },
  { title: '教學與課程片段', who: '老師、講師、職人分享', lines: [['疊加螢幕畫面與講者鏡頭', '1 層'], ['鎖定剪好的軌道', '2 條'], ['去除舊影片的 Logo', '1 處']], total: '01:20' },
];

// ---------- 常見問題資料 ----------

const faqs: [string, string][] = [
  ['需要安裝軟體嗎？', '不用。片刻剪趣直接在瀏覽器執行，建議使用最新版 Chrome 或 Edge。'],
  ['AI 自動字幕準確嗎？支援台灣用語嗎？', '使用 Whisper 語音辨識，並自動轉成繁體中文。準確度會受收音品質影響，辨識完可以逐句修改；第一次使用會下載語音模型。'],
  ['可以做子母畫面、把好幾支影片疊在一起嗎？', '可以。在素材按「疊加」，影片或圖片就會疊在主軌上方，層數不限。上層會蓋住下層，每一層都能各自調整位置、大小、透明度和濾鏡，匯出時一起輸出。'],
  ['智能剪輯套用模板後還能改嗎？', '可以。套用後的字幕、花字、配樂、音效、濾鏡都是一般的項目，能在時間軸上逐一修改或刪除；不滿意可以一鍵復原，或換另一個模板重新套用。'],
  ['美肌會不會把背景也磨糊？', '美肌在皮膚的範圍處理得最多，眼睛、頭髮和輪廓會保持清楚。它沒有臉部辨識，畫面中其他很平滑的地方也可能被輕微柔化，覺得太糊可以把磨皮調低。'],
  ['影片會上傳到伺服器嗎？存在哪裡？', '不會。片刻剪趣採本機剪輯：原始影片留在你的電腦，剪輯、AI 字幕、算圖和匯出都在你的瀏覽器裡完成。存到帳戶的只有專案本身（剪輯內容、字幕、設定），只有你自己看得到；刪除帳號時會一併刪除。'],
  ['換電腦或換瀏覽器可以接著剪嗎？', '可以，但需要重新提供素材。登入後專案的剪輯內容和字幕都在，只是影片檔在原本那台電腦上，請把同樣的影片檔再選一次，就能接著剪。所以剪完前請保留原始影片檔；清除瀏覽器資料後，也同樣需要重新提供素材。'],
  ['配樂、音效、貼紙、濾鏡可以用在商業影片嗎？', '可以。這些都是片刻剪趣原創製作，沒有版權問題，個人與商業影片都能免費使用，也不需要標註來源。'],
  ['可以用自己的聲音配音嗎？', '可以（專業版）。在「朗讀」錄一段約 10 秒的朗讀，就能建立你的 AI 聲音。請只使用自己的聲音，或已取得聲音主人同意的錄音。'],
  ['去浮水印可以處理任何影片嗎？', '請只處理你自己拍攝、或已取得授權的影片。移除他人作品的浮水印或字幕再發佈，可能侵害著作權。'],
  ['免費試用 7 天怎麼算？', '註冊當下就自動開通專業版 7 天，不需要信用卡，期間可以使用全部專業版功能。7 天後沒有付費會自動回到免費版，不會扣款，專案也都會保留。試用期間付款的話，第一個月會從試用結束後開始計算。'],
  ['免費版和專業版差在哪？', '免費版每月 3 個專案、匯出 720p 並帶浮水印；專業版 NT$399／月，不限專案、1080p 無浮水印，AI 功能不限次數。'],
  ['可以隨時取消訂閱嗎？', '可以。在帳戶設定取消後，專業版會使用到這期結束，之後自動回到免費版，不會再扣款。'],
  ['匯出的影片是什麼格式？', '依瀏覽器支援輸出 MP4 或 WebM，畫面比例和你在編輯器選的一樣。'],
];

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
