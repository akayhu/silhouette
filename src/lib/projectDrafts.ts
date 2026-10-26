import type { ProjectData } from './types';

export interface Draft {
  version: 1;
  key: string;
  userId: string;
  projectId: string;
  seq: number;
  savedAt: number;
  baseUpdatedAt: string;
  name: string;
  data: ProjectData;
}
export interface DraftStorage {
  put(draft: Draft): Promise<void>;
  list(userId: string, projectId: string): Promise<Draft[]>;
  remove(key: string, throughSeq: number): Promise<void>;
  emergency(draft: Draft): void;
}
const PREFIX = 'pianke:recovery:v1:';
const valid = (value: unknown): value is Draft => {
  const d = value as Draft | null;
  return !!d && d.version === 1 && typeof d.key === 'string' && typeof d.userId === 'string' && typeof d.projectId === 'string'
    && typeof d.name === 'string' && typeof d.baseUpdatedAt === 'string' && Number.isFinite(d.savedAt) && Number.isFinite(d.seq)
    && !!d.data && ['9:16', '16:9', '1:1'].includes(d.data.aspect)
    && ['media', 'clips', 'audio', 'captions', 'stickers', 'overlays'].every((key) => Array.isArray(d.data[key as keyof ProjectData]));
};
function readEmergency(key: string) {
  try { const d: unknown = JSON.parse(localStorage.getItem(PREFIX + key) ?? 'null'); return valid(d) ? d : null; }
  catch { return null; }
}
function clearEmergency(key: string, seq: number) {
  if ((readEmergency(key)?.seq ?? Infinity) <= seq) localStorage.removeItem(PREFIX + key);
}
let connection: Promise<IDBDatabase> | undefined;
function open() {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('pianke-recovery', 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore('drafts', { keyPath: 'key' });
      store.createIndex('project', ['userId', 'projectId']);
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => { req.result.close(); connection = undefined; };
      resolve(req.result);
    };
    req.onerror = () => { connection = undefined; reject(req.error); };
    req.onblocked = () => { connection = undefined; reject(new Error('本機草稿資料庫被其他分頁阻擋')); };
  });
}
async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let tx: IDBTransaction | undefined;
  let expired = false;
  try {
    return await Promise.race([
      (async () => {
        const db = await open();
        if (expired) throw new Error('本機草稿存取逾時');
        return new Promise<T>((resolve, reject) => {
          let result: T;
          tx = db.transaction('drafts', mode);
          tx.oncomplete = () => resolve(result);
          tx.onerror = tx.onabort = () => reject(tx?.error ?? new Error('無法寫入本機草稿'));
          run(tx.objectStore('drafts'), (value) => { result = value; });
        });
      })(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => { expired = true; tx?.abort(); reject(new Error('本機草稿存取逾時')); }, 4000); }),
    ]);
  } finally { clearTimeout(timeout); }
}
export const projectDrafts: DraftStorage = {
  emergency(draft) { localStorage.setItem(PREFIX + draft.key, JSON.stringify(draft)); },
  async put(draft) {
    try {
      await transaction<void>('readwrite', (store) => { store.put(draft); });
      try { clearEmergency(draft.key, draft.seq); } catch { /* IndexedDB remains authoritative. */ }
    } catch { this.emergency(draft); }
  },
  async list(userId, projectId) {
    let drafts: Draft[] = [];
    let failed = false;
    try {
      drafts = await transaction<Draft[]>('readonly', (store, result) => {
        const req = store.index('project').getAll([userId, projectId]);
        req.onsuccess = () => result(req.result.filter(valid));
      });
    } catch { failed = true; }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        const d = readEmergency(key.slice(PREFIX.length));
        if (!d || d.userId !== userId || d.projectId !== projectId) continue;
        const previous = drafts.findIndex((item) => item.key === d.key);
        if (previous < 0) drafts.push(d);
        else if (d.seq >= drafts[previous].seq) drafts[previous] = d;
      }
    } catch { if (failed) throw new Error('此瀏覽器無法讀取本機草稿，請勿關閉尚未同步的專案。'); }
    return drafts.sort((a, b) => b.savedAt - a.savedAt);
  },
  async remove(key, throughSeq) {
    try {
      await transaction<void>('readwrite', (store) => {
        const req = store.get(key);
        req.onsuccess = () => { if (req.result && req.result.seq <= throughSeq) store.delete(key); };
      });
    } finally { clearEmergency(key, throughSeq); }
  },
};
