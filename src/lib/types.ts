import type { ClipFilter } from './filters';

export type Plan = 'free' | 'pro';

export interface User {
  id: string;
  email: string;
  name: string;
  plan: Plan;
  role: 'user' | 'admin';
  planSource: 'paid' | 'admin' | 'trial' | null;
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
  /** 音訊波形（0–1），音樂面板顯示用 */
  peaks?: number[];
  /** 本機素材：檔案只存在使用者的裝置，帳戶裡只記檔名與大小（換裝置時用來配對重新提供的檔案） */
  local?: { fileName: string; size: number; type: string };
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

/** 美肌：0–100，0 代表不處理 */
export interface ClipBeauty {
  smooth: number;
  whiten: number;
  rosy: number;
}

/** 片段播放時的動態效果（運鏡） */
export type ClipMotion = 'none' | 'zoomIn' | 'zoomOut' | 'punch' | 'shake';

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
  motion?: ClipMotion;
  beauty?: ClipBeauty;
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
  /** 智能剪輯模板加的配樂／音效（重新套用模板時會先移除） */
  role?: 'template';
}

export type CaptionAnimation = 'none' | 'fade' | 'pop' | 'typewriter' | 'slide' | 'karaoke';

/** 文字陰影：blur、distance 是相對字級的百分比，angle 0° = 往右、90° = 往下 */
export interface CaptionShadow {
  color: string;
  opacity: number;
  blur: number;
  distance: number;
  angle: number;
}

export interface CaptionStyle {
  font: string;
  size: number;
  color: string;
  stroke: string;
  background: string | null;
  bold: boolean;
  /** 0 = 頂端、1 = 底端 */
  y: number;
  /** 水平中心位置，0 = 最左、1 = 最右；沒有設定 = 置中 */
  x?: number;
  animation: CaptionAnimation;
  /** 卡拉 OK 動畫：唸到的字換成這個顏色；沒有設定 = 黃色 */
  highlight?: string;
  /** 沒有設定 = 無陰影 */
  shadow?: CaptionShadow | null;
}

/** 字幕裡每個字（或詞）在時間軸上的位置，語音辨識產生；用來「改文字就剪影片」 */
export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

export interface Caption {
  id: string;
  start: number;
  end: number;
  text: string;
  style: CaptionStyle;
  /** 逐字時間（時間軸秒數）。文字或位置被改到對不上時視為失效，改用整句時間 */
  words?: CaptionWord[];
  /** 雙語字幕：第二行的翻譯（顯示在原文下方、字小一點） */
  translation?: string;
  /** 智能剪輯加上的花字（重新套用模板時會先移除） */
  role?: 'flower';
}

export type StickerAnimation = 'none' | 'pop' | 'bounce' | 'wobble' | 'pulse' | 'spin' | 'float';

/** 畫面上的貼紙：x、y 是中心點位置（畫布寬高的比例），scale 1 = 短邊的 30% */
/** 疊加在主軌上方的影片／圖片（畫中畫）。lane 越大越上層 */
export interface OverlayClip {
  id: string;
  mediaId: string;
  start: number;
  in: number;
  out: number;
  speed: number;
  volume: number;
  lane: number;
  opacity: number;
  transform?: ClipTransform;
  filter?: ClipFilter;
  beauty?: ClipBeauty;
}

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

/** 時間軸的四條軌道 */
export type TrackKey = 'caption' | 'sticker' | 'overlay' | 'main' | 'audio';

/** 影片封面：從影片挑一格畫面（或用一張圖片），再加上封面標題 */
export interface VideoCover {
  source: 'frame' | 'image';
  /** source 為 frame 時，取時間軸上第幾秒的畫面 */
  time: number;
  /** source 為 image 時，素材庫裡的圖片 */
  mediaId?: string;
  title: string;
  style: CaptionStyle;
  /** 匯出影片時，開頭 0.1 秒顯示封面（讓平台抓到封面） */
  inVideo: boolean;
  /** 小縮圖（我的專案列表使用） */
  thumb?: string;
}

export interface ProjectData {
  /** 影片封面 */
  cover?: VideoCover;
  /** 專案內的人名、品牌與常見辨識錯字校正表 */
  captionDictionary?: { from: string; to: string }[];
  /** 鎖定的軌道：不能選取、編輯，也不會被其他軌的波紋刪除移動 */
  locks?: Partial<Record<TrackKey, boolean>>;
  aspect: Aspect;
  media: MediaItem[];
  clips: VideoClip[];
  audio: AudioClip[];
  captions: Caption[];
  stickers: StickerItem[];
  overlays: OverlayClip[];
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

export interface AdminStats {
  members: { total: number; paid: number; trial: number; free: number; adminGranted: number; newToday: number };
  revenue: { total: number; today: number; payments: number; inRange: number };
  daily: { date: string; amount: number; payments: number; signups: number; cumulative: number }[];
}

export interface AdminMember {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  plan: Plan;
  planSource: 'paid' | 'admin' | 'trial' | null;
  planRenewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  projects: number;
  totalPaid: number;
  lastPaymentAt: string | null;
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
