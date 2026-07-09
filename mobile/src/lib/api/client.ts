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

export async function apiGet(endpoint: string) {
  const res = await request(endpoint, { method: 'GET' });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function apiPost(endpoint: string, data: any) {
  const res = await request(endpoint, {
    method: 'POST',
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export async function apiPatch(endpoint: string, data: any) {
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
