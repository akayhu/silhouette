import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import { MarketingLayout } from '../components/Layout';
import { PlanCards } from '../components/Plans';
import { Barcode, mkButton, RunningHead } from '../components/marketing';
import { stickerDef, stickerUrl } from '../lib/stickers';
import { OG_IMAGE, PUBLIC_ROUTES, SITE_NAME, SITE_URL } from '../lib/seo';
import { SMART_TEMPLATES } from '../lib/templates';
import { FILTER_PRESETS } from '../lib/filters';
import { StylePreview } from '../components/StylePreview';
import musicLibrary from '../../server/music/library.json';

/**
 * 首頁是一本生活雜誌《片刻剪趣》的創刊號：
 * 封面 → 編輯室報告 → 特輯（模板）→ 功能索引 → 編輯器跨頁 → 四種人的剪法 → 方案 → 問與答 → 封底。
 */
export default function Landing() {
  return (
    <MarketingLayout>
      <StructuredData />
      <Cover />
      <EditorNote />
      <Templates />
      <FeatureIndex />
      <Spread />
      <People />
      <section id="pricing" className="scroll-mt-16 px-4 pt-16 pb-24 sm:px-8">
        <Page page="p.12" title="方案">
          <Headline title="先免費剪，需要再升級" deck="新會員註冊就送 7 天專業版，全部功能都能用。之後專業版每月 NT$399，不綁約，隨時可以取消。" />
          <PlanCards />
        </Page>
      </section>
      <Faq />
      <BackCover />
    </MarketingLayout>
  );
}

/** 一個單元：上緣版頭（刊名＋頁碼），內容在 1240px 版心裡 */
function Page({ page, title, children, tone }: { page: string; title: string; children: ReactNode; tone?: 'paper' | 'blue' }) {
  return (
    <div className="mx-auto max-w-[1240px]">
      <RunningHead page={page} title={title} tone={tone} />
      <div className="pt-10 sm:pt-14">{children}</div>
    </div>
  );
}

/** 雜誌標題：左邊明體大標，右邊導言，靠左對齊而不是置中 */
function Headline({ title, deck }: { title: string; deck?: string }) {
  return (
    <div className="mb-12 grid gap-5 lg:grid-cols-12 lg:gap-8">
      <h2 className="font-ming text-[clamp(32px,3.8vw,52px)] leading-[1.2] font-black text-balance lg:col-span-6">{title}</h2>
      {deck && <p className="max-w-[34em] text-[17px] leading-[1.85] text-mag-soft lg:col-span-5 lg:col-start-8 lg:pt-3">{deck}</p>}
    </div>
  );
}

function ProTag() {
  return <span className="ml-2 inline-block bg-mag-blue-soft px-1.5 align-[2px] text-[12px] leading-[1.6] font-bold text-mag-blue-deep">專業版</span>;
}

// ---------- 封面 ----------

