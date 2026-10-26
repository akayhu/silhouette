import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import { checkCaptions, fixCaptions, ISSUE_LABELS, MAX_CPS, MAX_LINE, MIN_DURATION, summarizeIssues, type CaptionIssue } from '../../lib/captionCheck';
import { formatCaptionTime } from '../../lib/captions';
import { Button, useToast } from '../../components/ui';
import { useEditor } from '../store';
import { ensureUnlocked } from '../locks';

/** 一鍵修正：回傳修了幾處、還剩幾個要自己處理 */
export function fixCaptionIssues(ids?: Set<string>) {
  if (!ensureUnlocked('caption')) return null;
  let fixed = 0;
  useEditor.getState().commit((d) => {
    const result = fixCaptions(d.captions, ids);
    fixed = result.fixed;
    return result.fixed ? { ...d, captions: result.captions } : d;
  });
  return { fixed, left: checkCaptions(useEditor.getState().data.captions).length };
}

/** 字幕面板上方的品質檢查：列出讀不完、重疊、太短、太長、空白的字幕，可以逐句或全部修正 */
export function CaptionCheck({ seek }: { seek: (t: number) => void }) {
  const toast = useToast();
  const captions = useEditor((s) => s.data.captions);
  const locked = useEditor((s) => !!s.data.locks?.caption);
  const issues = useMemo(() => checkCaptions(captions), [captions]);
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => {
    const byId = new Map<string, CaptionIssue[]>();
    for (const i of issues) byId.set(i.id, [...(byId.get(i.id) ?? []), i]);
    return [...byId].map(([id, list]) => ({ caption: captions.find((c) => c.id === id)!, list })).filter((r) => r.caption);
  }, [issues, captions]);

  if (!captions.some((c) => c.role !== 'flower')) return null;
  if (!issues.length) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-mute">
        <CheckCircle2 className="size-3.5 text-mint" /> 字幕檢查通過：每行 {MAX_LINE} 字內、每秒 {MAX_CPS} 字內、沒有重疊
      </p>
    );
  }

  const fix = (ids?: Set<string>) => {
    const r = fixCaptionIssues(ids);
    if (!r) return;
    toast(r.left ? `已修正 ${r.fixed} 處，還有 ${r.left} 個要自己調整` : `已修正 ${r.fixed} 處；可以按 ⌘Z 復原`, r.left ? 'info' : 'success');
  };

  return (
    <section className="mt-3 rounded-xl border border-line" aria-label="字幕品質檢查">
      <div className="flex items-center gap-2 p-2">
        <AlertTriangle className="size-4 shrink-0 text-brand" />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <div className="text-xs font-bold">品質檢查：{rows.length} 句需要注意</div>
          <div className="truncate text-[11px] text-ink-mute">{summarizeIssues(issues)}</div>
        </button>
        <button className="grid size-7 place-items-center rounded-lg text-ink-soft hover:bg-sunken" onClick={() => setOpen(!open)} aria-label={open ? '收合' : '展開'}>
          <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <Button size="sm" disabled={locked} onClick={() => fix()}>
          全部修正
        </Button>
      </div>
      {open && (
        <>
          <ul className="max-h-72 divide-y divide-line overflow-y-auto border-t border-line">
            {rows.map(({ caption, list }) => (
              <li key={caption.id} className="flex items-start gap-2 px-2 py-2">
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    useEditor.getState().select({ type: 'caption', id: caption.id });
                    seek(caption.start);
                  }}
                  title="跳到這句"
                >
                  <div className="flex items-baseline gap-1.5 text-xs">
                    <span className="shrink-0 text-[11px] text-ink-mute tabular-nums">{formatCaptionTime(caption.start).slice(3, 8)}</span>
                    <span className="truncate font-semibold">{caption.text.trim() || '（空白）'}</span>
                  </div>
                  {list.map((i) => (
                    <div key={i.kind} className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">
                      <span className="font-bold text-brand">{ISSUE_LABELS[i.kind]}</span>　{i.message}
                      {i.manual && <span className="block text-ink-mute">→ {i.manual}</span>}
                    </div>
                  ))}
                </button>
                <button
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-brand hover:bg-brand-soft disabled:opacity-40"
                  disabled={locked}
                  onClick={() => fix(new Set([caption.id]))}
                >
                  修正
                </button>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-2 py-1.5 text-[10px] leading-relaxed text-ink-mute">
            修正方式：刪掉空白字幕、太長的句子在標點處拆成兩句、重疊的前一句提早結束、太短或太快的往後延長（最少 {MIN_DURATION} 秒，不會蓋到下一句）。
          </p>
        </>
      )}
    </section>
  );
}
