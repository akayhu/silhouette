import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createMemoryRouter, RouterProvider, Link, Route, Routes } from 'react-router-dom';
import { api, ApiError } from '../src/lib/api';
import { ProjectSave, type SaveStatus } from '../src/lib/projectSave';
import { projectDrafts, type DraftStorage, type Draft } from '../src/lib/projectDrafts';
import { useProjectPersistence } from '../src/editor/useProjectPersistence';
import { SaveBadge, PersistenceLoading, PersistenceNotice, NavigationWarning } from '../src/editor/PersistenceUI';
import { useEditor } from '../src/editor/store';
import type { Project, ProjectData, ProjectSummary } from '../src/lib/types';
import '../src/index.css';

const results = document.querySelector('#results')!;
const summary = document.querySelector('#summary')!;
const button = document.querySelector<HTMLButtonElement>('#run')!;
const host = document.querySelector('#sandbox')!;
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check: () => boolean, timeout = 4000) => { const end = Date.now() + timeout; while (!check()) { if (Date.now() > end) throw new Error('等待條件逾時'); await sleep(10); } };
const fresh = (): Project & ProjectSummary => ({ aspect: '9:16', duration: 0, id: crypto.randomUUID(), name: '測試專案', thumbnail: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', data: { aspect: '9:16', clips: [], media: [], audio: [], captions: [], stickers: [], overlays: [], duration: 0 } });
const memory = (): DraftStorage => {
  const records = new Map<string, Draft>();
  return { async put(d) { records.set(d.key, structuredClone(d)); }, async list(u, p) { return [...records.values()].filter((d) => d.userId === u && d.projectId === p); },
    async remove(k, seq) { if ((records.get(k)?.seq ?? Infinity) <= seq) records.delete(k); }, emergency(d) { records.set(d.key, structuredClone(d)); } };
};
function setup(extra: Partial<ConstructorParameters<typeof ProjectSave>[0]> = {}) {
  let status: SaveStatus; let writes = 0;
  const project = fresh();
  const storage = extra.storage ?? memory();
  const saver = new ProjectSave({ userId: 'test-' + crypto.randomUUID(), project, storage, debounce: 10000, retryDelay: 10, timeout: 100,
    write: async (draft) => { writes++; return { ...project, name: draft.name, updatedAt: new Date(Date.parse(project.updatedAt) + writes).toISOString() } as ProjectSummary; },
    readRemote: async () => project, ...extra, notify: (value) => { status = value; extra.notify?.(value); } });
  return { saver, project, storage, status: () => status!, writes: () => writes };
}
let passed = 0, failed = 0;
async function run(name: string, test: () => unknown) {
  const li = document.createElement('li'); li.textContent = '測試中：' + name; results.append(li);
  try { await test(); passed++; li.textContent = 'PASS：' + name; }
  catch (error) { failed++; li.textContent = `FAIL：${name} — ${error}`; }
}

let view: ReturnType<typeof useProjectPersistence> | undefined;
const resumed = JSON.parse(sessionStorage.getItem('pianke-test-reload') ?? 'null') as { cloud: Project & ProjectSummary; userId: string; rows: string[]; passed: number; failed: number } | null;
let cloud = resumed?.cloud ?? fresh(); let offline = false;
const testUser = resumed?.userId ?? 'persistence-browser-' + crypto.randomUUID();
const nativeProject = api.project, nativeUpdate = api.updateProject;
function mountHarness() {
  api.project = async () => { if (offline) throw new TypeError('模擬斷線'); return { project: structuredClone(cloud) }; };
  api.updateProject = async (_id, content) => {
    if (offline) throw new TypeError('模擬斷線');
    if (content.expectedUpdatedAt !== cloud.updatedAt) throw new ApiError('版本衝突', 409);
    cloud = { ...cloud, name: content.name ?? cloud.name, data: content.data ?? cloud.data, updatedAt: new Date(Date.parse(cloud.updatedAt) + 1).toISOString() };
    return { project: cloud as ProjectSummary };
  };
  function Harness() {
    const p = useProjectPersistence(testUser, cloud.id, () => { throw new Error('模擬縮圖失敗'); }); view = p;
    const name = useEditor((s) => s.name);
    if (!p.ready) return <PersistenceLoading persistence={p} />;
    return <><SaveBadge status={p.status} retry={p.retry} /><input aria-label="測試專案名稱" value={name} onChange={(e) => useEditor.getState().setName(e.target.value)} />
      <Link to="/dashboard">測試離開</Link><PersistenceNotice persistence={p} /><NavigationWarning persistence={p} /></>;
  }
  function RoutesHarness() { return <Routes><Route path="/editor/:id" element={<Harness />} /><Route path="/dashboard" element={<p>已返回專案列表</p>} /></Routes>; }
  const router = createMemoryRouter([{ path: '*', element: <RoutesHarness /> }], { initialEntries: ['/dashboard', `/editor/${cloud.id}`], initialIndex: 1 });
  const root = createRoot(host); flushSync(() => root.render(<StrictMode><RouterProvider router={router} /></StrictMode>));
  return { router, unmount: () => { flushSync(() => root.unmount()); router.dispose(); view = undefined; } };
}

button.disabled = false; button.textContent = '執行全部測試';
button.onclick = async () => {
  button.disabled = true; results.replaceChildren(); passed = failed = 0;
  await run('連續修改只會有一個儲存請求，舊回應不會把新編輯標成已儲存', async () => {
    const pending: { draft: Draft; base: string; done: (p: ProjectSummary) => void }[] = [];
    const t = setup({ write: (draft, base) => new Promise((done) => pending.push({ draft, base, done })), timeout: 2000 });
    try {
      t.saver.change('版本 A', t.project.data); const first = t.saver.save();
      t.saver.change('版本 B', { ...t.project.data }); await t.saver.save(); assert(pending.length === 1, '出現並行寫入');
      const firstAt = '2026-01-01T00:00:01.000Z'; pending[0].done({ ...t.project, updatedAt: firstAt } as ProjectSummary); await first;
      assert(t.status().phase !== 'saved' && t.saver.hasUnsaved(), '舊版本錯誤標成已儲存');
      await until(() => pending.length === 2); assert(pending[1].draft.name === '版本 B' && pending[1].base === firstAt, '新版本基準錯誤');
      pending[1].done({ ...t.project, updatedAt: '2026-01-01T00:00:02.000Z' } as ProjectSummary);
      await until(() => t.status().phase === 'saved');
    } finally { t.saver.dispose(); }
  });
  await run('暫時斷線會退避重試並保存最新內容', async () => {
    let attempts = 0; const t = setup({ write: async () => { if (++attempts < 3) throw new TypeError('斷線'); return { ...t.project, updatedAt: '2026-01-01T00:00:01.000Z' } as ProjectSummary; } });
    try { t.saver.change('離線修改', t.project.data); await t.saver.save(); await until(() => t.status().phase === 'saved'); assert(attempts === 3, '未完成自動重試'); }
    finally { t.saver.dispose(); }
  });
  await run('儲存請求卡住會逾時，保留草稿並可重試', async () => {
    const t = setup({ write: () => new Promise(() => {}), timeout: 20 });
    try { t.saver.change('逾時版本', t.project.data); await t.saver.save(); assert(t.status().phase === 'error' && !!t.status().retryAt, '沒有逾時或重試'); assert(t.saver.hasUnsaved(), '遺失未儲存狀態'); }
    finally { t.saver.dispose(); }
  });
  await run('登入過期會停止自動重試，保留草稿', async () => {
    let attempts = 0; const t = setup({ write: async () => { attempts++; throw new ApiError('登入過期', 401); } });
    try { t.saver.change('保留登入前修改', t.project.data); await t.saver.save(); await sleep(40); assert(attempts === 1 && !t.status().retryAt && t.saver.hasUnsaved(), '登入過期仍持續重試或清除草稿'); }
    finally { t.saver.dispose(); }
  });
  await run('伺服器衝突不自動覆寫，修改後仍維持暫停狀態', async () => {
    let attempts = 0; const t = setup({ write: async () => { attempts++; throw new ApiError('衝突', 409); } });
    try { t.saver.change('本機修改', t.project.data); await t.saver.save(); t.saver.change('繼續本機修改', t.project.data); t.saver.retry(); await sleep(40);
      assert(attempts === 1 && t.status().phase === 'conflict', '衝突後仍自動覆寫'); }
    finally { t.saver.dispose(); }
  });
  await run('回應遺失但伺服器內容已相同時，可辨認已成功儲存', async () => {
    const project = fresh(); const t = setup({ project, write: async () => { throw new ApiError('舊版本', 409); }, readRemote: async () => ({ ...project, name: '實際已儲存', updatedAt: '2026-01-01T00:00:01.000Z' }) });
    try { t.saver.change('實際已儲存', project.data); await t.saver.save(); assert(t.status().phase === 'saved' && !t.saver.hasUnsaved(), '誤判成版本衝突'); }
    finally { t.saver.dispose(); }
  });
  await run('復原過期草稿後，重新開啟仍保有原版本基準', async () => {
    const t = setup(); const d = { ...t.saver.getDraft(), baseUpdatedAt: '2025-01-01T00:00:00.000Z', name: '過期草稿', seq: 5 };
    try { t.saver.recover(d); await t.saver.backup(); assert(t.status().phase === 'conflict' && t.saver.getDraft().baseUpdatedAt === d.baseUpdatedAt, '遺失衝突基準');
      t.saver.overwrite(t.project.updatedAt); await until(() => t.status().phase === 'saved'); }
    finally { t.saver.dispose(); }
  });
  await run('IndexedDB 草稿依帳戶和專案隔離，清理不會刪除較新的版本', async () => {
    const t = setup({ storage: projectDrafts }); const d = t.saver.getDraft();
    try { await projectDrafts.put({ ...d, seq: 2 }); await projectDrafts.remove(d.key, 1);
      assert((await projectDrafts.list(d.userId, d.projectId)).some((x) => x.key === d.key && x.seq === 2), '新草稿遭舊回應清除');
      assert((await projectDrafts.list(d.userId + '-other', d.projectId)).length === 0, '讀到其他帳戶草稿');
      assert((await projectDrafts.list(d.userId, d.projectId + '-other')).length === 0, '讀到其他專案草稿'); }
    finally { await projectDrafts.remove(d.key, 99); t.saver.dispose(); }
  });
  await run('離開頁面緊急備份能覆蓋較舊的 IndexedDB 草稿', async () => {
    const t = setup({ storage: projectDrafts }); const d = t.saver.getDraft();
    try { await projectDrafts.put(d); projectDrafts.emergency({ ...d, seq: 3, name: '最新緊急備份' });
      const drafts = await projectDrafts.list(d.userId, d.projectId); assert(drafts[0]?.seq === 3 && drafts[0].name === '最新緊急備份', '沒有優先復原新備份'); }
    finally { await projectDrafts.remove(d.key, 99); t.saver.dispose(); }
  });
  await run('本機空間不足時明確回報，但不妨礙伺服器儲存', async () => {
    const storage = memory(); storage.put = async () => { throw new Error('QuotaExceeded'); }; storage.emergency = () => { throw new Error('QuotaExceeded'); };
    const t = setup({ storage });
    try { t.saver.change('空間不足測試', t.project.data); await t.saver.backup(); assert(t.status().local === 'error', '未回報備份失敗'); await t.saver.save(); assert(t.status().phase === 'saved', '備份失敗阻擋同步'); }
    finally { t.saver.dispose(); }
  });
  await run('切換專案後，舊請求回應不會改寫目前畫面狀態', async () => {
    let done!: (p: ProjectSummary) => void; const statuses: SaveStatus[] = [];
    const t = setup({ write: () => new Promise((resolve) => { done = resolve; }), notify: (s) => statuses.push(s) });
    t.saver.change('舊專案修改', t.project.data); const pending = t.saver.save(); t.saver.dispose(); const count = statuses.length;
    done({ ...t.project, updatedAt: '2026-01-01T00:00:01.000Z' } as ProjectSummary); await pending;
    assert(statuses.length === count, '舊請求更新已離開的畫面');
  });
  await run('編輯器可在 StrictMode 載入，縮圖失敗仍可完成同步', async () => {
    cloud = fresh(); offline = false; const h = mountHarness();
    try { await until(() => !!view?.ready); useEditor.getState().setName('縮圖失敗仍可存');
      await until(() => view?.status.phase === 'saved' && cloud.name === '縮圖失敗仍可存'); }
    finally { h.unmount(); }
  });
  await run('斷線期間保留本機草稿，恢復連線後立即同步', async () => {
    cloud = fresh(); offline = false; const h = mountHarness();
    try { await until(() => !!view?.ready); offline = true; useEditor.getState().setName('斷線編輯');
      await until(() => view?.status.phase === 'error' && view?.status.local === 'saved');
      assert(cloud.name !== '斷線編輯', '離線時錯誤同步'); offline = false; window.dispatchEvent(new Event('online'));
      await until(() => cloud.name === '斷線編輯' && view?.status.phase === 'saved'); }
    finally { h.unmount(); }
  });
  await run('未同步時返回會阻擋；繼續編輯保留目前專案', async () => {
    cloud = fresh(); offline = false; const h = mountHarness();
    try { await until(() => !!view?.ready); offline = true; useEditor.getState().setName('返回前修改');
      await h.router.navigate(-1); await until(() => host.textContent!.includes('修改尚未同步，確定要離開'));
      const stay = [...host.querySelectorAll('button')].find((b) => b.textContent === '繼續編輯'); stay!.click();
      await until(() => !host.textContent!.includes('修改尚未同步，確定要離開')); assert(h.router.state.location.pathname.startsWith('/editor/'), '未保留頁面');
      const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); assert(event.defaultPrevented, '沒有離開提醒');
    } finally { h.unmount(); offline = false; }
  });
  await run('重新掛載後提供草稿復原，復原後可完成同步', async () => {
    cloud = fresh(); offline = false; let h = mountHarness();
    try { await until(() => !!view?.ready); offline = true; useEditor.getState().setName('重新開啟要保留'); await sleep(200); h.unmount();
      offline = false; h = mountHarness(); await until(() => (view?.recovery.length ?? 0) > 0);
      assert(!view!.ready, '未選版本前就啟動編輯或同步'); view!.restore(view!.recovery[0]);
      await until(() => !!view?.ready && useEditor.getState().name === '重新開啟要保留');
      await until(() => cloud.name === '重新開啟要保留' && view?.status.phase === 'saved');
    } finally { h.unmount(); offline = false; }
  });
  await run('復原舊草稿遇到新伺服器版本時，明確選擇後才覆寫', async () => {
    cloud = fresh(); offline = false; let h = mountHarness();
    try {
      await until(() => !!view?.ready); offline = true; useEditor.getState().setName('要保留的草稿'); await sleep(200); h.unmount();
      cloud = { ...cloud, name: '另一分頁版本', updatedAt: '2026-01-01T00:00:01.000Z' };
      offline = false; h = mountHarness(); await until(() => (view?.recovery.length ?? 0) > 0);
      view!.restore(view!.recovery[0]); await until(() => view?.status.phase === 'conflict');
      assert(cloud.name === '另一分頁版本', '復原時覆寫伺服器');
      await view!.resolveConflict(true); await until(() => view?.status.phase === 'saved'); assert(cloud.name === '要保留的草稿', '未完成使用者指定的版本儲存');
      assert((await projectDrafts.list(testUser, cloud.id)).length === 0, '復原成功後留下重複草稿');
    } finally { h.unmount(); offline = false; }
  });
  await run('衝突時捨棄本機修改，重載後不再出現已捨棄草稿', async () => {
    cloud = fresh(); offline = false; let h = mountHarness();
    try {
      await until(() => !!view?.ready); offline = true; useEditor.getState().setName('要捨棄的草稿'); await sleep(200); h.unmount();
      cloud = { ...cloud, name: '保留伺服器版本', updatedAt: '2026-01-01T00:00:01.000Z' };
      offline = false; h = mountHarness(); await until(() => (view?.recovery.length ?? 0) > 0);
      view!.restore(view!.recovery[0]); await until(() => view?.status.phase === 'conflict');
      await view!.resolveConflict(false); await until(() => view?.status.phase === 'saved');
      assert(useEditor.getState().name === '保留伺服器版本', '未載入伺服器內容');
      h.unmount(); h = mountHarness(); await until(() => !!view?.ready); assert(view!.recovery.length === 0, '捨棄草稿再次出現');
    } finally { h.unmount(); offline = false; }
  });
  api.project = nativeProject; api.updateProject = nativeUpdate;
  summary.textContent = `完成：${passed} 通過，${failed} 失敗。`;
  button.disabled = false;
};

const reloadTest = document.querySelector<HTMLButtonElement>('#reload-test')!;
reloadTest.onclick = async () => {
  reloadTest.disabled = button.disabled = true;
  cloud = fresh(); offline = false;
  const h = mountHarness();
  await until(() => !!view?.ready);
  offline = true;
  useEditor.getState().setName('重新整理前的未同步草稿');
  sessionStorage.setItem('pianke-test-reload', JSON.stringify({ cloud, userId: testUser,
    rows: [...results.querySelectorAll('li')].map((li) => li.textContent), passed, failed }));
  h.unmount(); // Flush emergency backup before a real document reload, without an interactive unload prompt.
  location.reload();
};
if (resumed) {
  passed = resumed.passed; failed = resumed.failed;
  for (const row of resumed.rows) { const li = document.createElement('li'); li.textContent = row; results.append(li); }
  button.disabled = true; reloadTest.disabled = true;
  const h = mountHarness();
  void until(() => (view?.recovery.length ?? 0) > 0).then(() => {
    summary.textContent = '重新整理後已找到草稿。請按「復原這份草稿」，再按「完成復原驗證」。';
    reloadTest.disabled = false; reloadTest.textContent = '完成復原驗證';
    reloadTest.onclick = async () => {
      reloadTest.disabled = true;
      await run('實際重新整理頁面後，仍能復原未同步草稿並完成同步', async () => {
        await until(() => !!view?.ready && cloud.name === '重新整理前的未同步草稿' && view.status.phase === 'saved');
        assert(useEditor.getState().name === cloud.name, '復原內容不符');
      });
      h.unmount(); api.project = nativeProject; api.updateProject = nativeUpdate;
      sessionStorage.removeItem('pianke-test-reload');
      summary.textContent = `完成：${passed} 通過，${failed} 失敗（包含實際重新整理復原）。`;
      button.disabled = false;
    };
  });
}
