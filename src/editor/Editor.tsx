import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRightLeft, AudioLines, Download, Eraser, Film, Loader2, Music, Palette, Redo2, ScanFace, Smile, Sparkles, Type, Undo2, WandSparkles } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Engine } from '../lib/engine';
import { aspectSize, isLocked, splitAudioAt, splitCaptionAt, splitMainAt, splitOverlayAt, splitStickerAt, removeItems, trackOf } from '../lib/timeline';
import { ensureUnlocked } from './locks';
import type { Aspect } from '../lib/types';
import { Button, Logo } from '../components/ui';
import { useEditor } from './store';
import { Preview } from './Preview';
import { ToolTabs } from './ToolTabs';
import { Timeline } from './Timeline';
import { Inspector } from './Inspector';
import { MediaPanel } from './panels/MediaPanel';
import { MusicPanel } from './panels/MusicPanel';
import { TextPanel } from './panels/TextPanel';
import { VoicePanel } from './panels/VoicePanel';
import { AIPanel } from './panels/AIPanel';
import { ErasePanel } from './panels/ErasePanel';
import { TransitionPanel } from './panels/TransitionPanel';
import { StickerPanel } from './panels/StickerPanel';
import { FilterPanel } from './panels/FilterPanel';
import { BeautyPanel } from './panels/BeautyPanel';
import { SmartEditPanel } from './panels/SmartEditPanel';
import { ExportDialog } from './ExportDialog';
import { AutoEditDialog } from './AutoEditDialog';
import { useProjectPersistence } from './useProjectPersistence';
import { NavigationWarning, PersistenceLoading, PersistenceNotice, SaveBadge } from './PersistenceUI';

const PREVIEW_SHORT_SIDE = 540;

const tabs = [
  { id: 'media', label: '素材', icon: Film },
  { id: 'smart', label: '智能剪輯', icon: WandSparkles },
  { id: 'music', label: '音樂', icon: Music },
  { id: 'text', label: '字幕', icon: Type },
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const persistence = useProjectPersistence(user?.id, id, () => thumbnail(canvasRef.current));
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
  }, [loaded, id, persistence.generation]);

  useEffect(() => {
    engineRef.current?.setWatermark(user?.plan !== 'pro');
  }, [user?.plan]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = aspectSize(data.aspect, PREVIEW_SHORT_SIDE);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    engineRef.current?.setData(data);
  }, [data]);

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
    const { selection, time, commit } = useEditor.getState();
    if (!ensureUnlocked(selection ? trackOf(selection.type) : 'main')) return;
    if (selection?.type === 'audio') commit((d) => splitAudioAt(d, selection.id, time));
    else if (selection?.type === 'caption') commit((d) => splitCaptionAt(d, selection.id, time));
    else if (selection?.type === 'sticker') commit((d) => splitStickerAt(d, selection.id, time));
    else if (selection?.type === 'overlay') commit((d) => splitOverlayAt(d, selection.id, time));
    else commit((d) => splitMainAt(d, time));
  }, []);

  const removeSelected = useCallback(() => {
    const { selected, commit, select, data } = useEditor.getState();
    if (!selected.length) return;
    // 刪主軌片段會波紋移動其他軌；主軌鎖定時整個不動
    if (selected.some((s) => s.type === 'clip') && !ensureUnlocked('main')) return;
    if (selected.every((s) => isLocked(data, trackOf(s.type)))) return void ensureUnlocked(trackOf(selected[0].type));
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
    setSelected(all.filter((i) => !isLocked(data, trackOf(i.type))));
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
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30;
        seek(useEditor.getState().time + (e.key === 'ArrowLeft' ? -step : step));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loaded, togglePlay, split, removeSelected, selectAll, seek, undo, redo]);

  const openExport = () => {
    engineRef.current?.pause();
    useEditor.getState().setPlaying(false);
    setExporting(true);
  };

  if (!loaded) return <PersistenceLoading persistence={persistence} />;

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
          <AspectPicker value={data.aspect} onChange={(aspect) => useEditor.getState().commit((d) => ({ ...d, aspect }))} />
          <Button onClick={openExport} disabled={!data.duration}>
            <Download className="size-4" /> 匯出
          </Button>
        </div>
      </header>
      <PersistenceNotice persistence={persistence} />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            <section className="flex w-[360px] shrink-0 flex-col border-r border-line bg-surface">
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
                {tab === 'voice' && <VoicePanel />}
                {tab === 'sticker' && <StickerPanel />}
                {tab === 'filter' && <FilterPanel />}
                {tab === 'beauty' && <BeautyPanel />}
                {tab === 'transition' && <TransitionPanel />}
                {tab === 'ai' && <AIPanel />}
                {tab === 'erase' && <ErasePanel onCompare={(on) => engineRef.current?.setBypassErase(on)} />}
              </div>
            </section>
            {/* 中間：屬性編輯區；右側：預覽 */}
            <aside className="min-w-0 flex-1 overflow-y-auto bg-surface">
              <div className="mx-auto h-full max-w-xl">
                <Inspector />
              </div>
            </aside>
          </div>
          <Timeline seek={seek} split={split} remove={removeSelected} togglePlay={togglePlay} />
        </div>
        {/* 右側預覽：從頂部延伸到底部 */}
        <Preview canvasRef={canvasRef} togglePlay={togglePlay} seek={seek} loading={!loaded} />
      </div>
      <NavigationWarning persistence={persistence} />
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
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
