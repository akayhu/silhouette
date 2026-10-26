import { useEffect, useState } from 'react';

/** 預覽畫面的參考線：只畫在編輯器上，不會出現在匯出的影片裡 */

/** 短影音安全框：外框離邊 5%（動作安全），內框離邊 10%（字幕與文字安全） */
export const SAFE_INSETS = [0.05, 0.1];

/** 開關記在這台瀏覽器 */
function useStoredToggle(key: string) {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(key) === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(on));
    } catch {
      /* 無法儲存就只在這次有效 */
    }
  }, [key, on]);
  return [on, setOn] as const;
}

/** 參考線（安全框）、垂直中線、水平中線各自獨立開關 */
export function usePreviewGuides() {
  const [showGuides, setShowGuides] = useStoredToggle('pianke.preview.guides');
  const [showVertical, setShowVertical] = useStoredToggle('pianke.preview.vertical');
  const [showHorizontal, setShowHorizontal] = useStoredToggle('pianke.preview.horizontal');
  return { showGuides, setShowGuides, showVertical, setShowVertical, showHorizontal, setShowHorizontal };
}

const LINE = '[filter:drop-shadow(0_0_1px_rgb(0_0_0/0.55))]';

/** 參考線：短影音安全框（外框、內框） */
export function GuidesOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {SAFE_INSETS.map((p) => (
        <div key={p} className={`absolute border border-white/90 ${LINE}`} style={{ left: `${p * 100}%`, right: `${p * 100}%`, top: `${p * 100}%`, bottom: `${p * 100}%` }} />
      ))}
    </div>
  );
}

/** 畫面正中央的垂直線／水平線 */
export function CenterLine({ axis }: { axis: 'vertical' | 'horizontal' }) {
  return (
    <div
      className={`pointer-events-none absolute ${axis === 'vertical' ? 'inset-y-0 left-1/2 border-l' : 'inset-x-0 top-1/2 border-t'} border-white/90 ${LINE}`}
      aria-hidden
    />
  );
}
