import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { defaultCaptionStyle, newCaption } from '../../lib/timeline';
import type { CaptionStyle, ProjectData } from '../../lib/types';
import { applyCaptionRules, formatCaptionTime, importCaptionCues, matchesCaption, mergeCaptions, orderedCaptions, parseCaptionRules, parseSubtitles, replaceCaptionText, serializeSubtitles, shiftCaptions, splitCaptionText } from '../../lib/captions';
import { Button, Modal } from '../../components/ui';
import { useEditor } from '../store';
import { ensureUnlocked, LockedBanner } from '../locks';
import { CaptionRow } from './CaptionRow';
import { CaptionCheck } from './CaptionCheck';

const presets: { name: string; style: Partial<CaptionStyle>; preview: React.CSSProperties }[] = [
  { name: '經典白字', style: {}, preview: { color: '#fff', WebkitTextStroke: '5px #1f1d2b', paintOrder: 'stroke' } },
  { name: '綜藝黃', style: { color: '#ffe14a', stroke: '#1f1d2b', animation: 'pop' }, preview: { color: '#ffe14a', WebkitTextStroke: '5px #1f1d2b', paintOrder: 'stroke' } },
  { name: '白底黑字', style: { color: '#1f1d2b', background: 'rgba(255,255,255,0.92)', animation: 'fade' }, preview: { color: '#1f1d2b', background: '#fff', padding: '2px 8px', borderRadius: 6 } },
  { name: '品牌紅', style: { color: '#ffffff', background: 'rgba(212,44,34,0.94)', animation: 'slide' }, preview: { color: '#fff', background: '#d42c22', padding: '2px 8px', borderRadius: 6 } },
  { name: '珊瑚標題', style: { color: '#ff7a59', stroke: '#ffffff', size: 110, y: 0.2, animation: 'pop' }, preview: { color: '#ff7a59', WebkitTextStroke: '5px #fff', paintOrder: 'stroke' } },
  { name: '立體投影', style: { color: '#ffffff', stroke: '#1f1d2b', shadow: { color: '#5b4cf5', opacity: 1, blur: 0, distance: 10, angle: 45 }, animation: 'pop' }, preview: { color: '#fff', WebkitTextStroke: '4px #1f1d2b', paintOrder: 'stroke', textShadow: '3px 3px 0 #5b4cf5' } },
  { name: '柔光陰影', style: { color: '#ffffff', stroke: '#1f1d2b', shadow: { color: '#000000', opacity: 0.45, blur: 28, distance: 6, angle: 90 } }, preview: { color: '#fff', WebkitTextStroke: '4px #1f1d2b', paintOrder: 'stroke', textShadow: '0 3px 10px rgba(0,0,0,0.45)' } },
  { name: '卡拉 OK', style: { color: '#ffffff', stroke: '#1f1d2b', highlight: '#ffe14a', animation: 'karaoke' }, preview: { color: '#fff', WebkitTextStroke: '4px #1f1d2b', paintOrder: 'stroke', backgroundImage: 'linear-gradient(90deg,#ffe14a 55%,#fff 55%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } },
  { name: '打字機', style: { color: '#ffffff', stroke: '#1f1d2b', bold: false, animation: 'typewriter' }, preview: { color: '#fff', WebkitTextStroke: '4px #1f1d2b', paintOrder: 'stroke', fontWeight: 500 } },
];

type Scope = 'visible' | 'selected' | 'all';
const PAGE = 25;
const field = 'min-w-0 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-brand disabled:opacity-50';

export function TextPanel({ seek }: { seek: (t: number) => void }) {
  const captions = useEditor((s) => s.data.captions);
  const dictionary = useEditor((s) => s.data.captionDictionary);
  const selected = useEditor((s) => s.selected);
  const selection = useEditor((s) => s.selection);
  const locked = useEditor((s) => !!s.data.locks?.caption);
  const [find, setFind] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [includeFlowers, setIncludeFlowers] = useState(false);
  const [scope, setScope] = useState<Scope>('visible');
  const [page, setPage] = useState(0);
  const [offset, setOffset] = useState('0');
  const [preset, setPreset] = useState(0);
  const [rulesText, setRulesText] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [incoming, setIncoming] = useState<ReturnType<typeof parseSubtitles> | null>(null);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [reading, setReading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inputs = useRef(new Map<string, HTMLTextAreaElement>());
  const editing = useRef<{ id: string; checkpointed: boolean } | null>(null);
  const readToken = useRef(0);
  useEffect(() => () => { readToken.current++; }, []);
  useEffect(() => setRulesText((dictionary ?? []).map((r) => `${r.from} => ${r.to}`).join('\n')), [dictionary]);
  const eligible = useMemo(() => orderedCaptions(captions.filter((c) => includeFlowers || c.role !== 'flower')), [captions, includeFlowers]);
  const filtered = useMemo(() => eligible.filter((c) => matchesCaption(c, find, matchCase)), [eligible, find, matchCase]);
  const checked = new Set(selected.filter((s) => s.type === 'caption').map((s) => s.id));
  const targets = scope === 'selected' ? eligible.filter((c) => checked.has(c.id)) : scope === 'all' ? eligible : filtered;
  const targetIds = new Set(targets.map((c) => c.id));
  const checkedEligible = new Set(eligible.filter((c) => checked.has(c.id)).map((c) => c.id));
  const maxPage = Math.max(0, Math.ceil(filtered.length / PAGE) - 1);
  const currentPage = Math.min(page, maxPage);
  const visible = filtered.slice(currentPage * PAGE, (currentPage + 1) * PAGE);
  useEffect(() => {
    const index = filtered.findIndex((c) => c.id === selection?.id);
    if (index >= 0) setPage(Math.floor(index / PAGE));
  }, [selection?.id]);

  const inform = (text: string, error = false) => setMessage({ text, error });
  const apply = (edit: (data: ProjectData) => ProjectData, success?: string) => {
    if (!ensureUnlocked('caption')) return;
    try { useEditor.getState().commit(edit); if (success) inform(success); }
    catch (e) { inform(e instanceof Error ? e.message : '修改失敗', true); }
  };
  const add = (style: Partial<CaptionStyle> = {}) => {
    if (!ensureUnlocked('caption')) return;
    const state = useEditor.getState();
    const caption = newCaption(state.time, state.time + 2, '輸入字幕文字', { ...defaultCaptionStyle(), ...style });
    state.commit((d) => ({ ...d, captions: [...d.captions, caption] })); state.select({ type: 'caption', id: caption.id });
    if (find) setFind('');
  };
  const focus = (id: string, start: number) => {
    if (!ensureUnlocked('caption')) return;
    if (editing.current?.id !== id) editing.current = { id, checkpointed: false };
    useEditor.getState().select({ type: 'caption', id }); seek(start);
  };
  const changeText = (id: string, text: string) => {
    if (!ensureUnlocked('caption')) return;
    const state = useEditor.getState();
    if (state.data.captions.find((c) => c.id === id)?.text === text) return;
    if (editing.current?.id !== id || !editing.current.checkpointed) { state.checkpoint(); editing.current = { id, checkpointed: true }; }
    state.live((d) => ({ ...d, captions: d.captions.map((c) => c.id === id ? { ...c, text } : c) }));
  };
  const split = (id: string) => apply((d) => {
    const caption = d.captions.find((c) => c.id === id);
    if (!caption) return d;
    const pieces = splitCaptionText(caption, inputs.current.get(id)?.selectionStart ?? 0);
    return { ...d, captions: d.captions.flatMap((c) => c.id === id ? pieces : [c]) };
  }, '已依文字游標拆句；時間依字數分配，可再微調。');
  const next = (id: string) => {
    const at = filtered.findIndex((c) => c.id === id); const caption = filtered[at + 1];
    if (!caption) { inform('已到最後一句。'); return; }
    setPage(Math.floor((at + 1) / PAGE));
    requestAnimationFrame(() => { inputs.current.get(caption.id)?.focus(); focus(caption.id, caption.start); });
  };
  const replace = () => apply((d) => {
    const result = replaceCaptionText(d.captions, targetIds, find, replacement, matchCase);
    inform(`已修改 ${result.changed} 句，共找到 ${result.occurrences} 處。`);
    return result.captions === d.captions ? d : { ...d, captions: result.captions };
  });
  const merge = () => {
    let id = '';
    apply((d) => { const result = mergeCaptions(d.captions, checkedEligible); id = result.id; return { ...d, captions: result.captions }; }, '已合併；沿用第一句樣式，保留各句換行。');
    if (id) useEditor.getState().select({ type: 'caption', id });
  };
  const exportFile = (format: 'srt' | 'vtt') => {
    try {
      const contents = serializeSubtitles(targets, format);
      const url = URL.createObjectURL(new Blob([contents], { type: format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8' }));
      const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = `${useEditor.getState().name.replace(/[\\/:*?"<>|]/g, '-') || '字幕'}.${format}`;
      anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      inform(`已匯出 ${targets.length} 句 ${format.toUpperCase()} 字幕（純文字與時間，不含視覺樣式）。`);
    } catch (e) { inform(e instanceof Error ? e.message : '匯出失敗', true); }
  };
  const readFile = async (file: File) => {
    const token = ++readToken.current; const projectId = useEditor.getState().projectId;
    setReading(true);
    try {
      if (!/\.(srt|vtt)$/i.test(file.name)) throw new Error('請選擇 .srt 或 .vtt 字幕檔。');
      if (file.size > 2_000_000) throw new Error('字幕檔請勿超過 2 MB。');
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
      catch { throw new Error('無法讀取字幕檔，請先轉存為 UTF-8 編碼。'); }
      const result = parseSubtitles(text);
      if (token !== readToken.current || useEditor.getState().projectId !== projectId) return;
      setIncoming(result); setImportMode('append');
    } catch (e) { if (token === readToken.current) inform(e instanceof Error ? e.message : '匯入失敗', true); }
    finally { if (token === readToken.current) setReading(false); }
  };
  const pagination = <div className="my-2 flex items-center justify-between gap-1 text-[11px] text-ink-soft">
    <button disabled={!currentPage} onClick={() => setPage(currentPage - 1)} className="rounded px-2 py-1 disabled:opacity-35">上一頁</button>
    <span>第 {currentPage + 1}／{maxPage + 1} 頁・每頁 {PAGE} 句</span>
    <button disabled={currentPage >= maxPage} onClick={() => setPage(currentPage + 1)} className="rounded px-2 py-1 disabled:opacity-35">下一頁</button>
  </div>;

  return <div className="p-4">
    <div className="flex items-center justify-between"><h2 className="text-sm font-extrabold">字幕校對</h2><button className="text-xs font-bold text-brand disabled:opacity-40" disabled={locked} onClick={() => add()}><Plus className="mr-1 inline size-3" />新增一句</button></div>
    <LockedBanner track="caption" />
    <CaptionCheck seek={seek} />
    <div className="mt-3 space-y-2">
      <input aria-label="搜尋字幕" placeholder="搜尋文字（純文字搜尋）" className={field} value={find} onChange={(e) => { setFind(e.target.value); setPage(0); }} />
      <div className="flex gap-2"><input aria-label="取代文字" placeholder="取代為…（可留空）" className={field} value={replacement} onChange={(e) => setReplacement(e.target.value)} /><Button size="sm" disabled={locked || !find || !targets.length} onClick={replace}>全部取代</Button></div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-ink-soft">
        <label><input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} className="mr-1 accent-brand" />區分英文大小寫</label>
        <label><input type="checkbox" checked={includeFlowers} onChange={(e) => { setIncludeFlowers(e.target.checked); setPage(0); }} className="mr-1 accent-brand" />包含花字</label>
      </div>
      <label className="block text-[11px] text-ink-soft">批次與匯出範圍<select aria-label="字幕操作範圍" className={`${field} mt-1`} value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
        <option value="visible">目前列表（{filtered.length} 句，含其他頁）</option><option value="selected">已勾選（{checkedEligible.size} 句）</option><option value="all">全部{includeFlowers ? '字幕與花字' : '一般字幕'}（{eligible.length} 句）</option>
      </select></label>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" disabled={locked || reading} onClick={() => input.current?.click()}>{reading ? '讀取中…' : '匯入 SRT／VTT'}</Button><Button variant="secondary" size="sm" disabled={!targets.length} onClick={() => exportFile('srt')}>匯出 SRT</Button><Button variant="secondary" size="sm" disabled={!targets.length} onClick={() => exportFile('vtt')}>匯出 VTT</Button></div>
      <input ref={input} type="file" accept=".srt,.vtt" className="hidden" aria-label="匯入字幕檔" onChange={(e) => { const file = e.target.files?.[0]; if (file) void readFile(file); e.target.value = ''; }} />
    </div>
    {message && <p role={message.error ? 'alert' : 'status'} className={`mt-3 rounded-lg px-2 py-2 text-xs ${message.error ? 'bg-red-50 text-red-700' : 'bg-brand-soft text-brand'}`}>{message.text}</p>}
    <details className="mt-3 rounded-xl border border-line p-2 text-xs">
      <summary className="cursor-pointer font-bold">批次時間與樣式・目前範圍 {targets.length} 句</summary>
      <div className="mt-3 flex gap-2"><input type="number" step="0.1" aria-label="批次平移秒數" className={field} value={offset} onChange={(e) => setOffset(e.target.value)} /><Button size="sm" disabled={locked || !targets.length} onClick={() => apply((d) => {
        if (!offset.trim()) throw new Error('請輸入平移秒數；正數延後，負數提前。');
        const shifted = shiftCaptions(d.captions, targetIds, Number(offset)); return shifted === d.captions ? d : { ...d, captions: shifted };
      }, `已平移 ${targets.length} 句；影片與音訊不變。`)}>平移秒數</Button></div>
      <p className="mt-1 text-[10px] text-ink-mute">正數延後、負數提前；超過影片結尾會延長專案。</p>
      <div className="mt-3 flex gap-2"><select aria-label="批次字幕樣式" className={field} value={preset} onChange={(e) => setPreset(Number(e.target.value))}>{presets.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}</select><Button size="sm" disabled={locked || !targets.length} onClick={() => apply((d) => ({ ...d, captions: d.captions.map((c) => targetIds.has(c.id) ? { ...c, style: { ...defaultCaptionStyle(), ...presets[preset].style } } : c) }), `已套用樣式至 ${targets.length} 句。`)}>套用樣式</Button></div>
    </details>
    <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
      <button disabled={locked || !filtered.length} className="font-bold text-brand disabled:opacity-40" onClick={() => useEditor.getState().setSelected(filtered.map((c) => ({ type: 'caption', id: c.id })))}>勾選列表全部</button>
      <button className="text-ink-soft" onClick={() => useEditor.getState().setSelected(selected.filter((s) => s.type !== 'caption'))}>取消勾選</button>
      <button disabled={locked || checkedEligible.size < 2} className="ml-auto font-bold text-brand disabled:opacity-40" title="合併相鄰字幕；沿用第一句樣式，跨空白處也會連成同一段" onClick={merge}>合併勾選 {checkedEligible.size} 句</button>
    </div>
    <p className="mt-2 text-[10px] text-ink-mute">Enter 下一句・Shift+Enter 換行・⌘／Ctrl+Enter 依文字游標拆句。批次操作可復原。</p>
    {pagination}
    {!filtered.length ? <p className="rounded-xl bg-sunken p-3 text-xs text-ink-soft">{eligible.length ? '沒有符合搜尋條件的字幕。' : '還沒有一般字幕，可新增、匯入或使用 AI 自動字幕。'}</p> : <ul className="space-y-2">
      {visible.map((c, index) => <CaptionRow key={c.id} caption={c} number={currentPage * PAGE + index + 1} checked={checked.has(c.id)} active={selection?.id === c.id} locked={locked}
        inputRef={(el) => { if (el) inputs.current.set(c.id, el); else inputs.current.delete(c.id); }}
        toggle={() => { if (ensureUnlocked('caption')) useEditor.getState().toggleSelect({ type: 'caption', id: c.id }); }}
        focus={() => focus(c.id, c.start)} change={(text) => changeText(c.id, text)} split={() => { split(c.id); editing.current = null; }} next={() => next(c.id)} blur={() => { editing.current = null; }} error={(text) => inform(text, true)}
        retime={(start, end) => {
          if (start < 0 || end <= start) throw new Error('結束時間必須晚於開始時間。');
          apply((d) => ({ ...d, captions: d.captions.map((x) => x.id === c.id ? { ...x, start, end } : x) }));
        }} />)}
    </ul>}
    {filtered.length > PAGE && pagination}
    <details className="mt-4 rounded-xl border border-line p-2 text-xs"><summary className="cursor-pointer font-bold">人名與品牌校正字典（此專案）</summary>
      <p className="mt-2 text-[11px] text-ink-soft">每行一筆，例如「麥克風牌子 =&gt; 正確品牌」。儲存後可一鍵校正指定範圍，不會自動修改辨識結果。</p>
      <textarea aria-label="字幕校正字典" className={`${field} mt-2 h-24`} disabled={locked} value={rulesText} onChange={(e) => setRulesText(e.target.value)} placeholder={'錯字 => 正確文字\nMac Book => MacBook'} />
      <div className="mt-2 flex gap-2"><Button size="sm" disabled={locked} onClick={() => apply((d) => ({ ...d, captionDictionary: parseCaptionRules(rulesText) }), '已儲存專案字典，可隨專案同步及復原。')}>儲存字典</Button>
      <Button variant="secondary" size="sm" disabled={locked || !dictionary?.length || !targets.length} onClick={() => apply((d) => { const result = applyCaptionRules(d.captions, targetIds, d.captionDictionary ?? []); inform(`已校正 ${result.changed} 句。`); return result.captions === d.captions ? d : { ...d, captions: result.captions }; })}>套用已儲存字典</Button></div>
    </details>
    <details className="mt-3 rounded-xl border border-line p-2 text-xs"><summary className="cursor-pointer font-bold">以樣式新增字幕</summary><div className="mt-2 grid grid-cols-2 gap-2">
      {presets.map((p) => <button key={p.name} disabled={locked} onClick={() => add(p.style)} className="grid h-16 place-items-center rounded-xl bg-[linear-gradient(140deg,#c9d4ff,#ffd9cb)] disabled:opacity-40"><span className="text-sm font-black" style={p.preview}>{p.name}</span></button>)}
    </div></details>
    <Modal open={!!incoming} onClose={() => setIncoming(null)} width="max-w-lg">
      <h2 className="text-xl font-extrabold">確認匯入字幕</h2>
      <p className="mt-3 text-sm">找到 {incoming?.cues.length} 句，將套用預設字幕樣式。匯入後可以復原。</p>
      {incoming?.warnings.map((warning) => <p key={warning} className="mt-2 text-xs text-ink-soft">{warning}</p>)}
      <ul className="mt-3 space-y-2 rounded-xl bg-sunken p-3 text-xs">{incoming?.cues.slice(0, 3).map((cue, i) => <li key={i} className="whitespace-pre-wrap">{formatCaptionTime(cue.start)} — {cue.text}</li>)}</ul>
      <div className="mt-4 space-y-2 text-sm"><label className="block"><input type="radio" name="caption-import-mode" checked={importMode === 'append'} onChange={() => setImportMode('append')} /> 追加到現有字幕</label><label className="block"><input type="radio" name="caption-import-mode" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} /> 取代一般字幕，保留花字</label></div>
      <Button className="mt-5 w-full" disabled={locked || !incoming} onClick={() => {
        if (!incoming || !ensureUnlocked('caption')) return;
        apply((d) => importCaptionCues(d, incoming.cues, importMode, defaultCaptionStyle()), `已匯入 ${incoming.cues.length} 句字幕。`);
        setIncoming(null); setFind(''); setPage(0); useEditor.getState().select(null);
      }}>確認匯入</Button>
    </Modal>
  </div>;
}
