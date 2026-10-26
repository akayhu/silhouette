import { ApiError } from './api';
import type { Project, ProjectData, ProjectSummary } from './types';
import type { Draft, DraftStorage } from './projectDrafts';

export type SavePhase = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
export interface SaveStatus {
  phase: SavePhase;
  local: 'pending' | 'saved' | 'error';
  message: string;
  lastSavedAt: string | null;
  retryAt: number | null;
}
export const sameContent = (a: Pick<Draft, 'name' | 'data'>, b: Pick<Draft, 'name' | 'data'>) =>
  (a.name.trim() || '未命名專案') === (b.name.trim() || '未命名專案') && JSON.stringify(a.data) === JSON.stringify(b.data);

interface SaveOptions {
  userId: string;
  project: Project;
  storage: DraftStorage;
  write: (draft: Draft, base: string, signal: AbortSignal) => Promise<ProjectSummary>;
  readRemote: () => Promise<Project>;
  notify: (status: SaveStatus) => void;
  debounce?: number;
  retryDelay?: number;
  timeout?: number;
}

/** A single in-flight write; acknowledgements apply only to the version they saved. */
export class ProjectSave {
  private draft: Draft;
  private base: string;
  private dirty = false;
  private disposed = false;
  private sending = false;
  private blocked = false;
  private attempts = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private localTimer?: ReturnType<typeof setTimeout>;
  private request?: AbortController;
  private status: SaveStatus;
  constructor(private options: SaveOptions) {
    const { project, userId } = options;
    this.base = project.updatedAt;
    this.draft = { version: 1, key: crypto.randomUUID(), userId, projectId: project.id, seq: 0,
      savedAt: Date.now(), baseUpdatedAt: this.base, name: project.name, data: project.data };
    this.status = { phase: 'saved', local: 'saved', message: '', lastSavedAt: project.updatedAt, retryAt: null };
    this.emit({});
  }
  private emit(patch: Partial<SaveStatus>) {
    this.status = { ...this.status, ...patch };
    if (!this.disposed) this.options.notify({ ...this.status });
  }
  private schedule(delay: number) {
    clearTimeout(this.timer);
    if (!this.disposed && !this.blocked) this.timer = setTimeout(() => void this.save(), delay);
  }
  change(name: string, data: ProjectData) {
    if (name === this.draft.name && data === this.draft.data) return;
    this.draft = { ...this.draft, name, data, seq: this.draft.seq + 1, savedAt: Date.now(), baseUpdatedAt: this.base };
    this.dirty = true;
    this.emit({ phase: this.blocked ? this.status.phase : 'dirty', local: 'pending' });
    // Throttle rather than debounce: continuous dragging still produces regular backups.
    this.localTimer ??= setTimeout(() => { this.localTimer = undefined; void this.backup(); }, 150);
    this.schedule(this.options.debounce ?? 1200);
  }
  recover(draft: Draft) {
    this.draft = { ...draft, key: this.draft.key, seq: 1, savedAt: Date.now() };
    this.dirty = true;
    this.blocked = draft.baseUpdatedAt !== this.base;
    this.base = draft.baseUpdatedAt;
    this.emit({ phase: this.blocked ? 'conflict' : 'dirty', local: 'pending',
      message: this.blocked ? '伺服器版本也有更新，草稿已復原到編輯器，尚未覆寫伺服器。' : '' });
    // Transfer ownership only after the recovered content is durably backed up.
    void this.backup().then((saved) => {
      if (saved) void this.options.storage.remove(draft.key, draft.seq).catch(() => {});
    });
    this.schedule(this.options.debounce ?? 1200);
  }
  async backup() {
    if (!this.dirty) return false;
    const draft = { ...this.draft, baseUpdatedAt: this.base };
    try {
      await this.options.storage.put(draft);
      if (draft.seq === this.draft.seq) this.emit({ local: 'saved' });
      return true;
    } catch {
      if (draft.seq === this.draft.seq) this.emit({ local: 'error' });
      return false;
    }
  }
  emergency() {
    if (!this.dirty) return;
    try { this.options.storage.emergency({ ...this.draft, baseUpdatedAt: this.base }); this.emit({ local: 'saved' }); }
    catch { if (this.status.local !== 'saved') this.emit({ local: 'error' }); }
  }
  hasUnsaved() { return this.dirty; }
  getDraft() { return { ...this.draft, baseUpdatedAt: this.base }; }
  retry() {
    if (this.status.phase === 'conflict') return;
    this.blocked = false; this.attempts = 0;
    this.emit({ message: '', retryAt: null });
    this.schedule(0);
  }
  /** Called only after the user explicitly chooses their draft over the current remote version. */
  overwrite(baseUpdatedAt: string) {
    this.base = baseUpdatedAt;
    this.blocked = false; this.attempts = 0;
    this.emit({ phase: 'dirty', message: '', retryAt: null });
    void this.backup(); this.schedule(0);
  }
  async save() {
    if (this.disposed || this.sending || !this.dirty || this.blocked) return;
    clearTimeout(this.timer);
    this.sending = true;
    const sent = { ...this.draft, baseUpdatedAt: this.base };
    const abort = new AbortController(); this.request = abort;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    this.emit({ phase: 'saving', message: '', retryAt: null });
    try {
      // A request deadline covers a fetch implementation that never settles on abort as well.
      const result = await Promise.race([
        this.options.write(sent, this.base, abort.signal),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => { abort.abort(); reject(new Error('儲存逾時，將自動重試。')); }, this.options.timeout ?? 15_000); }),
      ]).catch(async (error: unknown) => {
        if (error instanceof ApiError && error.status === 409) {
          const remote = await this.options.readRemote();
          // A previous write may have succeeded while its response was lost.
          if (sameContent(sent, remote)) return remote;
        }
        throw error;
      });
      if (this.disposed) return;
      this.base = result.updatedAt;
      this.attempts = 0;
      this.dirty = this.draft.seq !== sent.seq;
      this.emit({ phase: this.dirty ? 'dirty' : 'saved', lastSavedAt: result.updatedAt, message: '', retryAt: null });
      // Conditional deletion cannot erase a newer backup written during this request.
      void this.options.storage.remove(sent.key, sent.seq).catch(() => {});
      if (this.dirty) { void this.backup(); this.schedule(0); }
    } catch (error) {
      if (this.disposed) return;
      const status = error instanceof ApiError ? error.status : 0;
      this.blocked = [401, 403, 404, 409, 413].includes(status);
      const message = status === 409 ? '其他分頁或裝置已更新此專案，自動儲存已暫停。'
        : status === 401 ? '登入已過期，請重新登入後重試；草稿仍保留在本機。'
        : status === 404 ? '伺服器找不到此專案，請先下載草稿備份。'
        : status === 413 ? '專案內容超過伺服器限制，請先下載草稿備份。'
        : error instanceof Error ? error.message : '儲存失敗，請稍後再試。';
      const delay = Math.min((this.options.retryDelay ?? 2000) * 2 ** this.attempts++, 30_000);
      const retry = !this.blocked && this.attempts <= 5;
      this.emit({ phase: status === 409 ? 'conflict' : 'error', message, retryAt: retry ? Date.now() + delay : null });
      void this.backup();
      if (retry) this.schedule(delay);
    } finally { clearTimeout(timeout); this.sending = false; }
  }
  dispose() {
    if (this.disposed) return;
    this.emergency();
    this.disposed = true;
    clearTimeout(this.timer); clearTimeout(this.localTimer);
    this.request?.abort();
  }
}
