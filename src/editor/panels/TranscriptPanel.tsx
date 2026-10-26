import { useEffect, useMemo, useState } from 'react';
import { Scissors, X } from 'lucide-react';
import { formatCaptionTime, orderedCaptions } from '../../lib/captions';
import { captionWords, cutTranscript } from '../../lib/timeline';
import type { Caption } from '../../lib/types';
import { Button, useToast } from '../../components/ui';
import { useEditor } from '../store';
import { ensureUnlocked } from '../locks';

/** 逐字稿上的一個可選單位：有逐字時間就是一個字（詞），沒有就是整句 */
interface Token {
  key: string;
  caption: Caption;
  text: string;
  start: number;
  end: number;
  first: boolean;
  last: boolean;
}

type Range = [number, number];

/** 單字的語助詞，一鍵全選用 */
const FILLER = /^[嗯啊呃哦喔噢額欸誒唉恩][\s，,。.…~～]*$/;

function buildTokens(captions: Caption[]) {
  const lines = orderedCaptions(captions.filter((c) => c.role !== 'flower')).map((caption) => {
    const words = captionWords(caption);
    const tokens: Token[] = words
      ? words.map((w, i) => ({ key: `${caption.id}#${i}`, caption, text: w.text, start: w.start, end: w.end, first: i === 0, last: i === words.length - 1 }))
      : [{ key: `${caption.id}#*`, caption, text: caption.text, start: caption.start, end: caption.end, first: true, last: true }];
    return { caption, tokens, timed: !!words };
  });
  return { lines, tokens: lines.flatMap((l) => l.tokens) };
}

/**
 * 選取的字 → 要剪掉的時間範圍。連續選取的字合成一段（跨句也會連起來，中間的停頓一起剪掉）；
 * 選到一句的頭或尾時，連字幕前後的空白也算進去，避免留下一小段沒有字的畫面。
 */
function rangesOf(tokens: Token[], picked: Set<string>): Range[] {
  const ranges: Range[] = [];
  let run: Token[] = [];
  const flush = () => {
    if (!run.length) return;
    const a = run[0];
    const b = run[run.length - 1];
    ranges.push([a.first ? Math.min(a.caption.start, a.start) : a.start, b.last ? Math.max(b.caption.end, b.end) : b.end]);
    run = [];
  };
  for (const t of tokens) {
    if (picked.has(t.key)) run.push(t);
    else flush();
  }
  flush();
  return ranges;
}

