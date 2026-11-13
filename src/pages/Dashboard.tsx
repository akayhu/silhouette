import { useEffect, useMemo, useState } from 'react';
import { deleteLocalFiles } from '../lib/localMedia';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDownAZ, Clapperboard, Clock, Copy, Crown, MoreHorizontal, Pencil, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatTime, relativeTime } from '../lib/format';
import { isPaidPro, isTrial, trialDaysLeft, trialEnded } from '../lib/plan';
import { upcomingShoppingMoments } from '../lib/shoppingCalendar';
import type { Aspect, ProjectSummary } from '../lib/types';
import { AppLayout } from '../components/Layout';
import { Button, Field, Modal, inputClass, useToast, useUpgrade } from '../components/ui';

/** 存在 localStorage 的 key 帶日期，換一個檔期（例如明年的雙11）會是新 key，不會被去年關掉的紀錄誤蓋住 */
const dismissKey = (id: string, date: Date) => `shopping-moment-dismissed:${id}:${date.toISOString().slice(0, 10)}`;

/** 蝦皮分潤這類開箱／推薦影片的檔期提示：只顯示最近的一個，關掉後這個檔期就不會再跳出來 */
function ShoppingMomentCard() {
  const next = useMemo(() => upcomingShoppingMoments()[0] ?? null, []);
  const [dismissed, setDismissed] = useState(() => {
    if (!next) return false;
    try {
      return localStorage.getItem(dismissKey(next.moment.id, next.date)) === '1';
    } catch {
      return false;
    }
  });
  if (!next || dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(dismissKey(next.moment.id, next.date), '1');
    } catch {
      /* 無痕模式等存不了就算了，這次工作階段還是會關掉 */
    }
  };
  return (
    <div className="mt-6 flex items-start gap-3 rounded-3xl border border-line bg-surface p-5 shadow-card">
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
        <ShoppingBag className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-bold">
          {next.daysUntil === 0 ? '今天就是' : `還有 ${next.daysUntil} 天`} {next.moment.name}
          {next.approx && <span className="ml-1 text-xs font-normal text-ink-mute">（約，農曆節慶每年日期會變動）</span>}
          ，適合拍分潤影片
        </div>
        <div className="mt-1.5 text-sm text-ink-soft">建議關鍵字：{next.moment.keywords.join('、')}</div>
        <div className="mt-0.5 text-sm text-ink-soft">拍片角度：{next.moment.angle}</div>
      </div>
      <button onClick={dismiss} aria-label="關閉提示" className="shrink-0 rounded-lg p-1.5 text-ink-mute hover:bg-sunken hover:text-ink">
        <X className="size-4" />
      </button>
    </div>
  );
}

