import type { MediaItem, ProjectData } from './types';

/**
 * 本機優先：使用者加入的影片、圖片、音樂只存在這台裝置的瀏覽器裡（IndexedDB），不會上傳到伺服器。
 * 專案存到帳戶時，素材網址換成「local:素材 id」；打開專案時再換回可以播放的本機網址。
 * 這台裝置找不到檔案（換電腦、清除瀏覽器資料）時，網址是空的，由使用者重新提供素材。
 */

export const LOCAL_PREFIX = 'local:';

interface StoredFile {
  id: string;
  blob: Blob;
  name: string;
  size: number;
  type: string;
  savedAt: number;
}

let connection: Promise<IDBDatabase> | undefined;
function open() {
  return (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('pianke-media', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files', { keyPath: 'id' });
    req.onsuccess = () => {
      req.result.onversionchange = () => {
        req.result.close();
        connection = undefined;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      connection = undefined;
      reject(req.error ?? new Error('無法開啟本機素材庫'));
    };
  }));
}

async function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    let result: T;
    const tx = db.transaction('files', mode);
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('無法存取本機素材庫'));
    body(tx.objectStore('files'), (value) => (result = value));
  });
}

/** 這次開啟網頁期間，每個素材的本機播放網址（同一個素材只建立一次） */
const urls = new Map<string, string>();
/** 本機網址 → 檔案本身；逐格匯出直接讀檔案，比透過網址快 */
const blobs = new Map<string, Blob>();

function register(id: string, blob: Blob) {
  const old = urls.get(id);
  if (old) {
    URL.revokeObjectURL(old);
    blobs.delete(old);
  }
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  blobs.set(url, blob);
  return url;
}

export const blobForUrl = (url: string) => blobs.get(url);
export const isLocalMedia = (m: MediaItem) => !!m.local;
/** 本機素材在這台裝置找不到（需要重新提供） */
export const isMissing = (m: MediaItem) => !!m.local && !m.url;

let persistAsked = false;
/** 請瀏覽器把素材當成重要資料，空間不夠時不要自動清掉 */
async function requestPersist() {
  if (persistAsked) return;
  persistAsked = true;
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.();
  } catch {
    /* 不支援也能用，只是比較可能被清掉 */
  }
}

/** 把檔案存到這台裝置，回傳可以播放的本機網址與要記在專案裡的檔案資訊 */
export async function saveLocalFile(id: string, file: File | Blob, name: string): Promise<{ url: string; local: NonNullable<MediaItem['local']> }> {
  void requestPersist();
  const record: StoredFile = { id, blob: file, name, size: file.size, type: file.type, savedAt: Date.now() };
  try {
    await run<void>('readwrite', (store) => store.put(record));
  } catch (error) {
    const quota = error instanceof DOMException && error.name === 'QuotaExceededError';
    throw new Error(quota ? '這台裝置的瀏覽器空間不夠，請刪除不用的專案素材後再試' : '無法把素材存到這台裝置：' + (error as Error).message);
  }
  return { url: register(id, file), local: { fileName: name, size: file.size, type: file.type } };
}

async function readLocalFile(id: string): Promise<StoredFile | null> {
  try {
    return await run<StoredFile | null>('readonly', (store, done) => {
      const req = store.get(id);
      req.onsuccess = () => done((req.result as StoredFile | undefined) ?? null);
    });
  } catch {
    return null;
  }
}

/** 存到帳戶前：本機素材的網址換成 local:id（本機網址只在這次開啟有效，也不該存到伺服器） */
export function persistableData(d: ProjectData): ProjectData {
  if (!d.media.some((m) => m.local)) return d;
  return { ...d, media: d.media.map((m) => (m.local ? { ...m, url: LOCAL_PREFIX + m.id } : m)) };
}

