import { useState } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import { Check, CloudOff, Loader2 } from 'lucide-react';
import { Button, Modal } from '../components/ui';
import type { SaveStatus } from '../lib/projectSave';
import type { useProjectPersistence } from './useProjectPersistence';
type Persistence = ReturnType<typeof useProjectPersistence>;
const time = (date: string | number) => new Date(date).toLocaleString('zh-TW', { hour12: false });

export function SaveBadge({ status, retry }: { status: SaveStatus; retry: () => void }) {
  return <div aria-live="polite" className="flex items-center gap-2 text-xs font-semibold" title={status.lastSavedAt ? `上次同步：${time(status.lastSavedAt)}` : undefined}>
    {status.phase === 'saved' ? <span className="flex items-center gap-1 text-mint"><Check className="size-3.5" />已同步至伺服器</span>
      : status.phase === 'saving' ? <span className="flex items-center gap-1 text-ink-mute"><Loader2 className="size-3.5 animate-spin" />同步中</span>
      : <span className="flex items-center gap-1 text-ink-soft"><CloudOff className="size-3.5" />{status.phase === 'conflict' ? '版本有衝突' : status.local === 'saved' ? '草稿已存於本機，待同步' : '尚未同步'}</span>}
    {status.phase === 'error' && <button className="text-brand underline" onClick={retry}>立即重試</button>}
  </div>;
}

export function PersistenceLoading({ persistence: p }: { persistence: Persistence }) {
  const [index, setIndex] = useState(0);
  const draft = p.recovery[Math.min(index, p.recovery.length - 1)];
  return <div className="grid min-h-screen place-items-center bg-sunken p-6 text-center">
    {draft ? <section role="dialog" aria-modal="true" aria-labelledby="recovery-title" className="w-full max-w-lg rounded-3xl bg-surface p-6 text-left shadow-pop">
      <h1 id="recovery-title" className="text-xl font-extrabold">找到尚未同步的本機草稿</h1>
      <p className="mt-3 text-sm text-ink-soft">可復原專案名稱、時間軸、字幕和效果。這份備份不包含影片原始檔；原始素材仍需能從伺服器讀取。</p>
      {p.recovery.length > 1 && <label className="mt-4 block text-sm">選擇草稿<select aria-label="選擇復原草稿" className="mt-1 w-full rounded-lg border p-2" value={index} onChange={(e) => setIndex(Number(e.target.value))}>
        {p.recovery.map((d, i) => <option key={d.key} value={i}>{d.name}・{time(d.savedAt)}</option>)}
      </select></label>}
      <p className="mt-3 text-sm font-bold">{draft.name}・{time(draft.savedAt)}</p>
      <p className="mt-2 text-xs text-ink-mute">若伺服器也有更新，復原後會暫停自動同步，讓你決定保留哪個版本。</p>
      {(p.error || p.warning) && <p role="alert" className="mt-3 text-sm text-red-600">{p.error || p.warning}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button disabled={p.busy} onClick={() => p.restore(draft)}>復原這份草稿</Button>
        <Button variant="secondary" onClick={() => p.download(draft)}>下載草稿備份</Button>
        <Button variant="ghost" disabled={p.busy} onClick={() => void p.useRemote()}>捨棄這些草稿，使用伺服器版本</Button>
      </div>
    </section> : <div>
      <p className="font-bold">{p.error || '正在檢查專案與本機草稿…'}</p>
      {p.error && <><Button className="mt-4" onClick={p.retryLoad}>重新載入</Button><Link to="/dashboard" className="ml-4 text-brand">回到我的專案</Link></>}
    </div>}
  </div>;
}

export function PersistenceNotice({ persistence: p }: { persistence: Persistence }) {
  const [conflict, setConflict] = useState(false);
  const { status } = p;
  const localError = status.local === 'error' && status.phase !== 'saved';
  if (status.phase !== 'error' && status.phase !== 'conflict' && !localError && !p.warning) return null;
  return <>
    <div role="alert" className="flex shrink-0 items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">
      <div className="flex-1">
        {localError ? '本機備份也無法寫入，可能儲存空間不足或網站儲存權限已停用。請先下載草稿備份。' : status.message || p.warning}
        {status.phase === 'error' && status.local === 'saved' && ' 最新編輯已保留在這台瀏覽器。'}
        {status.retryAt && ' 稍後會自動重試，恢復連線時也會立即重試。'}
      </div>
      <Button size="sm" variant="secondary" onClick={() => p.download()}>下載草稿備份</Button>
      {status.phase === 'error' && <Button size="sm" onClick={p.retry}>立即重試</Button>}
      {status.phase === 'conflict' && <Button size="sm" onClick={() => setConflict(true)}>處理版本衝突</Button>}
    </div>
    <Modal open={conflict} onClose={() => setConflict(false)} width="max-w-lg">
      <h2 className="text-xl font-extrabold">選擇要保留的版本</h2>
      <p className="mt-3 text-sm text-ink-soft">伺服器與這個分頁都有修改，尚未自動覆寫。建議先下載目前草稿備份。</p>
      <p className="mt-2 text-sm text-ink-soft">選「使用目前草稿儲存」會取代當下的伺服器版本；選「使用伺服器版本」會捨棄這個分頁的修改。</p>
      <div className="mt-5 flex flex-col gap-2">
        <Button variant="secondary" onClick={() => p.download()}>先下載目前草稿</Button>
        <Button disabled={p.busy} onClick={async () => { await p.resolveConflict(true); setConflict(false); }}>使用目前草稿儲存</Button>
        <Button variant="ghost" disabled={p.busy} onClick={async () => { await p.resolveConflict(false); setConflict(false); }}>捨棄目前修改，使用伺服器版本</Button>
      </div>
    </Modal>
  </>;
}

export function NavigationWarning({ persistence: p }: { persistence: Persistence }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname && p.hasUnsaved());
  return <Modal open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()}>
    <h2 className="text-xl font-extrabold">修改尚未同步，確定要離開？</h2>
    <p className="mt-3 text-sm text-ink-soft">{p.status.local === 'saved' ? '本機草稿已保留，再次開啟專案時可復原。' : '本機草稿尚未確認寫入，建議先下載備份或留在頁面完成同步。'}</p>
    <div className="mt-5 flex flex-wrap gap-2">
      <Button onClick={() => blocker.reset?.()}>繼續編輯</Button>
      <Button variant="secondary" onClick={() => p.download()}>下載草稿備份</Button>
      <Button variant="ghost" onClick={() => { p.beforeLeave(); blocker.proceed?.(); }}>離開，稍後復原</Button>
    </div>
  </Modal>;
}
