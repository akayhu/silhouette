import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRightLeft, AudioLines, Download, Eraser, Compass, Film, Keyboard, Loader2, PanelRight, PanelTop, Music, Palette, Redo2, ScanFace, Smile, Sparkles, TextCursorInput, Type, Undo2, WandSparkles } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Engine } from '../lib/engine';
import { aspectSize, isLocked, trimAt, type TrimSide, splitAudioAt, splitCaptionAt, splitMainAt, splitOverlayAt, splitStickerAt, removeItems, trackOf } from '../lib/timeline';
import { ensureUnlocked } from './locks';
import type { Aspect } from '../lib/types';
import { Button, Logo, notify } from '../components/ui';
import { useEditor } from './store';
import { Preview } from './Preview';
import { ToolTabs } from './ToolTabs';
import { Timeline } from './Timeline';
import { Inspector } from './Inspector';
import { MediaPanel } from './panels/MediaPanel';
import { MusicPanel } from './panels/MusicPanel';
import { TextPanel } from './panels/TextPanel';
import { TranscriptPanel } from './panels/TranscriptPanel';
import { VoicePanel } from './panels/VoicePanel';
import { AIPanel } from './panels/AIPanel';
import { ErasePanel } from './panels/ErasePanel';
import { TransitionPanel } from './panels/TransitionPanel';
import { StickerPanel } from './panels/StickerPanel';
import { FilterPanel } from './panels/FilterPanel';
import { BeautyPanel } from './panels/BeautyPanel';
import { SmartEditPanel } from './panels/SmartEditPanel';
import { ExportDialog } from './ExportDialog';
import { setCaptionEdge, ShortcutsDialog } from './Shortcuts';
import { LAYOUT_DEFAULT, Splitter, useEditorLayout } from './Splitter';
import { Guide, guideEnabled } from './Guide';
import { CoverDialog } from './CoverDialog';
import { AutoEditDialog } from './AutoEditDialog';
import { useProjectPersistence } from './useProjectPersistence';
import { NavigationWarning, PersistenceLoading, PersistenceNotice, SaveBadge } from './PersistenceUI';

const PREVIEW_SHORT_SIDE = 540;

const tabs = [
  { id: 'media', label: '素材', icon: Film },
  { id: 'smart', label: '智能剪輯', icon: WandSparkles },
  { id: 'music', label: '音樂', icon: Music },
  { id: 'text', label: '字幕', icon: Type },
  { id: 'transcript', label: '文字剪輯', icon: TextCursorInput },
  { id: 'sticker', label: '貼紙', icon: Smile },
  { id: 'filter', label: '濾鏡', icon: Palette },
  { id: 'beauty', label: '美肌', icon: ScanFace },
  { id: 'transition', label: '轉場', icon: ArrowRightLeft },
  { id: 'voice', label: '朗讀', icon: AudioLines },
  { id: 'ai', label: 'AI 工具', icon: Sparkles },
  { id: 'erase', label: '去水印', icon: Eraser },
] as const;
type Tab = (typeof tabs)[number]['id'];

