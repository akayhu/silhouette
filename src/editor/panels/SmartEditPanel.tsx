import { useEffect, useState } from 'react';
import { Activity, Film, Images, Loader2, Music2, RotateCcw, WandSparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { coverSize, defaultCover, renderCover } from '../../lib/cover';
import { formatTime } from '../../lib/format';
import { checkOpeningHook, swapToOpening } from '../../lib/hookCheck';
import { findHighlights, type HighlightCandidate } from '../../lib/highlightDetect';
import { findSimilarAdjacentShots, type SimilarShotPair } from '../../lib/shotSimilarity';
import { brollCandidates } from '../../lib/autoBroll';
import { takeIntentTemplate } from '../../lib/autoPick';
import { runSmartEdit, type SmartEditResult } from '../../lib/smartEdit';
import { SMART_TEMPLATES, type SmartTemplate } from '../../lib/templates';
import type { LibraryTrack, ProjectData } from '../../lib/types';
import { StylePreview } from '../../components/StylePreview';
import { Button, ProBadge, useToast, useUpgrade } from '../../components/ui';
import { useEditor } from '../store';
import { ensureUnlocked } from '../locks';
import { PanelNav, panelContentClass, PanelShell } from '../PanelNav';

const MAX_COMPARE = 3;

type Section = 'apply' | 'suggest';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'apply', label: '套用模板' },
  { id: 'suggest', label: '智慧建議' },
];

function summaryLines(c: SmartEditResult['counts']) {
  return [
    c.cuts > 0 && `剪掉 ${c.cuts} 段空拍，共 ${c.removed.toFixed(1)} 秒`,
    c.subtitles > 0 && `自動字幕 ${c.subtitles} 句`,
    c.captionStyled > 0 && `${c.captionStyled} 句字幕換上模板樣式`,
    c.flowers > 0 && `花字 ${c.flowers} 個`,
    c.music && `配樂「${c.music}」`,
    c.sfx > 0 && `音效 ${c.sfx} 個`,
    c.filter && `濾鏡「${c.filter}」`,
    c.punch + c.shake > 0 && `重點特寫 ${c.punch + c.shake} 個`,
    c.transitions > 0 && `轉場 ${c.transitions} 個`,
    c.stickers > 0 && `貼紙 ${c.stickers} 個`,
    c.broll > 0 && `空鏡 ${c.broll} 段`,
  ].filter(Boolean) as string[];
}