/** 打開專案時：把 local:id 換成這台裝置上的檔案；找不到的網址留空，等使用者重新提供 */
export async function hydrateLocalMedia(d: ProjectData): Promise<ProjectData> {
  if (!d.media.some((m) => m.local || m.url.startsWith(LOCAL_PREFIX))) return d;
  const media = await Promise.all(
    d.media.map(async (m) => {
      if (!m.local && !m.url.startsWith(LOCAL_PREFIX)) return m;
      const cached = urls.get(m.id);
      if (cached) return { ...m, url: cached };
      const file = await readLocalFile(m.id);
      return { ...m, url: file ? register(m.id, file.blob) : '' };
    }),
  );
  return { ...d, media };
}

/**
 * 重新提供素材：把使用者選的檔案配對到找不到的素材。
 * 依序比對「檔名＋大小」、「大小」、「檔名」，每個檔案只配給一個素材。
 */
export async function relinkFiles(media: MediaItem[], files: File[]): Promise<{ id: string; url: string }[]> {
  const missing = media.filter(isMissing);
  const left = [...files];
  const take = (test: (m: MediaItem, f: File) => boolean, m: MediaItem) => {
    const i = left.findIndex((f) => test(m, f));
    return i >= 0 ? left.splice(i, 1)[0] : undefined;
  };
  const found: { m: MediaItem; f: File }[] = [];
  for (const rule of [
    (m: MediaItem, f: File) => f.name === m.local!.fileName && f.size === m.local!.size,
    (m: MediaItem, f: File) => f.size === m.local!.size,
    (m: MediaItem, f: File) => f.name === m.local!.fileName,
  ]) {
    for (const m of missing) {
      if (found.some((x) => x.m.id === m.id)) continue;
      const f = take(rule, m);
      if (f) found.push({ m, f });
    }
  }
  const out: { id: string; url: string }[] = [];
  for (const { m, f } of found) {
    const { url } = await saveLocalFile(m.id, f, f.name);
    out.push({ id: m.id, url });
  }
  return out;
}

/** 舊專案的素材還在伺服器上（/uploads/…）；本機素材與音樂庫（/music/…）不算 */
export const isOnServer = (m: MediaItem) => !m.local && m.url.startsWith('/uploads/');

/**
 * 把伺服器上的素材下載到這台裝置。成功的素材改成本機素材（網址換成本機網址、記下檔名與大小）；
 * 專案存檔後，伺服器會刪掉不再使用的檔案。
 */
export async function moveToDevice(media: MediaItem[], onProgress?: (done: number, total: number) => void): Promise<{ id: string; url: string; local: NonNullable<MediaItem['local']> }[]> {
  const todo = media.filter(isOnServer);
  const out: { id: string; url: string; local: NonNullable<MediaItem['local']> }[] = [];
  for (const [i, m] of todo.entries()) {
    const res = await fetch(m.url);
    if (!res.ok) throw new Error(`素材「${m.name}」下載失敗（${res.status}）`);
    const blob = await res.blob();
    const ext = m.url.match(/\.[a-z0-9]+$/i)?.[0] ?? '';
    const saved = await saveLocalFile(m.id, blob, m.name + ext);
    out.push({ id: m.id, ...saved });
    onProgress?.(i + 1, todo.length);
  }
  return out;
}

/** 刪除專案時一併刪掉這台裝置上的素材檔 */
export async function deleteLocalFiles(ids: string[]) {
  if (!ids.length) return;
  try {
    await run<void>('readwrite', (store) => ids.forEach((id) => store.delete(id)));
  } catch {
    /* 刪不掉也不影響使用 */
  }
  for (const id of ids) {
    const url = urls.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      blobs.delete(url);
      urls.delete(id);
    }
  }
}

/** 這台裝置的瀏覽器空間：已用多少、總共多少（位元組）；不支援時回傳 null */
export async function storageUsage(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e && e.quota ? { used: e.usage ?? 0, quota: e.quota } : null;
  } catch {
    return null;
  }
}
