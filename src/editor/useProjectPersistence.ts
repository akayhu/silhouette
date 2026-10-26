import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { projectDrafts, type Draft } from '../lib/projectDrafts';
import { ProjectSave, sameContent, type SaveStatus } from '../lib/projectSave';
import type { Project } from '../lib/types';
import { useEditor } from './store';

const initial: SaveStatus = { phase: 'saved', local: 'saved', message: '', lastSavedAt: null, retryAt: null };
export function useProjectPersistence(userId: string | undefined, id: string | undefined, thumbnail: () => string | undefined) {
  const [status, setStatus] = useState(initial);
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [recovery, setRecovery] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const saver = useRef<ProjectSave | null>(null);
  const start = useRef<(project: Project, draft?: Draft) => void>(() => {});
  const remote = useRef<Project | null>(null);
  const recoveredFrom = useRef<Draft | null>(null);
  const thumb = useRef(thumbnail); thumb.current = thumbnail;
  const [loadKey, reload] = useState(0);

  useEffect(() => {
    if (!id || !userId) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const loadAbort = new AbortController();
    const deadline = setTimeout(() => loadAbort.abort(), 15_000);
    setReady(false); setError(''); setWarning(''); setRecovery([]); setStatus(initial);
    start.current = (project, draft) => {
      if (!active) return;
      saver.current?.dispose(); unsubscribe?.();
      useEditor.getState().load(project.id, draft?.name ?? project.name, draft?.data ?? project.data);
      // The store normalizes older project formats; take its actual initial snapshot.
      const normalized = { ...project, name: useEditor.getState().name, data: useEditor.getState().data };
      recoveredFrom.current = draft ?? null;
      let recovering = false;
      const coordinator = new ProjectSave({ userId, project: normalized, storage: projectDrafts,
        write: async (content, expectedUpdatedAt, signal) => {
          let image: string | undefined;
          try { image = thumb.current(); } catch { /* A thumbnail must never prevent project saving. */ }
          return (await api.updateProject(id, { name: content.name.trim() || '未命名專案', data: content.data, thumbnail: image, expectedUpdatedAt }, signal)).project;
        },
        readRemote: async () => (await api.project(id, AbortSignal.timeout(15_000))).project,
        notify: (value) => {
          if (!active) return;
          setStatus(value);
          useEditor.getState().setSave(value.phase);
          if (recovering && value.phase === 'saved' && draft) void projectDrafts.remove(draft.key, draft.seq).catch(() => {});
        },
      });
      saver.current = coordinator;
      unsubscribe = useEditor.subscribe((state, previous) => {
        if (state.projectId === id && (state.data !== previous.data || state.name !== previous.name)) coordinator.change(state.name, state.data);
      });
      recovering = !!draft;
      if (draft) coordinator.recover({ ...draft, data: normalized.data });
      setRecovery([]); setGeneration((value) => value + 1); setReady(true);
    };
    void (async () => {
      const [cloud, local] = await Promise.allSettled([api.project(id, loadAbort.signal), projectDrafts.list(userId, id)]);
      clearTimeout(deadline);
      if (!active) return;
      if (local.status === 'rejected') setWarning('無法讀取本機復原資料；請確認瀏覽器允許網站儲存資料。');
      const drafts = local.status === 'fulfilled' ? local.value : [];
      remote.current = cloud.status === 'fulfilled' ? cloud.value.project : null;
      if (cloud.status === 'rejected' && cloud.reason instanceof ApiError && [401, 403, 404].includes(cloud.reason.status)) {
        setError(cloud.reason.message); return;
      }
      const pending = drafts.filter((draft) => {
        if (remote.current && sameContent(draft, remote.current)) {
          void projectDrafts.remove(draft.key, draft.seq).catch(() => {}); return false;
        }
        return true;
      });
      if (pending.length) { setRecovery(pending); return; }
      if (remote.current) start.current(remote.current);
      else setError('暫時無法載入專案，請確認網路後重試。');
    })();
    const online = () => saver.current?.retry();
    const hidden = () => { if (document.visibilityState === 'hidden') { saver.current?.emergency(); void saver.current?.backup(); } };
    const leave = (event: BeforeUnloadEvent) => {
      if (!saver.current?.hasUnsaved()) return;
      saver.current.emergency(); event.preventDefault(); event.returnValue = '';
    };
    const pagehide = () => saver.current?.emergency();
    window.addEventListener('online', online);
    window.addEventListener('beforeunload', leave);
    window.addEventListener('pagehide', pagehide);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      active = false; clearTimeout(deadline); loadAbort.abort(); unsubscribe?.();
      saver.current?.dispose(); saver.current = null;
      window.removeEventListener('online', online); window.removeEventListener('beforeunload', leave);
      window.removeEventListener('pagehide', pagehide); document.removeEventListener('visibilitychange', hidden);
    };
  }, [id, userId, loadKey]);

  const restore = (draft: Draft) => {
    const project = remote.current ?? { id: draft.projectId, name: draft.name, data: draft.data,
      createdAt: new Date(draft.savedAt).toISOString(), updatedAt: draft.baseUpdatedAt, thumbnail: null };
    start.current(project, draft);
  };
  const useRemote = async () => {
    setBusy(true);
    try {
      const project = (await api.project(id!, AbortSignal.timeout(15_000))).project;
      // This button explicitly discards the offered drafts; never delete a newer write from another tab.
      await Promise.all(recovery.map((d) => projectDrafts.remove(d.key, d.seq).catch(() => {})));
      start.current(project);
    } catch (err) { setError(err instanceof Error ? err.message : '無法載入伺服器版本'); }
    finally { setBusy(false); }
  };
  const download = (draft = saver.current?.getDraft()) => {
    if (!draft) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${draft.name || '未命名專案'}-草稿.json`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const resolveConflict = async (local: boolean) => {
    setBusy(true);
    try {
      const project = (await api.project(id!, AbortSignal.timeout(15_000))).project;
      if (local) saver.current?.overwrite(project.updatedAt);
      else {
        const draft = saver.current?.getDraft();
        saver.current?.dispose();
        if (draft) await projectDrafts.remove(draft.key, draft.seq);
        if (recoveredFrom.current) await projectDrafts.remove(recoveredFrom.current.key, recoveredFrom.current.seq);
        start.current(project);
      }
    } catch (err) { setWarning(err instanceof Error ? err.message : '無法處理版本衝突，草稿仍保留。'); }
    finally { setBusy(false); }
  };
  return { status, ready, generation, error, warning, recovery, busy, restore, useRemote, download, resolveConflict,
    retry: () => saver.current?.retry(), retryLoad: () => reload((key) => key + 1),
    beforeLeave: () => saver.current?.emergency(), hasUnsaved: () => saver.current?.hasUnsaved() ?? false };
}