export function TranscriptPanel({ seek }: { seek: (t: number) => void }) {
  const toast = useToast();
  const captions = useEditor((s) => s.data.captions);
  const time = useEditor((s) => s.time);
  const { lines, tokens } = useMemo(() => buildTokens(captions), [captions]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<string | null>(null);

  // 字幕變了（剪掉、編輯、復原）就清掉選取，避免選到位置已經不同的字
  useEffect(() => {
    setPicked(new Set());
    setAnchor(null);
  }, [captions]);

  const ranges = useMemo(() => rangesOf(tokens, picked), [tokens, picked]);
  const seconds = ranges.reduce((n, [a, b]) => n + b - a, 0);
  const fillers = useMemo(() => tokens.filter((t) => FILLER.test(t.text)), [tokens]);
  const untimed = lines.filter((l) => !l.timed).length;

  const toggle = (token: Token, range: boolean) => {
    const next = new Set(picked);
    if (range && anchor) {
      const from = tokens.findIndex((t) => t.key === anchor);
      const to = tokens.findIndex((t) => t.key === token.key);
      if (from >= 0 && to >= 0) {
        const on = picked.has(anchor);
        for (const t of tokens.slice(Math.min(from, to), Math.max(from, to) + 1)) on ? next.add(t.key) : next.delete(t.key);
      }
    } else {
      next.has(token.key) ? next.delete(token.key) : next.add(token.key);
      setAnchor(token.key);
    }
    setPicked(next);
    seek(token.start);
  };

  const toggleSentence = (line: (typeof lines)[number]) => {
    const all = line.tokens.every((t) => picked.has(t.key));
    const next = new Set(picked);
    for (const t of line.tokens) all ? next.delete(t.key) : next.add(t.key);
    setPicked(next);
    setAnchor(line.tokens[0].key);
  };

  const cut = () => {
    if (!ranges.length || !ensureUnlocked('main', 'caption')) return;
    useEditor.getState().commit((d) => cutTranscript(d, ranges));
    toast(`已剪掉 ${ranges.length} 段，共 ${seconds.toFixed(1)} 秒；按 ⌘Z 可以復原`, 'success');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && picked.size) {
      e.preventDefault();
      e.stopPropagation();
      cut();
    } else if (e.key === 'Escape' && picked.size) {
      e.stopPropagation();
      setPicked(new Set());
    }
  };

  return (
    <div className="flex min-h-full flex-col" onKeyDown={onKeyDown}>
      <div className="p-4 pb-2">
        <h2 className="text-sm font-extrabold">文字剪輯</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-mute">
          像改稿一樣剪片：點選要刪的字（按住 Shift 可以連選），按「剪掉」或 Delete，那段畫面和聲音就會從影片刪除，後面的內容自動往前補。
        </p>
        {lines.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!fillers.length}
              onClick={() => setPicked(new Set([...picked, ...fillers.map((t) => t.key)]))}
            >
              選取語助詞{fillers.length ? `（${fillers.length}）` : ''}
            </Button>
          </div>
        )}
        {untimed > 0 && (
          <p className="mt-3 rounded-xl bg-sunken px-3 py-2 text-xs leading-relaxed text-ink-soft">
            有 {untimed} 句沒有逐字時間（手動輸入、改過字數，或舊版辨識），只能整句剪。到「AI 工具」重新產生字幕，就能逐字剪輯。
          </p>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs leading-relaxed text-ink-mute">還沒有字幕。先到「AI 工具」產生 AI 自動字幕，或上傳影片時勾選自動剪輯，就會出現逐字稿。</p>
      ) : (
        <ol className="flex-1 space-y-1 px-2 pb-4" aria-label="逐字稿">
          {lines.map((line) => {
            const allPicked = line.tokens.every((t) => picked.has(t.key));
            return (
              <li key={line.caption.id} className={`rounded-xl px-2 py-1.5 ${allPicked ? 'bg-brand-soft/60' : ''}`}>
                <button
                  className="text-[11px] font-semibold text-ink-mute tabular-nums hover:text-brand"
                  onClick={() => toggleSentence(line)}
                  title={allPicked ? '取消選取這句' : '選取整句'}
                  aria-pressed={allPicked}
                >
                  {formatCaptionTime(line.caption.start).slice(3, 8)}
                </button>
                <p className="mt-0.5 text-[15px] leading-7">
                  {line.tokens.map((t) => {
                    const on = picked.has(t.key);
                    const now = time >= t.start && time < t.end;
                    return (
                      <button
                        key={t.key}
                        aria-pressed={on}
                        onClick={(e) => toggle(t, e.shiftKey)}
                        className={`rounded px-px transition-colors ${
                          on ? 'bg-brand/15 text-brand line-through decoration-2' : now ? 'bg-ink/10' : 'hover:bg-sunken'
                        }`}
                      >
                        {t.text}
                      </button>
                    );
                  })}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      {picked.size > 0 && (
        <div className="sticky bottom-0 flex items-center gap-2 border-t border-line bg-surface p-3">
          <div className="min-w-0 flex-1 text-xs">
            <div className="font-bold">已選 {picked.size} 個{tokens.some((t) => picked.has(t.key) && t.key.endsWith('#*')) ? '字或句' : '字'}</div>
            <div className="text-ink-mute tabular-nums">會剪掉 {ranges.length} 段，共 {seconds.toFixed(1)} 秒</div>
          </div>
          <button className="grid size-9 place-items-center rounded-xl text-ink-soft hover:bg-sunken" onClick={() => setPicked(new Set())} aria-label="取消選取" title="取消選取（Esc）">
            <X className="size-4" />
          </button>
          <Button size="sm" onClick={cut}>
            <Scissors className="size-4" /> 剪掉
          </Button>
        </div>
      )}
    </div>
  );
}