const aspects: { id: Aspect; label: string; sub: string; box: string }[] = [
  { id: '9:16', label: '9:16 直式', sub: 'Reels、TikTok、Shorts', box: 'h-12 w-7' },
  { id: '16:9', label: '16:9 橫式', sub: 'YouTube', box: 'h-7 w-12' },
  { id: '1:1', label: '1:1 方形', sub: 'IG 貼文', box: 'size-10' },
];

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const upgrade = useUpgrade();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [aspect, setAspect] = useState<Aspect>('9:16');
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'updated' | 'name'>('updated');

  const load = () => api.projects().then((r) => setProjects(r.projects));
  useEffect(() => {
    load();
    refresh();
    if (new URLSearchParams(location.search).get('verified') === '1') {
      toast('帳號已完成驗證，歡迎使用 7 天免費專業版試用！', 'success');
      navigate('/dashboard', { replace: true });
    }
  }, []);

  const visible = useMemo(() => {
    if (!projects) return null;
    const q = query.trim().toLowerCase();
    const filtered = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
    return sort === 'name' ? [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'zh-TW')) : filtered;
  }, [projects, query, sort]);

  if (!user) return null;
  const { projectsThisMonth, projectLimit } = user.usage;
  const atLimit = projectLimit !== null && projectsThisMonth >= projectLimit;

  const openCreate = () => {
    if (atLimit) return upgrade(`免費版每月可以建立 ${projectLimit} 個專案，這個月已經用完了。`);
    setNewName('');
    setCreating(true);
  };

  const duplicate = async (p: ProjectSummary) => {
    setMenu(null);
    try {
      const { project } = await api.duplicateProject(p.id);
      toast('已複製專案');
      load();
      refresh();
      navigate(`/editor/${project.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UPGRADE_REQUIRED') upgrade(err.message);
      else toast((err as Error).message, 'error');
    }
  };

  const create = async () => {
    try {
      const { project } = await api.createProject({ name: newName, aspect });
      navigate(`/editor/${project.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UPGRADE_REQUIRED') {
        setCreating(false);
        upgrade(err.message);
      } else toast((err as Error).message, 'error');
    }
  };

  return (
    <AppLayout>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">嗨，{user.name}</h1>
          <p className="mt-1 text-ink-soft">繼續剪輯，或開一個新專案。</p>
        </div>
        <Button size="lg" onClick={openCreate}>
          <Plus className="size-5" /> 新增專案
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-ink-soft">目前方案</span>
            {user.plan === 'pro' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-coral-soft px-2.5 py-1 text-xs font-bold text-coral">
                <Crown className="size-3.5" /> {isTrial(user) ? '專業版試用' : '專業版'}
              </span>
            ) : (
              <span className="rounded-full bg-sunken px-2.5 py-1 text-xs font-bold text-ink-soft">免費版</span>
            )}
          </div>
          <div className="mt-3 text-sm text-ink-soft">
            {isTrial(user) ? (
              <>
                試用還剩 <b className="text-coral">{trialDaysLeft(user)} 天</b>（到 {formatDate(user.planRenewsAt!)}），到期後自動回到免費版，不會扣款
              </>
            ) : user.plan === 'pro' ? (
              user.planRenewsAt ? `${user.cancelAtPeriodEnd ? '將於' : '下次續訂：'}${formatDate(user.planRenewsAt)}${user.cancelAtPeriodEnd ? ' 結束' : ''}` : '不限期'
            ) : trialEnded(user) ? (
              '7 天專業版試用已結束，升級後即可繼續使用 AI 功能與 1080p 匯出'
            ) : (
              '升級後解鎖 AI 功能與 1080p 匯出'
            )}
          </div>
          {!isPaidPro(user) && (
            <Link to="/checkout" className="mt-3 inline-block text-sm font-bold text-brand hover:underline">
              升級專業版 NT$399／月 →
            </Link>
          )}
        </div>
        <div className="rounded-3xl border border-line bg-surface p-5 shadow-card">
          <div className="text-sm font-bold text-ink-soft">本月專案用量</div>
          <div className="mt-2 text-3xl font-extrabold">
            {projectsThisMonth}
            <span className="text-lg text-ink-mute"> / {projectLimit ?? '不限'}</span>
          </div>
          {projectLimit !== null && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-sunken">
              <div className={`h-full rounded-full ${atLimit ? 'bg-coral' : 'bg-brand'}`} style={{ width: `${Math.min(100, (projectsThisMonth / projectLimit) * 100)}%` }} />
            </div>
          )}
        </div>
      </div>

      <ShoppingMomentCard />

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">我的專案</h2>
        {projects !== null && projects.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋專案名稱"
                aria-label="搜尋專案名稱"
                className="h-9 w-44 rounded-xl border border-line bg-surface pl-9 pr-8 text-sm outline-none focus:border-brand sm:w-56"
              />
              {query && (
                <button onClick={() => setQuery('')} aria-label="清除搜尋" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-ink-mute hover:bg-sunken hover:text-ink">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex rounded-xl border border-line p-0.5">
              <button
                onClick={() => setSort('updated')}
                aria-pressed={sort === 'updated'}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${sort === 'updated' ? 'bg-brand-soft text-brand' : 'text-ink-mute hover:text-ink'}`}
              >
                <Clock className="size-3.5" /> 最近更新
              </button>
              <button
                onClick={() => setSort('name')}
                aria-pressed={sort === 'name'}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${sort === 'name' ? 'bg-brand-soft text-brand' : 'text-ink-mute hover:text-ink'}`}
              >
                <ArrowDownAZ className="size-3.5" /> 名稱
              </button>
            </div>
          </div>
        )}
      </div>
      {visible === null ? (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[4/5] animate-pulse rounded-3xl bg-sunken" />
          ))}
        </div>
      ) : visible.length === 0 && query ? (
        <div className="mt-4 flex flex-col items-center rounded-3xl border-2 border-dashed border-line bg-surface/60 px-6 py-16 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-sunken text-ink-mute">
            <Search className="size-7" />
          </span>
          <span className="mt-4 text-lg font-extrabold">找不到「{query}」</span>
          <span className="mt-1 text-sm text-ink-soft">換個關鍵字，或清除搜尋看全部專案</span>
        </div>
      ) : visible.length === 0 ? (
        <button onClick={openCreate} className="mt-4 flex w-full flex-col items-center rounded-3xl border-2 border-dashed border-line bg-surface/60 px-6 py-16 text-center transition hover:border-brand/50 hover:bg-brand-soft/30">
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
            <Clapperboard className="size-7" />
          </span>
          <span className="mt-4 text-lg font-extrabold">還沒有專案</span>
          <span className="mt-1 text-sm text-ink-soft">建立第一個專案，上傳影片開始剪輯</span>
        </button>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((p) => (
            <div key={p.id} className="group relative rounded-3xl border border-line bg-surface p-2 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop">
              <Link to={`/editor/${p.id}`} className="block">
                <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-2xl bg-sunken">
                  {p.thumbnail ? (
                    <img src={p.thumbnail} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <Clapperboard className="size-8 text-brand/40" />
                  )}
                </div>
                <div className="px-2 pt-3 pb-1.5">
                  <div className="truncate pr-8 font-bold">{p.name}</div>
                  <div className="mt-0.5 flex gap-2 text-xs text-ink-mute">
                    <span>{p.aspect}</span>·<span>{formatTime(p.duration)}</span>·<span>{relativeTime(p.updatedAt)}</span>
                  </div>
                </div>
              </Link>
              <button
                onClick={() => setMenu(menu === p.id ? null : p.id)}
                className="absolute right-3 bottom-4 rounded-lg p-1.5 text-ink-mute hover:bg-sunken hover:text-ink"
                aria-label="更多"
              >
                <MoreHorizontal className="size-4" />
              </button>
              {menu === p.id && (
                <div className="absolute right-3 bottom-12 z-10 w-36 animate-fade-up rounded-2xl border border-line bg-surface p-1.5 shadow-pop" onMouseLeave={() => setMenu(null)}>
                  <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-sunken" onClick={() => (setRenaming(p), setNewName(p.name), setMenu(null))}>
                    <Pencil className="size-4" /> 重新命名
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-sunken" onClick={() => duplicate(p)}>
                    <Copy className="size-4" /> 複製
                  </button>
                  <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50" onClick={() => (setDeleting(p), setMenu(null))}>
                    <Trash2 className="size-4" /> 刪除
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} width="max-w-lg">
        <h2 className="text-xl font-extrabold">新增專案</h2>
        <div className="mt-5 space-y-5">
          <Field label="專案名稱">
            <input className={inputClass} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例如：週末咖啡廳 vlog" autoFocus />
          </Field>
          <div>
            <span className="mb-2 block text-[13px] font-semibold text-ink-soft">畫面比例</span>
            <div className="grid grid-cols-3 gap-2">
              {aspects.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAspect(a.id)}
                  aria-pressed={aspect === a.id}
                  className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 text-center transition ${aspect === a.id ? 'border-brand bg-brand-soft/50' : 'border-line hover:border-ink-mute/40'}`}
                >
                  <span className="grid h-14 place-items-center">
                    <span className={`rounded-md border-2 ${aspect === a.id ? 'border-brand bg-brand/10' : 'border-ink-mute/50'} ${a.box}`} />
                  </span>
                  <span className="text-sm font-bold">{a.label}</span>
                  <span className="text-[11px] text-ink-mute">{a.sub}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <Button size="lg" className="mt-6 w-full" onClick={create}>
          建立並開始剪輯
        </Button>
      </Modal>

      <Modal open={!!renaming} onClose={() => setRenaming(null)}>
        <h2 className="text-xl font-extrabold">重新命名</h2>
        <input className={`${inputClass} mt-4`} value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="專案名稱" autoFocus />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRenaming(null)}>
            取消
          </Button>
          <Button
            onClick={async () => {
              try {
                await api.updateProject(renaming!.id, { name: newName, expectedUpdatedAt: renaming!.updatedAt });
                setRenaming(null);
                load();
              } catch (error) {
                toast(error instanceof Error ? error.message : '重新命名失敗，請稍後再試', 'error');
              }
            }}
          >
            儲存
          </Button>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)}>
        <h2 className="text-xl font-extrabold">刪除「{deleting?.name}」？</h2>
        <p className="mt-2 text-sm text-ink-soft">專案和上傳的素材會一起刪除，無法復原。刪除不會退回本月的專案額度。</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>
            取消
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              // 先記下這個專案在這台裝置上的素材，刪除專案後一起清掉
              const localIds = await api
                .project(deleting!.id)
                .then((r) => r.project.data.media.filter((m) => m.local).map((m) => m.id))
                .catch(() => [] as string[]);
              // 複製、精彩片段轉出的專案會共用同一份本機素材：還有其他專案在用的就不能刪
              const inUse = new Set<string>();
              if (localIds.length) {
                const others = await api.projects().then((r) => r.projects.filter((p) => p.id !== deleting!.id)).catch(() => []);
                const lists = await Promise.all(others.map((p) => api.project(p.id).then((r) => r.project.data.media.filter((m) => m.local).map((m) => m.id)).catch(() => [] as string[])));
                lists.flat().forEach((id) => inUse.add(id));
              }
              await api.deleteProject(deleting!.id);
              await deleteLocalFiles(localIds.filter((id) => !inUse.has(id)));
              setDeleting(null);
              toast('已刪除專案');
              load();
              refresh();
            }}
          >
            刪除專案
          </Button>
        </div>
      </Modal>
    </AppLayout>
  );
}