function Cover() {
  return (
    <section className="overflow-hidden px-4 pt-6 pb-16 sm:px-8 lg:pb-24">
      <div className="mx-auto max-w-[1240px]">
        <div className="flex items-baseline justify-between border-b-2 border-mag-ink pb-2 font-ming text-[13px] tracking-[0.12em] text-mag-soft">
          <span>創刊號・特輯　剪一支短影音的一天</span>
          <span className="hidden sm:inline">
            <span className="num">2026</span> 秋季號
          </span>
        </div>
        <div className="grid gap-10 pt-8 lg:grid-cols-12 lg:gap-8 lg:pt-10">
          <div className="lg:col-span-3 lg:flex lg:justify-end">
            <h1 className="tategaki font-ming text-[clamp(42px,5.4vw,80px)] leading-[1.22] font-black tracking-[0.04em] lg:h-[min(640px,76vh)] lg:leading-[1.3]">
              打開瀏覽器，
              <br />
              <span className="text-mag-blue">一次</span>剪好
              <br />
              一支短影音
            </h1>
          </div>
          <div className="order-3 lg:order-none lg:col-span-5">
            <EditDemo />
          </div>
          <div className="lg:col-span-4">
            <p className="max-w-[30em] text-[17px] leading-[1.85] text-mag-soft">
              把手機拍的影片拖進來，片刻剪趣會剪掉沒人說話的空拍、上好繁體中文字幕，再依內容加上特寫、轉場和動畫。你只要挑版本、微調，就能發佈。影片留在你的電腦，不必上傳。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
              <Link to="/register" className={mkButton('ink', 'lg')}>
                免費開始剪輯 <ArrowRight className="size-5" />
              </Link>
              <a href="#features" className="text-[16px] font-bold whitespace-nowrap underline decoration-1 underline-offset-[6px] hover:text-mag-blue">
                翻到功能索引
              </a>
            </div>
            <p className="mt-4 text-[14px] text-mag-soft">免費註冊即享 7 天專業版・不需信用卡</p>
            <p className="mt-10 font-kai text-[19px] leading-[1.7] text-mag-ink">
              「拍完丟進來，剩下的交給它。」
              <span className="mt-1 block text-[14px] text-mag-mute">— 本期主題：最快剪完一支</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** 封面示範：鈷藍色塊上的手機畫面，旁邊是封面標題式的「本期內容」，點一行手機只播那個效果 */
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
  const replay = () => {
    setActive(0);
    setPlaying(true);
    setRun((r) => r + 1);
  };
  const line = LINES[active];

  return (
    <figure>
      <div className="bg-mag-blue px-6 pt-8 pb-6 text-white sm:px-10">
        <div className="mx-auto w-[min(270px,72vw)]">
          <Phone effect={line.id} clip={line.clip} run={run} />
          <Timeline effect={line.id} run={run} />
        </div>
      </div>
      <figcaption className="mt-5">
        <div className="flex items-baseline justify-between border-b border-mag-ink/20 pb-2">
          <span className="font-ming text-[15px] font-black">本期內容：自動剪好的這一支</span>
          <span className="flex gap-1">
            <button
              type="button"
              onClick={() => setPlaying(!playing)}
              className="grid size-8 place-items-center text-mag-ink hover:bg-mag-ink hover:text-mag-white"
              aria-label={playing ? '暫停示範' : '繼續播放示範'}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button type="button" onClick={replay} className="grid size-8 place-items-center text-mag-ink hover:bg-mag-ink hover:text-mag-white" aria-label="從頭重播示範">
              <RotateCcw className="size-4" />
            </button>
          </span>
        </div>
        <ol className="grid grid-cols-2 gap-x-6" aria-label="自動剪輯做了哪些事，點一項看效果">
          {LINES.map((l, i) => {
            const on = i === active;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => pick(i)}
                  aria-pressed={on}
                  className={`flex w-full items-baseline justify-between gap-2 border-b border-mag-ink/10 py-2.5 text-left transition-colors ${on ? 'text-mag-blue' : 'hover:text-mag-blue'}`}
                >
                  <span className={`text-[15px] ${on ? 'font-black underline decoration-2 underline-offset-[5px]' : 'font-medium'}`}>{l.label}</span>
                  <span className="num shrink-0 text-[13px] text-mag-soft">{l.amount ?? l.qty}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <span className="text-[13px] text-mag-mute">點一項，手機只播那個效果。數字為示範。</span>
          <span className="shrink-0 font-ming text-[15px]">
            <span className="num text-mag-mute line-through">00:42</span>　
            <span className="num text-[30px] font-black">00:29</span>
          </span>
        </div>
      </figcaption>
    </figure>
  );
}

function Phone({ effect, clip, run }: { effect: Effect; clip: number; run: number }) {
  const c = CLIPS[clip];
  const motion = effect === 'punch' ? 'demo-punch 0.22s cubic-bezier(0.2,0.9,0.3,1) both' : effect === 'zoom' ? `demo-zoom ${STEP_MS}ms linear both` : undefined;
  const caption =
    effect === 'subs' ? { animation: 'demo-type 1.1s steps(12) both' } : effect === 'anim' ? { animation: 'demo-pop 0.45s cubic-bezier(0.2,0.9,0.3,1) both' } : undefined;
  return (
    <div className="rounded-[34px] bg-mag-ink p-[8px] shadow-[0_24px_40px_-24px_rgb(10_20_70/0.7)]">
      <div className="relative aspect-[9/16] overflow-hidden rounded-[27px] bg-mag-blue-deep" role="img" aria-label={`示範畫面：${c.alt}，字幕「${c.caption}」`}>
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
          <span key={`c${run}`} className="inline-block text-[20px] leading-tight font-black text-white [-webkit-text-stroke:6px_var(--color-mag-ink)] [paint-order:stroke]" style={caption}>
            {c.caption}
          </span>
        </div>
        <span className="absolute top-4 left-4 bg-mag-ink/70 px-1.5 py-0.5 text-[11px] text-white">示範</span>
      </div>
    </div>
  );
}

function Timeline({ effect, run }: { effect: Effect; run: number }) {
  const cutting = effect === 'cut' || effect === 'filler';
  // 剪空拍那一項：先顯示完整素材，再看著空檔收起來
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    if (!cutting) return setCollapsed(true);
    setCollapsed(false);
    const t = setTimeout(() => setCollapsed(true), 700);
    return () => clearTimeout(t);
  }, [cutting, run]);
  return (
    <div className="mt-5" aria-hidden>
      <div className="flex h-6 gap-[2px] overflow-hidden">
        {SEGMENTS.map((s, i) => {
          const gone = !!s.cut && collapsed;
          return (
            <span
              key={i}
              className={`h-full transition-[flex-grow,opacity] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                s.cut ? 'bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.18)_0_4px,rgb(255_255_255/0.55)_4px_5px)]' : 'bg-white'
              } ${gone ? 'opacity-0' : ''}`}
              style={{ flexGrow: gone ? 0.0001 : s.len, flexBasis: 0 }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[12px] text-white/85">
        <span>{collapsed ? '剪好 00:29' : '原始 00:42'}</span>
        <span>{cutting && !collapsed ? '剪掉空拍中…' : '可以發佈了'}</span>
      </div>
    </div>
  );
}

// ---------- p.02 編輯室報告：本機剪輯 ----------

function EditorNote() {
  return (
    <section id="editor-note" className="scroll-mt-16 bg-mag-white px-4 pt-16 pb-20 sm:px-8">
      <Page page="p.02" title="編輯室報告">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          <h2 className="tategaki font-ming text-[clamp(32px,3.6vw,50px)] leading-[1.3] font-black lg:col-span-2 lg:h-[420px]">
            影片，
            <br />
            留在你的電腦
          </h2>
          <div className="grid gap-8 text-[16px] leading-[1.9] text-mag-soft md:grid-cols-3 lg:col-span-10 lg:gap-10">
            <div>
              <h3 className="font-ming text-[20px] font-black text-mag-ink">不必上傳</h3>
              <p className="mt-3">
                片刻剪趣採本機剪輯。你加入的影片、圖片和音樂只存在這台電腦的瀏覽器裡；剪輯、AI 字幕、翻譯、算圖和匯出，也都在你的瀏覽器裡完成。
              </p>
            </div>
            <div>
              <h3 className="font-ming text-[20px] font-black text-mag-ink">專案跟著帳戶走</h3>
              <p className="mt-3">剪輯的內容、字幕和設定會存到帳戶裡，只有你自己看得到。換一台電腦登入，專案的結構都還在。</p>
            </div>
            <div className="border-t-2 border-mag-blue pt-4 md:border-t-0 md:border-l-2 md:pt-0 md:pl-6">
              <h3 className="font-ming text-[20px] font-black text-mag-ink">需要注意的地方</h3>
              <p className="mt-3">
                換裝置時需重新提供素材：影片檔在原本那台電腦上，打開專案後把同樣的檔案再選一次（會依檔名和大小自動配對），就能接著剪。清除瀏覽器資料後也一樣，所以剪完前請保留原始影片。
              </p>
            </div>
          </div>
        </div>
        <p className="mt-12 text-right font-kai text-[18px] text-mag-ink">— 片刻剪趣編輯部</p>
      </Page>
    </section>
  );
}

// ---------- p.04 特輯：智能剪輯模板（資料直接來自 App 的模板設定，新增模板首頁會自動出現） ----------

function Templates() {
  return (
    <section id="templates" className="scroll-mt-16 px-4 pt-16 pb-24 sm:px-8">
      <Page page="p.04" title="特輯　智能剪輯">
        <Headline
          title="選一個模板，一鍵剪好"
          deck="智能剪輯會先剪掉空拍、上好字幕，再依模板換上字幕樣式，把重點句做成花字，配上音樂、音效和濾鏡。剪完每一項都能再調整。"
        />
        <ul className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-5">
          {SMART_TEMPLATES.map((t, i) => {
            const sfx = [t.sfx.intro, t.sfx.transition, t.sfx.flower, t.sfx.sticker].filter((x, j, a): x is string => !!x && a.indexOf(x) === j);
            const rows: [string, string][] = [
              ['配樂', TRACK_TITLE.get(t.music) ?? '—'],
              ['音效', sfx.length ? sfx.map((x) => TRACK_TITLE.get(x) ?? x).join('・') : '無'],
              ['濾鏡', t.filter ? (FILTER_PRESETS.find((p) => p.id === t.filter)?.name ?? '—') : '不改'],
              ['特效', INTENSITY_LABEL[t.intensity]],
              ['花字', `最多 ${t.flowerMax} 個`],
            ];
            return (
              <li key={t.id} className={i % 2 ? 'lg:pt-12' : ''}>
                <div className="grid aspect-[4/5] place-items-center content-center gap-2 overflow-hidden px-2" style={{ background: t.swatch }} aria-hidden>
                  <StylePreview style={t.flower} text="超好吃！" size={28} />
                  <StylePreview style={t.caption} text="字幕長這樣" size={15} />
                </div>
                <h3 className="mt-4 font-ming text-[21px] font-black">{t.name}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-mag-soft">{t.desc}</p>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-mag-ink/15 pt-3 text-[13px]">
                  {rows.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-mag-mute">{k}</dt>
                      <dd className="font-semibold">{v}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
        <p className="mt-12 max-w-[46em] text-[14px] leading-relaxed text-mag-soft">
          再套用一次會換掉上一次的花字、模板配樂和音效，你自己加的音樂不會被動到。不滿意可以一鍵復原。智能剪輯是 <ProTag /> 功能，新會員試用期間也能用。
        </p>
      </Page>
    </section>
  );
}

// ---------- p.06 功能索引 ----------

function FeatureIndex() {
  return (
    <section id="features" className="scroll-mt-16 bg-mag-white px-4 pt-16 pb-24 sm:px-8">
      <Page page="p.06" title="功能索引">
        <Headline title="剪一支短影音會用到的，都在這裡" deck="標了「專業版」的需要專業版，其餘免費就能用。" />
        <div className="gap-12 md:columns-2 lg:columns-3">
          {GROUPS.map((g) => (
            <div key={g.title} className="mb-12 break-inside-avoid">
              <h3 className="flex items-baseline justify-between border-t-2 border-mag-ink pt-3 font-ming text-[22px] font-black">
                {g.title}
                <span className="num text-[13px] font-medium text-mag-mute">{g.items.length} 項</span>
              </h3>
              <ul className="mt-2">
                {g.items.map((it) => (
                  <li key={it.name} className="border-b border-mag-ink/10 py-3">
                    <div className="flex items-baseline justify-between gap-3 text-[15px] leading-snug">
                      <span>
                        {it.name}
                        {it.pro && <ProTag />}
                      </span>
                      {it.qty && <span className="num shrink-0 text-[14px] font-bold">{it.qty}</span>}
                    </div>
                    {it.note && <p className="mt-1.5 text-[13px] leading-relaxed text-mag-mute">{it.note}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Page>
    </section>
  );
}

// ---------- p.08 跨頁：實際的編輯器畫面 ----------

function Spread() {
  return (
    <section className="px-4 pt-16 pb-24 sm:px-8">
      <Page page="p.08" title="跨頁　剪輯現場">
        <Headline title="這就是剪輯畫面" deck="上面的每一項，都在這個編輯器裡完成。左邊放素材，中間調整，右邊即時預覽，下方是時間軸。" />
        <figure>
          <div className="mx-auto max-w-[340px] sm:max-w-none">
            {/* 手機上整個編輯器縮到看不清，改給預覽區的特寫 */}
            <picture>
              <source media="(max-width: 639px)" srcSet="/editor-demo-mobile.jpg" width={920} height={1690} />
              <img
                src="/editor-demo.jpg"
                width={1440}
                height={900}
                loading="lazy"
                alt="片刻剪趣編輯器：時間軸上有三段小吃影片、轉場、三句字幕與一張「超好吃」貼紙，預覽畫面是烤香腸與黃色字幕"
                className="block h-auto w-full border border-mag-ink/15"
              />
            </picture>
          </div>
          <figcaption className="mt-4 grid gap-2 text-[14px] text-mag-soft sm:grid-cols-[1fr_auto]">
            <span className="font-kai text-[17px] text-mag-ink">圖｜片刻剪趣編輯器實際畫面，示範專案「台南小吃一日」。手機上顯示預覽區。</span>
            <span>照片：Unsplash</span>
          </figcaption>
        </figure>
      </Page>
    </section>
  );
}

// ---------- p.10 四種人的剪法（示範） ----------

function People() {
  return (
    <section className="bg-mag-white px-4 pt-16 pb-24 sm:px-8">
      <Page page="p.10" title="四種人的剪法">
        <Headline title="四種人，四種剪法" deck="不同類型的影片，在片刻剪趣裡各有順手的做法。以下是示範。" />
        <div className="grid gap-x-8 gap-y-12 border-t border-mag-ink sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-mag-ink/15">
          {ORDERS.map((o) => (
            <article key={o.title} className="pt-6 lg:px-6 lg:first:pl-0 lg:last:pr-0">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-ming text-[22px] font-black">{o.title}</h3>
                <span className="text-[12px] text-mag-mute">示範</span>
              </div>
              <p className="mt-2 font-kai text-[17px] text-mag-soft">{o.who}</p>
              <ul className="mt-5 space-y-2.5 text-[14px] leading-snug">
                {o.lines.map(([name, qty]) => (
                  <li key={name} className="flex items-baseline justify-between gap-3">
                    <span>{name}</span>
                    <span className="num shrink-0 font-bold">{qty}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex items-baseline justify-between border-t border-mag-ink/15 pt-3">
                <span className="text-[14px] font-bold">成品長度</span>
                <span className="num font-ming text-[34px] leading-none font-black text-mag-blue">{o.total}</span>
              </div>
            </article>
          ))}
        </div>
      </Page>
    </section>
  );
}

// ---------- p.14 問與答 ----------

function Faq() {
  return (
    <section id="faq" className="scroll-mt-16 bg-mag-white px-4 pt-16 pb-24 sm:px-8">
      <Page page="p.14" title="問與答">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
          <h2 className="font-ming text-[clamp(32px,3.8vw,52px)] leading-[1.2] font-black lg:sticky lg:top-24 lg:col-span-4 lg:self-start">問與答</h2>
          <div className="border-t border-mag-ink lg:col-span-8">
            {faqs.map(([q, a]) => (
              <details key={q} className="group border-b border-mag-ink/15">
                <summary className="flex cursor-pointer list-none items-baseline gap-4 py-5 text-[17px] font-bold [&::-webkit-details-marker]:hidden">
                  <span className="font-ming text-[17px] font-black text-mag-blue" aria-hidden>
                    問
                  </span>
                  <span className="flex-1">{q}</span>
                  <Plus className="size-5 shrink-0 self-center text-mag-ink transition-transform group-open:rotate-45" aria-hidden />
                </summary>
                <p className="pb-6 pl-9 pr-9 text-[15px] leading-[1.9] text-mag-soft">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </Page>
    </section>
  );
}

// ---------- 封底 ----------

function BackCover() {
  return (
    <section className="bg-mag-blue px-4 pt-14 pb-20 text-white sm:px-8">
      <Page page="封底" title="下一支，今天就剪" tone="blue">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-ming text-[clamp(38px,5.2vw,76px)] leading-[1.15] font-black text-balance">今天就剪出第一支短影音</h2>
            <p className="mt-5 text-[18px] text-white/90">免費註冊，立即享有 7 天專業版，不需信用卡。</p>
          </div>
          <div className="flex flex-col items-start gap-5 lg:items-end">
            <Link to="/register" className={mkButton('paper', 'lg')}>
              免費開始剪輯 <ArrowRight className="size-5" />
            </Link>
            <div className="flex items-end gap-3 text-white/85">
              <Barcode value="PIANKE-ISSUE-01" className="h-10 w-[170px]" />
              <span className="font-ming text-[12px] leading-tight">
                創刊號
                <br />
                定價 <span className="num">NT$0</span> 起
              </span>
            </div>
          </div>
        </div>
      </Page>
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
      { name: '原創手繪貼紙', qty: '35 款' },
      { name: '貼紙動畫', qty: '6 種' },
      { name: '濾鏡，可調強度', qty: '14 種' },
      { name: '亮度、對比、飽和度、色溫、暗角、顆粒微調' },
      { name: '轉場', qty: '10 種' },
      { name: '片段動態：慢慢放大、縮小、特寫推近、震動', qty: '4 種' },
      { name: '美肌：磨皮、美白、紅潤', note: '4 種預設，可個別微調；主軌和疊加片段都能用。' },
    ],
  },
  {
    title: 'AI 自動處理',
    items: [
      { name: '智能剪輯', qty: '5 個模板', pro: true, note: '一鍵剪空拍、上字幕、花字、配樂、音效和濾鏡。' },
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

// ---------- 問與答資料 ----------

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
