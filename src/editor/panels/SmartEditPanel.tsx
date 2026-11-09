import { useEffect, useState } from 'react';
import { Activity, Images, Loader2, Music2, RotateCcw, WandSparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { checkOpeningHook, swapToOpening } from '../../lib/hookCheck';
import { findSimilarAdjacentShots, type SimilarShotPair } from '../../lib/shotSimilarity';
import { runSmartEdit, type SmartEditResult } from '../../lib/smartEdit';
import { SMART_TEMPLATES, type SmartTemplate } from '../../lib/templates';
import type { LibraryTrack, ProjectData } from '../../lib/types';
import { StylePreview } from '../../components/StylePreview';
import { Button, ProBadge, useToast, useUpgrade } from '../../components/ui';
import { useEditor } from '../store';
import { ensureUnlocked } from '../locks';

const MAX_COMPARE = 3;

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
  ].filter(Boolean) as string[];
}

export function SmartEditPanel({ seek }: { seek: (t: number) => void }) {
  const { user } = useAuth();
  const isPro = user?.plan === 'pro';
  const upgrade = useUpgrade();
  const toast = useToast();
  const hasClips = useEditor((s) => s.data.clips.length > 0);
  const captionCount = useEditor((s) => s.data.captions.filter((c) => c.role !== 'flower').length);
  const clipsKey = useEditor((s) => s.data.clips.map((c) => `${c.id}:${c.mediaId}:${c.in}:${c.out}`).join('|'));
  const [library, setLibrary] = useState<LibraryTrack[]>([]);
  const [selected, setSelected] = useState<SmartTemplate[]>([SMART_TEMPLATES[0]]);
  const [regen, setRegen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState<{ tpl: SmartTemplate; counts: SmartEditResult['counts'] } | null>(null);
  // 選 2-3 個模板時，先把每個模板實際跑過一次（真正的剪輯結果，不是猜的），
  // 列出來比較之後再選一個套用；只選 1 個就跟以前一樣直接套用，不用多一次確認
  const [candidates, setCandidates] = useState<{ tpl: SmartTemplate; result: SmartEditResult }[] | null>(null);
  const [weakOpening, setWeakOpening] = useState<string | null>(null);
  const [similarPairs, setSimilarPairs] = useState<SimilarShotPair[]>([]);

  useEffect(() => {
    api.music().then((r) => setLibrary(r.items)).catch(() => setLibrary([]));
  }, []);

  // 開場強度檢查、連續鏡頭相似度檢查：都要逐格讀取畫面，只在主軌片段真的變動時才重新算一次
  useEffect(() => {
    setWeakOpening(null);
    setSimilarPairs([]);
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

  const toggle = (t: SmartTemplate) => {
    setDone(null);
    setCandidates(null);
    setSelected((s) => {
      if (s.some((x) => x.id === t.id)) return s.filter((x) => x.id !== t.id);
      if (s.length >= MAX_COMPARE) return s; // 最多比較 3 個，避免要跑太多次分析
      return [...s, t];
    });
  };

  const applyResult = (tpl: SmartTemplate, result: SmartEditResult, base: ProjectData) => {
    // 分析期間又改了專案就不套用，避免蓋掉修改
    if (useEditor.getState().data !== base) {
      toast('剪輯期間專案有變動，請再試一次', 'info');
      return;
    }
    useEditor.getState().commit(() => result.data);
    setDone({ tpl, counts: result.counts });
    setCandidates(null);
    toast(`已套用「${tpl.name}」模板`, 'success');
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
    <div className="p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-extrabold">智能剪輯</h2>
        {!isPro && <ProBadge />}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-mute">
        選 1 個模板直接套用，或選 2-3 個先比較結果再決定。一鍵剪掉空拍、配上字幕、花字、音樂和音效，完成後每一項都能再調整，也能一鍵復原。
      </p>

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
          <div className="text-sm font-extrabold text-brand">已套用「{done.tpl.name}」</div>
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
    </div>
  );
}