export function SmartEditPanel({ seek }: { seek: (t: number) => void }) {
  const [section, setSection] = useState<Section>('apply');
  const { user } = useAuth();
  const isPro = user?.plan === 'pro';
  const upgrade = useUpgrade();
  const toast = useToast();
  const hasClips = useEditor((s) => s.data.clips.length > 0);
  const captionCount = useEditor((s) => s.data.captions.filter((c) => c.role !== 'flower').length);
  const clipsKey = useEditor((s) => s.data.clips.map((c) => `${c.id}:${c.mediaId}:${c.in}:${c.out}`).join('|'));
  const [library, setLibrary] = useState<LibraryTrack[]>([]);
  // 首頁選過「我要剪這種影片」就預先選好對應模板（只用一次）
  const [intent] = useState(() => takeIntentTemplate(SMART_TEMPLATES));
  const [selected, setSelected] = useState<SmartTemplate[]>([intent ?? SMART_TEMPLATES[0]]);
  const [regen, setRegen] = useState(false);
  const brollPool = useEditor((s) => brollCandidates(s.data).length);
  const [withBroll, setWithBroll] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState<{ tpl: SmartTemplate; counts: SmartEditResult['counts']; auto?: string[] } | null>(null);
  // 選 2-3 個模板時，先把每個模板實際跑過一次（真正的剪輯結果，不是猜的），
  // 列出來比較之後再選一個套用；只選 1 個就跟以前一樣直接套用，不用多一次確認
  const [candidates, setCandidates] = useState<{ tpl: SmartTemplate; result: SmartEditResult }[] | null>(null);
  const [weakOpening, setWeakOpening] = useState<string | null>(null);
  const [similarPairs, setSimilarPairs] = useState<SimilarShotPair[]>([]);
  const [findingHighlights, setFindingHighlights] = useState(false);
  const [highlights, setHighlights] = useState<{ candidate: HighlightCandidate; thumb: string }[] | null>(null);

  useEffect(() => {
    api.music().then((r) => setLibrary(r.items)).catch(() => setLibrary([]));
  }, []);

  // 開場強度檢查、連續鏡頭相似度檢查：都要逐格讀取畫面，只在主軌片段真的變動時才重新算一次
  useEffect(() => {
    setWeakOpening(null);
    setSimilarPairs([]);
    setHighlights(null);
    if (!clipsKey) return;
    let cancelled = false;
    const base = useEditor.getState().data;
    checkOpeningHook(base).then((r) => {
      if (!cancelled && useEditor.getState().data === base && r.weak && r.betterClipId) setWeakOpening(r.betterClipId);
    });
    const mediaById = new Map(base.media.map((m) => [m.id, m]));
    findSimilarAdjacentShots(base.clips, mediaById).then((pairs) => {
      if (!cancelled && useEditor.getState().data === base && pairs.length) setSimilarPairs(pairs);
    });
    return () => {
      cancelled = true;
    };
  }, [clipsKey]);

  const applyBetterOpening = () => {
    if (!weakOpening) return;
    if (!ensureUnlocked('main')) return;
    useEditor.getState().commit((d) => swapToOpening(d, weakOpening));
    setWeakOpening(null);
    toast('已把動態較大的片段換到開場', 'success');
  };

  // 精彩片段抓取：逐格讀整支影片的畫面動態，比較花時間，不自動跑，按了才分析
  const findHighlightClips = async () => {
    setFindingHighlights(true);
    setHighlights(null);
    try {
      const base = useEditor.getState().data;
      const result = await findHighlights(base);
      if (useEditor.getState().data !== base) return toast('分析期間專案有變動，請再試一次', 'info');
      if (!result.length) return toast('沒有找到明顯突出的片段，可能影片本身節奏就很平均', 'info');
      // 縮圖依序畫（不平行）：好幾個 Engine 同時搶同一段影片解碼容易來不及就緒
      const { width, height } = coverSize(base);
      const tw = 96;
      const th = Math.max(1, Math.round((tw * height) / width));
      const withThumbs: { candidate: HighlightCandidate; thumb: string }[] = [];
      for (const candidate of result) {
        const canvas = await renderCover(base, { ...defaultCover(), time: candidate.start }, tw, th);
        withThumbs.push({ candidate, thumb: canvas.toDataURL('image/jpeg', 0.75) });
      }
      if (useEditor.getState().data !== base) return;
      setHighlights(withThumbs);
    } finally {
      setFindingHighlights(false);
    }
  };

  const toggle = (t: SmartTemplate) => {
    setDone(null);
    setCandidates(null);
    setSelected((s) => {
      if (s.some((x) => x.id === t.id)) return s.filter((x) => x.id !== t.id);
      if (s.length >= MAX_COMPARE) return s; // 最多比較 3 個，避免要跑太多次分析
      return [...s, t];
    });
  };

  const applyResult = (tpl: SmartTemplate, result: SmartEditResult, base: ProjectData, auto?: string[]) => {
    // 分析期間又改了專案就不套用，避免蓋掉修改
    if (useEditor.getState().data !== base) {
      toast('剪輯期間專案有變動，請再試一次', 'info');
      return;
    }
    useEditor.getState().commit(() => result.data);
    setDone({ tpl, counts: result.counts, auto });
    setCandidates(null);
    toast(auto ? `已一鍵自動剪輯，挑了「${tpl.name}」模板` : `已套用「${tpl.name}」模板`, 'success');
  };

  // 一鍵自動剪輯：不用選模板，剪空拍、剪掉講錯重講、上字幕，依內容挑模板，花字、配樂、音效一次配好
  const runAuto = async () => {
    if (!isPro) return upgrade('一鍵自動剪輯是專業版功能，剪輯、字幕、花字、配樂和音效一次完成。');
    const base = useEditor.getState().data;
    if (!base.clips.length) return toast('主軌上還沒有影片', 'error');
    setDone(null);
    setCandidates(null);
    try {
      setStatus('分析影片內容');
      const result = await runSmartEdit(base, 'auto', library, { regenerateCaptions: regen, broll: withBroll && brollPool > 0 }, setStatus);
      applyResult(result.template, result, base, result.matched);
    } catch (e) {
      toast('一鍵自動剪輯失敗：' + (e as Error).message, 'error');
    } finally {
      setStatus(null);
    }
  };

  const run = async () => {
    if (!isPro) return upgrade('智能剪輯是專業版功能，一鍵完成剪輯、字幕、花字、配樂和音效。');
    const base = useEditor.getState().data;
    if (!base.clips.length) return toast('主軌上還沒有影片', 'error');
    setDone(null);
    setCandidates(null);
    try {
      if (selected.length === 1) {
        setStatus('分析影片內容');
        const result = await runSmartEdit(base, selected[0], library, { regenerateCaptions: regen }, setStatus);
        applyResult(selected[0], result, base);
        return;
      }
      // 2-3 個模板依序實際跑一次，不會互相干擾（runSmartEdit 不會動到目前的專案，只是算出結果）
      const results: { tpl: SmartTemplate; result: SmartEditResult }[] = [];
      for (const tpl of selected) {
        setStatus(`分析「${tpl.name}」`);
        results.push({ tpl, result: await runSmartEdit(base, tpl, library, { regenerateCaptions: regen }, setStatus) });
      }
      if (useEditor.getState().data !== base) {
        toast('剪輯期間專案有變動，請再試一次', 'info');
        return;
      }
      setCandidates(results);
    } catch (e) {
      toast('智能剪輯失敗：' + (e as Error).message, 'error');
    } finally {
      setStatus(null);
    }
  };

  const undo = () => {
    useEditor.getState().undo();
    setDone(null);
  };

  const lines = done ? summaryLines(done.counts) : [];

  return (
    <PanelShell>
      <PanelNav sections={SECTIONS} value={section} onChange={setSection} />
      <div className={panelContentClass}>
      {section === 'suggest' && <>
      <h2 className="text-sm font-extrabold">智慧建議</h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-mute">依畫面動態、字幕密度抓出開場強度、鏡頭相似度跟精彩片段，純訊號分析，不是真的能聽懂內容的 AI。</p>
      {!weakOpening && !similarPairs.length && !hasClips && <p className="mt-3 rounded-xl bg-sunken p-3 text-xs text-ink-soft">主軌上還沒有影片，先加入影片再回來看建議。</p>}
      {(weakOpening || similarPairs.length > 0) && (
        <div className="mt-3 divide-y divide-line rounded-xl border border-line">
          {weakOpening && (
            <div className="flex items-start gap-2.5 p-3">
              <Activity className="mt-0.5 size-4 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold">開場有點靜</div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">前幾秒畫面變化不大，容易被滑掉；後面有一段動態明顯更強。</p>
                <Button size="sm" className="mt-2" onClick={applyBetterOpening}>
                  換成開場
                </Button>
              </div>
            </div>
          )}
          {similarPairs.length > 0 && (
            <div className="flex items-start gap-2.5 p-3">
              <Images className="mt-0.5 size-4 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold">有 {similarPairs.length} 處銜接畫面很像</div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">兩段接起來色調、畫面都很接近，可能看不太出來有剪接。</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {similarPairs.map((p, i) => (
                    <button key={p.nextId} className="rounded-lg border border-line px-2 py-1 text-[11px] font-bold text-ink-soft hover:border-brand/40 hover:text-brand" onClick={() => seek(p.at)}>
                      接點 {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {hasClips && (
        <div className="mt-3 rounded-xl border border-line p-3">
          <div className="flex items-start gap-2.5">
            <Film className="mt-0.5 size-4 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold">精彩片段</div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">依字幕密度、強調詞和畫面動態，抓出影片裡幾段比較突出的時間窗，適合剪成獨立短片。</p>
              <Button variant="secondary" size="sm" className="mt-2" disabled={findingHighlights} onClick={findHighlightClips}>
                {findingHighlights ? <Loader2 className="size-3.5 animate-spin" /> : <Film className="size-3.5" />}
                {findingHighlights ? '分析畫面中…' : '找精彩片段'}
              </Button>
              {highlights && (
                <ul className="mt-2.5 space-y-1.5">
                  {highlights.map(({ candidate: h, thumb }, i) => (
                    <li key={h.start} className="flex items-center gap-2.5 rounded-xl bg-sunken p-2">
                      <img src={thumb} alt="" className="h-12 w-8 shrink-0 rounded-md object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold">{h.title ?? `第 ${i + 1} 段`}</div>
                        <div className="text-[11px] text-ink-mute">
                          {formatTime(h.start)} - {formatTime(h.end)}
                        </div>
                      </div>
                      <button className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-brand hover:bg-brand-soft" onClick={() => seek(h.start)}>
                        跳到這段
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      </>}

      {section === 'apply' && <>
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-extrabold">智能剪輯</h2>
        {!isPro && <ProBadge />}
      </div>
      <div className="mt-3 rounded-2xl border border-brand/25 bg-brand-soft/50 p-3">
        <div className="text-sm font-extrabold text-brand">一鍵自動剪輯</div>
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          不用選模板：自動剪掉空拍和「嗯、啊」、講錯重講只留後面那次，辨識字幕，依內容挑模板，重點句做成花字，音樂音效一起配好。
        </p>
        <Button className="mt-2.5 w-full" onClick={runAuto} disabled={!!status || !hasClips}>
          {status ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
          {status ?? (!hasClips ? '先把影片加到主軌' : '一鍵自動剪輯')}
        </Button>
        {brollPool > 0 && (
          <label className="mt-2 flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5 accent-brand" checked={withBroll} onChange={(e) => setWithBroll(e.target.checked)} />
            <span>
              順便在講話的地方蓋空鏡
              <span className="block text-[11px] text-ink-mute">用素材庫裡 {brollPool} 個還沒放上時間軸的影片與圖片</span>
            </span>
          </label>
        )}
      </div>
      {intent && <p className="mt-3 rounded-xl bg-sunken px-3 py-2 text-xs text-ink-soft">依你在首頁選的類型，已預先選好「{intent.name}」模板，可以改選別的。</p>}
      <p className="mt-4 text-xs leading-relaxed text-ink-mute">
        想自己挑風格？選 1 個模板直接套用，或選 2-3 個先比較結果再決定。完成後每一項都能再調整，也能一鍵復原。
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="模板（可多選比較）">
        {SMART_TEMPLATES.map((t) => {
          const on = selected.some((x) => x.id === t.id);
          const song = library.find((s) => s.id === t.music);
          return (
            <button
              key={t.id}
              aria-pressed={on}
              onClick={() => toggle(t)}
              className={`relative overflow-hidden rounded-2xl border-2 text-left transition ${on ? 'border-brand' : 'border-line hover:border-ink-mute/40'}`}
            >
              {on && (
                <span className="absolute top-1.5 right-1.5 z-10 grid size-5 place-items-center rounded-full bg-brand text-[10px] font-bold text-white">
                  {selected.findIndex((x) => x.id === t.id) + 1}
                </span>
              )}
              <div className="relative grid h-20 place-items-center gap-0.5 px-1" style={{ background: t.swatch }}>
                <StylePreview style={t.flower} text="超好吃！" size={17} />
                <StylePreview style={t.caption} text="字幕長這樣" size={10} />
              </div>
              <div className="p-2">
                <div className={`text-[13px] font-extrabold ${on ? 'text-brand' : ''}`}>{t.name}</div>
                <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-ink-mute">
                  <Music2 className="size-3 shrink-0" /> {song?.title ?? '—'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-soft">
        {selected.length === 1 ? selected[0].desc : selected.length > 1 ? `已選 ${selected.length} 個模板，跑完後可以比較實際結果再選一個套用。` : '請選至少 1 個模板。'}
      </p>

      {captionCount > 0 && (
        <label className="mt-3 flex items-start gap-2 text-xs">
          <input type="checkbox" className="mt-0.5 accent-brand" checked={regen} onChange={(e) => setRegen(e.target.checked)} />
          <span>
            重新辨識字幕
            <span className="block text-[11px] text-ink-mute">不勾選就沿用目前的 {captionCount} 句字幕，只換樣式</span>
          </span>
        </label>
      )}

      {candidates ? (
        <div className="mt-4 space-y-2.5">
          {candidates.map(({ tpl, result }) => (
            <div key={tpl.id} className="rounded-2xl border border-line bg-surface p-3">
              <div className="text-sm font-extrabold">{tpl.name}</div>
              <ul className="mt-1.5 space-y-0.5 text-xs text-ink-soft">
                {summaryLines(result.counts).map((l) => (
                  <li key={l}>・{l}</li>
                ))}
              </ul>
              <Button size="sm" className="mt-2.5 w-full" onClick={() => applyResult(tpl, result, useEditor.getState().data)}>
                套用「{tpl.name}」
              </Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" className="w-full" onClick={() => setCandidates(null)}>
            重新選擇模板
          </Button>
        </div>
      ) : done ? (
        <div className="mt-4 rounded-2xl bg-brand-soft/60 p-3">
          <div className="text-sm font-extrabold text-brand">{done.auto ? `一鍵自動剪輯完成，挑了「${done.tpl.name}」` : `已套用「${done.tpl.name}」`}</div>
          {done.auto && <p className="mt-1 text-[11px] text-ink-mute">{done.auto.length ? `依內容關鍵字：${done.auto.slice(0, 4).join('、')}` : '內容沒有明顯類型，用最通用的口播風格'}；配樂也是依字幕內容與語速挑的。</p>}
          <ul className="mt-1.5 space-y-0.5 text-xs text-ink-soft">
            {lines.map((l) => (
              <li key={l}>・{l}</li>
            ))}
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" onClick={undo}>
              <RotateCcw className="size-3.5" /> 復原
            </Button>
            <Button size="sm" onClick={() => setDone(null)}>
              換個模板
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-4 w-full" onClick={run} disabled={!!status || !hasClips || selected.length === 0}>
          {status ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
          {status ?? (!hasClips ? '先把影片加到主軌' : selected.length > 1 ? `比較這 ${selected.length} 個模板` : '一鍵智能剪輯')}
        </Button>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-ink-mute">再套用一次會換掉上一次的花字、模板配樂和音效；你自己上傳的音樂不會被動到。之後會陸續新增模板。</p>
      </>}
      </div>
    </PanelShell>
  );
}
