import { DEFAULT_CLIP_FILTER } from './filters';
import { uid } from './format';
import { isLocked, layoutMain, mainDuration } from './timeline';
import type { AudioClip, LibraryTrack, MediaItem, ProjectData, VideoClip } from './types';

/**
 * 照片快閃：用照片做的短影音（回憶、旅遊、商品照）。每張照片只停一下、慢慢放大，
 * 換張時閃一下白光，再配上節奏明快的配樂。純規則式，不呼叫任何 AI API。
 * 只用在主軌全部是照片的專案；有影片的專案不動，避免打亂口白和字幕的時間。
 */

export interface PhotoFlashOptions {
  /** 每張照片停留幾秒 */
  secondsPerPhoto: number;
  /** 套一層柔和的奶油色調 */
  softFilter: boolean;
  /** 自動配樂 */
  music: boolean;
}

export type PhotoFlashResult =
  | { ok: true; data: ProjectData; photos: number; duration: number; music: string | null }
  | { ok: false; reason: string };

/** 快閃配樂偏好的節奏（bpm）：太慢的曲子配 1 秒一張會拖 */
const TARGET_BPM = 120;
const FLASH_LEN = 0.25;

const isPhoto = (m: MediaItem | undefined) => m?.kind === 'image';

/** 有沒有可以排成快閃的照片：主軌全是照片，或主軌是空的但素材庫裡有還沒用到的照片 */
export function photoFlashPhotos(d: Pick<ProjectData, 'media' | 'clips' | 'overlays'>): MediaItem[] | 'has-video' {
  const byId = new Map(d.media.map((m) => [m.id, m]));
  if (d.clips.length) return d.clips.every((c) => isPhoto(byId.get(c.mediaId))) ? d.clips.map((c) => byId.get(c.mediaId)!) : 'has-video';
  const used = new Set(d.overlays.map((o) => o.mediaId));
  return d.media.filter((m) => isPhoto(m) && !used.has(m.id));
}

/** 挑節奏最接近 120 bpm 的配樂；沒有 bpm 資料的排在最後 */
export function pickFlashMusic(library: LibraryTrack[]): LibraryTrack | null {
  const tracks = library.filter((t) => t.category === 'music');
  if (!tracks.length) return null;
  const dist = (t: LibraryTrack) => (t.bpm == null ? Infinity : Math.abs(t.bpm - TARGET_BPM));
  return [...tracks].sort((a, b) => dist(a) - dist(b) || a.id.localeCompare(b.id))[0];
}

export function planPhotoFlash(input: ProjectData, library: LibraryTrack[], opts: PhotoFlashOptions): PhotoFlashResult {
  if (isLocked(input, 'main')) return { ok: false, reason: '主軌已鎖定，先解鎖再套用' };
  const photos = photoFlashPhotos(input);
  if (photos === 'has-video') return { ok: false, reason: '主軌上有影片：照片快閃只用在全部都是照片的專案，才不會打亂口白和字幕的時間' };
  if (!photos.length) return { ok: false, reason: '先把照片加進專案' };

  const sec = Math.min(3, Math.max(0.4, opts.secondsPerPhoto));
  const overlap = Math.min(FLASH_LEN, sec * 0.4);
  const filter = opts.softFilter ? { ...DEFAULT_CLIP_FILTER, preset: 'cream' as const, intensity: 1 } : undefined;
  const base: VideoClip[] = input.clips.length ? input.clips : photos.map((m) => ({ id: uid(), mediaId: m.id, in: 0, out: sec, speed: 1, volume: 1 }));
  const clips: VideoClip[] = base.map((c, i) => ({
    ...c,
    in: 0,
    out: sec,
    speed: 1,
    motion: 'zoomIn',
    transition: i === 0 ? undefined : { type: 'flash', duration: overlap },
    ...(filter ? { filter } : {}),
  }));

  let d: ProjectData = { ...input, clips };
  const total = mainDuration(clips);
  let musicTitle: string | null = null;
  // 上一次配的快閃音樂（模板標記）先拿掉，使用者自己加的音訊不動
  if (opts.music && !isLocked(d, 'audio-music')) {
    const audio: AudioClip[] = d.audio.filter((a) => a.role !== 'template');
    let media = d.media;
    const song = pickFlashMusic(library);
    if (song && total > 0.5) {
      const found = media.find((m) => m.url === song.url);
      const m: MediaItem = found ?? { id: uid(), name: song.title, kind: 'audio', url: song.url, duration: song.duration, origin: 'library' };
      if (!found) media = [...media, m];
      for (let at = 0; at < total - 0.3; at += song.duration) {
        const out = Math.min(song.duration, total - at);
        audio.push({ id: uid(), mediaId: m.id, start: at, in: 0, out, volume: 0.8, fadeIn: at === 0 ? 0.3 : 0, fadeOut: at + out >= total - 0.01 ? Math.min(1.5, out / 3) : 0, role: 'template' });
      }
      musicTitle = song.title;
    }
    const libUrls = new Set(library.map((t) => t.url));
    const used = new Set(audio.map((a) => a.mediaId));
    media = media.filter((m) => !(m.origin === 'library' && libUrls.has(m.url) && !used.has(m.id)));
    d = { ...d, media, audio };
  }
  return { ok: true, data: { ...d, duration: Math.max(total, d.duration) }, photos: clips.length, duration: total, music: musicTitle };
}
