import { auth } from '../../firebase';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5002';

export async function getAccessToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

async function request(endpoint: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    const retryToken = await auth.currentUser!.getIdToken(true);
    return fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: { ...headers, 'Authorization': `Bearer ${retryToken}` }
    });
  }

  return response;
}

export async function apiGet(endpoint: string) {
  const res = await request(endpoint, { method: 'GET' });
  return res.json();
}

export async function apiPost(endpoint: string, data: any) {
  const res = await request(endpoint, {
    method: 'POST',
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function apiPatch(endpoint: string, data: any) {
  const res = await request(endpoint, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function apiDelete(endpoint: string) {
  return request(endpoint, { method: 'DELETE' });
}
