import { Lock } from 'lucide-react';
import { isLocked, trackLabel } from '../lib/timeline';
import type { TrackKey } from '../lib/types';
import { notify } from '../components/ui';
import { useEditor } from './store';

/** 軌道沒鎖定才回傳 true；鎖定時顯示提示，讓呼叫端停止動作 */
export function ensureUnlocked(...tracks: TrackKey[]) {
  const data = useEditor.getState().data;
  const hit = tracks.find((t) => isLocked(data, t));
  if (!hit) return true;
  notify(`${trackLabel(hit)}已鎖定，請先解鎖`, 'error');
  return false;
}

/** 軌道鎖定時放在面板上方的提示，附一鍵解鎖；字幕可能同時有好幾列，傳陣列時只要任一列鎖定就顯示，解鎖會一次解開全部 */
export function LockedBanner({ track }: { track: TrackKey | TrackKey[] }) {
  const tracks = Array.isArray(track) ? track : [track];
  const locks = useEditor((s) => s.data.locks);
  const hit = tracks.find((t) => !!locks?.[t]);
  if (!hit) return null;
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl bg-brand-soft/70 px-3 py-2 text-xs font-semibold text-brand">
      <Lock className="size-3.5 shrink-0" />
      <span className="flex-1">{trackLabel(hit)}已鎖定，無法修改</span>
      <button
        className="rounded-lg bg-surface px-2 py-1 font-bold shadow-card hover:bg-white"
        onClick={() => tracks.forEach((t) => isLocked(useEditor.getState().data, t) && useEditor.getState().toggleLock(t))}
      >
        解鎖
      </button>
    </div>
  );
}
