import { useEffect, useRef, useState, type RefCallback } from 'react';
import type { Caption } from '../../lib/types';
import { formatCaptionTime, parseEditTime } from '../../lib/captions';

function TimeField({ value, label, disabled, save, error }: { value: number; label: string; disabled: boolean; save: (time: number) => void; error: (message: string) => void }) {
  const [text, setText] = useState(formatCaptionTime(value));
  const cancel = useRef(false);
  useEffect(() => setText(formatCaptionTime(value)), [value]);
  return <input aria-label={label} title="秒數或 00:00:01.250" value={text} disabled={disabled}
    className="min-w-0 w-full rounded border border-line bg-surface px-1 py-1 font-mono text-[10px] outline-none focus:border-brand disabled:opacity-50"
    onChange={(e) => setText(e.target.value)} onFocus={() => { cancel.current = false; }}
    onBlur={() => {
      if (cancel.current) return;
      try { const next = parseEditTime(text); if (next !== value) save(next); setText(formatCaptionTime(next)); }
      catch (e) { error(e instanceof Error ? e.message : '時間無效'); setText(formatCaptionTime(value)); }
    }}
    onKeyDown={(e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
      if (e.key === 'Escape') { cancel.current = true; setText(formatCaptionTime(value)); e.currentTarget.blur(); }
    }} />;
}

export function CaptionRow({ caption: c, number, checked, active, locked, inputRef, toggle, focus, change, split, next, retime, error, blur }: {
  caption: Caption; number: number; checked: boolean; active: boolean; locked: boolean;
  inputRef: RefCallback<HTMLTextAreaElement>; toggle: () => void; focus: () => void; change: (text: string) => void;
  split: () => void; next: () => void; blur: () => void; retime: (start: number, end: number) => void; error: (text: string) => void;
}) {
  return <li className={`rounded-xl border p-2 ${active || checked ? 'border-brand bg-brand-soft/30' : 'border-line'}`}>
    <div className="mb-1.5 flex items-center gap-2 text-[11px] text-ink-soft">
      <input type="checkbox" checked={checked} disabled={locked} onChange={toggle} aria-label={`勾選第 ${number} 句`} className="accent-brand" />
      <button className="font-bold text-brand" onClick={focus}>第 {number} 句{c.role === 'flower' ? '・花字' : ''}</button>
      <button disabled={locked} className="ml-auto rounded px-2 py-1 font-bold hover:bg-sunken disabled:opacity-40" onMouseDown={(e) => e.preventDefault()} onClick={split}>依游標拆句</button>
    </div>
    <textarea ref={inputRef} aria-label={`第 ${number} 句字幕文字`} value={c.text} rows={2} disabled={locked}
      className="w-full resize-y rounded-md bg-transparent px-1 py-1 text-sm leading-relaxed outline-none focus:bg-surface disabled:opacity-50"
      onFocus={focus} onBlur={blur} onChange={(e) => change(e.target.value)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229 || e.key !== 'Enter') return;
        if (e.metaKey || e.ctrlKey) { e.preventDefault(); split(); }
        else if (!e.shiftKey) { e.preventDefault(); next(); }
      }} />
    <div className="mt-1 grid grid-cols-[auto_1fr_auto_1fr] items-center gap-1.5">
      <span className="text-[10px] text-ink-mute">始</span><TimeField value={c.start} label={`第 ${number} 句開始時間`} disabled={locked} save={(start) => retime(start, c.end)} error={error} />
      <span className="text-[10px] text-ink-mute">終</span><TimeField value={c.end} label={`第 ${number} 句結束時間`} disabled={locked} save={(end) => retime(c.start, end)} error={error} />
    </div>
  </li>;
}
