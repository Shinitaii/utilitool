import { auth } from '../../firebase';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5002';

if (import.meta.env.PROD && !API_BASE.startsWith('https://')) {
  throw new Error(
    `VITE_API_BASE_URL must be an https:// URL in production builds (got: ${API_BASE})`
  );
}

export async function getAccessToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

function buildHeaders(token: string, extraHeaders?: HeadersInit) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...extraHeaders
  };
}

async function request(endpoint: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = buildHeaders(token, options.headers);

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    const retryToken = await auth.currentUser!.getIdToken(true);
    return fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: buildHeaders(retryToken, options.headers)
    });
  }

  return response;
}

export async function apiGet<T = any>(endpoint: string): Promise<T> {
  const res = await request(endpoint, { method: 'GET' });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function apiPost<T = any>(endpoint: string, data: any): Promise<T> {
  const res = await request(endpoint, {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function apiPatch<T = any>(endpoint: string, data: any): Promise<T> {
  const res = await request(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function apiDelete(endpoint: string) {
  const res = await request(endpoint, { method: 'DELETE' });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res;
}

/** Shared optional-param query-string builder for the feature API modules. */
export function buildQueryString(
  params?: Record<string, string | number | undefined | null>
): string {
  if (!params) return '';
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const qs = query.toString();
  return qs ? `?${qs}` : '';
}
