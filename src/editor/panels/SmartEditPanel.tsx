import { useEffect, useState } from 'react';
import { Loader2, Music2, RotateCcw, WandSparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { runSmartEdit, type SmartEditResult } from '../../lib/smartEdit';
import { SMART_TEMPLATES, type SmartTemplate } from '../../lib/templates';
import type { CaptionStyle, LibraryTrack } from '../../lib/types';
import { Button, ProBadge, useToast, useUpgrade } from '../../components/ui';
import { useEditor } from '../store';

/** 卡片上的字樣預覽：用模板的字幕／花字樣式畫一小段字 */
function StylePreview({ style, text, size }: { style: Omit<CaptionStyle, 'animation'>; text: string; size: number }) {
  const sh = style.shadow;
  const shadow = sh ? `${Math.cos((sh.angle * Math.PI) / 180) * sh.distance * 0.12}px ${Math.sin((sh.angle * Math.PI) / 180) * sh.distance * 0.12}px ${sh.blur * 0.12}px ${sh.color}` : undefined;
  return (
    <span
      className="inline-block leading-tight font-black whitespace-nowrap"
      style={{
        fontFamily: `"${style.font}", "Noto Sans TC", sans-serif`,
        fontSize: size,
        color: style.color,
        background: style.background ?? undefined,
        padding: style.background ? '1px 6px' : undefined,
        borderRadius: style.background ? 4 : undefined,
        WebkitTextStroke: style.background ? undefined : `${Math.max(2, size / 7)}px ${style.stroke}`,
        paintOrder: 'stroke',
        textShadow: shadow,
      }}
    >
      {text}
    </span>
  );
}

export function SmartEditPanel() {
  const { user } = useAuth();
  const isPro = user?.plan === 'pro';
  const upgrade = useUpgrade();
  const toast = useToast();
  const hasClips = useEditor((s) => s.data.clips.length > 0);
  const captionCount = useEditor((s) => s.data.captions.filter((c) => c.role !== 'flower').length);
  const [library, setLibrary] = useState<LibraryTrack[]>([]);
  const [pick, setPick] = useState<SmartTemplate>(SMART_TEMPLATES[0]);
  const [regen, setRegen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState<{ tpl: SmartTemplate; counts: SmartEditResult['counts'] } | null>(null);

  useEffect(() => {
    api.music().then((r) => setLibrary(r.items)).catch(() => setLibrary([]));
  }, []);

  const run = async () => {
    if (!isPro) return upgrade('智能剪輯是專業版功能，一鍵完成剪輯、字幕、花字、配樂和音效。');
    const base = useEditor.getState().data;
    if (!base.clips.length) return toast('主軌上還沒有影片', 'error');
    setDone(null);
    setStatus('分析影片內容');
    try {
      const result = await runSmartEdit(base, pick, library, { regenerateCaptions: regen }, setStatus);
      // 分析期間又改了專案就不套用，避免蓋掉修改
      if (useEditor.getState().data !== base) {
        toast('剪輯期間專案有變動，請再按一次', 'info');
        return;
      }
      useEditor.getState().commit(() => result.data);
      setDone({ tpl: pick, counts: result.counts });
      toast(`已套用「${pick.name}」模板`, 'success');
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

  const c = done?.counts;
  const lines = c
    ? [
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
      ].filter(Boolean)
    : [];

  return (
    <div className="p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-extrabold">智能剪輯</h2>
        {!isPro && <ProBadge />}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-mute">選一個模板，一鍵剪掉空拍、配上字幕、花字、音樂和音效。完成後每一項都能再調整，也能一鍵復原。</p>

      <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="模板">
        {SMART_TEMPLATES.map((t) => {
          const on = pick.id === t.id;
          const song = library.find((s) => s.id === t.music);
          return (
            <button
              key={t.id}
              role="radio"
              aria-checked={on}
              onClick={() => setPick(t)}
              className={`overflow-hidden rounded-2xl border-2 text-left transition ${on ? 'border-brand' : 'border-line hover:border-ink-mute/40'}`}
            >
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
      <p className="mt-3 text-xs leading-relaxed text-ink-soft">{pick.desc}</p>

      {captionCount > 0 && (
        <label className="mt-3 flex items-start gap-2 text-xs">
          <input type="checkbox" className="mt-0.5 accent-brand" checked={regen} onChange={(e) => setRegen(e.target.checked)} />
          <span>
            重新辨識字幕
            <span className="block text-[11px] text-ink-mute">不勾選就沿用目前的 {captionCount} 句字幕，只換樣式</span>
          </span>
        </label>
      )}

      {done ? (
        <div className="mt-4 rounded-2xl bg-brand-soft/60 p-3">
          <div className="text-sm font-extrabold text-brand">已套用「{done.tpl.name}」</div>
          <ul className="mt-1.5 space-y-0.5 text-xs text-ink-soft">
            {lines.map((l) => (
              <li key={l as string}>・{l}</li>
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
        <Button className="mt-4 w-full" onClick={run} disabled={!!status || !hasClips}>
          {status ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
          {status ?? (hasClips ? '一鍵智能剪輯' : '先把影片加到主軌')}
        </Button>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-ink-mute">再套用一次會換掉上一次的花字、模板配樂和音效；你自己上傳的音樂不會被動到。之後會陸續新增模板。</p>
    </div>
  );
}
