import { useState } from 'react';
import { Languages, Loader2, Plus, X } from 'lucide-react';
import { translateTexts } from '../lib/translate';
import type { Caption } from '../lib/types';
import { useToast } from '../components/ui';
import { ensureUnlocked } from './locks';
import { useEditor } from './store';

/** 屬性面板裡的雙語字幕翻譯：直接修改、重新翻譯這句、移除；沒有翻譯的字幕可以自己加 */
export function TranslationField({ caption: c }: { caption: Caption }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const update = (translation: string | undefined, live = false) => {
    if (!ensureUnlocked('caption')) return;
    const fn = (d: ReturnType<typeof useEditor.getState>['data']) => ({
      ...d,
      captions: d.captions.map((x) => (x.id === c.id ? { ...x, translation } : x)),
    });
    live ? useEditor.getState().live(fn) : useEditor.getState().commit(fn);
  };

  const retranslate = async () => {
    if (!c.text.trim() || !ensureUnlocked('caption')) return;
    const text = c.text;
    try {
      setBusy('準備翻譯');
      const [out] = await translateTexts([text.replace(/\n/g, ' ')], 'en', (p) =>
        setBusy(p.phase === 'download' ? `下載翻譯模型 ${Math.round(p.progress)}%` : '翻譯中'),
      );
      // 翻譯期間字幕被改過就不套用，避免翻到舊的句子
      if (useEditor.getState().data.captions.find((x) => x.id === c.id)?.text !== text) return toast('翻譯期間字幕改過了，請再按一次', 'info');
      update(out ?? '');
    } catch (e) {
      toast('翻譯失敗：' + (e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  if (c.role === 'flower') return null;
  if (c.translation === undefined) {
    return (
      <button className="mt-2 flex items-center gap-1 text-xs font-bold text-brand hover:underline" onClick={() => update('')}>
        <Plus className="size-3.5" /> 加上英文翻譯
      </button>
    );
  }
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-semibold text-ink-soft">英文翻譯</span>
        <button
          className="ml-auto flex items-center gap-1 text-[11px] font-bold text-brand disabled:text-ink-mute"
          disabled={!!busy || !c.text.trim()}
          onClick={() => void retranslate()}
          title="依目前的中文重新翻譯這句"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Languages className="size-3" />}
          {busy ?? '重新翻譯這句'}
        </button>
        <button className="grid size-5 place-items-center rounded text-ink-mute hover:bg-sunken hover:text-ink" onClick={() => update(undefined)} title="移除這句的翻譯" aria-label="移除這句的翻譯">
          <X className="size-3.5" />
        </button>
      </div>
      <textarea
        aria-label="英文翻譯"
        className="h-16 w-full resize-none rounded-xl border border-line bg-surface p-2.5 text-sm outline-none focus:border-brand"
        value={c.translation}
        placeholder="輸入英文翻譯（留空就不顯示）"
        onFocus={() => useEditor.getState().checkpoint()}
        onChange={(e) => update(e.target.value, true)}
      />
    </div>
  );
}