export default function Editor() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('media');
  const [exporting, setExporting] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  // 首次使用引導：新專案（主軌還沒有影片）預設打開，其他工具收起來
  const [guide, setGuide] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  // 工具區寬度、預覽寬度、時間軸高度：拖曳分隔線調整，記在這台瀏覽器
  const [layout, setLayout] = useEditorLayout();
  const dragFrom = useRef(layout);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const persistence = useProjectPersistence(user?.id, id, () => useEditor.getState().data.cover?.thumb ?? thumbnail(canvasRef.current));
  const projectLoaded = useEditor((s) => s.projectId === id);
  const loaded = projectLoaded && persistence.ready;
  const data = useEditor((s) => s.data);
  const name = useEditor((s) => s.name);
  const junction = useEditor((s) => s.junction);
  useEffect(() => {
    if (junction) setTab('transition');
  }, [junction]);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);

  // 建立播放引擎（換比例時重建畫布尺寸即可）
  useEffect(() => {
    if (!loaded || !canvasRef.current) return;
    const engine = new Engine(canvasRef.current, { speakers: true, watermark: user?.plan !== 'pro' });
    engine.onTime = (t) => useEditor.getState().setTime(t);
    engine.onEnded = () => useEditor.getState().setPlaying(false);
    engine.setData(useEditor.getState().data);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // 切換版面時預覽的畫布會重建，引擎也要接到新的畫布
  }, [loaded, id, persistence.generation, layout.mode]);

  useEffect(() => {
    engineRef.current?.setWatermark(user?.plan !== 'pro');
  }, [user?.plan]);

  useEffect(() => {
    if (loaded) setGuide(guideEnabled() && useEditor.getState().data.clips.length === 0);
  }, [loaded, id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = aspectSize(data.aspect, PREVIEW_SHORT_SIDE);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    engineRef.current?.setData(data);
  }, [data, layout.mode]);

  const togglePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.playing) {
      engine.pause();
      useEditor.getState().setPlaying(false);
    } else {
      engine.play();
      useEditor.getState().setPlaying(true);
    }
  }, []);

  useEffect(() => {
    if (exporting) {
      engineRef.current?.pause();
      useEditor.getState().setPlaying(false);
    }
  }, [exporting]);

  const seek = useCallback((t: number) => engineRef.current?.seek(t), []);

  const split = useCallback(() => {
    const { selection, time, commit, data } = useEditor.getState();
    if (!ensureUnlocked(selection ? trackOf(selection, data) : 'main')) return;
    if (selection?.type === 'audio') commit((d) => splitAudioAt(d, selection.id, time));
    else if (selection?.type === 'caption') commit((d) => splitCaptionAt(d, selection.id, time));
    else if (selection?.type === 'sticker') commit((d) => splitStickerAt(d, selection.id, time));
    else if (selection?.type === 'overlay') commit((d) => splitOverlayAt(d, selection.id, time));
    else commit((d) => splitMainAt(d, time));
  }, []);

  /** 向左／向右裁剪：剪掉選取項目（沒選就是播放頭所在的主軌片段）在播放頭左邊或右邊的部分 */
  const trim = useCallback((side: TrimSide) => {
    const { selected, time, data, commit } = useEditor.getState();
    const result = trimAt(data, selected, time, side);
    if (!result.trimmed) {
      const anyLocked = (selected.length ? selected.map((s) => trackOf(s, data)) : ['main' as const]).some((t) => isLocked(data, t));
      if (anyLocked) return void ensureUnlocked(...(selected.length ? selected.map((s) => trackOf(s, data)) : ['main' as const]));
      return notify(selected.length ? '播放頭要在選取的項目中間，而且兩邊都至少留 0.1 秒' : '播放頭要在主軌片段中間，或先點選要裁剪的項目', 'info');
    }
    commit(() => result.data);
    // 向左裁剪主軌後，後面的內容往前補，播放頭移到接起來的地方
    if (side === 'left' && result.main) seek(result.main[0]);
  }, [seek]);

  const removeSelected = useCallback(() => {
    const { selected, commit, select, data } = useEditor.getState();
    if (!selected.length) return;
    // 刪主軌片段會波紋移動其他軌；主軌鎖定時整個不動
    if (selected.some((s) => s.type === 'clip') && !ensureUnlocked('main')) return;
    if (selected.every((s) => isLocked(data, trackOf(s, data)))) return void ensureUnlocked(trackOf(selected[0], data));
    commit((d) => removeItems(d, selected));
    select(null);
  }, []);

  const selectAll = useCallback(() => {
    const { data, setSelected } = useEditor.getState();
    const all = [
      ...data.captions.map((c) => ({ type: 'caption' as const, id: c.id })),
      ...data.stickers.map((st) => ({ type: 'sticker' as const, id: st.id })),
      ...data.overlays.map((o) => ({ type: 'overlay' as const, id: o.id })),
      ...data.clips.map((c) => ({ type: 'clip' as const, id: c.id })),
      ...data.audio.map((a) => ({ type: 'audio' as const, id: a.id })),
    ];
    setSelected(all.filter((i) => !isLocked(data, trackOf(i, data))));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (!loaded || document.querySelector('[role="dialog"]') || el?.closest?.('input, textarea, select, [contenteditable]')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
      } else if (e.key === 'Escape') {
        useEditor.getState().select(null);
      } else if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        split();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeSelected();
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcuts(true);
      } else if (!mod && (e.key === '[' || e.key === ']')) {
        e.preventDefault();
        setCaptionEdge(e.key === '[' ? 'start' : 'end');
      } else if (!mod && (e.code === 'KeyQ' || e.code === 'KeyW')) {
        e.preventDefault();
        trim(e.code === 'KeyQ' ? 'left' : 'right');
      } else if (!mod && e.code === 'KeyK') {
        e.preventDefault();
        togglePlay();
      } else if (!mod && (e.code === 'KeyJ' || e.code === 'KeyL')) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        seek(Math.max(0, useEditor.getState().time + (e.code === 'KeyJ' ? -step : step)));
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        seek(e.key === 'Home' ? 0 : useEditor.getState().data.duration);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30;
        seek(useEditor.getState().time + (e.key === 'ArrowLeft' ? -step : step));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loaded, togglePlay, split, trim, removeSelected, selectAll, seek, undo, redo]);

  const openExport = () => {
    engineRef.current?.pause();
    useEditor.getState().setPlaying(false);
    setExporting(true);
  };

  if (!loaded) return <PersistenceLoading persistence={persistence} />;

  // 編輯器各區塊；依版面模式（預覽在右側／上方）排列
  const toolsPanel = (
    <section className="flex shrink-0 flex-col border-r border-line bg-surface" style={{ width: layout.tools }}>
      {/* 工具列：放在素材區上方，橫向排列 */}
      <ToolTabs
        tabs={tabs}
        value={tab}
        onChange={(id) => {
          setTab(id);
          if (id !== 'erase') useEditor.getState().setEraseEdit(null);
        }}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'media' && <MediaPanel />}
        {tab === 'smart' && <SmartEditPanel />}
        {tab === 'music' && <MusicPanel />}
        {tab === 'text' && <TextPanel seek={seek} />}
        {tab === 'transcript' && <TranscriptPanel seek={seek} />}
        {tab === 'voice' && <VoicePanel />}
        {tab === 'sticker' && <StickerPanel />}
        {tab === 'filter' && <FilterPanel />}
        {tab === 'beauty' && <BeautyPanel />}
        {tab === 'transition' && <TransitionPanel />}
        {tab === 'ai' && <AIPanel />}
        {tab === 'erase' && <ErasePanel onCompare={(on) => engineRef.current?.setBypassErase(on)} />}
      </div>
    </section>
  );
  const guidePanel = (
    <div className="flex min-w-0 flex-1 justify-center bg-surface">
      <div className="flex w-full max-w-[560px] min-w-0 flex-col border-x border-line">
        <Guide
          onExpandTools={() => setGuide(false)}
          onExport={openExport}
          seek={seek}
          play={() => {
            if (!engineRef.current?.playing) togglePlay();
          }}
        />
      </div>
    </div>
  );
  const toolsSplit = (
    <Splitter
      direction="col"
      label="調整工具區寬度"
      onStart={() => (dragFrom.current = layout)}
      onDrag={(d) => setLayout({ tools: dragFrom.current.tools + d })}
      onKey={(d) => setLayout({ tools: layout.tools + d })}
      onReset={() => setLayout({ tools: LAYOUT_DEFAULT().tools })}
    />
  );
  const inspectorPanel = (
    <aside className="min-w-0 flex-1 overflow-y-auto bg-surface">
      <div className="mx-auto h-full max-w-xl">
        <Inspector />
      </div>
    </aside>
  );
  const previewSplit = (
    <Splitter
      direction="col"
      label="調整預覽區寬度"
      onStart={() => (dragFrom.current = layout)}
      onDrag={(d) => setLayout({ preview: dragFrom.current.preview - d })}
      onKey={(d) => setLayout({ preview: layout.preview - d })}
      onReset={() => setLayout({ preview: LAYOUT_DEFAULT().preview })}
    />
  );
  const previewPanel = <Preview width={layout.preview} canvasRef={canvasRef} togglePlay={togglePlay} seek={seek} loading={!loaded} />;
  const timelineSplit = (
    <Splitter
      direction="row"
      label="調整時間軸高度"
      onStart={() => (dragFrom.current = layout)}
      onDrag={(d) => setLayout({ timeline: dragFrom.current.timeline - d })}
      onKey={(d) => setLayout({ timeline: layout.timeline - d })}
      onReset={() => setLayout({ timeline: LAYOUT_DEFAULT().timeline })}
    />
  );
  // 引導中時間軸縮小，讓位給引導步驟（不改使用者設定的高度）
  const timelinePanel = <Timeline height={guide ? Math.min(layout.timeline, 190) : layout.timeline} seek={seek} split={split} trim={trim} remove={removeSelected} togglePlay={togglePlay} onCover={() => setCoverOpen(true)} />;

  return (
    <div className="flex h-screen min-w-[1024px] flex-col overflow-hidden bg-[#f4f2ee]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
        <Link to="/dashboard" className="rounded-lg p-2 text-ink-soft hover:bg-sunken hover:text-ink" aria-label="回到我的專案">
          <ArrowLeft className="size-5" />
        </Link>
        <Logo to="/dashboard" compact />
        <input
          value={name}
          onChange={(e) => useEditor.getState().setName(e.target.value)}
          className="h-9 w-56 rounded-lg border border-transparent bg-transparent px-2 font-bold outline-none hover:border-line focus:border-brand"
          aria-label="專案名稱"
        />
        <SaveBadge status={persistence.status} retry={persistence.retry} />
        <div className="ml-4 flex items-center gap-1">
          <IconBtn label="復原 (⌘Z)" onClick={undo} disabled={!canUndo}>
            <Undo2 className="size-4" />
          </IconBtn>
          <IconBtn label="重做 (⇧⌘Z)" onClick={redo} disabled={!canRedo}>
            <Redo2 className="size-4" />
          </IconBtn>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setGuide(!guide)}
            aria-pressed={guide}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold transition ${guide ? 'bg-brand-soft text-brand' : 'text-ink-soft hover:bg-sunken hover:text-ink'}`}
            title={guide ? '關閉引導，顯示全部工具' : '打開四步引導'}
          >
            <Compass className="size-4" /> 引導
          </button>
          <IconBtn
            label={layout.mode === 'top' ? '改成預覽在右側' : '改成預覽在上方（時間軸延伸到右邊）'}
            onClick={() => setLayout({ mode: layout.mode === 'top' ? 'side' : 'top' })}
            aria-pressed={layout.mode === 'top'}
          >
            {layout.mode === 'top' ? <PanelRight className="size-4" /> : <PanelTop className="size-4" />}
          </IconBtn>
          <IconBtn label="快捷鍵 (?)" onClick={() => setShortcuts(true)}>
            <Keyboard className="size-4" />
          </IconBtn>
          <AspectPicker value={data.aspect} onChange={(aspect) => useEditor.getState().commit((d) => ({ ...d, aspect }))} />
          <Button onClick={openExport} disabled={!data.duration}>
            <Download className="size-4" /> 匯出
          </Button>
        </div>
      </header>
      <PersistenceNotice persistence={persistence} />

      {layout.mode === 'top' ? (
        // 預覽在上方：上排是工具、屬性、預覽，時間軸橫跨整個寬度
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            {guide ? guidePanel : (
              <>
                {toolsPanel}
                {toolsSplit}
                {inspectorPanel}
              </>
            )}
            {previewSplit}
            {previewPanel}
          </div>
          {timelineSplit}
          {timelinePanel}
        </div>
      ) : (
        // 預覽在右側：預覽從上到下，左邊是工具、屬性與時間軸
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1">
              {guide ? guidePanel : (
                <>
                  {toolsPanel}
                  {toolsSplit}
                  {inspectorPanel}
                </>
              )}
            </div>
            {timelineSplit}
            {timelinePanel}
          </div>
          {previewSplit}
          {previewPanel}
        </div>
      )}
      <NavigationWarning persistence={persistence} />
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
      <ShortcutsDialog open={shortcuts} onClose={() => setShortcuts(false)} />
      {coverOpen && <CoverDialog onClose={() => setCoverOpen(false)} />}
      <AutoEditDialog />
    </div>
  );
}

function thumbnail(canvas: HTMLCanvasElement | null) {
  if (!canvas || !canvas.width) return undefined;
  const c = document.createElement('canvas');
  const scale = 320 / Math.max(canvas.width, canvas.height);
  c.width = Math.round(canvas.width * scale);
  c.height = Math.round(canvas.height * scale);
  c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}

export function IconBtn({ label, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...rest} title={label} aria-label={label} className="grid size-8 place-items-center rounded-lg text-ink-soft transition hover:bg-sunken hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent">
      {children}
    </button>
  );
}

function AspectPicker({ value, onChange }: { value: Aspect; onChange: (a: Aspect) => void }) {
  return (
    <div className="flex rounded-xl bg-sunken p-0.5">
      {(['9:16', '16:9', '1:1'] as Aspect[]).map((a) => (
        <button
          key={a}
          onClick={() => onChange(a)}
          className={`rounded-[10px] px-2.5 py-1.5 text-xs font-bold transition ${value === a ? 'bg-surface text-ink shadow-card' : 'text-ink-soft hover:text-ink'}`}
        >
          {a}
        </button>
      ))}
    </div>
  );
}
