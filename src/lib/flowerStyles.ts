import { SMART_TEMPLATES } from './templates';
import type { CaptionStyle } from './types';

export interface FlowerStyleOption {
  id: string;
  name: string;
  style: CaptionStyle;
}

/**
 * 花字庫：每個智能剪輯模板都已經設計好一組獨立的花字樣式（顏色、描邊、底色、陰影、動畫），
 * 直接重用這些真的在用的樣式當作可以挑選的花字，不用另外幻想新樣式、也不用重複定義一次。
 */
export const FLOWER_STYLES: FlowerStyleOption[] = SMART_TEMPLATES.map((t) => ({ id: t.id, name: t.name, style: t.flower }));
