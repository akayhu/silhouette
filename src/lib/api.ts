import type { ExportInfo, SavedExport } from './exportStore';
import type { AdminAuditEntry, AdminMember, AdminStats, LibraryTrack, Project, ProjectData, ProjectSummary, PromoCode, SessionInfo, User, Voice } from './types';

export interface TtsResult {
  url: string;
  segments: { text: string; start: number; end: number }[];
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: init.body && !(init.body instanceof Blob) ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error || '發生錯誤，請稍後再試', res.status, body.code);
  return body as T;
}

const json = (method: string, data?: unknown): RequestInit => ({ method, body: data === undefined ? undefined : JSON.stringify(data) });

export const api = {
  me: () => request<{ user: User | null }>('/api/auth/me'),
  /** 註冊後要先去信箱點驗證連結才會開通（不會馬上登入） */
  register: (d: { name: string; email: string; password: string }) => request<{ pending: true; email: string }>('/api/auth/register', json('POST', d)),
  login: (d: { email: string; password: string }) => request<{ user: User }>('/api/auth/login', json('POST', d)),
  resendVerification: (email: string) => request<{ ok: true }>('/api/auth/resend-verification', json('POST', { email })),
  forgotPassword: (email: string) => request<{ ok: true }>('/api/auth/forgot-password', json('POST', { email })),
  resetPassword: (token: string, password: string) => request<{ user: User }>('/api/auth/reset-password', json('POST', { token, password })),
  logout: () => request('/api/auth/logout', json('POST')),
  updateMe: (d: { name?: string; currentPassword?: string; newPassword?: string }) => request<{ user: User }>('/api/auth/me', json('PATCH', d)),
  sessions: () => request<{ sessions: SessionInfo[] }>('/api/auth/sessions'),
  revokeSession: (id: string) => request(`/api/auth/sessions/${id}`, json('DELETE')),

  /** 建立綠界訂單：回傳收銀台網址和表單欄位，前端要組一個 <form> 用瀏覽器導頁過去（不是 fetch）；code 是折扣優惠碼 */
  ecpayCheckout: (code?: string) => request<{ actionUrl: string; fields: Record<string, string | number> }>('/api/billing/ecpay/checkout', json('POST', code ? { code } : undefined)),
  cancel: () => request<{ user: User }>('/api/billing/cancel', json('POST')),
  payments: () => request<{ payments: { id: string; amount: number; cardLast4: string | null; createdAt: string }[] }>('/api/billing/payments'),
  checkPromo: (code: string) =>
    request<{ kind: 'months'; months: number } | { kind: 'discount'; discountAmount: number }>('/api/billing/promo/check', json('POST', { code })),
  redeemPromo: (code: string) => request<{ user: User; months: number }>('/api/billing/promo/redeem', json('POST', { code })),

  projects: () => request<{ projects: ProjectSummary[] }>('/api/projects'),
  project: (id: string, signal?: AbortSignal) => request<{ project: Project }>(`/api/projects/${id}`, { signal }),
  createProject: (d: { name: string; aspect: string }) => request<{ project: Project }>('/api/projects', json('POST', d)),
  updateProject: (id: string, d: { name?: string; data?: ProjectData; thumbnail?: string; expectedUpdatedAt?: string }, signal?: AbortSignal) =>
    request<{ project: ProjectSummary }>(`/api/projects/${id}`, { ...json('PATCH', d), signal }),
  deleteProject: (id: string) => request(`/api/projects/${id}`, json('DELETE')),

  exports: (id: string) => request<{ exports: SavedExport[] }>(`/api/projects/${id}/exports`),
  deleteExport: (id: string, exportId: string) => request(`/api/projects/${id}/exports/${exportId}`, json('DELETE')),
  /** 匯出成品存到帳戶；用 XHR 才拿得到上傳進度 */
  saveExport: (id: string, blob: Blob, info: ExportInfo, onProgress?: (p: number) => void, signal?: AbortSignal) =>
    new Promise<{ export: SavedExport }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/projects/${id}/exports`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('X-Export-Meta', encodeURIComponent(JSON.stringify(info)));
      xhr.responseType = 'json';
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        const body = xhr.response ?? {};
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new ApiError(body.error || '存到帳戶失敗，請稍後再試', xhr.status, body.code));
      };
      xhr.onerror = () => reject(new ApiError('網路中斷，存到帳戶失敗', 0));
      xhr.onabort = () => reject(new DOMException('已取消', 'AbortError'));
      signal?.addEventListener('abort', () => xhr.abort(), { once: true });
      xhr.send(blob);
    }),

  adminStats: (days: number) => request<AdminStats>(`/api/admin/stats?days=${days}`),
  adminUsers: (q: string, plan: 'all' | 'pro' | 'trial' | 'free', page: number, pageSize: number) =>
    request<{ users: AdminMember[]; total: number; page: number; pageSize: number }>(
      `/api/admin/users?q=${encodeURIComponent(q)}&plan=${plan}&page=${page}&pageSize=${pageSize}`,
    ),
  adminGrant: (id: string, months: number) => request(`/api/admin/users/${id}`, json('PATCH', { action: 'grant', months })),
  adminRevoke: (id: string) => request(`/api/admin/users/${id}`, json('PATCH', { action: 'revoke' })),
  adminResetPassword: (id: string, password: string) => request(`/api/admin/users/${id}`, json('PATCH', { action: 'reset-password', password })),
  adminDelete: (id: string) => request(`/api/admin/users/${id}`, json('DELETE')),
  adminPromoCodes: (page: number, pageSize: number) =>
    request<{ codes: PromoCode[]; total: number; page: number; pageSize: number }>(`/api/admin/promo-codes?page=${page}&pageSize=${pageSize}`),
  adminCreatePromoCode: (d: { kind: 'months'; months: number } | { kind: 'discount'; discountAmount: number }) =>
    request<{ code: PromoCode }>('/api/admin/promo-codes', json('POST', d)),
  adminAuditLog: (page: number, pageSize: number) =>
    request<{ entries: AdminAuditEntry[]; total: number; page: number; pageSize: number }>(`/api/admin/audit-log?page=${page}&pageSize=${pageSize}`),
  music: () => request<{ license: string; items: LibraryTrack[] }>('/api/music'),
  voices: () => request<{ voices: Voice[]; breezy: boolean }>('/api/tts/voices'),
  createVoice: (wav: Blob, name: string, text: string) =>
    request<{ voice: Voice }>('/api/voices', {
      method: 'POST',
      body: wav,
      headers: { 'X-Voice-Name': encodeURIComponent(name), 'X-Voice-Text': encodeURIComponent(text), 'Content-Type': 'application/octet-stream' },
    }),
  deleteVoice: (id: string) => request(`/api/voices/${id}`, json('DELETE')),
  ttsJob: (id: string) =>
    request<{ status: 'running' | 'done' | 'error'; stage: string; done: number; total: number; error?: string; result?: TtsResult }>(`/api/tts/jobs/${id}`),
  tts: (id: string, d: { text?: string; segments?: string[]; voice: string; rate: number }) =>
    request<Partial<TtsResult> & { jobId?: string; total?: number }>(`/api/projects/${id}/tts`, json('POST', d)),
};
