import { create } from 'zustand';
import type { ProjectData } from '../lib/types';
import { totalDuration } from '../lib/timeline';

export type SelItem = { type: 'clip' | 'audio' | 'caption'; id: string };
export type Selection = SelItem | null;
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

interface EditorState {
  projectId: string | null;
  name: string;
  data: ProjectData;
  /** 單選時的項目（屬性面板用）；多選時為 null */
  selection: Selection;
  /** 所有選取中的項目（框選／Shift 加選） */
  selected: SelItem[];
  time: number;
  playing: boolean;
  zoom: number;
  past: ProjectData[];
  future: ProjectData[];
  save: SaveState;
  /** 正在預覽上框選浮水印的素材 id */
  eraseEdit: string | null;
  setEraseEdit: (id: string | null) => void;
  /** 選中的轉場接點：轉場套用在這個片段（和它前一段之間） */
  junction: string | null;
  setJunction: (clipId: string | null) => void;
  load: (id: string, name: string, data: ProjectData) => void;
  /** 一般編輯：記錄到復原歷史 */
  commit: (fn: (d: ProjectData) => ProjectData) => void;
  /** 拖曳中的連續更新：不記錄歷史，拖曳開始時先呼叫 checkpoint */
  live: (fn: (d: ProjectData) => ProjectData) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  select: (s: Selection) => void;
  setSelected: (items: SelItem[]) => void;
  toggleSelect: (item: SelItem) => void;
  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setZoom: (z: number) => void;
  setName: (n: string) => void;
  setSave: (s: SaveState) => void;
}

const HISTORY = 100;

const withDuration = (d: ProjectData): ProjectData => ({ ...d, duration: totalDuration(d) });

const empty: ProjectData = { aspect: '9:16', media: [], clips: [], audio: [], captions: [], duration: 0 };

export const useEditor = create<EditorState>((set, get) => ({
  projectId: null,
  name: '',
  data: empty,
  selection: null,
  selected: [],
  time: 0,
  playing: false,
  zoom: 60,
  past: [],
  future: [],
  save: 'saved',
  eraseEdit: null,
  setEraseEdit: (eraseEdit) => set({ eraseEdit }),
  junction: null,
  setJunction: (junction) => set({ junction }),
  load: (projectId, name, data) =>
    set({
      projectId,
      name,
      data: withDuration({ ...empty, ...data, audio: data.audio ?? [] }),
      past: [],
      future: [],
      selection: null,
      selected: [],
      time: 0,
      save: 'saved',
    }),
  commit: (fn) => {
    const { data, past } = get();
    const next = fn(data);
    if (next === data) return;
    set({ data: withDuration(next), past: [...past.slice(-HISTORY), data], future: [], save: 'dirty' });
  },
  live: (fn) => set({ data: withDuration(fn(get().data)), save: 'dirty' }),
  checkpoint: () => set({ past: [...get().past.slice(-HISTORY), get().data], future: [] }),
  undo: () => {
    const { past, data, future } = get();
    if (!past.length) return;
    set({ data: past[past.length - 1], past: past.slice(0, -1), future: [data, ...future], save: 'dirty', selection: null, selected: [] });
  },
  redo: () => {
    const { past, data, future } = get();
    if (!future.length) return;
    set({ data: future[0], future: future.slice(1), past: [...past, data], save: 'dirty', selection: null, selected: [] });
  },
  select: (selection) => set({ selection, selected: selection ? [selection] : [] }),
  setSelected: (selected) => set({ selected, selection: selected.length === 1 ? selected[0] : null }),
  toggleSelect: (item) => {
    const cur = get().selected;
    const selected = cur.some((s) => s.id === item.id) ? cur.filter((s) => s.id !== item.id) : [...cur, item];
    set({ selected, selection: selected.length === 1 ? selected[0] : null });
  },
  setTime: (time) => set({ time }),
  setPlaying: (playing) => set({ playing }),
  setZoom: (zoom) => set({ zoom: Math.min(400, Math.max(8, zoom)) }),
  setName: (name) => set({ name, save: 'dirty' }),
  setSave: (save) => set({ save }),
}));
