import type { ExportBitrate, ExportFps } from './offlineExport';

/** 一支匯出成品的資訊（本機與帳戶共用） */
export interface ExportInfo {
  ext: 'mp4' | 'webm';
  width: number;
  height: number;
  quality: 720 | 1080;
  fps: ExportFps;
  bitrate: ExportBitrate;
  duration: number;
  mode: 'offline' | 'realtime';
}

/** 存到帳戶的匯出（伺服器回傳） */
export interface SavedExport extends ExportInfo {
  id: string;
  size: number;
  createdAt: string;
  url: string;
}

/** 存在這台裝置的最近一次匯出 */
export interface LocalExport {
  key: string;
  userId: string;
  projectId: string;
  info: ExportInfo;
  blob: Blob;
  createdAt: number;
  /** 已存到帳戶的話，對應的帳戶匯出 id */
  savedId?: string;
}

/**
 * 每個專案在本機只留最近一次匯出（IndexedDB），關掉視窗或重新整理都還在。
 * 影片很佔空間，整台裝置最多留 MAX_PROJECTS 個專案的成品，舊的自動清掉。
 */
const MAX_PROJECTS = 3;
const keyOf = (userId: string, projectId: string) => `${userId}:${projectId}`;

let connection: Promise<IDBDatabase> | undefined;
function open() {
  return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('pianke-exports', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('latest', { keyPath: 'key' });
    req.onsuccess = () => {
      req.result.onversionchange = () => {
        req.result.close();
        connection = undefined;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      connection = undefined;
      reject(req.error);
    };
  }));
}

async function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    let result: T;
    const tx = db.transaction('latest', mode);
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('無法存取本機匯出紀錄'));
    body(tx.objectStore('latest'), (value) => (result = value));
  });
}

export const localExports = {
  async get(userId: string, projectId: string): Promise<LocalExport | null> {
    try {
      return await run<LocalExport | null>('readonly', (store, done) => {
        const req = store.get(keyOf(userId, projectId));
        req.onsuccess = () => done((req.result as LocalExport | undefined) ?? null);
      });
    } catch {
      return null;
    }
  },

  /** 存進本機；空間不夠或瀏覽器不允許就略過（使用者仍可直接下載） */
  async put(userId: string, projectId: string, info: ExportInfo, blob: Blob): Promise<LocalExport | null> {
    const record: LocalExport = { key: keyOf(userId, projectId), userId, projectId, info, blob, createdAt: Date.now() };
    try {
      await run<void>('readwrite', (store) => {
        store.put(record);
        const req = store.getAll();
        req.onsuccess = () => {
          const all = (req.result as LocalExport[]).filter((r) => r.key !== record.key).sort((a, b) => b.createdAt - a.createdAt);
          for (const old of all.slice(MAX_PROJECTS - 1)) store.delete(old.key);
        };
      });
      return record;
    } catch {
      return null;
    }
  },

  async markSaved(record: LocalExport, savedId: string | undefined) {
    try {
      await run<void>('readwrite', (store) => store.put({ ...record, savedId }));
    } catch {
      /* 只影響「已存到帳戶」的標示 */
    }
  },

  async remove(userId: string, projectId: string) {
    try {
      await run<void>('readwrite', (store) => store.delete(keyOf(userId, projectId)));
    } catch {
      /* 刪不掉也不影響使用 */
    }
  },
};
