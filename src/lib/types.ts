import type { ClipFilter } from './filters';

export type Plan = 'free' | 'pro';

export interface User {
  id: string;
  email: string;
  name: string;
  plan: Plan;
  planRenewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  usage: { projectsThisMonth: number; projectLimit: number | null };
}

export type Aspect = '9:16' | '16:9' | '1:1';
export type MediaKind = 'video' | 'image' | 'audio';

export interface MediaItem {
  id: string;
  name: string;
  kind: MediaKind;
  url: string;
  duration: number;
  width?: number;
  height?: number;
  /** 朗讀產生的音訊會標記來源，素材庫用來分組 */
  origin?: 'upload' | 'tts' | 'library';
  /** 影片／圖片的小縮圖（data URL），時間軸和素材庫使用 */
  thumb?: string;
  /** 去浮水印區域（套用在這個素材的所有片段） */
  erase?: EraseRegion[];
}

export type EraseMode = 'fill' | 'blur' | 'mosaic';

/** 座標是相對於原始畫面的比例（0–1） */
export interface EraseRegion {
  id: string;
  /** 自動偵測時判斷的類型，面板上用來標示 */
  kind?: 'logo' | 'subtitle';
  x: number;
  y: number;
  w: number;
  h: number;
  mode: EraseMode;
}

/** 主軌（影片／圖片）採磁吸排列，start 由前面片段的長度推算 */
/** 畫面在預覽中的擺放方式；x、y 為相對畫布中心的位移（畫布寬高的比例） */
export interface ClipTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  fit: 'contain' | 'cover';
}

export type TransitionType = 'fade' | 'flash' | 'dip' | 'slideLeft' | 'slideRight' | 'slideUp' | 'zoom' | 'blur' | 'wipe' | 'circle';

/** 從前一個片段轉到這個片段的轉場；兩段會重疊 duration 秒 */
export interface Transition {
  type: TransitionType;
  duration: number;
}

export interface VideoClip {
  id: string;
  mediaId: string;
  in: number;
  out: number;
  speed: number;
  volume: number;
  transform?: ClipTransform;
  transition?: Transition;
  filter?: ClipFilter;
}

/** 音訊軌可自由擺放 */
export interface AudioClip {
  id: string;
  mediaId: string;
  start: number;
  in: number;
  out: number;
  volume: number;
  /** 淡入／淡出秒數 */
  fadeIn?: number;
  fadeOut?: number;
}

export type CaptionAnimation = 'none' | 'fade' | 'pop' | 'typewriter' | 'slide';

export interface CaptionStyle {
  font: string;
  size: number;
  color: string;
  stroke: string;
  background: string | null;
  bold: boolean;
  /** 0 = 頂端、1 = 底端 */
  y: number;
  animation: CaptionAnimation;
}

export interface Caption {
  id: string;
  start: number;
  end: number;
  text: string;
  style: CaptionStyle;
}

export type StickerAnimation = 'none' | 'pop' | 'bounce' | 'wobble' | 'pulse' | 'spin' | 'float';

/** 畫面上的貼紙：x、y 是中心點位置（畫布寬高的比例），scale 1 = 短邊的 30% */
export interface StickerItem {
  id: string;
  stickerId: string;
  start: number;
  end: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  animation: StickerAnimation;
}

export interface ProjectData {
  aspect: Aspect;
  media: MediaItem[];
  clips: VideoClip[];
  audio: AudioClip[];
  captions: Caption[];
  stickers: StickerItem[];
  duration: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  thumbnail: string | null;
  aspect: Aspect;
  duration: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project extends Omit<ProjectSummary, 'aspect' | 'duration'> {
  data: ProjectData;
}

export interface Voice {
  id: string;
  locale: string;
  engine: 'system' | 'breezy';
  sample?: string;
  name?: string;
  desc?: string;
  custom?: boolean;
}

export interface LibraryTrack {
  id: string;
  title: string;
  category: 'music' | 'sfx';
  mood: string;
  bpm: number | null;
  desc: string;
  duration: number;
  url: string;
  peaks: number[];
}
