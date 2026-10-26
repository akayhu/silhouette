import type { AdminMember, AdminStats, LibraryTrack, Project, ProjectData, ProjectSummary, User, Voice } from './types';

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
  register: (d: { name: string; email: string; password: string }) => request<{ user: User }>('/api/auth/register', json('POST', d)),
  login: (d: { email: string; password: string }) => request<{ user: User }>('/api/auth/login', json('POST', d)),
  logout: () => request('/api/auth/logout', json('POST')),
  updateMe: (d: { name?: string; currentPassword?: string; newPassword?: string }) => request<{ user: User }>('/api/auth/me', json('PATCH', d)),

  checkout: (d: { cardNumber: string; name: string }) => request<{ user: User }>('/api/billing/checkout', json('POST', d)),
  cancel: () => request<{ user: User }>('/api/billing/cancel', json('POST')),
  resume: () => request<{ user: User }>('/api/billing/resume', json('POST')),
  payments: () => request<{ payments: { id: string; amount: number; cardLast4: string; createdAt: string }[] }>('/api/billing/payments'),

  projects: () => request<{ projects: ProjectSummary[] }>('/api/projects'),
  project: (id: string, signal?: AbortSignal) => request<{ project: Project }>(`/api/projects/${id}`, { signal }),
  createProject: (d: { name: string; aspect: string }) => request<{ project: Project }>('/api/projects', json('POST', d)),
  updateProject: (id: string, d: { name?: string; data?: ProjectData; thumbnail?: string; expectedUpdatedAt?: string }, signal?: AbortSignal) =>
    request<{ project: ProjectSummary }>(`/api/projects/${id}`, { ...json('PATCH', d), signal }),
  deleteProject: (id: string) => request(`/api/projects/${id}`, json('DELETE')),
  upload: (id: string, file: File | Blob, name: string) =>
    request<{ url: string }>(`/api/projects/${id}/media`, {
      method: 'POST',
      body: file,
      headers: { 'X-Filename': encodeURIComponent(name), 'Content-Type': 'application/octet-stream' },
    }),

  adminStats: (days: number) => request<AdminStats>(`/api/admin/stats?days=${days}`),
  adminUsers: (q: string, plan: 'all' | 'pro' | 'trial' | 'free') =>
    request<{ users: AdminMember[] }>(`/api/admin/users?q=${encodeURIComponent(q)}&plan=${plan}`),
  adminGrant: (id: string, months: number) => request(`/api/admin/users/${id}`, json('PATCH', { action: 'grant', months })),
  adminRevoke: (id: string) => request(`/api/admin/users/${id}`, json('PATCH', { action: 'revoke' })),
  adminDelete: (id: string) => request(`/api/admin/users/${id}`, json('DELETE')),
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
