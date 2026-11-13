export type ExportBitrate = 'high' | 'standard' | 'small';
export type ExportFps = 24 | 30 | 60;

/** 匯出設定：解析度（短邊）、畫質（位元率等級）、每秒格數；capBps 是為了壓進檔案大小上限而額外限制的畫面位元率 */
export interface ExportSettings {
  quality: 720 | 1080;
  bitrate: ExportBitrate;
  fps: ExportFps;
  capBps?: number;
}

export const DEFAULT_SETTINGS: Omit<ExportSettings, 'quality'> = { bitrate: 'standard', fps: 30 };
export const AUDIO_BITRATE = 160_000;

/** 再低畫面就糊到沒法看，壓不到目標就直接告訴使用者，不偷偷再降 */
export const MIN_VIDEO_BPS = 400_000;
/** 編碼器用變動位元率，實際大小會在目標上下浮動，留一點空間 */
const TARGET_MARGIN = 0.92;

/**
 * 畫面位元率：標準是 1080p 8 Mbps／720p 4 Mbps（30 格），
 * 高畫質多 60%、省空間減半；60 格約多 50%，24 格略少。有 capBps 時不超過它。
 */
export function videoBitrate({ quality, bitrate, fps, capBps }: ExportSettings) {
  const base = quality === 1080 ? 8_000_000 : 4_000_000;
  const level = { high: 1.6, standard: 1, small: 0.5 }[bitrate];
  const rate = fps === 60 ? 1.5 : fps === 24 ? 0.85 : 1;
  const natural = Math.round((base * level * rate) / 100_000) * 100_000;
  return capBps ? Math.min(natural, capBps) : natural;
}

/** 檔案大小上限（位元組）：編碼器用變動位元率，畫面簡單時實際會小很多 */
export function estimateSize(settings: ExportSettings, duration: number) {
  return ((videoBitrate(settings) + AUDIO_BITRATE) * duration) / 8;
}

export interface TargetPlan {
  /** 要額外限制的畫面位元率；原本就小於目標時是 undefined（不用動） */
  capBps?: number;
  /** 能不能壓進目標大小 */
  feasible: boolean;
  /** 套用後檔案最大約幾位元組 */
  estimate: number;
  /** 這支影片在最低可接受畫質下，檔案最小約幾位元組 */
  minBytes: number;
}

/** 想把檔案壓在 targetBytes 以內：算出需要的位元率；壓不進去就回報辦不到，而不是悄悄降到很糊 */
export function planTargetSize(settings: Omit<ExportSettings, 'capBps'>, duration: number, targetBytes: number): TargetPlan {
  const natural = videoBitrate(settings);
  const minBytes = ((MIN_VIDEO_BPS + AUDIO_BITRATE) * duration) / 8;
  const need = Math.floor((targetBytes * TARGET_MARGIN * 8) / Math.max(duration, 0.1) - AUDIO_BITRATE);
  if (need >= natural) return { feasible: true, estimate: estimateSize(settings, duration), minBytes };
  if (need >= MIN_VIDEO_BPS) {
    const capBps = Math.floor(need / 50_000) * 50_000;
    return { capBps, feasible: true, estimate: estimateSize({ ...settings, capBps }, duration), minBytes };
  }
  return { capBps: MIN_VIDEO_BPS, feasible: false, estimate: minBytes, minBytes };
}
