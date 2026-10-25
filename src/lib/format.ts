export function formatTime(sec: number, withFrames = false) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const whole = Math.floor(rest);
  const base = `${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}`;
  if (!withFrames) return base;
  return `${base}.${String(Math.floor((rest - whole) * 100)).padStart(2, '0')}`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function relativeTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return '剛剛';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return formatDate(iso);
}

export const uid = () => Math.random().toString(36).slice(2, 10);
