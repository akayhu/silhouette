import { aspectSize } from './timeline';
import type { Aspect, ClipTransform } from './types';

/**
 * 分割畫面版型：一鍵把主軌片段跟疊加片段各自定位到畫面的一個區域（上下對分、左右對分、子母畫面），
 * 不用自己手動算位置和縮放。純幾何計算，跟畫面內容無關。
 */

export interface SplitRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SplitPreset {
  id: string;
  name: string;
  main: (W: number, H: number) => SplitRegion;
  overlay: (W: number, H: number) => SplitRegion;
}

export const SPLIT_PRESETS: SplitPreset[] = [
  { id: 'top-bottom', name: '上下對分', main: (W, H) => ({ x: 0, y: 0, w: W, h: H / 2 }), overlay: (W, H) => ({ x: 0, y: H / 2, w: W, h: H / 2 }) },
  { id: 'left-right', name: '左右對分', main: (W, H) => ({ x: 0, y: 0, w: W / 2, h: H }), overlay: (W, H) => ({ x: W / 2, y: 0, w: W / 2, h: H }) },
  { id: 'pip-br', name: '子母畫面（右下）', main: (W, H) => ({ x: 0, y: 0, w: W, h: H }), overlay: (W, H) => ({ x: W * 0.58, y: H * 0.58, w: W * 0.38, h: H * 0.38 }) },
  { id: 'pip-bl', name: '子母畫面（左下）', main: (W, H) => ({ x: 0, y: 0, w: W, h: H }), overlay: (W, H) => ({ x: W * 0.04, y: H * 0.58, w: W * 0.38, h: H * 0.38 }) },
];

/** 把某個區域換算成「填滿（cover）那個區域」所需的 ClipTransform；sw/sh 是素材原始尺寸。
 * 一定要帶 clipRegion：來源長寬比跟區域差很多時（例如橫式素材配直式分割），單純縮放蓋不住、
 * 也可能蓋出區域外，一定要裁切才不會蓋到隔壁區域。 */
export function regionTransform(region: SplitRegion, sw: number, sh: number, W: number, H: number): ClipTransform {
  const coverBase = Math.max(W / sw, H / sh);
  const requiredBase = Math.max(region.w / sw, region.h / sh);
  const scale = coverBase > 0 ? requiredBase / coverBase : 1;
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  return { x: (cx - W / 2) / W, y: (cy - H / 2) / H, scale, rotation: 0, fit: 'cover', clipRegion: { x: region.x / W, y: region.y / H, w: region.w / W, h: region.h / H } };
}

/** 算出套用某個版型時，主軌片段與疊加片段各自要用的 transform */
export function splitTransforms(preset: SplitPreset, aspect: Aspect, mainSize: { w: number; h: number }, overlaySize: { w: number; h: number }) {
  const { width: W, height: H } = aspectSize(aspect, 1080);
  return {
    main: regionTransform(preset.main(W, H), mainSize.w, mainSize.h, W, H),
    overlay: regionTransform(preset.overlay(W, H), overlaySize.w, overlaySize.h, W, H),
  };
}
