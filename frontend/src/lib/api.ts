const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * Wrapper around fetch that includes credentials (cookies) on every request.
 */
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: 'include', // Always send cookies for session auth
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorBody.error || `API error: ${res.status}`);
  }

  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────────

export function getGoogleLoginUrl(): string {
  return `${API_URL}/auth/google`;
}

export async function loginWithEmail(email: string, password?: string) {
  return apiFetch<import('@/types').UserResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getCurrentUser() {
  return apiFetch<import('@/types').UserResponse>('/auth/me');
}

export async function logout() {
  return apiFetch<{ message: string }>('/auth/logout', { method: 'POST' });
}

// ─── Senders ──────────────────────────────────────────────────

export async function getSenders() {
  return apiFetch<import('@/types').SenderResponse[]>('/api/senders');
}

// ─── Emails ───────────────────────────────────────────────────

export async function scheduleEmails(data: import('@/types').ScheduleEmailRequest) {
  return apiFetch<import('@/types').ScheduleEmailResponse>('/api/emails/schedule', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function uploadCsv(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const url = `${API_URL}/api/emails/upload-csv`;
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    body: formData,
    // Don't set Content-Type — browser sets it with boundary for FormData
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Upload failed');
  }

  return res.json() as Promise<import('@/types').CsvUploadResponse>;
}

export async function getScheduledEmails(page = 1, search = '') {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('search', search);
  return apiFetch<import('@/types').PaginatedResponse<import('@/types').ScheduledEmailResponse>>(
    `/api/emails/scheduled?${params}`
  );
}

export async function getSentEmails(page = 1, search = '') {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set('search', search);
  return apiFetch<import('@/types').PaginatedResponse<import('@/types').ScheduledEmailResponse>>(
    `/api/emails/sent?${params}`
  );
}

export async function searchEmails(q: string, page = 1) {
  const params = new URLSearchParams({ q, page: String(page) });
  return apiFetch<import('@/types').PaginatedResponse<any>>(`/api/emails/search?${params}`);
}

// ─── Slack ────────────────────────────────────────────────────

export function getSlackConnectUrl(): string {
  return `${API_URL}/integrations/slack/connect`;
}

export async function getSlackStatus() {
  return apiFetch<import('@/types').SlackStatusResponse>('/integrations/slack/status');
}

export async function disconnectSlack() {
  return apiFetch<{ message: string }>('/integrations/slack/disconnect', { method: 'POST' });
}
